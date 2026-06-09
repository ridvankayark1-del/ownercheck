"use client";

import { useEffect, useState } from "react";
import {
  getAverageScore,
  getOwnerEvaluationCriteria,
} from "@/lib/ownerEvaluationCriteria";
import { supabase } from "@/lib/supabaseClient";

type ClaimProductFormProps = {
  productId: string;
  category?: string | null;
};

function createVerificationCode() {
  return `OwnerCheck-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function ClaimProductForm({ productId, category }: ClaimProductFormProps) {
  const [verificationCode, setVerificationCode] = useState("");

  const criteria = getOwnerEvaluationCriteria(category);
  const [criteriaScores, setCriteriaScores] = useState<Record<string, string>>(
    () => Object.fromEntries(criteria.map((criterion) => [criterion, "5"]))
  );
  const [ownershipMonths, setOwnershipMonths] = useState("6");
  const [rating, setRating] = useState("5");
  const [reviewText, setReviewText] = useState("");
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [wouldBuyAgain, setWouldBuyAgain] = useState("true");
  const [verificationPhoto, setVerificationPhoto] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setVerificationCode(createVerificationCode());
  }, []);

  async function uploadVerificationPhoto(userId: string) {
    if (!verificationPhoto) {
      return null;
    }

    const fileExtension = verificationPhoto.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${productId}-${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("owner-verifications")
      .upload(filePath, verificationPhoto);

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from("owner-verifications")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function submitOwnership() {
    setMessage("");

    const review = reviewText.trim();

    if (!review) {
      setMessage("Write a short real-owner review first.");
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

    let verificationPhotoUrl: string | null = null;

    try {
      verificationPhotoUrl = await uploadVerificationPhoto(user.id);
    } catch (error) {
      setLoading(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not upload verification photo."
      );
      return;
    }

    const finalVerificationCode =
      verificationCode || createVerificationCode();

    const { data: ownedProduct, error } = await supabase
      .from("owned_products")
      .insert({
        user_id: user.id,
        product_id: productId,
        ownership_months: Number(ownershipMonths),
        verification_status: verificationPhotoUrl
          ? "photo_submitted"
          : "unverified",
        verification_photo_url: verificationPhotoUrl,
        verification_code: finalVerificationCode,
        rating: Number(rating),
        review_text: review,
        pros: pros.trim() || null,
        cons: cons.trim() || null,
        would_buy_again: wouldBuyAgain === "true",
      })
      .select("id")
      .single();

    if (error || !ownedProduct) {
      setLoading(false);

      if (error?.message.includes("unique_user_product_claim")) {
        setMessage("You already claimed this product.");
        return;
      }

      setMessage(error?.message || "Could not claim product.");
      return;
    }

    const numericCriteriaScores = Object.fromEntries(
      criteria.map((criterion) => [
        criterion,
        Number(criteriaScores[criterion] || 0),
      ])
    );
    const overallCriteriaRating = getAverageScore(numericCriteriaScores);

    if (overallCriteriaRating) {
      await supabase.from("owner_product_ratings").upsert(
        {
          product_id: productId,
          user_id: user.id,
          owned_product_id: ownedProduct.id,
          criteria_scores: numericCriteriaScores,
          overall_rating: Number(overallCriteriaRating.toFixed(1)),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,product_id",
        }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("credit_balance, trust_score")
      .eq("id", user.id)
      .single();

    const currentCredits = profile?.credit_balance || 0;
    const currentTrust = profile?.trust_score || 0;

    const creditReward = verificationPhotoUrl ? 30 : 20;
    const trustReward = verificationPhotoUrl ? 3 : 2;

    await supabase
      .from("profiles")
      .update({
        credit_balance: currentCredits + creditReward,
        trust_score: currentTrust + trustReward,
      })
      .eq("id", user.id);

    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: creditReward,
      reason: verificationPhotoUrl
        ? "Claimed product with verification photo"
        : "Claimed a product as owner",
    });

    setReviewText("");
    setPros("");
    setCons("");
    setVerificationPhoto(null);
    setLoading(false);
    setMessage(
      verificationPhotoUrl
        ? "Ownership added with photo submitted. 30 credits earned. Refreshing..."
        : "Ownership added. 20 credits earned. Refreshing..."
    );

    window.location.reload();
  }

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-black">I own this product</h2>
      <p className="mt-2 text-muted">
        Add your real-owner experience. Upload a verification photo to earn more
        credits and show stronger proof.
      </p>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <p className="text-sm font-black">Verification photo optional</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Write this code on paper and place it next to the product in your
          photo:
        </p>
        <p className="mt-3 rounded-2xl bg-white p-3 text-lg font-black">
          {verificationCode || "Generating code..."}
        </p>
        <p className="mt-2 text-xs font-bold text-muted">
          With photo: 30 credits · Without photo: 20 credits
        </p>

        <input
          className="input mt-4"
          type="file"
          accept="image/*"
          onChange={(event) =>
            setVerificationPhoto(event.target.files?.[0] || null)
          }
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Months owned</label>
          <input
            className="input mt-2"
            type="number"
            min="0"
            value={ownershipMonths}
            onChange={(event) => setOwnershipMonths(event.target.value)}
          />
        </div>

        <div>
          <label className="label">Rating</label>
          <select
            className="input mt-2"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
          >
            <option value="5">5 · excellent</option>
            <option value="4">4 · good</option>
            <option value="3">3 · okay</option>
            <option value="2">2 · bad</option>
            <option value="1">1 · terrible</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Your real-owner review</label>
        <textarea
          className="input mt-2 min-h-28"
          value={reviewText}
          onChange={(event) => setReviewText(event.target.value)}
          placeholder="What should buyers know after owning this product?"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Pros</label>
          <input
            className="input mt-2"
            value={pros}
            onChange={(event) => setPros(event.target.value)}
            placeholder="Comfort, battery, build quality"
          />
        </div>

        <div>
          <label className="label">Cons</label>
          <input
            className="input mt-2"
            value={cons}
            onChange={(event) => setCons(event.target.value)}
            placeholder="Price, setup, durability"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Would you buy it again?</label>
        <select
          className="input mt-2"
          value={wouldBuyAgain}
          onChange={(event) => setWouldBuyAgain(event.target.value)}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <h3 className="font-black">Owner scorecard</h3>
        <p className="mt-1 text-sm font-bold text-muted">
          Rate the parts buyers usually ask real owners about.
        </p>

        <div className="mt-4 grid gap-3">
          {criteria.map((criterion) => (
            <label
              key={criterion}
              className="grid gap-2 text-sm font-bold md:grid-cols-[1fr_96px]"
            >
              <span>{criterion}</span>
              <select
                className="input py-2"
                value={criteriaScores[criterion] || "5"}
                onChange={(event) =>
                  setCriteriaScores((current) => ({
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
      </div>

      <button
        type="button"
        className="btn btn-dark mt-5"
        onClick={submitOwnership}
        disabled={loading}
      >
        {loading ? "Adding..." : "Claim product"}
      </button>

      {message && (
        <p className="mt-3 text-sm font-bold text-muted">{message}</p>
      )}
    </div>
  );
}
