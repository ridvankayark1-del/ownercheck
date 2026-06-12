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

    const { error } = await supabase.rpc("create_public_question", {
      product_id_input: productId,
      question_text_input: text,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message || "Could not add question.");
      return;
    }

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
