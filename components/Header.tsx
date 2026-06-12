"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { supabase } from "@/lib/supabaseClient";
import { ProductSearch } from "@/components/ProductSearch";

export function Header() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    async function loadOwnerStatus(userId: string) {
      const { count, error } = await supabase
        .from("owned_products")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (error) {
        setIsOwner(false);
        return;
      }

      setIsOwner((count || 0) > 0);
    }

    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setLoggedIn(!!user);
      if (user) {
        await loadOwnerStatus(user.id);
        const adminCheck = await checkCurrentUserIsAdmin();
        setIsAdmin(adminCheck.isAdmin);
      } else {
        setIsOwner(false);
        setIsAdmin(false);
      }
      setReady(true);
    }

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
      if (session?.user) {
        loadOwnerStatus(session.user.id);
        checkCurrentUserIsAdmin().then((adminCheck) => {
          setIsAdmin(adminCheck.isAdmin);
        });
      } else {
        setIsOwner(false);
        setIsAdmin(false);
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
      <nav className="mx-auto grid max-w-6xl gap-3 px-5 py-4 md:grid-cols-[auto_minmax(220px,420px)_auto] md:items-center">
        <Link href="/" className="text-xl font-black tracking-tight">
          OwnerCheck
        </Link>

        <ProductSearch
          compact
          placeholder="Search products..."
          className="order-3 md:order-none"
        />

        <div className="hidden items-center gap-5 text-sm font-semibold md:flex">
          <Link href="/explore">Explore</Link>

          {ready && loggedIn && (
            <>
              {isOwner && <Link href="/owner/dashboard">Owner Dashboard</Link>}
              <Link href="/profile">Profile</Link>

              {isAdmin && <Link href="/admin/product-factory">Admin</Link>}

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

        <div className="order-4 flex items-center gap-4 text-sm font-semibold md:hidden">
          <Link href="/explore">Explore</Link>
          {ready && loggedIn && isOwner && (
            <Link href="/owner/dashboard">Owner Dashboard</Link>
          )}
          {ready && loggedIn && <Link href="/profile">Profile</Link>}
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
