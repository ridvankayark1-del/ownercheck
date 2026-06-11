"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DirectQuestionFormProps = {
  productId: string;
};

const DIRECT_QUESTION_COST = 25;

export function DirectQuestionForm({ productId }: DirectQuestionFormProps) {
  const [questionText, setQuestionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submitDirectQuestion() {
    setMessage("");

    const text = questionText.trim();

    if (!text) {
      setMessage("Write a direct question first.");
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

    const { error } = await supabase.rpc("create_direct_question", {
      product_id_input: productId,
      question_text_input: text,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message || "Could not send direct question.");
      return;
    }

    setQuestionText("");
    setLoading(false);
    setMessage("Direct question sent. 25 credits spent.");
  }

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-black">Ask an owner directly</h2>
      <p className="mt-2 text-muted">
        Costs 25 credits. OwnerCheck will send your question to one eligible
        owner for a private answer.
      </p>

      <textarea
        className="input mt-4 min-h-28"
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        placeholder="Ask a specific owner about their real experience..."
      />

      <button
        type="button"
        className="btn btn-dark mt-4"
        onClick={submitDirectQuestion}
        disabled={loading}
      >
        {loading ? "Sending..." : "Ask directly · 25 credits"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}
