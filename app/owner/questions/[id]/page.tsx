"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type PublicQuestionDetail = {
  id: string;
  product_id: string;
  buyer_id: string | null;
  winning_owner_id: string | null;
  winning_answer_id: string | null;
  question_text: string;
  status: string;
  credit_reward: number | null;
  created_at: string;
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
  answers?: Array<{
    id: string;
    owner_id: string;
    answer_text: string;
    created_at: string;
  }>;
};

type DetailData = {
  question: PublicQuestionDetail;
  viewer: {
    id: string;
    canAnswer: boolean;
    isWinningOwner: boolean;
  };
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getBuyerName(question: PublicQuestionDetail) {
  if (question.profiles?.display_name) return question.profiles.display_name;
  if (question.profiles?.email) return question.profiles.email.split("@")[0];
  return "Unknown buyer";
}

export default function OwnerPublicQuestionPage({ params }: PageProps) {
  const [questionId, setQuestionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState<DetailData | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function getSessionToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
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

    const response = await fetch(`/api/owner/questions/${id}`, {
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

  async function submitAnswer() {
    const text = answerText.trim();

    if (!text) {
      setMessage("Write an answer first.");
      return;
    }

    const token = await getSessionToken();

    if (!token) {
      window.location.href = `/auth?redirect=/owner/questions/${questionId}`;
      return;
    }

    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/owner/questions/${questionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ answerText: text }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setSaving(false);
      setMessage(result.error || "Could not answer this question.");
      await loadQuestion(questionId);
      return;
    }

    setAnswerText("");
    setSaving(false);
    setMessage("Answer saved. You won this public question reward.");
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
            Verified owners can answer public product questions.
          </p>
          <Link
            href={`/auth?redirect=/owner/questions/${questionId}`}
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
  const winningAnswer = question.answers?.find(
    (answer) => answer.id === question.winning_answer_id
  );
  const answeredByAnother =
    question.status === "answered" && !viewer.isWinningOwner;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/owner/dashboard" className="text-sm font-bold text-muted">
        Back to owner dashboard
      </Link>

      <section className="card mt-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
          <span>Public Questions</span>
          <span>/</span>
          <span>{question.products?.name || "Unknown product"}</span>
          <span>/</span>
          <span>Buyer: {getBuyerName(question)}</span>
          <span>/</span>
          <span>{question.status}</span>
        </div>

        <h1 className="mt-4 text-3xl font-black">Public product question</h1>
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

        {question.status === "open" && viewer.canAnswer && (
          <div className="mt-6">
            <label className="label">Your public answer</label>
            <textarea
              className="input mt-2 min-h-40"
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              placeholder="Share your real-owner experience..."
            />
            <button
              type="button"
              className="btn btn-dark mt-4"
              onClick={submitAnswer}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : `Submit answer / earn ${question.credit_reward || 10} credits`}
            </button>
          </div>
        )}

        {question.status === "open" && !viewer.canAnswer && (
          <div className="mt-6 rounded-2xl bg-amber-50 p-4">
            <h2 className="font-black text-amber-900">
              Verified owners only
            </h2>
            <p className="mt-2 text-sm font-bold text-amber-800">
              Complete verification for this product before answering.
            </p>
          </div>
        )}

        {viewer.isWinningOwner && (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <h2 className="font-black text-emerald-900">Answered by you</h2>
            <p className="mt-2 leading-7 text-emerald-950">
              {winningAnswer?.answer_text || "Your answer was saved."}
            </p>
          </div>
        )}

        {answeredByAnother && (
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <h2 className="font-black">Answered by another verified owner</h2>
            <p className="mt-2 text-sm font-bold text-muted">
              The first verified owner already answered this public question.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
