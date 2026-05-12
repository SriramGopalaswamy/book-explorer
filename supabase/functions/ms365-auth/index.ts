import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logError, logInfo, logWarn } from "../_shared/logger.ts";

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
 * Resolve an existing application user without scanning auth users. The old
 * flow used auth.admin.listUsers(email search by pagination), which can fail
 * with "Database error finding users" and makes MS365 login appear hung.
 * Profiles are the app-owned identity index and contain auth user_id.
 */
async function findExistingProfileByEmail(supabase: any, email: string, organizationId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_id,status")
    .eq("email", email.toLowerCase())
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    logError("ms365-auth", error, { stage: "findExistingProfileByEmail" });
    throw new Error(`Failed to look up existing profile: ${error.message}`);
  }
  return data ?? null;
}

function errorResponse(requestId: string, stage: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ error: message, stage, requestId, ...extra }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

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

async function ensureUserRole(supabase: any, userId: string, organizationId: string, role: "admin" | "employee") {
  const { data: existingRole, error: lookupError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to verify user role: ${lookupError.message}`);
  if (existingRole) return;

  const { error: insertError } = await supabase.from("user_roles").insert({
    user_id: userId,
    role,
    organization_id: organizationId,
  });
  if (insertError && insertError.code !== "23505") {
    throw new Error(`Failed to assign user role: ${insertError.message}`);
  }
}

async function ensureOrganizationMembership(supabase: any, userId: string, organizationId: string) {
  const { error } = await supabase
    .from("organization_members")
    .upsert(
      { user_id: userId, organization_id: organizationId, role: "member" },
      { onConflict: "organization_id,user_id" },
    );
  if (error && error.code !== "23505") {
    throw new Error(`Failed to ensure organization membership: ${error.message}`);
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

  const requestId = crypto.randomUUID();
  let stage = "parse_request";
  const AZURE_CLIENT_ID     = Deno.env.get("AZURE_CLIENT_ID")!;
  const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const AZURE_TENANT_ID     = Deno.env.get("AZURE_TENANT_ID")!;
  const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const { action, code, redirect_uri } = await req.json();
    logInfo("ms365-auth", "request received", { requestId, action });

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
      stage = "azure_token_exchange";
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
        const detail = await tokenRes.text();
        logWarn("ms365-auth", "Token exchange failed", { requestId, stage, status: tokenRes.status, detail });
        return errorResponse(requestId, stage, "Token exchange failed", 400);
      }

      const tokens = await tokenRes.json();
      const authHeader = { Authorization: `Bearer ${tokens.access_token}` };

      // Fetch MS365 profile + manager in parallel
      stage = "microsoft_graph_profile";
      const [profileRes, managerResRaw] = await Promise.all([
        fetch("https://graph.microsoft.com/v1.0/me", { headers: authHeader }),
        fetch("https://graph.microsoft.com/v1.0/me/manager", { headers: authHeader }).catch(() => null),
      ]);

      if (!profileRes.ok) {
        logWarn("ms365-auth", "Microsoft profile fetch failed", { requestId, stage, status: profileRes.status });
        return errorResponse(requestId, stage, "Failed to fetch user profile from Microsoft", 400);
      }

      const ms365Profile = await profileRes.json();
      const email      = ms365Profile.mail || ms365Profile.userPrincipalName;
      if (!email) {
        return errorResponse(requestId, stage, "Microsoft profile did not return an email address", 400);
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
      stage = "resolve_organization";
      const orgEntry = await resolveOrgFromEmailDomain(supabase, email);
      if (!orgEntry) {
        console.warn(`[ms365-auth] No organization configured for email domain of: ${email}`);
        return errorResponse(requestId, stage, "Your email domain is not authorized for Microsoft SSO login.", 403, { emailDomain: email.split("@")[1]?.toLowerCase() });
      }
      const { organizationId, ssoDomain } = orgEntry;

      if (!email?.toLowerCase().endsWith(`@${ssoDomain}`)) {
        return errorResponse(requestId, stage, `Only @${ssoDomain} accounts are allowed`, 403);
      }

      const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      const isAdminEmail = adminEmails.includes(email.toLowerCase());

      stage = "find_existing_profile";
      const existingProfile = await findExistingProfileByEmail(supabase, email, organizationId);

      let session;

      if (existingProfile?.user_id) {
        const existingUserId = existingProfile.user_id;
        if (existingProfile.status === "inactive") {
          return errorResponse(requestId, stage, "Your account has been deactivated. Contact your administrator.", 403);
        }
        await ensureOrganizationMembership(supabase, existingUserId, organizationId);

        if (existingProfile.status === "pending_approval") {
          await supabase.from("profiles").update({ status: "active" }).eq("user_id", existingUserId);
        }

        let resolvedProfileId: string | null = existingProfile.id ?? null;
        let profileAlreadySynced = false;

        stage = "create_magic_link_existing_user";
        const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
        if (error) {
          logError("ms365-auth", error, { requestId, stage });
          return errorResponse(requestId, stage, "Failed to authenticate user", 500);
        }

        stage = "verify_magic_link_existing_user";
        const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.properties?.hashed_token!,
          type: "magiclink",
        });
        if (verifyError) {
          logError("ms365-auth", verifyError, { requestId, stage });
          return errorResponse(requestId, stage, "Failed to create session", 500);
        }

        session = sessionData.session;

        // Defer non-critical sync work — return session immediately, let role/profile
        // sync finish in the background. Cuts perceived login latency by ~2-4s.
        const bgSync = (async () => {
          try {
            if (!profileAlreadySynced) {
              await syncProfileFromMS365(supabase, existingUserId, organizationId, fullName, jobTitle, department, phone, email, managerEmail);
            }
            if (resolvedProfileId) await resolveWaitingManagerRefs(supabase, email, resolvedProfileId);
            await ensureUserRole(supabase, existingUserId, organizationId, isAdminEmail ? "admin" : "employee");
          } catch (e) {
            console.error("ms365-auth background sync failed:", e);
          }
        })();
        // @ts-ignore EdgeRuntime is available in Supabase runtime
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(bgSync);
        } else {
          await bgSync;
        }
      } else {
        // New user
        stage = "create_auth_user";
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createError) {
          if (createError.code === "email_exists" || createError.message?.includes("already been registered")) {
            logWarn("ms365-auth", "User exists without matching profile; signing in then repairing profile", { requestId, stage });
            stage = "create_magic_link_race_fallback";
            const { data: ld2, error: le2 } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
            if (le2) {
              logError("ms365-auth", le2, { requestId, stage });
              return errorResponse(requestId, stage, "Failed to authenticate user", 500);
            }
            stage = "verify_magic_link_race_fallback";
            const { data: sd2, error: ve2 } = await supabase.auth.verifyOtp({ token_hash: ld2.properties?.hashed_token!, type: "magiclink" });
            if (ve2) {
              logError("ms365-auth", ve2, { requestId, stage });
              return errorResponse(requestId, stage, "Failed to create session", 500);
            }
            session = sd2.session;
            const fallbackUserId = sd2.user?.id ?? sd2.session?.user?.id;
            if (fallbackUserId) {
              stage = "repair_profile_race_fallback";
              const { data: fbProfile } = await supabase.from("profiles").select("id,status").eq("user_id", fallbackUserId).maybeSingle();
              if (fbProfile?.status === "inactive") {
                return errorResponse(requestId, stage, "Your account has been deactivated. Contact your administrator.", 403);
              }
              if (fbProfile?.status === "pending_approval") await supabase.from("profiles").update({ status: "active" }).eq("user_id", fallbackUserId);
              await syncProfileFromMS365(supabase, fallbackUserId, organizationId, fullName, jobTitle, department, phone, email, managerEmail);
              await ensureUserRole(supabase, fallbackUserId, organizationId, isAdminEmail ? "admin" : "employee");
            }
            return new Response(JSON.stringify({ session }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          logError("ms365-auth", createError, { requestId, stage });
          return errorResponse(requestId, stage, "Failed to create user", 500);
        }

        stage = "create_role_new_user";
        await ensureUserRole(supabase, newUser.user!.id, organizationId, isAdminEmail ? "admin" : "employee");

        stage = "sync_profile_new_user";
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
          return errorResponse(requestId, stage, "This account has been deactivated. Contact your administrator.", 403);
        }

        stage = "create_magic_link_new_user";
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
        if (linkError) {
          logError("ms365-auth", linkError, { requestId, stage });
          return errorResponse(requestId, stage, "Failed to authenticate new user", 500);
        }

        stage = "verify_magic_link_new_user";
        const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties?.hashed_token!,
          type: "magiclink",
        });
        if (verifyError) {
          logError("ms365-auth", verifyError, { requestId, stage });
          return errorResponse(requestId, stage, "Failed to create session", 500);
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
    logError("ms365-auth", err, { requestId, stage });
    return new Response(
      JSON.stringify({ error: "Internal server error", stage, requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
