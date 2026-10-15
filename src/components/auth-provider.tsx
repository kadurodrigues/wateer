import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/** "disabled" means no Supabase project is configured, so the app is local-only. */
export type AuthStatus = "disabled" | "loading" | "signed-out" | "signed-in";

export type AccountProfile = {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  profile: AccountProfile | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function profileOf(user: User): AccountProfile {
  const meta = user.user_metadata as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  const avatar = text(meta["avatar_url"]) ?? text(meta["picture"]);
  return {
    name: text(meta["full_name"]) ?? text(meta["name"]),
    email: user.email ?? null,
    avatarUrl: avatar?.startsWith("https://") ? avatar : null,
  };
}

const OAUTH_PARAMS = ["code", "error", "error_code", "error_description", "state"];

/** A failed sign-in comes back as ?error=…; read it before Supabase strips the URL. */
function readAuthErrorFromUrl(): string | null {
  const params = new URL(window.location.href).searchParams;
  return params.get("error_description") ?? params.get("error");
}

/** Once Supabase has exchanged ?code=, the OAuth parameters don't belong in the address bar. */
function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  if (!OAUTH_PARAMS.some((key) => url.searchParams.has(key))) return;
  for (const key of OAUTH_PARAMS) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>(
    isSupabaseConfigured ? "loading" : "disabled",
  );
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Before getSupabase(): creating the client consumes the redirect's parameters.
    const redirectError = readAuthErrorFromUrl();
    const supabase = getSupabase();
    if (!supabase) return;
    if (redirectError) toast.error(`Sign-in didn't complete: ${redirectError}`);

    const apply = (next: User | null) => {
      setUser(next);
      setStatus(next ? "signed-in" : "signed-out");
    };

    // Fires once with the stored session (after exchanging a returning ?code=), then on
    // every sign-in, sign-out and token refresh, including from other tabs.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      apply(session?.user ?? null);
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") clearAuthParamsFromUrl();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Back to wherever sign-in started, so previews and localhost work too.
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) toast.error(`Couldn't start sign-in: ${error.message}`);
  }, []);

  const signOut = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(`Couldn't sign out: ${error.message}`);
  }, []);

  const value = React.useMemo(
    () => ({
      status,
      user,
      profile: user ? profileOf(user) : null,
      signInWithGoogle,
      signOut,
    }),
    [status, user, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
