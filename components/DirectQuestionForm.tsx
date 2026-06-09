"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DirectQuestionFormProps = {
  productId: string;
};

type EligibleOwner = {
  user_id: string;
  verification_status: string;
  created_at: string;
};

const DIRECT_QUESTION_COST = 25;

function getVerificationPriority(status: string) {
  if (status === "photo_verified") return 0;
  if (status === "photo_submitted") return 1;
  return 2;
}

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

    if ((profile.credit_balance || 0) < DIRECT_QUESTION_COST) {
      setLoading(false);
      setMessage("You need at least 25 credits to ask an owner directly.");
      return;
    }

    const { data: ownersData, error: ownersError } = await supabase
      .from("owned_products")
      .select("user_id, verification_status, created_at")
      .eq("product_id", productId)
      .neq("user_id", user.id)
      .in("verification_status", [
        "photo_verified",
        "photo_submitted",
        "unverified",
      ]);

    if (ownersError) {
      setLoading(false);
      setMessage(ownersError.message);
      return;
    }

    const eligibleOwners = ((ownersData || []) as EligibleOwner[])
      .filter((owner) => owner.user_id)
      .sort((firstOwner, secondOwner) => {
        const priorityDifference =
          getVerificationPriority(firstOwner.verification_status) -
          getVerificationPriority(secondOwner.verification_status);

        if (priorityDifference !== 0) return priorityDifference;

        return (
          new Date(firstOwner.created_at).getTime() -
          new Date(secondOwner.created_at).getTime()
        );
      });

    const selectedOwner = eligibleOwners[0];

    if (!selectedOwner) {
      setLoading(false);
      setMessage("No available owners yet. Ask a public question instead.");
      return;
    }

    const { data: directQuestion, error: directQuestionError } = await supabase
      .from("direct_questions")
      .insert({
        product_id: productId,
        buyer_id: user.id,
        owner_id: selectedOwner.user_id,
        question_text: text,
        status: "pending",
        credit_cost: DIRECT_QUESTION_COST,
        credit_reward: 20,
      })
      .select("id")
      .single();

    if (directQuestionError || !directQuestion) {
      setLoading(false);
      setMessage(
        directQuestionError?.message || "Could not send direct question."
      );
      return;
    }

    const { error: creditError } = await supabase
      .from("profiles")
      .update({
        credit_balance: (profile.credit_balance || 0) - DIRECT_QUESTION_COST,
      })
      .eq("id", user.id);

    if (creditError) {
      setLoading(false);
      setMessage(
        `Direct question was created, but credits could not be deducted: ${creditError.message}`
      );
      return;
    }

    const { error: transactionError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: -DIRECT_QUESTION_COST,
        reason: "Asked an owner directly",
      });

    if (transactionError) {
      setLoading(false);
      setMessage(
        `Direct question was created, but the credit transaction could not be recorded: ${transactionError.message}`
      );
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
