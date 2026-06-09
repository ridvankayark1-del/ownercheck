"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ProductInfo = {
  slug: string;
  name: string;
};

type ProfileInfo = {
  display_name: string | null;
  email: string | null;
};

type RawDirectQuestion = {
  id: string;
  question_text: string;
  answer_text: string | null;
  status: string;
  credit_reward: number | null;
  created_at: string;
  answered_at: string | null;
  products: ProductInfo | ProductInfo[] | null;
  profiles: ProfileInfo | ProfileInfo[] | null;
};

type DirectQuestion = {
  id: string;
  question_text: string;
  answer_text: string | null;
  status: string;
  credit_reward: number | null;
  created_at: string;
  answered_at: string | null;
  products: ProductInfo | null;
  profiles: ProfileInfo | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

function getBuyerName(profile: ProfileInfo | null) {
  if (!profile) return "Unknown buyer";
  if (profile.display_name) return profile.display_name;
  if (profile.email) return profile.email.split("@")[0];
  return "Unknown buyer";
}

export default function DirectRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [requests, setRequests] = useState<DirectQuestion[]>([]);
  const [answerTextById, setAnswerTextById] = useState<Record<string, string>>(
    {}
  );
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  async function loadRequests() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setMessage(userError.message);
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

    const { data, error } = await supabase
      .from("direct_questions")
      .select(
        "id, question_text, answer_text, status, credit_reward, created_at, answered_at, products(slug, name), profiles!direct_questions_buyer_id_fkey(display_name, email)"
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setRequests([]);
    } else {
      const normalized = ((data || []) as RawDirectQuestion[]).map((item) => ({
        ...item,
        products: normalizeSingle(item.products),
        profiles: normalizeSingle(item.profiles),
      }));

      setRequests(normalized);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function submitAnswer(request: DirectQuestion) {
    const answerText = (answerTextById[request.id] || "").trim();

    if (!answerText) {
      setMessage("Write an answer first.");
      return;
    }

    setSavingId(request.id);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSavingId("");
      window.location.href = "/auth";
      return;
    }

    const { data: updatedRequest, error: updateError } = await supabase
      .from("direct_questions")
      .update({
        answer_text: answerText,
        status: "answered",
        answered_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .select("id")
      .single();

    if (updateError || !updatedRequest) {
      setSavingId("");
      setMessage(updateError?.message || "Could not answer this request.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("credit_balance, trust_score")
      .eq("id", user.id)
      .single();

    const creditReward = request.credit_reward || 20;
    const currentCredits = profile?.credit_balance || 0;
    const currentTrust = profile?.trust_score || 0;

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        credit_balance: currentCredits + creditReward,
        trust_score: currentTrust + 2,
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      setSavingId("");
      setMessage(
        `Answer saved, but reward could not be applied: ${profileUpdateError.message}`
      );
      return;
    }

    const { error: transactionError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: creditReward,
        reason: "Answered a direct owner request",
      });

    if (transactionError) {
      setSavingId("");
      setMessage(
        `Answer saved, but reward transaction could not be recorded: ${transactionError.message}`
      );
      return;
    }

    setAnswerTextById((current) => ({
      ...current,
      [request.id]: "",
    }));
    setSavingId("");
    setMessage("Direct request answered. 20 credits earned.");
    await loadRequests();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading direct requests...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Log in to see direct requests</h1>
          <p className="mt-3 text-muted">
            Direct owner requests sent to you will appear here.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="mb-8">
        <p className="font-bold text-muted">Owner inbox</p>
        <h1 className="mt-2 text-4xl font-black">Direct requests</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Private buyer questions assigned to you based on the products you own.
        </p>

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}
      </section>

      {requests.length === 0 ? (
        <div className="card p-6">
          <h2 className="text-2xl font-black">No direct requests yet</h2>
          <p className="mt-3 text-muted">
            When buyers ask you privately about products you own, requests will
            appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {requests.map((request) => (
            <div key={request.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
                <span>{request.products?.name || "Unknown product"}</span>
                <span>·</span>
                <span>Buyer: {getBuyerName(request.profiles)}</span>
                <span>·</span>
                <span>{request.status}</span>
              </div>

              <p className="mt-3 text-lg font-bold">{request.question_text}</p>

              {request.status === "answered" ? (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase text-muted">
                    Your private answer
                  </p>
                  <p className="mt-2 leading-7">{request.answer_text}</p>
                </div>
              ) : (
                <div className="mt-4">
                  <label className="label">Private answer</label>
                  <textarea
                    className="input mt-2 min-h-28"
                    value={answerTextById[request.id] || ""}
                    onChange={(event) =>
                      setAnswerTextById((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    placeholder="Answer this buyer directly..."
                  />

                  <button
                    type="button"
                    className="btn btn-dark mt-4"
                    onClick={() => submitAnswer(request)}
                    disabled={savingId === request.id}
                  >
                    {savingId === request.id
                      ? "Saving..."
                      : "Send answer · earn 20 credits"}
                  </button>
                </div>
              )}

              {request.products?.slug && (
                <Link
                  href={`/product/${request.products.slug}`}
                  className="mt-4 inline-flex text-sm font-bold underline"
                >
                  View product
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
