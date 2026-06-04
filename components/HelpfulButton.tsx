"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HelpfulButtonProps = {
  answerId: string;
  ownerId: string | null;
  currentHelpfulCount: number;
};

export function HelpfulButton({
  answerId,
  ownerId,
  currentHelpfulCount,
}: HelpfulButtonProps) {
  const [helpfulCount, setHelpfulCount] = useState(currentHelpfulCount);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function markHelpful() {
    setMessage("");
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

    if (ownerId === user.id) {
      setLoading(false);
      setMessage("You cannot mark your own answer helpful.");
      return;
    }

    const { error: voteError } = await supabase
      .from("answer_helpful_votes")
      .insert({
        answer_id: answerId,
        user_id: user.id,
      });

    if (voteError) {
      setLoading(false);

      if (voteError.message.includes("answer_helpful_votes_answer_id_user_id_key")) {
        setMessage("You already marked this helpful.");
        return;
      }

      setMessage(voteError.message);
      return;
    }

    const newHelpfulCount = helpfulCount + 1;

    const { error: answerError } = await supabase
      .from("answers")
      .update({ helpful_count: newHelpfulCount })
      .eq("id", answerId);

    if (answerError) {
      setLoading(false);
      setMessage(answerError.message);
      return;
    }

    if (ownerId) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("trust_score")
        .eq("id", ownerId)
        .single();

      const currentTrust = ownerProfile?.trust_score || 0;

      await supabase
        .from("profiles")
        .update({ trust_score: currentTrust + 1 })
        .eq("id", ownerId);
    }

    setHelpfulCount(newHelpfulCount);
    setLoading(false);
    setMessage("Marked helpful.");
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn"
        onClick={markHelpful}
        disabled={loading}
      >
        {loading ? "Saving..." : `Helpful · ${helpfulCount}`}
      </button>

      {message && <p className="text-xs font-bold text-muted">{message}</p>}
    </div>
  );
}