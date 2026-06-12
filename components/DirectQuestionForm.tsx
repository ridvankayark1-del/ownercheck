"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { OwnerTrustCard } from "@/components/OwnerTrustCard";

type OwnerOption = {
  userId: string;
  name: string;
  ownerLevel: string;
  ownershipMonths?: number | null;
  rating?: number | null;
  scorecardRating?: number | null;
  answerCount?: number;
  helpfulCount?: number;
  photoVerified?: boolean;
};

type DirectQuestionFormProps = {
  productId: string;
  ownerOptions: OwnerOption[];
};

export function DirectQuestionForm({
  productId,
  ownerOptions,
}: DirectQuestionFormProps) {
  const [questionText, setQuestionText] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(
    ownerOptions[0]?.userId || ""
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedOwner = useMemo(
    () =>
      ownerOptions.find((owner) => owner.userId === selectedOwnerId) ||
      ownerOptions[0],
    [ownerOptions, selectedOwnerId]
  );

  async function submitDirectQuestion() {
    setMessage("");

    const text = questionText.trim();

    if (!text) {
      setMessage("Write a private chat request first.");
      return;
    }

    if (!selectedOwnerId) {
      setMessage("Choose a verified owner first.");
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
      selected_owner_id_input: selectedOwnerId,
      question_text_input: text,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message || "Could not send private chat request.");
      return;
    }

    setQuestionText("");
    setLoading(false);
    setMessage(
      "Private chat request sent. The selected owner can accept or decline it."
    );
  }

  return (
    <div className="card border-slate-200 bg-slate-50/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase text-muted">
            Start a private chat
          </p>
          <h2 className="mt-1 text-2xl font-black">Start a private chat</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-800">
          25 credits
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted">
        Choose one verified owner for personal buying advice. If they accept,
        this opens a private one-to-one chat.
      </p>

      <div className="mt-4 grid gap-2 text-sm">
        <div className="rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase text-muted">Best for</p>
          <p className="mt-1 font-bold">Personal buying advice</p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase text-muted">Visibility</p>
          <p className="mt-1 font-bold">
            Private. Only you and the selected owner can see the chat.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase text-muted">Cost</p>
          <p className="mt-1 font-bold">25 credits</p>
        </div>
      </div>

      {ownerOptions.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-muted">
          No verified owners are available for private chat yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Verified owner</label>
            <select
              className="input mt-2"
              value={selectedOwnerId}
              onChange={(event) => setSelectedOwnerId(event.target.value)}
            >
              {ownerOptions.map((owner) => (
                <option key={owner.userId} value={owner.userId}>
                  {owner.name} / {owner.ownerLevel}
                </option>
              ))}
            </select>
          </div>

          {selectedOwner && (
            <OwnerTrustCard
              name={selectedOwner.name}
              ownerLevel={selectedOwner.ownerLevel}
              photoVerified={selectedOwner.photoVerified}
              ownershipMonths={selectedOwner.ownershipMonths}
              rating={selectedOwner.rating}
              scorecardRating={selectedOwner.scorecardRating}
              answerCount={selectedOwner.answerCount}
              helpfulCount={selectedOwner.helpfulCount}
            />
          )}
        </div>
      )}

      <textarea
        className="input mt-4 min-h-28"
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        placeholder="Example: Can we chat about whether this is right for my commute and budget?"
      />

      <button
        type="button"
        className="btn btn-dark mt-4"
        onClick={submitDirectQuestion}
        disabled={loading || ownerOptions.length === 0}
      >
        {loading ? "Sending..." : "Start private chat · 25 credits"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}
