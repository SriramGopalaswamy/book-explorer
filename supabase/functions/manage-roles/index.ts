import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(
    authHeader.replace("Bearer ", "")
  );

  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestingUserId = claimsData.claims.sub as string;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify requesting user is admin
  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", requestingUserId)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "list_users") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, department, job_title");

      const { data: roles } = await supabase.from("user_roles").select("user_id, role");

      const roleMap = new Map<string, string[]>();
      for (const r of roles || []) {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role);
      }

      const users = (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        department: p.department,
        job_title: p.job_title,
        roles: roleMap.get(p.user_id) || ["employee"],
      }));

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_role") {
      const { user_id, role } = body;

      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id and role required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validRoles = ["admin", "hr", "manager", "finance", "employee"];
      if (!validRoles.includes(role)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete existing roles for the user
      await supabase.from("user_roles").delete().eq("user_id", user_id);

      // Insert new role
      const { error: insertError } = await supabase.from("user_roles").insert({
        user_id,
        role,
      });

      if (insertError) {
        console.error("Insert role error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to update role" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Protect sriram@grx10.com from deletion
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", user_id)
        .maybeSingle();

      if (targetProfile?.email?.toLowerCase() === "sriram@grx10.com") {
        return new Response(JSON.stringify({ error: "This account is protected and cannot be deleted" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete user roles
      await supabase.from("user_roles").delete().eq("user_id", user_id);

      // Delete profile
      await supabase.from("profiles").delete().eq("user_id", user_id);

      // Delete auth user (may not exist for seeded/mock users)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);

      if (deleteError && deleteError.status !== 404) {
        console.error("Delete user error:", deleteError);
        return new Response(JSON.stringify({ error: "Failed to delete user: " + deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk_create_users") {
      const { users: newUsers } = body;

      if (!newUsers || !Array.isArray(newUsers) || newUsers.length === 0) {
        return new Response(JSON.stringify({ error: "users array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: { email: string; success: boolean; error?: string }[] = [];

      for (const u of newUsers) {
        const email = u.email?.toLowerCase().trim();
        const fullName = u.full_name?.trim() || "";
        const department = u.department?.trim() || null;
        const jobTitle = u.job_title?.trim() || null;
        const role = u.role?.toLowerCase().trim() || "employee";

        if (!email) {
          results.push({ email: u.email || "unknown", success: false, error: "Email is required" });
          continue;
        }

        const validRoles = ["admin", "hr", "manager", "finance", "employee"];
        if (!validRoles.includes(role)) {
          results.push({ email, success: false, error: `Invalid role: ${role}` });
          continue;
        }

        try {
          // Check if user already exists
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", email)
            .maybeSingle();

          if (existingProfile) {
            results.push({ email, success: false, error: "User already exists" });
            continue;
          }

          // Create auth user
          const tempPassword = crypto.randomUUID() + "Aa1!";
          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });

          if (createError || !newUser.user) {
            results.push({ email, success: false, error: createError?.message || "Failed to create user" });
            continue;
          }

          // Create profile
          await supabase.from("profiles").upsert({
            user_id: newUser.user.id,
            full_name: fullName,
            email,
            department,
            job_title: jobTitle,
            status: "active",
          }, { onConflict: "user_id" });

          // Assign role
          await supabase.from("user_roles").insert({
            user_id: newUser.user.id,
            role,
          });

          results.push({ email, success: true });
        } catch (err) {
          results.push({ email, success: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const errors = results.filter((r) => !r.success).map((r) => `${r.email}: ${r.error}`);

      return new Response(JSON.stringify({ success: true, created: successCount, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Manage roles error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
