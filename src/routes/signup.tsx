import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { WelcomeInfo } from "@/components/WelcomeInfo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — IRB Coaching" }] }),
  component: SignupPage,
});

const schema = z
  .object({
    first_name: z.string().trim().min(1, "First name required").max(60),
    last_name: z.string().trim().min(1, "Last name required").max(60),
    email: z.string().trim().email("Enter a valid email").max(255),
    phone: z.string().trim().min(5, "Phone required").max(30),
    date_of_birth: z.string().min(1, "Date of birth required"),
    gender: z.string().min(1, "Select an option"),
    password: z.string().min(8, "At least 8 characters").max(72),
    confirm_password: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

const readableSignupError = (message: string) => {
  if (message.toLowerCase().includes("weak password")) {
    return "That password is too common. Try a more unique password with letters, numbers, and symbols.";
  }
  return message;
};

function SignupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fromShare, setFromShare] = useState(false);
  const [newClubIntent, setNewClubIntent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      sessionStorage.setItem("pending_invite_code", invite.toUpperCase());
      setFromShare(true);
    }
    if (params.get("new_club") === "1") {
      sessionStorage.setItem("new_club_intent", "1");
      setNewClubIntent(true);
      setFromShare(true);
    }
  }, []);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = schema.safeParse({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      date_of_birth: dob,
      gender,
      password,
      confirm_password: confirmPassword,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues[0].message;
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    const full_name = `${parsed.data.first_name} ${parsed.data.last_name}`.trim();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name, phone: parsed.data.phone },
      },
    });
    if (error) {
      setBusy(false);
      const msg = readableSignupError(error.message);
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }

    // If auto-confirm is on, session exists — write the full profile.
    if (data.session && data.user) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          full_name,
          phone: parsed.data.phone,
          email: parsed.data.email.toLowerCase(),
          gender: parsed.data.gender,
        },
        { onConflict: "id" },
      );
      const { error: identityError } = await supabase.from("profile_identity").upsert(
        {
          user_id: data.user.id,
          date_of_birth: parsed.data.date_of_birth,
        },
        { onConflict: "user_id" },
      );

      if (profileError || identityError) {
        setBusy(false);
        const msg = profileError?.message ?? identityError?.message ?? "Account created, but profile setup failed.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
    }

    setBusy(false);
    if (data.session) {
      toast.success("Account created.");
      navigate({ to: "/dashboard", replace: true });
    } else {
      toast.success("Account created. Check your email to confirm.");
      navigate({ to: "/login", replace: true });
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        newClubIntent
          ? "Start your club on IRB Coaching."
          : fromShare
            ? "Join your club and start RSVPing to sessions."
            : "Join your club and start RSVPing to sessions."
      }
      footer={
        <>
          Already a member?{" "}
          <Link to="/login" className="text-accent font-medium">
            Sign in
          </Link>
        </>
      }
    >
      {fromShare && <WelcomeInfo />}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first">First name</Label>
            <Input
              id="first"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last">Last name</Label>
            <Input
              id="last"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gender">Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="gender">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="non_binary">Non-binary</SelectItem>
                <SelectItem value="prefer_not">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-accent hover:text-accent/80"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum 8 characters. Avoid common passwords.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pr-20"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((s) => !s)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-accent hover:text-accent/80"
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 text-base" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
        </Button>
        {errorMsg && (
          <p className="text-sm text-red-600 text-center">{errorMsg}</p>
        )}
      </form>
    </AuthShell>
  );
}
