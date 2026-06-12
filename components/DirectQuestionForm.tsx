"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DirectQuestionFormProps = {
  productId: string;
  ownerOptions: Array<{
    userId: string;
    name: string;
    ownerLevel: string;
  }>;
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

  async function submitDirectQuestion() {
    setMessage("");

    const text = questionText.trim();

    if (!text) {
      setMessage("Write a direct request first.");
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
      setMessage(error.message || "Could not send direct request.");
      return;
    }

    setQuestionText("");
    setLoading(false);
    setMessage("Direct request sent to the selected owner. 25 credits spent.");
  }

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-black">Direct Requests</h2>
      <p className="mt-2 text-muted">
        Costs 25 credits. Choose one verified owner and start a private
        one-to-one request.
      </p>

      {ownerOptions.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-muted">
          No verified owners are available for direct requests yet.
        </p>
      ) : (
        <div className="mt-4">
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
      )}

      <textarea
        className="input mt-4 min-h-28"
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        placeholder="Ask this owner privately about their real experience..."
      />

      <button
        type="button"
        className="btn btn-dark mt-4"
        onClick={submitDirectQuestion}
        disabled={loading || ownerOptions.length === 0}
      >
        {loading ? "Sending..." : "Start direct request / 25 credits"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}
