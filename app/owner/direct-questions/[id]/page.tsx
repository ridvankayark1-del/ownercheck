"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type QuestionDetail = {
  id: string;
  product_id: string | null;
  buyer_id: string | null;
  owner_id: string | null;
  chat_id: string | null;
  question_text: string;
  answer_text: string | null;
  status: string;
  credit_reward: number | null;
  created_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  answered_at: string | null;
  products: {
    slug: string;
    name: string;
    brand: string | null;
    category: string | null;
  } | null;
  profiles: {
    display_name: string | null;
    email: string | null;
  } | null;
};

type DetailData = {
  question: QuestionDetail;
  viewer: {
    id: string;
    canAccept: boolean;
    canDecline: boolean;
    canOpenChat: boolean;
    isSelectedOwner: boolean;
    isBuyer: boolean;
  };
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getBuyerName(question: QuestionDetail) {
  if (question.profiles?.display_name) return question.profiles.display_name;
  if (question.profiles?.email) return question.profiles.email.split("@")[0];
  return "Unknown buyer";
}

export default function OwnerDirectQuestionPage({ params }: PageProps) {
  const [questionId, setQuestionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState<DetailData | null>(null);
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

  async function loadQuestion(id: string) {
    setLoading(true);
    setMessage("");

    const token = await getSessionToken();

    if (!token) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const response = await fetch(`/api/owner/direct-questions/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = (await response.json()) as DetailData & { error?: string };

    if (!response.ok) {
      setMessage(result.error || "Could not load this question.");
      setLoading(false);
      return;
    }

    setData(result);
    setLoading(false);
  }

  useEffect(() => {
    async function resolveParams() {
      const resolved = await params;
      setQuestionId(resolved.id);
      await loadQuestion(resolved.id);
    }

    resolveParams();
  }, [params]);

  async function updateRequest(action: "accept" | "decline") {
    const token = await getSessionToken();

    if (!token) {
      window.location.href = `/auth?redirect=/owner/direct-questions/${questionId}`;
      return;
    }

    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/owner/direct-questions/${questionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json()) as {
      chat?: { id: string };
      error?: string;
    };

    if (!response.ok) {
      setSaving(false);
      setMessage(result.error || `Could not ${action} this direct request.`);
      await loadQuestion(questionId);
      return;
    }

    setSaving(false);
    if (action === "accept" && result.chat?.id) {
      window.location.href = `/chats/${result.chat.id}`;
      return;
    }

    setMessage("Direct request declined.");
    await loadQuestion(questionId);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading question...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Log in to answer</h1>
          <p className="mt-3 text-muted">
            Selected owners can answer private direct requests.
          </p>
          <Link
            href={`/auth?redirect=/owner/direct-questions/${questionId}`}
            className="btn btn-dark mt-5"
          >
            Log in
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Question unavailable</h1>
          {message && (
            <p className="mt-3 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </p>
          )}
          <Link href="/owner/dashboard" className="btn mt-5">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const { question, viewer } = data;
  const isAccepted = ["accepted", "answered"].includes(question.status);
  const isDeclined = question.status === "declined";

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/owner/dashboard" className="text-sm font-bold text-muted">
        Back to owner dashboard
      </Link>

      <section className="card mt-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
          <span>{question.products?.name || "Unknown product"}</span>
          <span>/</span>
          <span>Buyer: {getBuyerName(question)}</span>
          <span>/</span>
          <span>{question.status}</span>
        </div>

        <h1 className="mt-4 text-3xl font-black">Direct Request</h1>
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-lg font-bold leading-8">
          {question.question_text}
        </p>

        {question.products?.slug && (
          <Link
            href={`/product/${question.products.slug}`}
            className="mt-4 inline-flex text-sm font-bold underline"
          >
            View product
          </Link>
        )}

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}

        {question.status === "pending" && viewer.canAccept && (
          <div className="mt-6 rounded-2xl bg-amber-50 p-4">
            <h2 className="font-black text-amber-900">
              Pending Direct Request
            </h2>
            <p className="mt-2 text-sm font-bold text-amber-800">
              Accepting creates a private chat between you and the buyer.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => updateRequest("accept")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Accept"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => updateRequest("decline")}
                disabled={saving}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {question.status === "pending" && !viewer.canAccept && (
          <div className="mt-6 rounded-2xl bg-amber-50 p-4">
            <h2 className="font-black text-amber-900">
              Pending Direct Request
            </h2>
            <p className="mt-2 text-sm font-bold text-amber-800">
              Only the selected owner can accept or decline this direct request.
            </p>
          </div>
        )}

        {isAccepted && question.chat_id && viewer.canOpenChat && (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <h2 className="font-black text-emerald-900">Private Chat Open</h2>
            <p className="mt-2 text-sm font-bold text-emerald-800">
              This direct request has been accepted.
            </p>
            <button
              type="button"
              className="btn btn-dark mt-4"
              onClick={() => {
                window.location.href = `/chats/${question.chat_id}`;
              }}
            >
              Open chat
            </button>
          </div>
        )}

        {isDeclined && (
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <h2 className="font-black">Direct Request Declined</h2>
            <p className="mt-2 text-sm font-bold text-muted">
              No private chat was created for this request.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
