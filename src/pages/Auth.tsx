import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, ArrowLeft } from "lucide-react";
import grx10Logo from "@/assets/grx10-logo.webp";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  // Keep login validation loose — actual credential check happens server-side
  password: z.string().min(1, "Password is required"),
});

// Password complexity: 12+ chars, uppercase, lowercase, digit, special char
const passwordComplexity = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Please enter a valid email address"),
  password: passwordComplexity,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;
type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [isMsLoading, setIsMsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const [ssoOnly, setSsoOnly] = useState(false);
  const { signIn, signUp, resetPassword, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  // Check SSO-only mode from org settings
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("organization_settings")
          .select("sso_only")
          .eq("organization_id", "00000000-0000-0000-0000-000000000001")
          .maybeSingle();
        if (data?.sso_only) setSsoOnly(true);
      } catch { /* ignore */ }
    })();
  }, []);


  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    if (error) {
      if (error.message.includes("Too many")) {
        toast.error(error.message);
      } else {
        // Generic message to prevent account enumeration
        toast.error("Invalid email or password. Please try again.");
      }
    } else {
      toast.success("Welcome back!");
    }
    setIsLoading(false);
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    const { error } = await signUp(data.email, data.password, data.fullName);
    if (error) {
      // Generic message to prevent account enumeration via registration
      toast.error("Unable to create account. If you already have an account, please sign in.");
    } else {
      toast.success("Account created! Please check your email to verify your account.");
      signupForm.reset();
      setActiveTab("login");
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    const { error } = await resetPassword(data.email);
    if (error) {
      // Always show success to prevent email enumeration
      console.error("[ForgotPassword] error:", error.message);
    }
    // Always show the same message regardless of whether email exists
    toast.success("If an account exists for that email, a reset link has been sent.");
    forgotPasswordForm.reset();
    setShowForgotPassword(false);
    setIsLoading(false);
  };

  const handleMicrosoftSignIn = async () => {
    setIsMsLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ms365-auth", {
        body: {
          action: "get_auth_url",
          redirect_uri: `${window.location.origin}/auth/callback`,
        },
      });
      if (fnError || data?.error) {
        toast.error(data?.error || fnError?.message || "Failed to start Microsoft sign in");
        setIsMsLoading(false);
        return;
      }
      // Validate redirect URL to prevent open redirect attacks
      const redirectUrl = new URL(data.url);
      const allowedHosts = ["login.microsoftonline.com", "login.microsoft.com", "login.live.com"];
      if (!allowedHosts.includes(redirectUrl.hostname)) {
        toast.error("Invalid authentication URL received");
        setIsMsLoading(false);
        return;
      }
      sessionStorage.setItem("ms365_oauth_state", data.state);
      window.location.href = data.url;
    } catch (err) {
      toast.error("An unexpected error occurred");
      setIsMsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || "Failed to sign in with Google");
        setIsGoogleLoading(false);
      }
      // If redirected, page will navigate away
    } catch (err) {
      toast.error("An unexpected error occurred");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-dark p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={grx10Logo} alt="GRX10" className="h-12 w-auto mb-4" />
          <p className="text-white/70 text-sm">Business Suite</p>
        </div>

        <Card className="shadow-xl border-border/50 bg-card/95 backdrop-blur">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">
              {showForgotPassword ? "Reset Password" : "Welcome"}
            </CardTitle>
            <CardDescription>
              {showForgotPassword 
                ? "Enter your email to receive a reset link" 
                : "Sign in to access your dashboard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setShowForgotPassword(false)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Button>
                <Form {...forgotPasswordForm}>
                  <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                    <FormField
                      control={forgotPasswordForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="you@company.com" type="email" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>) : "Send Reset Link"}
                    </Button>
                  </form>
                </Form>
              </div>
            ) : ssoOnly && !showEmailFallback ? (
              /* SSO-Primary Mode: MS365 button prominent, email fallback hidden */
              <div className="space-y-4">
                <Button type="button" className="w-full h-12 text-base" onClick={handleMicrosoftSignIn} disabled={isMsLoading}>
                  {isMsLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                  )}
                  Sign in with Microsoft 365
                </Button>

                <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading}>
                  {isGoogleLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Sign in with Google
                </Button>

                <div className="pt-2 text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowEmailFallback(true)}
                  >
                    Sign in with email &amp; password instead
                  </Button>
                </div>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField control={loginForm.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="you@company.com" type="email" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={loginForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Password</FormLabel>
                            <Button type="button" variant="link" className="px-0 h-auto font-normal text-xs text-muted-foreground hover:text-primary" onClick={() => setShowForgotPassword(true)}>
                              Forgot password?
                            </Button>
                          </div>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="••••••••" type="password" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>) : "Sign In"}
                      </Button>
                      
                      <div className="relative my-4">
                        <Separator />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                          or continue with
                        </span>
                      </div>
                      
                      <Button type="button" variant="outline" className="w-full" onClick={handleMicrosoftSignIn} disabled={isMsLoading}>
                        {isMsLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                          </svg>
                        )}
                        Sign in with Microsoft 365
                      </Button>

                      <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading}>
                        {isGoogleLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                        )}
                        Sign in with Google
                      </Button>

                      {ssoOnly && (
                        <div className="text-center">
                          <Button type="button" variant="link" className="text-xs text-muted-foreground" onClick={() => { setShowEmailFallback(false); }}>
                            ← Back to SSO login
                          </Button>
                        </div>
                      )}
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="signup">
                  <Form {...signupForm}>
                    <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                      <FormField control={signupForm.control} name="fullName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="John Doe" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={signupForm.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="you@company.com" type="email" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={signupForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="••••••••" type="password" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={signupForm.control} name="confirmPassword" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="••••••••" type="password" className="pl-10" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</>) : "Create Account"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-white/50 mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
