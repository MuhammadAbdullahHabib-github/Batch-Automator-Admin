"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { callRpc } from "@/lib/api";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  // loading stays true through the first client render (matching the server's render,
  // which never has a session) — avoids a hydration mismatch the same way the previous
  // localStorage-based version needed useSyncExternalStore for, but here it falls out
  // naturally: supabase-js's session restore is itself async.
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null); // { user_id, role, display_name, email } from whoami()
  const [loading, setLoading] = useState(true);
  const [signInError, setSignInError] = useState("");

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });

    async function applySession(newSession) {
      setSession(newSession);
      if (newSession) {
        try {
          const rows = await callRpc("whoami");
          if (active) setMe(rows?.[0] ?? null);
        } catch {
          if (active) setMe(null);
        }
      } else {
        setMe(null);
      }
      if (active) setLoading(false);
    }

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    setSignInError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setSignInError(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        me,
        role: me?.role ?? null,
        loading,
        signInError,
        signIn,
        signOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
