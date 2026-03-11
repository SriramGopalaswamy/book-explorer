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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify JWT and get user ID using getUser (faster than getClaims)
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestingUserId = userData.user.id;

  // Combined: verify admin role AND get org in parallel
  const [membershipResult, adminRoleResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", requestingUserId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", requestingUserId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);

  const requestingOrgId = membershipResult.data?.organization_id;

  if (!adminRoleResult.data || !requestingOrgId) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const protectedEmails = (Deno.env.get("PROTECTED_ADMIN_EMAILS") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  try {
    const body = await req.json();
    const { action } = body;

    // ─────────────────────────────────────────────
    // list_users — returns all users in org with status and manager info
    // ─────────────────────────────────────────────
    if (action === "list_users") {
      const [profilesResult, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email, department, job_title, status, manager_id, pending_manager_email")
          .eq("organization_id", requestingOrgId),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("organization_id", requestingOrgId),
      ]);

      const roleMap = new Map<string, string[]>();
      for (const r of rolesResult.data || []) {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role);
      }

      const users = (profilesResult.data || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        department: p.department,
        job_title: p.job_title,
        status: p.status || "active",
        manager_id: p.manager_id,
        pending_manager_email: p.pending_manager_email,
        roles: roleMap.get(p.user_id) || ["employee"],
      }));

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // set_role — change a user's role
    // ─────────────────────────────────────────────
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

      // SECURITY: Verify target user belongs to same org
      const { data: targetMember } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", requestingOrgId)
        .maybeSingle();
      if (!targetMember) {
        return new Response(JSON.stringify({ error: "Target user not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete existing roles for the user (scoped)
      await supabase.from("user_roles").delete().eq("user_id", user_id).eq("organization_id", requestingOrgId);

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

    // ─────────────────────────────────────────────
    // approve_user — approve a pending user, set status active and assign role
    // ─────────────────────────────────────────────
    if (action === "approve_user") {
      const { user_id, role } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const assignedRole = (role || "employee").toLowerCase();
      const validRoles = ["admin", "hr", "manager", "finance", "employee"];
      if (!validRoles.includes(assignedRole)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: Verify target user belongs to same org
      const { data: targetMember } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", requestingOrgId)
        .maybeSingle();
      if (!targetMember) {
        return new Response(JSON.stringify({ error: "Target user not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify user is actually pending
      const { data: pendingProfile } = await supabase
        .from("profiles")
        .select("status")
        .eq("user_id", user_id)
        .maybeSingle();

      if (!pendingProfile || pendingProfile.status !== "pending_approval") {
        return new Response(JSON.stringify({ error: "User is not in pending_approval status" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Activate the profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("user_id", user_id);

      if (updateError) {
        console.error("Profile activate error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to activate user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert role (replace any existing)
      await supabase.from("user_roles").delete().eq("user_id", user_id).eq("organization_id", requestingOrgId);
      await supabase.from("user_roles").insert({ user_id, role: assignedRole });

      // Unban in auth if previously banned
      await supabase.auth.admin.updateUserById(user_id, { ban_duration: "none" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // deactivate_user — soft deactivate: marks inactive, bans auth, reassigns reports
    // ─────────────────────────────────────────────
    if (action === "deactivate_user") {
      const { user_id, replacement_manager_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: Verify target user belongs to same org
      const { data: targetMemberDea } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", requestingOrgId)
        .maybeSingle();
      if (!targetMemberDea) {
        return new Response(JSON.stringify({ error: "Target user not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prevent deactivating protected accounts
      const { data: targetProfileDea } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("user_id", user_id)
        .maybeSingle();

      if (targetProfileDea?.email && protectedEmails.includes(targetProfileDea.email.toLowerCase())) {
        return new Response(JSON.stringify({ error: "This account is protected and cannot be deactivated" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reassign direct reports to replacement manager (or null if none provided)
      if (targetProfileDea?.id) {
        await supabase
          .from("profiles")
          .update({ manager_id: replacement_manager_id || null })
          .eq("manager_id", targetProfileDea.id)
          .eq("organization_id", requestingOrgId);
      }

      // Soft deactivate: set status inactive + soft delete flags
      const { error: deactivateError } = await supabase
        .from("profiles")
        .update({
          status: "inactive",
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      if (deactivateError) {
        console.error("Deactivate error:", deactivateError);
        return new Response(JSON.stringify({ error: "Failed to deactivate user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ban user in auth to immediately invalidate future token refreshes (~100 years)
      await supabase.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // delete_user — soft-deletes profile (trigger blocks hard delete), hard-deletes auth user
    // ─────────────────────────────────────────────
    if (action === "delete_user") {
      const { user_id, replacement_manager_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: Verify target user belongs to same org
      const { data: targetMemberDel } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", requestingOrgId)
        .maybeSingle();
      if (!targetMemberDel) {
        return new Response(JSON.stringify({ error: "Target user not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Protect designated admin accounts from deletion
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("user_id", user_id)
        .maybeSingle();

      if (targetProfile?.email && protectedEmails.includes(targetProfile.email.toLowerCase())) {
        return new Response(JSON.stringify({ error: "This account is protected and cannot be deleted" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reassign direct reports before removing manager reference
      if (targetProfile?.id) {
        await supabase
          .from("profiles")
          .update({ manager_id: replacement_manager_id || null })
          .eq("manager_id", targetProfile.id)
          .eq("organization_id", requestingOrgId);
      }

      // Delete user roles
      await supabase.from("user_roles").delete().eq("user_id", user_id);

      // Soft delete profile (prevent_profile_hard_delete trigger blocks actual DELETE)
      await supabase
        .from("profiles")
        .update({
          status: "inactive",
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      // Hard delete auth user (removes login ability; profile data is preserved)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);

      if (deleteError && deleteError.status !== 404) {
        console.error("Delete auth user error:", deleteError);
        return new Response(JSON.stringify({ error: "Failed to delete user: " + deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // get_direct_reports — list employees managed by a given profile
    // ─────────────────────────────────────────────
    if (action === "get_direct_reports") {
      const { profile_id } = body;

      if (!profile_id) {
        return new Response(JSON.stringify({ error: "profile_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: reports } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email")
        .eq("manager_id", profile_id)
        .eq("organization_id", requestingOrgId)
        .neq("status", "inactive");

      return new Response(JSON.stringify({ direct_reports: reports || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // update_manager — admin manually sets manager_id for a user.
    // Accepts manager_user_id (auth user UUID) and resolves to profiles.id internally.
    // ─────────────────────────────────────────────
    if (action === "update_manager") {
      const { user_id, manager_user_id } = body; // manager_user_id = null to remove manager

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: Verify target user belongs to same org
      const { data: targetMemberMgr } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", requestingOrgId)
        .maybeSingle();
      if (!targetMemberMgr) {
        return new Response(JSON.stringify({ error: "Target user not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve manager_user_id → manager profiles.id (FK on profiles.manager_id)
      let resolvedManagerProfileId: string | null = null;
      if (manager_user_id) {
        // Self-assignment check
        if (manager_user_id === user_id) {
          return new Response(JSON.stringify({ error: "A user cannot be their own manager" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: managerProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", manager_user_id)
          .eq("organization_id", requestingOrgId)
          .maybeSingle();
        if (!managerProfile) {
          return new Response(JSON.stringify({ error: "Manager not found in your organization" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        resolvedManagerProfileId = managerProfile.id;
      }

      const { error: mgrUpdateError } = await supabase
        .from("profiles")
        .update({
          manager_id: resolvedManagerProfileId,
          pending_manager_email: null,
        })
        .eq("user_id", user_id);

      if (mgrUpdateError) {
        console.error("Update manager error:", mgrUpdateError);
        return new Response(JSON.stringify({ error: "Failed to update manager" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // create_user — single user creation by admin
    // ─────────────────────────────────────────────
    if (action === "create_user") {
      const { email, full_name, department, job_title, phone, join_date, status, role, manager_id } = body;

      if (!email) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const assignedRole = (role || "employee").toLowerCase();
      const validRoles = ["admin", "hr", "manager", "finance", "employee"];
      if (!validRoles.includes(assignedRole)) {
        return new Response(JSON.stringify({ error: `Invalid role: ${assignedRole}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (existingProfile) {
        return new Response(JSON.stringify({ error: "A user with this email already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user with a temporary password; they'll sign in via MS365
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name || "" },
      });

      if (createError || !newUser.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Failed to create auth user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser.user.id;

      // Upsert profile — admin-created users start as 'active' (pre-provisioned)
      const { error: profileError } = await supabase.from("profiles").upsert({
        user_id: userId,
        full_name: full_name || null,
        email: email.toLowerCase().trim(),
        department: department || null,
        job_title: job_title || null,
        phone: phone || null,
        join_date: join_date || null,
        status: status || "active",
        manager_id: manager_id || null,
      }, { onConflict: "user_id" });

      if (profileError) {
        console.error("Profile upsert error:", profileError);
        await supabase.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: "Failed to create profile" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign role
      await supabase.from("user_roles").insert({ user_id: userId, role: assignedRole });

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────
    // bulk_create_users — CSV-based bulk create/update
    // ─────────────────────────────────────────────
    if (action === "bulk_create_users") {
      const { users: newUsers } = body;

      if (!newUsers || !Array.isArray(newUsers) || newUsers.length === 0) {
        return new Response(JSON.stringify({ error: "users array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: { email: string; success: boolean; updated?: boolean; error?: string }[] = [];

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
            // Verify user belongs to requesting admin's organization
            const { data: member } = await supabase
              .from("organization_members")
              .select("id")
              .eq("user_id", existingProfile.user_id)
              .eq("organization_id", requestingOrgId)
              .maybeSingle();

            if (!member) {
              results.push({ email, success: false, error: "User not in your organization" });
              continue;
            }

            // User exists — update their profile attributes and role
            const updateFields: Record<string, string | null> = {};
            if (fullName) updateFields.full_name = fullName;
            if (department !== null) updateFields.department = department;
            if (jobTitle !== null) updateFields.job_title = jobTitle;

            if (Object.keys(updateFields).length > 0) {
              await supabase.from("profiles").update(updateFields).eq("user_id", existingProfile.user_id);
            }

            // Update role: scoped to requesting org only
            await supabase.from("user_roles").delete()
              .eq("user_id", existingProfile.user_id)
              .eq("organization_id", requestingOrgId);
            await supabase.from("user_roles").insert({
              user_id: existingProfile.user_id,
              role,
              organization_id: requestingOrgId,
            });

            results.push({ email, success: true, updated: true });
            continue;
          }

          // Create auth user — admin bulk-created users start as 'active' (pre-provisioned)
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

          // Create profile with active status (pre-provisioned by admin)
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
      const createdCount = results.filter((r) => r.success && !r.updated).length;
      const updatedCount = results.filter((r) => r.success && r.updated).length;
      const errors = results.filter((r) => !r.success).map((r) => `${r.email}: ${r.error}`);

      return new Response(JSON.stringify({ success: true, created: createdCount, updated: updatedCount, total: successCount, errors }), {
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
