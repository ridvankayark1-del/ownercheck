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

    const { data: answer, error } = await supabase
      .from("answers")
      .insert({
        question_id: questionId,
        owner_id: user.id,
        answer_text: text,
        helpful_count: 0,
      })
      .select("id")
      .single();

    if (error || !answer) {
  setLoading(false);

  if (error?.message.includes("unique_user_answer_per_question")) {
    setMessage("You already answered this question.");
    return;
  }

  setMessage(error?.message || "Could not add answer.");
  return;
}

    const { data: profile } = await supabase
      .from("profiles")
      .select("credit_balance, trust_score")
      .eq("id", user.id)
      .single();

    const currentCredits = profile?.credit_balance || 0;
    const currentTrust = profile?.trust_score || 0;

    await supabase
      .from("profiles")
      .update({
        credit_balance: currentCredits + 10,
        trust_score: currentTrust + 1,
      })
      .eq("id", user.id);

    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: 10,
      reason: "Answered a product question",
      related_question_id: questionId,
      related_answer_id: answer.id,
    });

await supabase
  .from("questions")
  .update({ status: "answered" })
  .eq("id", questionId);

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