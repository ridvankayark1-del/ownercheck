"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AnswerQuestionFormProps = {
  questionId: string;
};

export function AnswerQuestionForm({ questionId }: AnswerQuestionFormProps) {
  const [answerText, setAnswerText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submitAnswer() {
    setMessage("");

    const text = answerText.trim();

    if (!text) {
      setMessage("Write an answer first.");
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

    const { data: answer, error } = await supabase.rpc(
      "answer_public_question",
      {
        question_id_input: questionId,
        answer_text_input: text,
      }
    );

    if (error || !answer) {
      setLoading(false);

      if (error?.message.includes("You already answered this question")) {
        setMessage("You already answered this question.");
        return;
      }

      setMessage(error?.message || "Could not add answer.");
      return;
    }

    setLoading(false);
    setAnswerText("");
    setMessage("Answer added. 10 credits earned. Refreshing...");
    window.location.reload();
  }

  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-bold">
        Own this product? Answer this question.
      </p>

      <textarea
        className="input mt-3 min-h-24"
        value={answerText}
        onChange={(event) => setAnswerText(event.target.value)}
        placeholder="Example: I own this. The mic is okay indoors, but not great on busy streets..."
      />

      <button
        type="button"
        className="btn btn-dark mt-3"
        onClick={submitAnswer}
        disabled={loading}
      >
        {loading ? "Adding..." : "Answer · earn 10 credits"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}