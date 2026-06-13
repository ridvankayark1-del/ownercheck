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
  const [chatAlertCount, setChatAlertCount] = useState(0);

  useEffect(() => {
    async function loadChatAlerts(userId: string) {
      const { data: chats, error: chatsError } = await supabase
        .from("chats")
        .select("id")
        .or(`buyer_id.eq.${userId},owner_id.eq.${userId}`);

      if (chatsError || !chats || chats.length === 0) {
        setChatAlertCount(0);
        return;
      }

      const chatIds = chats.map((chat) => chat.id);
      const { data: messages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("id, chat_id, sender_id, created_at")
        .in("chat_id", chatIds)
        .neq("sender_id", userId)
        .order("created_at", { ascending: false });

      if (messagesError || !messages) {
        setChatAlertCount(0);
        return;
      }

      const alertedChatIds = new Set<string>();

      messages.forEach((message) => {
        if (alertedChatIds.has(message.chat_id)) {
          return;
        }

        const seenAt = window.localStorage.getItem(
          `ownercheck:chatSeen:${message.chat_id}`
        );

        if (seenAt && new Date(message.created_at) > new Date(seenAt)) {
          alertedChatIds.add(message.chat_id);
        }
      });

      setChatAlertCount(alertedChatIds.size);
    }

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
        await Promise.all([loadOwnerStatus(user.id), loadChatAlerts(user.id)]);
        const adminCheck = await checkCurrentUserIsAdmin();
        setIsAdmin(adminCheck.isAdmin);
      } else {
        setIsOwner(false);
        setIsAdmin(false);
        setChatAlertCount(0);
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
        loadChatAlerts(session.user.id);
        checkCurrentUserIsAdmin().then((adminCheck) => {
          setIsAdmin(adminCheck.isAdmin);
        });
      } else {
        setIsOwner(false);
        setIsAdmin(false);
        setChatAlertCount(0);
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

  const chatsLink = (
    <Link href="/chats" className="relative inline-flex items-center gap-1">
      Chats
      {chatAlertCount > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
          {chatAlertCount > 9 ? "9+" : chatAlertCount}
        </span>
      )}
    </Link>
  );

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
              {chatsLink}
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
          {ready && loggedIn && chatsLink}
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
