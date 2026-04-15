import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default organization ID — the seeded GRX10 Solutions org
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// Helper: sync profile fields + manager_id from MS365 data.
async function syncProfileFromMS365(
  supabase: any,
  userId: string,
  fullName: string,
  jobTitle: string | null,
  department: string | null,
  phone: string | null,
  email: string,
  managerEmail: string | null,
  status: string = "active",
): Promise<void> {
  // ── Step 1: Guarantee org membership ──
  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert(
      { user_id: userId, organization_id: DEFAULT_ORG_ID },
      { onConflict: "organization_id,user_id" }
    );
  if (memberError) {
    throw new Error(`Failed to register org membership: ${memberError.message}`);
  }

  // ── Step 2: Guarantee minimal profile row ──
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({
        user_id: userId,
        email: email.toLowerCase(),
        organization_id: DEFAULT_ORG_ID,
        status,
      });
    if (insertError) {
      throw new Error(`Failed to create user profile: ${insertError.message}`);
    }
  }

  // ── Step 3: Enrich with MS365 data (non-critical) ──
  try {
    let managerId: string | null = null;
    if (managerEmail) {
      const { data: managerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", managerEmail.toLowerCase())
        .maybeSingle();
      managerId = managerProfile?.id || null;
    }

    const profileData: Record<string, any> = {
      full_name: fullName,
      email: email.toLowerCase(),
    };
    if (jobTitle) profileData.job_title = jobTitle;
    if (department) profileData.department = department;
    if (phone) profileData.phone = phone;

    if (managerId) {
      profileData.manager_id = managerId;
      profileData.pending_manager_email = null;
    } else if (managerEmail) {
      profileData.pending_manager_email = managerEmail.toLowerCase();
    }

    if (existingProfile) {
      await supabase
        .from("profiles")
        .update(profileData)
        .eq("id", existingProfile.id);
    } else {
      await supabase
        .from("profiles")
        .update(profileData)
        .eq("user_id", userId);
    }
  } catch (err) {
    console.warn("MS365 profile enrichment failed (non-critical):", err);
  }
}

// Helper: resolve pending manager references
async function resolveWaitingManagerRefs(
  supabase: any,
  email: string,
  profileId: string,
) {
  try {
    await supabase
      .from("profiles")
      .update({ manager_id: profileId, pending_manager_email: null })
      .eq("pending_manager_email", email.toLowerCase());
  } catch (err) {
    console.warn("Failed to resolve pending manager references:", err);
  }
}

