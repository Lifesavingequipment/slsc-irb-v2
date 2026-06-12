import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — IRB Coaching" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });
    setBusy(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
        toast.error("Email or password is incorrect. Check your details and try again.");
      } else if (msg.includes("email not confirmed")) {
        toast.error("Please confirm your email first — check your inbox for the link.");
      } else if (msg.includes("rate limit") || msg.includes("too many")) {
        toast.error("Too many attempts. Wait a minute and try again.");
      } else {
        toast.error(error.message);
      }
    }
    // On success, the auth listener updates `user` and the useEffect above
    // navigates to /dashboard. Navigating manually here races the listener
    // and causes a flash through /login or /signup.
  };

  const onForgotPassword = async () => {
    if (!email) {
      toast.error("Enter your email above first, then tap Forgot password.");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent. Check your inbox.");
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your IRB team."
      footer={<>No account? <Link to="/signup" className="text-accent font-medium">Create one</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={resetting}
              className="text-xs text-accent font-medium disabled:opacity-50"
            >
              {resetting ? "Sending..." : "Forgot password?"}
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 text-base" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
