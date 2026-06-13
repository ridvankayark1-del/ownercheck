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

    const { data: newHelpfulCount, error: rpcError } = await supabase.rpc(
      "vote_answer_helpful",
      {
        answer_id_input: answerId,
      }
    );

    if (rpcError) {
      setLoading(false);

      if (rpcError.message.includes("You already marked this helpful")) {
        setMessage("You already marked this helpful.");
        return;
      }

      setMessage(rpcError.message || "Could not vote.");
      return;
    }

    setHelpfulCount(Number(newHelpfulCount));
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