// Helper: get allowed SSO domain from organization_settings
async function getAllowedDomain(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from("organization_settings")
      .select("sso_domain")
      .eq("organization_id", DEFAULT_ORG_ID)
      .maybeSingle();
    if (data?.sso_domain) return data.sso_domain.toLowerCase();
  } catch {
    // fallback
  }
  return "grx10.com"; // default fallback
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const AZURE_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
  const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const AZURE_TENANT_ID = Deno.env.get("AZURE_TENANT_ID")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const { action, code, redirect_uri } = await req.json();

    // Step 1: Generate the Azure AD authorization URL
    if (action === "get_auth_url") {
      const state = crypto.randomUUID();
      const authUrl = new URL(
        `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`
      );
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

    // Step 2: Exchange authorization code for tokens and sign in/up the user
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
        const err = await tokenRes.text();
        console.error("Token exchange failed:", err);
        return new Response(
          JSON.stringify({ error: "Token exchange failed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokens = await tokenRes.json();

      // Get user profile from Microsoft Graph
      const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!profileRes.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch user profile" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const profile = await profileRes.json();
      const email = profile.mail || profile.userPrincipalName;
      const fullName = profile.displayName || "";
      const jobTitle = profile.jobTitle || null;
      const department = profile.department || null;
      const phone = profile.businessPhones?.[0] || profile.mobilePhone || null;

      // Fetch manager info from MS365
      let managerEmail: string | null = null;
      try {
        const managerRes = await fetch("https://graph.microsoft.com/v1.0/me/manager", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (managerRes.ok) {
          const managerData = await managerRes.json();
          managerEmail = managerData.mail || managerData.userPrincipalName || null;
        }
      } catch (mgrErr) {
        console.warn("Could not fetch manager from MS365:", mgrErr);
      }

      // Use service role client
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Verify domain dynamically from org settings
      const allowedDomain = await getAllowedDomain(supabase);
      if (!email?.toLowerCase().endsWith(`@${allowedDomain}`)) {
        return new Response(
          JSON.stringify({ error: `Only @${allowedDomain} accounts are allowed` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const isAdminEmail = adminEmails.includes(email.toLowerCase());

      // Check if user exists
      let existingUser = null;
      let page = 1;
      const perPage = 1000;
      while (!existingUser) {
        const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
        if (listErr || !usersPage?.users?.length) break;
        existingUser = usersPage.users.find(
          (u: any) => u.email?.toLowerCase() === email.toLowerCase()
        ) || null;
        if (usersPage.users.length < perPage) break;
        page++;
      }

      let session;

      if (existingUser) {
        // Check profile status
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

        // AUTO-ACTIVATE: If user is pending_approval, activate them now
        if (profileStatus?.status === "pending_approval") {
          await supabase
            .from("profiles")
            .update({ status: "active" })
            .eq("user_id", existingUser.id);
        }

        let resolvedProfileId: string | null = profileStatus?.id ?? null;
        let profileAlreadySynced = false;

        // Handle existing auth user with no profile row
        if (!profileStatus) {
          await syncProfileFromMS365(supabase, existingUser.id, fullName, jobTitle, department, phone, email, managerEmail, "active");
          profileAlreadySynced = true;
          const { data: freshProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("user_id", existingUser.id)
            .maybeSingle();
          resolvedProfileId = freshProfile?.id ?? null;
        }

        // Generate session
        const { data, error } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: email,
        });

        if (error) {
          console.error("Generate link error:", error);
          return new Response(
            JSON.stringify({ error: "Failed to authenticate user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: sessionData, error: verifyError } =
          await supabase.auth.verifyOtp({
            token_hash: data.properties?.hashed_token!,
            type: "magiclink",
          });

        if (verifyError) {
          console.error("Verify OTP error:", verifyError);
          return new Response(
            JSON.stringify({ error: "Failed to create session" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        session = sessionData.session;

        if (!profileAlreadySynced) {
          await syncProfileFromMS365(supabase, existingUser.id, fullName, jobTitle, department, phone, email, managerEmail);
        }

        if (resolvedProfileId) {
          await resolveWaitingManagerRefs(supabase, email, resolvedProfileId);
        }

        // Ensure role exists
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (!existingRole) {
          const role = isAdminEmail ? "admin" : "employee";
          await supabase.from("user_roles").insert({
            user_id: existingUser.id,
            role,
            organization_id: DEFAULT_ORG_ID,
          });
        }
      } else {
        // Create new user — AUTO-ACTIVATE with "active" status
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: newUser, error: createError } =
          await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });

        if (createError) {
          // Race condition fallback
          if (createError.code === 'email_exists' || createError.message?.includes('already been registered')) {
            console.log("User exists (fallback), signing in instead");
            const { data: linkData2, error: linkErr2 } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
            if (linkErr2) {
              console.error("Fallback generate link error:", linkErr2);
              return new Response(JSON.stringify({ error: "Failed to authenticate user" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            const { data: sessData2, error: verifyErr2 } = await supabase.auth.verifyOtp({ token_hash: linkData2.properties?.hashed_token!, type: "magiclink" });
            if (verifyErr2) {
              console.error("Fallback verify error:", verifyErr2);
              return new Response(JSON.stringify({ error: "Failed to create session" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            session = sessData2.session;

            const { data: fallbackUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const fbUser = fallbackUsers?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
            if (fbUser) {
              const { data: fbProfile } = await supabase
                .from("profiles")
                .select("status")
                .eq("user_id", fbUser.id)
                .maybeSingle();
              if (fbProfile?.status === "inactive") {
                return new Response(
                  JSON.stringify({ error: "Your account has been deactivated. Contact your administrator." }),
                  { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
              // Auto-activate if pending
              if (fbProfile?.status === "pending_approval") {
                await supabase.from("profiles").update({ status: "active" }).eq("user_id", fbUser.id);
              }
              await syncProfileFromMS365(supabase, fbUser.id, fullName, jobTitle, department, phone, email, managerEmail);
            }

            return new Response(JSON.stringify({ session }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          console.error("Create user error:", createError);
          return new Response(
            JSON.stringify({ error: "Failed to create user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Assign role
        const role = isAdminEmail ? "admin" : "employee";
        await supabase.from("user_roles").insert({
          user_id: newUser.user!.id,
          role,
          organization_id: DEFAULT_ORG_ID,
        });

        // AUTO-ACTIVATE: All MS365 SSO users get "active" status immediately
        await syncProfileFromMS365(supabase, newUser.user!.id, fullName, jobTitle, department, phone, email, managerEmail, "active");

        // Generate session for ALL new users (no more pending screen)
        const { data: linkData, error: linkError } =
          await supabase.auth.admin.generateLink({
            type: "magiclink",
            email,
          });

        if (linkError) {
          console.error("Generate link error:", linkError);
          return new Response(
            JSON.stringify({ error: "Failed to authenticate new user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: sessionData, error: verifyError } =
          await supabase.auth.verifyOtp({
            token_hash: linkData.properties?.hashed_token!,
            type: "magiclink",
          });

        if (verifyError) {
          console.error("Verify OTP error:", verifyError);
          return new Response(
            JSON.stringify({ error: "Failed to create session" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        session = sessionData.session;

        // Resolve pending manager references
        const { data: newProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", newUser.user!.id)
          .maybeSingle();
        if (newProfile?.id) {
          await resolveWaitingManagerRefs(supabase, email, newProfile.id);
        }
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
    console.error("MS365 auth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
