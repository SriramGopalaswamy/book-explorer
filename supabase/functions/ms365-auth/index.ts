import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: sync profile fields + manager_id from MS365 data
async function syncProfileFromMS365(
  supabase: any,
  userId: string,
  fullName: string,
  jobTitle: string | null,
  department: string | null,
  phone: string | null,
  email: string,
  managerEmail: string | null,
) {
  try {
    // Look up the manager's profile_id by their email
    let managerId: string | null = null;
    if (managerEmail) {
      const { data: managerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", managerEmail.toLowerCase())
        .maybeSingle();
      managerId = managerProfile?.id || null;
    }

    // Update the user's profile with MS365 data
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const profileData: Record<string, any> = {
      full_name: fullName,
      email: email.toLowerCase(),
    };
    if (jobTitle) profileData.job_title = jobTitle;
    if (department) profileData.department = department;
    if (phone) profileData.phone = phone;
    if (managerId) profileData.manager_id = managerId;

    if (existingProfile) {
      await supabase
        .from("profiles")
        .update(profileData)
        .eq("id", existingProfile.id);
    } else {
      await supabase
        .from("profiles")
        .insert({ ...profileData, user_id: userId });
    }
  } catch (err) {
    console.warn("Failed to sync profile from MS365:", err);
  }
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
      // Exchange code for tokens with Azure AD
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

      // Verify @grx10.com domain
      if (!email?.toLowerCase().endsWith("@grx10.com")) {
        return new Response(
          JSON.stringify({ error: "Only @grx10.com accounts are allowed" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use service role to sign in or create user
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Check if user exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

      let session;

      if (existingUser) {
        // Sign in existing user by generating a session
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

        // Use the token hash to verify OTP and get a session
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

        // Update profile with latest MS365 data
        await syncProfileFromMS365(supabase, existingUser.id, fullName, jobTitle, department, phone, email, managerEmail);

        // Ensure role exists for existing user
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (!existingRole) {
          const adminEmails = ["sriram@grx10.com", "nikita@grx10.com", "anchal@grx10.com"];
          const role = adminEmails.includes(email.toLowerCase()) ? "admin" : "employee";
          await supabase.from("user_roles").insert({
            user_id: existingUser.id,
            role,
          });
        }
      } else {
        // Create new user
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: newUser, error: createError } =
          await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });

        if (createError) {
          console.error("Create user error:", createError);
          return new Response(
            JSON.stringify({ error: "Failed to create user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Assign role: admin for sriram@grx10.com, employee for everyone else
        const adminEmails = ["sriram@grx10.com", "nikita@grx10.com", "anchal@grx10.com"];
        const role = adminEmails.includes(email.toLowerCase()) ? "admin" : "employee";
        await supabase.from("user_roles").insert({
          user_id: newUser.user!.id,
          role,
        });

        // Generate session for the new user
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

        // Sync profile with MS365 data for new user
        await syncProfileFromMS365(supabase, newUser.user!.id, fullName, jobTitle, department, phone, email, managerEmail);
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
