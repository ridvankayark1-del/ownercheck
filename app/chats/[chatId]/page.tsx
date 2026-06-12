"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { ProductImage } from "@/components/ProductImage";

type ChatDetail = {
  id: string;
  direct_question_id: string | null;
  product_id: string | null;
  buyer_id: string;
  owner_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  products: {
    slug: string;
    name: string;
    brand: string | null;
    category: string | null;
    image_url: string | null;
  } | null;
  direct_questions: {
    question_text: string;
    status: string;
  } | null;
};

type ProfileInfo = {
  display_name: string | null;
  email: string | null;
};

type ChatMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  profiles: ProfileInfo | null;
};

type ChatParticipant = {
  chat_id: string;
  user_id: string;
  role: string;
  profiles: ProfileInfo | null;
};

type ChatData = {
  chat: ChatDetail;
  messages: ChatMessage[];
  participants: ChatParticipant[];
  viewer: {
    id: string;
  };
};

type PageProps = {
  params: Promise<{
    chatId: string;
  }>;
};

function getName(profile: ProfileInfo | null, fallback: string) {
  if (profile?.display_name) return profile.display_name;
  if (profile?.email) return profile.email.split("@")[0];
  return fallback;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ChatPage({ params }: PageProps) {
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState<ChatData | null>(null);
  const [messageText, setMessageText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function getSessionToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      return null;
    }

    return session.access_token;
  }

  async function loadChat(id: string) {
    setLoading(true);
    setMessage("");

    const token = await getSessionToken();

    if (!token) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const response = await fetch(`/api/chats/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = (await response.json()) as ChatData & { error?: string };

    if (!response.ok) {
      setMessage(result.error || "Could not load this chat.");
      setLoading(false);
      return;
    }

    setData(result);
    setLoading(false);
  }

  useEffect(() => {
    async function resolveParams() {
      const resolved = await params;
      setChatId(resolved.chatId);
      await loadChat(resolved.chatId);
    }

    resolveParams();
  }, [params]);

  async function sendMessage() {
    const text = messageText.trim();

    if (!text) {
      setMessage("Write a message first.");
      return;
    }

    const token = await getSessionToken();

    if (!token) {
      window.location.href = `/auth?redirect=/chats/${chatId}`;
      return;
    }

    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/chats/${chatId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageText: text }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setSaving(false);
      setMessage(result.error || "Could not send this message.");
      return;
    }

    setMessageText("");
    setSaving(false);
    await loadChat(chatId);
  }

  const viewerIsOwner = data?.viewer.id === data?.chat.owner_id;
  const backHref = viewerIsOwner ? "/owner/dashboard" : "/profile";
  const backLabel = viewerIsOwner ? "Back to dashboard" : "Back to my directs";
  const buyerParticipant = data?.participants.find(
    (participant) => participant.role === "buyer"
  );
  const ownerParticipant = data?.participants.find(
    (participant) => participant.role === "owner"
  );
  const buyerName = getName(buyerParticipant?.profiles || null, "Buyer");
  const ownerName = getName(ownerParticipant?.profiles || null, "Owner");

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading private chat...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Log in to view chat</h1>
          <p className="mt-3 text-muted">
            Private chats are visible only to the buyer and selected owner.
          </p>
          <Link href={`/auth?redirect=/chats/${chatId}`} className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Chat unavailable</h1>
          {message && (
            <p className="mt-3 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </p>
          )}
          <Link href="/profile" className="btn mt-5">
            Back to profile
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <section className="card overflow-hidden p-0">
        <div className="border-b bg-white p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 md:h-28 md:w-28">
                {data.chat.products ? (
                  <ProductImage
                    src={data.chat.products.image_url}
                    category={data.chat.products.category}
                    alt={data.chat.products.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-black text-muted">
                    Product
                  </div>
                )}
              </div>
              <div>
                <p className="font-bold text-muted">Private Chat</p>
                <h1 className="mt-1 text-3xl font-black leading-tight">
                  {data.chat.products?.name || "Direct request"}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                    Private chat with verified owner
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    Buyer: {buyerName}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    Owner: {ownerName}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {data.chat.products?.slug && (
                <Link href={`/product/${data.chat.products.slug}`} className="btn">
                  View product
                </Link>
              )}
              <Link href={backHref} className="btn btn-dark">
                {backLabel}
              </Link>
            </div>
          </div>

          {data.chat.direct_questions?.question_text && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase text-muted">
                Original direct request
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                {data.chat.direct_questions.question_text}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-5 bg-slate-50 p-4 md:p-6">
          {data.messages.map((item) => {
            const sentByViewer = item.sender_id === data.viewer.id;

            return (
              <div
                key={item.id}
                className={`flex ${sentByViewer ? "justify-end" : "justify-start"}`}
              >
                <article
                  className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm md:max-w-[70%] ${
                    sentByViewer
                      ? "rounded-br-md bg-black text-white"
                      : "rounded-bl-md bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-black">
                    <span>
                      {sentByViewer ? "You" : getName(item.profiles, "Participant")}
                    </span>
                    <span className={sentByViewer ? "text-slate-300" : "text-muted"}>
                      {formatTime(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-7">
                    {item.message_text}
                  </p>
                </article>
              </div>
            );
          })}
        </div>

        {message && (
          <p className="mx-5 mt-5 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}

        <div className="border-t bg-white p-5 md:p-6">
          <label className="label">Message</label>
          <textarea
            className="input mt-2 min-h-28"
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Write a private reply about ownership, fit, usage, or buying advice..."
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-muted">
              Only the buyer and selected owner can view this chat.
            </p>
            <button
              type="button"
              className="btn btn-dark"
              onClick={sendMessage}
              disabled={saving}
            >
              {saving ? "Sending..." : "Send message"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
