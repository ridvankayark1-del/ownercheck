"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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

  const participantNames = useMemo(() => {
    if (!data) return "";

    return data.participants
      .map((participant) => getName(participant.profiles, participant.role))
      .join(" and ");
  }, [data]);

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
    <main className="mx-auto max-w-4xl px-5 py-12">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-bold text-muted">Private Chat</p>
            <h1 className="mt-2 text-3xl font-black">
              {data.chat.products?.name || "Direct request"}
            </h1>
            <p className="mt-2 text-sm font-bold text-muted">
              {participantNames}
            </p>
          </div>

          {data.chat.products?.slug && (
            <Link href={`/product/${data.chat.products.slug}`} className="btn">
              View product
            </Link>
          )}
        </div>

        {data.chat.direct_questions?.question_text && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-muted">
              Direct Request
            </p>
            <p className="mt-2 font-bold">
              {data.chat.direct_questions.question_text}
            </p>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {data.messages.map((item) => {
            const sentByViewer = item.sender_id === data.viewer.id;

            return (
              <article
                key={item.id}
                className={`rounded-2xl p-4 ${
                  sentByViewer ? "bg-black text-white" : "bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black">
                  <span>{sentByViewer ? "You" : getName(item.profiles, "Participant")}</span>
                  <span className={sentByViewer ? "text-slate-300" : "text-muted"}>
                    {formatTime(item.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap leading-7">
                  {item.message_text}
                </p>
              </article>
            );
          })}
        </div>

        {message && (
          <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}

        <div className="mt-6">
          <label className="label">Message</label>
          <textarea
            className="input mt-2 min-h-32"
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Write a private message..."
          />
          <button
            type="button"
            className="btn btn-dark mt-4"
            onClick={sendMessage}
            disabled={saving}
          >
            {saving ? "Sending..." : "Send message"}
          </button>
        </div>
      </section>
    </main>
  );
}
