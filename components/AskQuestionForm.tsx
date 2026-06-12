"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AskQuestionFormProps = {
  productId: string;
  starterQuestions?: string[];
};

export function AskQuestionForm({
  productId,
  starterQuestions = [],
}: AskQuestionFormProps) {
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
    <div className="card border-emerald-100 bg-emerald-50/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase text-muted">
            Public Questions
          </p>
          <h2 className="mt-1 text-2xl font-black">Ask a public question</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-800">
          10 credits
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted">
        Ask the verified owner community when the answer would help other
        shoppers too.
      </p>

      <div className="mt-4 grid gap-2 text-sm">
        <div className="rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase text-muted">Best for</p>
          <p className="mt-1 font-bold">General product questions</p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase text-muted">Visibility</p>
          <p className="mt-1 font-bold">
            Public Q&A. Answer can appear on this product page.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase text-muted">Cost</p>
          <p className="mt-1 font-bold">10 credits</p>
        </div>
      </div>

      <textarea
        className="input mt-4 min-h-28"
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        placeholder="Example: How comfortable is this after a full workday?"
      />

      {starterQuestions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-black uppercase text-muted">
            Question ideas
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {starterQuestions.slice(0, 4).map((question) => (
              <button
                key={question}
                type="button"
                className="rounded-full bg-slate-100 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-200"
                onClick={() => setQuestionText(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn-dark mt-4"
        onClick={submitQuestion}
        disabled={loading}
      >
        {loading ? "Adding..." : "Ask public question · 10 credits"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}
