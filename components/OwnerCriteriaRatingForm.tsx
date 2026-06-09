"use client";

import { useMemo, useState } from "react";
import {
  getAverageScore,
  getOwnerEvaluationCriteria,
} from "@/lib/ownerEvaluationCriteria";
import { supabase } from "@/lib/supabaseClient";

type OwnerCriteriaRatingFormProps = {
  productId: string;
  ownedProductId: string;
  category?: string | null;
  initialScores?: Record<string, number> | null;
  onSaved?: () => void;
};

function buildInitialScores(criteria: string[], initialScores?: Record<string, number> | null) {
  return Object.fromEntries(
    criteria.map((criterion) => [
      criterion,
      initialScores?.[criterion] && initialScores[criterion] >= 1
        ? String(initialScores[criterion])
        : "5",
    ])
  );
}

export function OwnerCriteriaRatingForm({
  productId,
  ownedProductId,
  category,
  initialScores,
  onSaved,
}: OwnerCriteriaRatingFormProps) {
  const criteria = useMemo(() => getOwnerEvaluationCriteria(category), [category]);
  const [scores, setScores] = useState<Record<string, string>>(() =>
    buildInitialScores(criteria, initialScores)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const numericScores = Object.fromEntries(
    criteria.map((criterion) => [criterion, Number(scores[criterion] || 0)])
  );
  const averageScore = getAverageScore(numericScores);

  async function saveScorecard() {
    setMessage("");
    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      window.location.href = "/auth";
      return;
    }

    if (!averageScore) {
      setSaving(false);
      setMessage("Add scores before saving.");
      return;
    }

    const { error } = await supabase.from("owner_product_ratings").upsert(
      {
        product_id: productId,
        user_id: user.id,
        owned_product_id: ownedProductId,
        criteria_scores: numericScores,
        overall_rating: Number(averageScore.toFixed(1)),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,product_id",
      }
    );

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Owner scorecard saved.");
    onSaved?.();
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black">Owner scorecard</h3>
          <p className="mt-1 text-sm font-bold text-muted">
            Based on your real-owner experience, not lab testing.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-black">
          {averageScore ? averageScore.toFixed(1) : "-"} / 5
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {criteria.map((criterion) => (
          <label
            key={criterion}
            className="grid gap-2 text-sm font-bold md:grid-cols-[1fr_96px]"
          >
            <span>{criterion}</span>
            <select
              className="input py-2"
              value={scores[criterion] || "5"}
              onChange={(event) =>
                setScores((current) => ({
                  ...current,
                  [criterion]: event.target.value,
                }))
              }
            >
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-dark mt-4"
        onClick={saveScorecard}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save owner scorecard"}
      </button>

      {message && <p className="mt-3 text-sm font-bold text-muted">{message}</p>}
    </div>
  );
}
