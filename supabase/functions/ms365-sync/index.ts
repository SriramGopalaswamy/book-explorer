import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ms365-sync — proactive manager assignment sync from Microsoft 365.
 *
 * Uses app-only (client_credentials) auth to call the Microsoft Graph API
 * and pull the current manager for every @grx10.com user in the database.
 * Requires the Azure app to have the "User.Read.All" application permission
 * (not delegated) with tenant admin consent.
 *
 * Can be called:
 *   - By an admin via the "Sync from MS365" button in Settings → Users
 *   - By a Supabase pg_cron job for scheduled background sync
 *
 * Body: { action: "sync_managers" }
 * Returns: { synced: number, skipped: number, errors: string[] }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const AZURE_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
  const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const AZURE_TENANT_ID = Deno.env.get("AZURE_TENANT_ID")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller is an authenticated admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Validate JWT and check admin role using the standard getUser() pattern
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
    // ── Step 1: Get an app-only token via client_credentials ──────────────────
    // Requires "User.Read.All" application permission with admin consent in Azure AD.
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: AZURE_CLIENT_ID,
          client_secret: AZURE_CLIENT_SECRET,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("App token fetch failed:", err);
      return new Response(
        JSON.stringify({
          error: "Failed to get Microsoft 365 app token. Ensure the Azure app has User.Read.All application permission with admin consent.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenRes.json();

    // ── Step 2: Fetch all @grx10.com users with their managers from Graph ─────
    // $expand=manager pulls each user's manager in the same request.
    // endswith() on userPrincipalName is an advanced query — requires
    // ConsistencyLevel: eventual + $count=true or Graph returns 400.
    const usersRes = await fetch(
      `https://graph.microsoft.com/v1.0/users` +
      `?$select=mail,userPrincipalName,displayName` +
      `&$expand=manager($select=mail,userPrincipalName,displayName)` +
      `&$filter=endswith(userPrincipalName,'@grx10.com')` +
      `&$count=true` +
      `&$top=999`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          ConsistencyLevel: "eventual",
        },
      }
    );

    if (!usersRes.ok) {
      const err = await usersRes.text();
      console.error("Graph users fetch failed:", err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users from Microsoft 365" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { value: graphUsers } = await usersRes.json();

    // ── Step 3: Load all profiles for the org ────────────────────────────────
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

    // Build lookup maps
    const emailToProfile = new Map(
      profiles.map((p) => [p.email?.toLowerCase(), p])
    );
    const profileIdByEmail = new Map(
      profiles.map((p) => [p.email?.toLowerCase(), p.id])
    );

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    // ── Step 4: For each MS365 user, resolve manager and update if changed ────
    for (const msUser of graphUsers) {
      const userEmail = (msUser.mail || msUser.userPrincipalName || "").toLowerCase();
      if (!userEmail.endsWith("@grx10.com")) continue;

      const profile = emailToProfile.get(userEmail);
      if (!profile) {
        skipped++;
        continue; // User exists in MS365 but hasn't logged in yet — skip
      }

      const managerEmail = (
        msUser.manager?.mail || msUser.manager?.userPrincipalName || null
      )?.toLowerCase() ?? null;

      // Resolve manager email to profiles.id
      const resolvedManagerId = managerEmail
        ? profileIdByEmail.get(managerEmail) ?? null
        : null;

      const managerChanged =
        resolvedManagerId !== profile.manager_id ||
        (resolvedManagerId === null &&
          managerEmail !== null &&
          profile.pending_manager_email !== managerEmail) ||
        (resolvedManagerId !== null && profile.pending_manager_email !== null);

      if (!managerChanged) {
        skipped++;
        continue;
      }

      const update: Record<string, any> = {};
      if (resolvedManagerId) {
        // Manager is in our system — set manager_id and clear pending email
        update.manager_id = resolvedManagerId;
        update.pending_manager_email = null;
      } else if (managerEmail) {
        // Manager exists in MS365 but hasn't logged in yet
        update.manager_id = null;
        update.pending_manager_email = managerEmail;
      } else {
        // No manager assigned in MS365
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

    console.log(`ms365-sync complete: ${synced} updated, ${skipped} unchanged, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ synced, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ms365-sync error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
