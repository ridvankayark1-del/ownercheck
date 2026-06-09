"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_EMAIL = "reportkowalski1@gmail.com";

export function Header() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pendingDirectRequestCount, setPendingDirectRequestCount] = useState(0);

  useEffect(() => {
    async function loadPendingDirectRequestCount(userId: string) {
      const { count, error } = await supabase
        .from("direct_questions")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "pending");

      if (error) {
        setPendingDirectRequestCount(0);
        return;
      }

      setPendingDirectRequestCount(count || 0);
    }

    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setLoggedIn(!!user);
      setUserEmail(user?.email || null);
      if (user) {
        await loadPendingDirectRequestCount(user.id);
      } else {
        setPendingDirectRequestCount(0);
      }
      setReady(true);
    }

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
      setUserEmail(session?.user?.email || null);
      if (session?.user) {
        loadPendingDirectRequestCount(session.user.id);
      } else {
        setPendingDirectRequestCount(0);
      }
      setReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-xl font-black tracking-tight">
          OwnerCheck
        </Link>

        <div className="hidden items-center gap-5 text-sm font-semibold md:flex">
          <Link href="/explore">Explore</Link>
          <Link href="/add-product">Add product</Link>
          <Link href="/questions">Questions</Link>

          {ready && loggedIn && (
            <>
              <Link href="/my-products">My products</Link>
              <Link href="/direct-requests">
                Direct requests
                {pendingDirectRequestCount > 0
                  ? ` (${pendingDirectRequestCount})`
                  : ""}
              </Link>
              <Link href="/profile">Profile</Link>

              {userEmail === ADMIN_EMAIL && (
                <Link href="/admin/products">Admin</Link>
              )}

              <button type="button" onClick={signOut} className="btn">
                Sign out
              </button>
            </>
          )}

          {ready && !loggedIn && (
            <Link href="/auth" className="btn btn-dark">
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
