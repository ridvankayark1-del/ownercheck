"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { supabase } from "@/lib/supabaseClient";
import { ProductSearch } from "@/components/ProductSearch";

import { PRODUCT_TAXONOMY } from "@/lib/productTaxonomy";

export function Header() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [chatAlertCount, setChatAlertCount] = useState(0);

  // Desktop Mega Menu State
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [activeMainCategory, setActiveMainCategory] = useState("audio");
  const megaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile Menu Drawer State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMegaMenuEnter = () => {
    if (megaMenuTimeoutRef.current) {
      clearTimeout(megaMenuTimeoutRef.current);
    }
    setIsMegaMenuOpen(true);
  };

  const handleMegaMenuLeave = () => {
    if (megaMenuTimeoutRef.current) {
      clearTimeout(megaMenuTimeoutRef.current);
    }
    megaMenuTimeoutRef.current = setTimeout(() => {
      setIsMegaMenuOpen(false);
    }, 250);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMegaMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (megaMenuTimeoutRef.current) {
        clearTimeout(megaMenuTimeoutRef.current);
      }
    };
  }, []);

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

  const activeMainConfig = PRODUCT_TAXONOMY[activeMainCategory];

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur">
      <nav className="mx-auto grid max-w-6xl gap-3 px-5 py-4 md:grid-cols-[auto_minmax(220px,420px)_auto] md:items-center">
        <Link href="/" className="text-xl font-black tracking-tight">
          OwnerCheck
        </Link>

        {pathname === "/explore" ? (
          <div className="order-3 md:order-none" />
        ) : (
          <ProductSearch
            compact
            placeholder="Search products..."
            className="order-3 md:order-none"
          />
        )}

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-5 text-sm font-semibold md:flex">
          {/* Products Dropdown Nav Item */}
          <div
            className="relative py-2"
            onMouseEnter={handleMegaMenuEnter}
            onMouseLeave={handleMegaMenuLeave}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-950 transition-colors"
            >
              Products
              <span className="text-[9px] text-slate-400">▼</span>
            </button>
          </div>

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

        {/* Mobile Navigation */}
        <div className="order-4 flex items-center gap-4 text-sm font-semibold md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="text-slate-700 font-semibold"
          >
            Products ▼
          </button>
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

      {/* Desktop Mega Menu Dropdown */}
      {isMegaMenuOpen && (
        <div
          className="absolute top-full left-0 right-0 bg-white border-b border-slate-200/80 shadow-2xl z-50 transition-all duration-300 ease-out"
          onMouseEnter={handleMegaMenuEnter}
          onMouseLeave={handleMegaMenuLeave}
        >
          <div className="mx-auto max-w-6xl px-5 py-8 grid grid-cols-[220px_1fr] gap-8">
            {/* Left Column: Main Categories */}
            <div className="border-r border-slate-100 pr-6 space-y-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-3 px-3">
                Departments
              </p>
              {Object.values(PRODUCT_TAXONOMY)
                .filter((m) => m.isActive)
                .map((main) => (
                  <button
                    key={main.slug}
                    onMouseEnter={() => setActiveMainCategory(main.slug)}
                    onClick={() => {
                      setIsMegaMenuOpen(false);
                      window.location.href = `/explore?main_category=${main.slug}`;
                    }}
                    className={`w-full text-left px-3.5 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                      activeMainCategory === main.slug
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
                    }`}
                  >
                    {main.label}
                  </button>
                ))}
            </div>

            {/* Right Area: Categories Grid */}
            <div className="py-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-5">
                Categories in {activeMainConfig?.label}
              </p>
              <div className="grid grid-cols-3 gap-8">
                {activeMainConfig &&
                  Object.values(activeMainConfig.categories)
                    .filter((c) => c.isActive)
                    .map((cat) => (
                      <div key={cat.slug} className="space-y-3">
                        <Link
                          href={`/explore?category=${cat.slug}`}
                          onClick={() => setIsMegaMenuOpen(false)}
                          className="block text-sm font-black text-slate-900 hover:underline hover:text-slate-950"
                        >
                          {cat.label}
                        </Link>
                        <ul className="space-y-2">
                          {cat.productTypes.slice(0, 5).map((pt) => (
                            <li key={pt.slug}>
                              <Link
                                href={`/explore?category=${cat.slug}&type=${pt.slug}`}
                                onClick={() => setIsMegaMenuOpen(false)}
                                className="text-xs font-semibold text-slate-400 hover:text-slate-900 transition-colors"
                              >
                                {pt.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-start">
          <div className="w-[85vw] max-w-sm bg-white h-full flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">All Products</h2>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-sm font-bold underline text-slate-500 hover:text-slate-900"
                >
                  Close
                </button>
              </div>

              <div className="space-y-6">
                {Object.values(PRODUCT_TAXONOMY)
                  .filter((m) => m.isActive)
                  .map((main) => (
                    <div key={main.slug} className="space-y-2">
                      <Link
                        href={`/explore?main_category=${main.slug}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block text-sm font-black text-slate-900 border-b border-slate-100 pb-1"
                      >
                        {main.label}
                      </Link>
                      <div className="pl-3 grid grid-cols-2 gap-2">
                        {Object.values(main.categories)
                          .filter((c) => c.isActive)
                          .map((cat) => (
                            <Link
                              key={cat.slug}
                              href={`/explore?category=${cat.slug}`}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-950 hover:underline py-1"
                            >
                              {cat.label}
                            </Link>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
