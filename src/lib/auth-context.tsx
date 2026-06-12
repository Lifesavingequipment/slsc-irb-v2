import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface MemberProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  profile_photo_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  memberProfile: MemberProfile | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadMemberProfile(userId: string): Promise<MemberProfile | null> {
  const { data } = await supabase
    .from("members")
    .select("id, first_name, last_name, preferred_name, profile_photo_url")
    .eq("auth_user_id", userId)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);

  useEffect(() => {
    // Listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) setMemberProfile(null);
    });
    // Then load existing session
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        const m = await loadMemberProfile(u.id);
        setMemberProfile(m);
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, memberProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
