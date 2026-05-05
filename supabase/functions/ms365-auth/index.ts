import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logError } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Per-domain cache: resolves once per cold-start per email domain.
// Key: lowercase email domain (e.g. "acme.com")
// Value: { organizationId, ssoDomain }
const domainCache = new Map<string, { organizationId: string; ssoDomain: string }>();

/**
 * Resolve the organization that owns this email domain via organization_settings.sso_domain.
 * Returns null if no organization is configured for the domain (login rejected).
 */
async function resolveOrgFromEmailDomain(
  supabase: any,
  email: string,
): Promise<{ organizationId: string; ssoDomain: string } | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  if (domainCache.has(domain)) return domainCache.get(domain)!;

  const { data } = await supabase
    .from("organization_settings")
    .select("organization_id, sso_domain")
    .ilike("sso_domain", domain)
    .maybeSingle();

  if (!data?.organization_id) return null;

  const entry = { organizationId: data.organization_id, ssoDomain: data.sso_domain.toLowerCase() };
  domainCache.set(domain, entry);
  return entry;
}

/** Sync profile fields + manager_id from MS365 data. */
async function syncProfileFromMS365(
  supabase: any,
  userId: string,
  organizationId: string,
  fullName: string,
  jobTitle: string | null,
  department: string | null,
  phone: string | null,
  email: string,
  managerEmail: string | null,
  status = "active",
): Promise<void> {
  // Guarantee org membership
  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert(
      { user_id: userId, organization_id: organizationId },
      { onConflict: "organization_id,user_id" }
    );
  if (memberError) throw new Error(`Failed to register org membership: ${memberError.message}`);

  // Guarantee minimal profile row
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ user_id: userId, email: email.toLowerCase(), organization_id: organizationId, status });
    if (insertError) throw new Error(`Failed to create user profile: ${insertError.message}`);
  }

  // Enrich with MS365 data (non-critical)
  try {
    let managerId: string | null = null;
    if (managerEmail) {
      const { data: managerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", managerEmail.toLowerCase())
        .eq("organization_id", organizationId)
        .maybeSingle();
      managerId = managerProfile?.id ?? null;
    }

    const profileData: Record<string, any> = { full_name: fullName, email: email.toLowerCase() };
    if (jobTitle) profileData.job_title = jobTitle;
    if (department) profileData.department = department;
    if (phone) profileData.phone = phone;
    if (managerId) {
      profileData.manager_id = managerId;
      profileData.pending_manager_email = null;
    } else if (managerEmail) {
      profileData.pending_manager_email = managerEmail.toLowerCase();
    }

    await supabase
      .from("profiles")
      .update(profileData)
      .eq("user_id", userId);
  } catch (err) {
    logError("ms365-auth", err, { stage: "profile_enrichment" });
  }
}

