import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ms365-sync — Microsoft 365 integration hub.
 *
 * Actions:
 *   - check_status:     Verify Azure credentials and return connection status
 *   - sync_managers:    Pull manager assignments from MS365 org chart
 *   - provision_users:  Create auth accounts + profiles for all MS365 users
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// Helper: get SSO domain from org settings
async function getSSODomain(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from("organization_settings")
      .select("sso_domain")
      .eq("organization_id", DEFAULT_ORG_ID)
      .maybeSingle();
    if (data?.sso_domain) return data.sso_domain.toLowerCase();
  } catch { /* fallback */ }
  return "grx10.com";
}

// Helper: get app-only token from Azure AD
async function getAppToken(clientId: string, clientSecret: string, tenantId: string): Promise<string | null> {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  if (!tokenRes.ok) return null;
  const { access_token } = await tokenRes.json();
  return access_token;
}

// Helper: fetch all users from MS365 with the configured domain
async function fetchGraphUsers(accessToken: string, domain: string): Promise<any[]> {
  const usersRes = await fetch(
    `https://graph.microsoft.com/v1.0/users` +
    `?$select=id,mail,userPrincipalName,displayName,jobTitle,department,businessPhones,mobilePhone` +
    `&$filter=endswith(userPrincipalName,'@${domain}')` +
    `&$count=true&$top=999`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: "eventual",
      },
    }
  );
  if (!usersRes.ok) {
    const err = await usersRes.text();
    console.error("Graph users fetch failed:", err);
    throw new Error("Failed to fetch users from Microsoft 365");
  }
  const { value } = await usersRes.json();
  return value || [];
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

  // Verify caller is an authenticated admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", DEFAULT_ORG_ID)
    .in("role", ["admin"])
    .maybeSingle();

  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const ssoDomain = await getSSODomain(supabase);

    // ═══════════════════════════════════════════════════════════
    // check_status — Verify Azure credentials and return status
    // ═══════════════════════════════════════════════════════════
    if (action === "check_status") {
      const missingSecrets: string[] = [];
      if (!AZURE_CLIENT_ID) missingSecrets.push("AZURE_CLIENT_ID");
      if (!AZURE_CLIENT_SECRET) missingSecrets.push("AZURE_CLIENT_SECRET");
      if (!AZURE_TENANT_ID) missingSecrets.push("AZURE_TENANT_ID");

      if (missingSecrets.length > 0) {
        return new Response(JSON.stringify({
          connected: false,
          reason: `Missing secrets: ${missingSecrets.join(", ")}`,
          domain: ssoDomain,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Test token acquisition
      const accessToken = await getAppToken(AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID);
      if (!accessToken) {
        return new Response(JSON.stringify({
          connected: false,
          reason: "Azure credentials are invalid or missing User.Read.All permission.",
          domain: ssoDomain,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get last sync timestamp and provisioned count from org settings
      const { data: settings } = await supabase
        .from("organization_settings")
        .select("last_ms365_sync_at, ms365_provisioned_count, sso_only")
        .eq("organization_id", DEFAULT_ORG_ID)
        .maybeSingle();

      // Count users from Graph
      let userCount = 0;
      try {
        const users = await fetchGraphUsers(accessToken, ssoDomain);
        userCount = users.length;
      } catch { /* non-critical */ }

      return new Response(JSON.stringify({
        connected: true,
        domain: ssoDomain,
        ms365_user_count: userCount,
        last_sync_at: settings?.last_ms365_sync_at || null,
        provisioned_count: settings?.ms365_provisioned_count || 0,
        sso_only: settings?.sso_only || false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════
    // sync_managers — Pull manager assignments from MS365
    // ═══════════════════════════════════════════════════════════
    if (action === "sync_managers") {
      const accessToken = await getAppToken(AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: "Failed to get Microsoft 365 app token." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const graphUsers = await fetchGraphUsers(accessToken, ssoDomain);

      // Fetch manager for each user individually
      for (const msUser of graphUsers) {
        try {
          const mgrRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${msUser.id}/manager?$select=mail,userPrincipalName,displayName`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          msUser.manager = mgrRes.ok ? await mgrRes.json() : null;
        } catch {
          msUser.manager = null;
        }
      }

      // Load all profiles for the org
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, email, manager_id, pending_manager_email")
        .eq("organization_id", DEFAULT_ORG_ID);

      if (!profiles?.length) {
        return new Response(
          JSON.stringify({ synced: 0, skipped: 0, errors: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailToProfile = new Map(profiles.map((p) => [p.email?.toLowerCase(), p]));
      const profileIdByEmail = new Map(profiles.map((p) => [p.email?.toLowerCase(), p.id]));

      let synced = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const msUser of graphUsers) {
        const userEmail = (msUser.mail || msUser.userPrincipalName || "").toLowerCase();
        if (!userEmail.endsWith(`@${ssoDomain}`)) continue;

        const profile = emailToProfile.get(userEmail);
        if (!profile) { skipped++; continue; }

        const managerEmail = (
          msUser.manager?.mail || msUser.manager?.userPrincipalName || null
        )?.toLowerCase() ?? null;

        const resolvedManagerId = managerEmail
          ? profileIdByEmail.get(managerEmail) ?? null
          : null;

        const managerChanged =
          resolvedManagerId !== profile.manager_id ||
          (resolvedManagerId === null && managerEmail !== null && profile.pending_manager_email !== managerEmail) ||
          (resolvedManagerId !== null && profile.pending_manager_email !== null);

        if (!managerChanged) { skipped++; continue; }

        const update: Record<string, any> = {};
        if (resolvedManagerId) {
          update.manager_id = resolvedManagerId;
          update.pending_manager_email = null;
        } else if (managerEmail) {
          update.manager_id = null;
          update.pending_manager_email = managerEmail;
        } else {
          update.manager_id = null;
          update.pending_manager_email = null;
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update(update)
          .eq("id", profile.id);

        if (updateError) {
          errors.push(`${userEmail}: ${updateError.message}`);
        } else {
          synced++;
        }
      }

      // Update last sync timestamp
      await supabase
        .from("organization_settings")
        .update({ last_ms365_sync_at: new Date().toISOString() })
        .eq("organization_id", DEFAULT_ORG_ID);

      console.log(`ms365-sync complete: ${synced} updated, ${skipped} unchanged, ${errors.length} errors`);

      return new Response(
        JSON.stringify({ synced, skipped, errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // provision_users — Create auth accounts for all MS365 users
    // ═══════════════════════════════════════════════════════════
    if (action === "provision_users") {
      const accessToken = await getAppToken(AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: "Failed to get Microsoft 365 app token." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const graphUsers = await fetchGraphUsers(accessToken, ssoDomain);

      // Load existing profiles to skip already-provisioned users
      const { data: existingProfiles } = await supabase
        .from("profiles")
        .select("email")
        .eq("organization_id", DEFAULT_ORG_ID);

      const existingEmails = new Set(
        (existingProfiles || []).map((p) => p.email?.toLowerCase()).filter(Boolean)
      );

      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const msUser of graphUsers) {
        const email = (msUser.mail || msUser.userPrincipalName || "").toLowerCase();
        if (!email.endsWith(`@${ssoDomain}`)) { skipped++; continue; }
        if (existingEmails.has(email)) { skipped++; continue; }

        try {
          // Create auth user
          const tempPassword = crypto.randomUUID() + "Aa1!";
          const { data: newUser, error: createError } =
            await supabase.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { full_name: msUser.displayName || "" },
            });

          if (createError) {
            if (createError.code === 'email_exists' || createError.message?.includes('already been registered')) {
              skipped++;
              continue;
            }
            console.error(`Provision error for ${email}:`, createError.message, createError);
            errors.push(`${email}: ${createError.message}`);
            continue;
          }

          const userId = newUser.user!.id;

          // Create org membership
          await supabase
            .from("organization_members")
            .upsert(
              { user_id: userId, organization_id: DEFAULT_ORG_ID },
              { onConflict: "organization_id,user_id" }
            );

          // Create profile — auto-activated
          await supabase.from("profiles").insert({
            user_id: userId,
            email: email,
            full_name: msUser.displayName || null,
            job_title: msUser.jobTitle || null,
            department: msUser.department || null,
            phone: msUser.businessPhones?.[0] || msUser.mobilePhone || null,
            organization_id: DEFAULT_ORG_ID,
            status: "active",
          });

          // Assign employee role
          await supabase.from("user_roles").insert({
            user_id: userId,
            role: "employee",
            organization_id: DEFAULT_ORG_ID,
          });

          created++;
        } catch (err: any) {
          errors.push(`${email}: ${err.message}`);
        }
      }

      // Update provisioned count
      await supabase
        .from("organization_settings")
        .update({
          ms365_provisioned_count: (existingEmails.size + created),
          last_ms365_sync_at: new Date().toISOString(),
        })
        .eq("organization_id", DEFAULT_ORG_ID);

      console.log(`ms365-provision complete: ${created} created, ${skipped} skipped, ${errors.length} errors`);

      return new Response(
        JSON.stringify({ created, skipped, errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // update_sso_settings — Update SSO domain and SSO-only flag
    // ═══════════════════════════════════════════════════════════
    if (action === "update_sso_settings") {
      const { sso_domain, sso_only } = body;
      const update: Record<string, any> = {};
      if (typeof sso_domain === "string") update.sso_domain = sso_domain.toLowerCase().trim();
      if (typeof sso_only === "boolean") update.sso_only = sso_only;

      if (Object.keys(update).length === 0) {
        return new Response(JSON.stringify({ error: "No settings to update" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("organization_settings")
        .update(update)
        .eq("organization_id", DEFAULT_ORG_ID);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ms365-sync error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
