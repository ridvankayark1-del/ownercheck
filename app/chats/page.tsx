"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { supabase } from "@/lib/supabaseClient";

type ProductInfo = {
  slug: string;
  name: string;
  image_url: string | null;
  category: string | null;
};

type RawChat = {
  id: string;
  buyer_id: string;
  owner_id: string;
  updated_at: string;
  products: ProductInfo | ProductInfo[] | null;
};

type ProfileInfo = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type ChatRow = {
  id: string;
  buyer_id: string;
  owner_id: string;
  updated_at: string;
  products: ProductInfo | null;
  otherParticipant: ProfileInfo | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

function getProfileName(profile: ProfileInfo | null) {
  if (profile?.display_name) return profile.display_name;
  if (profile?.email) return profile.email.split("@")[0];
  return "OwnerCheck user";
}

export default function ChatsInboxPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [viewerId, setViewerId] = useState("");
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadInbox() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setErrorMessage(userError.message);
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      if (!user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);
      setViewerId(user.id);

      const { data, error } = await supabase
        .from("chats")
        .select("id, buyer_id, owner_id, updated_at, products(slug, name, image_url, category)")
        .or(`buyer_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setChats([]);
        setLoading(false);
        return;
      }

      const normalizedChats = ((data || []) as RawChat[]).map((chat) => ({
        ...chat,
        products: normalizeSingle(chat.products),
      }));
      const otherParticipantIds = Array.from(
        new Set(
          normalizedChats.map((chat) =>
            chat.buyer_id === user.id ? chat.owner_id : chat.buyer_id
          )
        )
      );

      const { data: profileData, error: profileError } =
        otherParticipantIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, display_name, email")
              .in("id", otherParticipantIds)
          : { data: [] as ProfileInfo[], error: null };

      if (profileError) {
        setErrorMessage(profileError.message);
      }

      const profileMap = new Map(
        ((profileData || []) as ProfileInfo[]).map((profile) => [
          profile.id,
          profile,
        ])
      );

      setChats(
        normalizedChats.map((chat) => {
          const otherParticipantId =
            chat.buyer_id === user.id ? chat.owner_id : chat.buyer_id;

          return {
            ...chat,
            otherParticipant: profileMap.get(otherParticipantId) || null,
          };
        })
      );
      setLoading(false);
    }

    loadInbox();
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading chats...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Log in to view chats</h1>
          <p className="mt-3 text-muted">
            Your buyer and owner conversations will appear here.
          </p>
          <Link href="/auth?redirect=/chats" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase text-muted">
            Private chats
          </p>
          <h1 className="mt-1 text-4xl font-black">Inbox</h1>
        </div>
      </div>

      {errorMessage && (
        <p className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {errorMessage}
        </p>
      )}

      {chats.length === 0 ? (
        <div className="card p-6">
          <h2 className="text-2xl font-black">No chats yet</h2>
          <p className="mt-3 text-muted">
            Accepted private chat requests will show up here.
          </p>
          <Link href="/explore" className="btn btn-dark mt-5">
            Explore products
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {chats.map((chat) => {
            const product = chat.products;
            const viewerIsBuyer = chat.buyer_id === viewerId;

            return (
              <Link
                key={chat.id}
                href={`/chats/${chat.id}`}
                className="flex items-center gap-4 border-b border-slate-100 p-4 transition hover:bg-slate-50 last:border-b-0"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {product ? (
                    <ProductImage
                      src={product.image_url}
                      category={product.category}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs font-black text-muted">
                      Product
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-black">
                    {product?.name || "Direct request"}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-muted">
                    With {getProfileName(chat.otherParticipant)}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                    viewerIsBuyer
                      ? "bg-slate-100 text-slate-700"
                      : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {viewerIsBuyer ? "Buying" : "Owning"}
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
