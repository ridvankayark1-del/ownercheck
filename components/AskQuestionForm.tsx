"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AskQuestionFormProps = {
  productId: string;
};

export function AskQuestionForm({ productId }: AskQuestionFormProps) {
  const [questionText, setQuestionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submitQuestion() {
    setMessage("");

    const text = questionText.trim();

    if (!text) {
      setMessage("Write a question first.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      window.location.href = "/auth";
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setLoading(false);
      setMessage("Could not load your credits.");
      return;
    }

    if ((profile.credit_balance || 0) < 10) {
      setLoading(false);
      setMessage("You need at least 10 credits to ask a question.");
      return;
    }

    const { data: question, error } = await supabase
      .from("questions")
      .insert({
        product_id: productId,
        buyer_id: user.id,
        question_text: text,
        credit_reward: 10,
        status: "open",
      })
      .select("id")
      .single();

    if (error || !question) {
      setLoading(false);
      setMessage(error?.message || "Could not add question.");
      return;
    }

    const newBalance = (profile.credit_balance || 0) - 10;

    await supabase
      .from("profiles")
      .update({ credit_balance: newBalance })
      .eq("id", user.id);

    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -10,
      reason: "Asked a product question",
      related_question_id: question.id,
    });

    setLoading(false);
    setQuestionText("");
    setMessage("Question added. 10 credits spent. Refreshing...");
    window.location.reload();
  }

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-black">Ask a public question</h2>
      <p className="mt-2 text-muted">
        Costs 10 credits. This question will appear on the product page so real
        owners can answer.
      </p>

      <textarea
        className="input mt-4 min-h-28"
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        placeholder="Example: Is the microphone good for calls in a noisy room?"
      />

      <button
        type="button"
        className="btn btn-dark mt-4"
        onClick={submitQuestion}
        disabled={loading}
      >
        {loading ? "Adding..." : "Ask question · 10 credits"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}