/** Resolve any profiles that were waiting for this email as manager. */
async function resolveWaitingManagerRefs(supabase: any, email: string, profileId: string) {
  try {
    await supabase
      .from("profiles")
      .update({ manager_id: profileId, pending_manager_email: null })
      .eq("pending_manager_email", email.toLowerCase());
  } catch (err) {
    logError("ms365-auth", err, { stage: "resolve_manager_refs" });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const AZURE_CLIENT_ID     = Deno.env.get("AZURE_CLIENT_ID")!;
  const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const AZURE_TENANT_ID     = Deno.env.get("AZURE_TENANT_ID")!;
  const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const { action, code, redirect_uri } = await req.json();

    // ── Step 1: Return Azure AD authorization URL ──────────────────────────────
    if (action === "get_auth_url") {
      const state = crypto.randomUUID();
      const authUrl = new URL(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set("client_id", AZURE_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirect_uri);
      authUrl.searchParams.set("scope", "openid profile email User.Read");
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("state", state);
      return new Response(
        JSON.stringify({ url: authUrl.toString(), state }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 2: Exchange code → tokens → session ───────────────────────────────
    if (action === "exchange_code") {
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: AZURE_CLIENT_ID,
            client_secret: AZURE_CLIENT_SECRET,
            code,
            redirect_uri,
            grant_type: "authorization_code",
            scope: "openid profile email User.Read",
          }),
        }
      );

      if (!tokenRes.ok) {
        console.error("Token exchange failed:", await tokenRes.text());
        return new Response(
          JSON.stringify({ error: "Token exchange failed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokens = await tokenRes.json();
      const authHeader = { Authorization: `Bearer ${tokens.access_token}` };

      // Fetch MS365 profile + manager in parallel
      const [profileRes, managerResRaw] = await Promise.all([
        fetch("https://graph.microsoft.com/v1.0/me", { headers: authHeader }),
        fetch("https://graph.microsoft.com/v1.0/me/manager", { headers: authHeader }).catch(() => null),
      ]);

      if (!profileRes.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch user profile from Microsoft" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ms365Profile = await profileRes.json();
      const email      = ms365Profile.mail || ms365Profile.userPrincipalName;
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Microsoft profile did not return an email address" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fullName   = ms365Profile.displayName || "";
      const jobTitle   = ms365Profile.jobTitle || null;
      const department = ms365Profile.department || null;
      const phone      = ms365Profile.businessPhones?.[0] || ms365Profile.mobilePhone || null;

      let managerEmail: string | null = null;
      try {
        if (managerResRaw?.ok) {
          const mgr = await managerResRaw.json();
          managerEmail = mgr.mail || mgr.userPrincipalName || null;
        }
      } catch (e) {
        logError("ms365-auth", e, { stage: "fetch_manager" });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // ── Resolve organization from email domain ─────────────────────────────
      const orgEntry = await resolveOrgFromEmailDomain(supabase, email);
      if (!orgEntry) {
        console.warn(`[ms365-auth] No organization configured for email domain of: ${email}`);
        return new Response(
          JSON.stringify({ error: "Your email domain is not authorized for Microsoft SSO login." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { organizationId, ssoDomain } = orgEntry;

      if (!email?.toLowerCase().endsWith(`@${ssoDomain}`)) {
        return new Response(
          JSON.stringify({ error: `Only @${ssoDomain} accounts are allowed` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      const isAdminEmail = adminEmails.includes(email.toLowerCase());

      const { data: existingUserData } = await supabase.auth.admin.getUserByEmail(email);
      const existingUser = existingUserData?.user ?? null;

      let session;

      if (existingUser) {
        const { data: profileStatus } = await supabase
          .from("profiles")
          .select("id, status")
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (profileStatus?.status === "inactive") {
          return new Response(
            JSON.stringify({ error: "Your account has been deactivated. Contact your administrator." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (profileStatus?.status === "pending_approval") {
          await supabase.from("profiles").update({ status: "active" }).eq("user_id", existingUser.id);
        }

        let resolvedProfileId: string | null = profileStatus?.id ?? null;
        let profileAlreadySynced = false;

        if (!profileStatus) {
          await syncProfileFromMS365(supabase, existingUser.id, organizationId, fullName, jobTitle, department, phone, email, managerEmail, "active");
          profileAlreadySynced = true;
          const { data: fp } = await supabase.from("profiles").select("id").eq("user_id", existingUser.id).maybeSingle();
          resolvedProfileId = fp?.id ?? null;
        }

        const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
        if (error) {
          console.error("Generate link error:", error);
          return new Response(JSON.stringify({ error: "Failed to authenticate user" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.properties?.hashed_token!,
          type: "magiclink",
        });
        if (verifyError) {
          console.error("Verify OTP error:", verifyError);
          return new Response(JSON.stringify({ error: "Failed to create session" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        session = sessionData.session;

        if (!profileAlreadySynced) {
          await syncProfileFromMS365(supabase, existingUser.id, organizationId, fullName, jobTitle, department, phone, email, managerEmail);
        }
        if (resolvedProfileId) await resolveWaitingManagerRefs(supabase, email, resolvedProfileId);

        const { data: existingRole } = await supabase.from("user_roles").select("id").eq("user_id", existingUser.id).maybeSingle();
        if (!existingRole) {
          await supabase.from("user_roles").insert({
            user_id: existingUser.id,
            role: isAdminEmail ? "admin" : "employee",
            organization_id: organizationId,
          });
        }
      } else {
        // New user
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createError) {
          if (createError.code === "email_exists" || createError.message?.includes("already been registered")) {
            console.log("User exists (race fallback), signing in instead");
            const { data: ld2, error: le2 } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
            if (le2) return new Response(JSON.stringify({ error: "Failed to authenticate user" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            const { data: sd2, error: ve2 } = await supabase.auth.verifyOtp({ token_hash: ld2.properties?.hashed_token!, type: "magiclink" });
            if (ve2) return new Response(JSON.stringify({ error: "Failed to create session" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            session = sd2.session;
            const { data: fbData } = await supabase.auth.admin.getUserByEmail(email);
            const fbUser = fbData?.user ?? null;
            if (fbUser) {
              const { data: fbProfile } = await supabase.from("profiles").select("status").eq("user_id", fbUser.id).maybeSingle();
              if (fbProfile?.status === "inactive") {
                return new Response(JSON.stringify({ error: "Your account has been deactivated. Contact your administrator." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
              if (fbProfile?.status === "pending_approval") await supabase.from("profiles").update({ status: "active" }).eq("user_id", fbUser.id);
              await syncProfileFromMS365(supabase, fbUser.id, organizationId, fullName, jobTitle, department, phone, email, managerEmail);
              const { data: fbRole } = await supabase.from("user_roles").select("id").eq("user_id", fbUser.id).maybeSingle();
              if (!fbRole) {
                await supabase.from("user_roles").insert({
                  user_id: fbUser.id,
                  role: isAdminEmail ? "admin" : "employee",
                  organization_id: organizationId,
                });
              }
            }
            return new Response(JSON.stringify({ session }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          console.error("Create user error:", createError);
          return new Response(JSON.stringify({ error: "Failed to create user" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("user_roles").insert({
          user_id: newUser.user!.id,
          role: isAdminEmail ? "admin" : "employee",
          organization_id: organizationId,
        });

        await syncProfileFromMS365(supabase, newUser.user!.id, organizationId, fullName, jobTitle, department, phone, email, managerEmail, "active");

        // Block re-creation of an ex-employee whose prior profile is inactive in this org.
        const { data: inactiveMatch } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email.toLowerCase())
          .eq("organization_id", organizationId)
          .eq("status", "inactive")
          .maybeSingle();

        if (inactiveMatch) {
          await supabase.from("profiles")
            .update({ status: "inactive" })
            .eq("user_id", newUser.user!.id);
          await supabase.auth.admin.updateUserById(newUser.user!.id, { ban_duration: "876600h" });
          return new Response(
            JSON.stringify({ error: "This account has been deactivated. Contact your administrator." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
        if (linkError) {
          console.error("Generate link error:", linkError);
          return new Response(JSON.stringify({ error: "Failed to authenticate new user" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties?.hashed_token!,
          type: "magiclink",
        });
        if (verifyError) {
          console.error("Verify OTP error:", verifyError);
          return new Response(JSON.stringify({ error: "Failed to create session" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        session = sessionData.session;

        const { data: newProfile } = await supabase.from("profiles").select("id").eq("user_id", newUser.user!.id).maybeSingle();
        if (newProfile?.id) await resolveWaitingManagerRefs(supabase, email, newProfile.id);
      }

      return new Response(
        JSON.stringify({ session }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    logError("ms365-auth", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
