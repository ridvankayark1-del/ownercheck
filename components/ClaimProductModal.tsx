"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { LiveCameraCapture } from "@/components/LiveCameraCapture";
import { OwnerCriteriaRatingForm } from "@/components/OwnerCriteriaRatingForm";
import { supabase } from "@/lib/supabaseClient";
import {
  getOwnerLevel,
  getOwnerLevelBadgeClass,
  getOwnerLevelLabel,
} from "@/lib/ownerLevels";

type ClaimProductModalProps = {
  productId: string;
  productSlug: string;
  category?: string | null;
  triggerClassName?: string;
  triggerLabel?: string;
};

type ExistingClaim = {
  id: string;
  ownership_months: number | null;
  verification_status: string;
  verification_photo_url: string | null;
  verification_code: string | null;
  verification_token: string | null;
  verification_token_expires_at: string | null;
  verification_challenge: string | null;
  verification_capture_method: string | null;
  rating: number | null;
  review_text: string | null;
  pros: string | null;
  cons: string | null;
  would_buy_again: boolean | null;
};

type Profile = {
  credit_balance: number | null;
  trust_score: number | null;
};

type Step =
  | "claim"
  | "verify"
  | "phone"
  | "camera"
  | "rating"
  | "success"
  | "manage"
  | "signin";

function createVerificationCode() {
  return `OwnerCheck-${Math.floor(1000 + Math.random() * 9000)}`;
}

function createVerificationToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createVerificationChallenge() {
  const challenges = [
    "Show the product powered on if possible.",
    "Show the product beside the handwritten code.",
    "Capture the front or main side of the product clearly.",
    "Include a cable, case, lens, or accessory if you use one with it.",
  ];

  return challenges[Math.floor(Math.random() * challenges.length)];
}

function getCaptureMethodLabel(method?: string | null) {
  if (method === "phone_camera") return "Phone camera";
  if (method === "live_camera") return "Live camera";
  if (method === "upload") return "Manual upload";
  return "Not submitted";
}

function getPublicSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
}

export function ClaimProductModal({
  productId,
  productSlug,
  category,
  triggerClassName = "btn",
  triggerLabel,
}: ClaimProductModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("claim");
  const [existingClaim, setExistingClaim] = useState<ExistingClaim | null>(null);
  const [trustScore, setTrustScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [ownershipMonths, setOwnershipMonths] = useState("6");
  const [rating, setRating] = useState("5");
  const [reviewText, setReviewText] = useState("");
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [wouldBuyAgain, setWouldBuyAgain] = useState("true");
  const [verificationCode, setVerificationCode] = useState(createVerificationCode);
  const [verificationChallenge, setVerificationChallenge] = useState(
    createVerificationChallenge
  );
  const [phoneVerificationLink, setPhoneVerificationLink] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);

  const ownerLevel = existingClaim
    ? getOwnerLevel(existingClaim.verification_status, trustScore)
    : null;

  useEffect(() => {
    let active = true;

    async function loadTriggerState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("trust_score")
        .eq("id", user.id)
        .single();

      const { data: claim } = await supabase
        .from("owned_products")
        .select(
          "id, ownership_months, verification_status, verification_photo_url, verification_code, verification_token, verification_token_expires_at, verification_challenge, verification_capture_method, rating, review_text, pros, cons, would_buy_again"
        )
        .eq("user_id", user.id)
        .eq("product_id", productId)
        .maybeSingle();

      if (!active || !claim) return;

      setTrustScore(profile?.trust_score || 0);
      setExistingClaim(claim as ExistingClaim);
    }

    loadTriggerState();

    return () => {
      active = false;
    };
  }, [productId]);

  useEffect(() => {
    if (!open) return;

    async function loadClaim() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setStep("signin");
        setExistingClaim(null);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("credit_balance, trust_score")
        .eq("id", user.id)
        .single();

      setTrustScore(profile?.trust_score || 0);

      const { data: claim } = await supabase
        .from("owned_products")
        .select(
          "id, ownership_months, verification_status, verification_photo_url, verification_code, verification_token, verification_token_expires_at, verification_challenge, verification_capture_method, rating, review_text, pros, cons, would_buy_again"
        )
        .eq("user_id", user.id)
        .eq("product_id", productId)
        .maybeSingle();

      if (claim) {
        const typedClaim = claim as ExistingClaim;
        setExistingClaim(typedClaim);
        setOwnershipMonths(String(typedClaim.ownership_months || 6));
        setRating(String(typedClaim.rating || 5));
        setReviewText(typedClaim.review_text || "");
        setPros(typedClaim.pros || "");
        setCons(typedClaim.cons || "");
        setWouldBuyAgain(typedClaim.would_buy_again === false ? "false" : "true");
        setVerificationCode(typedClaim.verification_code || createVerificationCode());
        setVerificationChallenge(
          typedClaim.verification_challenge || createVerificationChallenge()
        );
        setStep("manage");
      } else {
        setExistingClaim(null);
        setVerificationCode(createVerificationCode());
        setStep("claim");
      }

      setLoading(false);
    }

    loadClaim();
  }, [open, productId]);

  async function awardUser(userId: string, profile: Profile | null, amount: number, trust: number, reason: string) {
    await supabase
      .from("profiles")
      .update({
        credit_balance: (profile?.credit_balance || 0) + amount,
        trust_score: (profile?.trust_score || 0) + trust,
      })
      .eq("id", userId);

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount,
      reason,
    });
  }

  async function submitClaim() {
    setMessage("");
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStep("signin");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("credit_balance, trust_score")
      .eq("id", user.id)
      .single();

    const finalVerificationCode = verificationCode || createVerificationCode();

    const { data: ownedProduct, error } = await supabase
      .from("owned_products")
      .insert({
        user_id: user.id,
        product_id: productId,
        ownership_months: Number(ownershipMonths),
        verification_status: "unverified",
        verification_photo_url: null,
        verification_code: finalVerificationCode,
        verification_challenge: verificationChallenge,
        rating: Number(rating),
        review_text: reviewText.trim() || null,
        pros: pros.trim() || null,
        cons: cons.trim() || null,
        would_buy_again: wouldBuyAgain === "true",
      })
      .select(
        "id, ownership_months, verification_status, verification_photo_url, verification_code, verification_token, verification_token_expires_at, verification_challenge, verification_capture_method, rating, review_text, pros, cons, would_buy_again"
      )
      .single();

    if (error || !ownedProduct) {
      setLoading(false);

      if (error?.message.includes("unique_user_product_claim")) {
        setMessage("You already claimed this product. Manage your ownership here.");
        setStep("manage");
        return;
      }

      setMessage(error?.message || "Could not claim product.");
      return;
    }

    await awardUser(
      user.id,
      profile || null,
      20,
      2,
      "Claimed a product as owner"
    );

    setExistingClaim(ownedProduct as ExistingClaim);
    setTrustScore((profile?.trust_score || 0) + 2);
    setStep("success");
    setLoading(false);
    setMessage("Product claimed. You can now answer buyer questions for this product.");
  }

  async function uploadVerificationFile(file: File, method: "live_camera") {
    setMessage("");

    if (!existingClaim) {
      setMessage("Claim this product before submitting photo proof.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStep("signin");
      setLoading(false);
      return;
    }

    const fileExtension = file.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/${productId}-${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("owner-verifications")
      .upload(filePath, file);

    if (uploadError) {
      setLoading(false);
      setMessage(uploadError.message);
      return;
    }

    const previousStatus = existingClaim.verification_status;
    const nextStatus =
      previousStatus === "photo_verified" ? "photo_verified" : "photo_submitted";

    const { data: updatedClaim, error: updateError } = await supabase
      .from("owned_products")
      .update({
        verification_status: nextStatus,
        verification_photo_url: filePath,
        verification_code: verificationCode,
        verification_challenge: verificationChallenge,
        verification_capture_method: method,
      })
      .eq("id", existingClaim.id)
      .select(
        "id, ownership_months, verification_status, verification_photo_url, verification_code, verification_token, verification_token_expires_at, verification_challenge, verification_capture_method, rating, review_text, pros, cons, would_buy_again"
      )
      .single();

    if (updateError || !updatedClaim) {
      setLoading(false);
      setMessage(updateError?.message || "Could not save photo proof.");
      return;
    }

    if (previousStatus === "unverified" || previousStatus === "verification_rejected") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("credit_balance, trust_score")
        .eq("id", user.id)
        .single();

      await awardUser(
        user.id,
        profile || null,
        10,
        1,
        "Submitted owner verification photo"
      );
      setTrustScore((profile?.trust_score || trustScore) + 1);
    }

    setExistingClaim(updatedClaim as ExistingClaim);
    setCapturedPhoto(null);
    setLoading(false);
    setMessage("Photo proof submitted. Admin review can upgrade it to Photo verified.");
    setStep("rating");
  }

  async function uploadLiveCameraProof() {
    if (!capturedPhoto) {
      setMessage("Capture a photo first.");
      return;
    }

    await uploadVerificationFile(capturedPhoto, "live_camera");
  }

  async function preparePhoneVerification() {
    setMessage("");

    if (!existingClaim) {
      setMessage("Claim this product before generating a phone verification link.");
      return;
    }

    const token = createVerificationToken();
    const nextCode = verificationCode || createVerificationCode();
    const nextChallenge = verificationChallenge || createVerificationChallenge();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    setLoading(true);

    const { data: updatedClaim, error } = await supabase
      .from("owned_products")
      .update({
        verification_token: token,
        verification_token_expires_at: expiresAt,
        verification_code: nextCode,
        verification_challenge: nextChallenge,
      })
      .eq("id", existingClaim.id)
      .select(
        "id, ownership_months, verification_status, verification_photo_url, verification_code, verification_token, verification_token_expires_at, verification_challenge, verification_capture_method, rating, review_text, pros, cons, would_buy_again"
      )
      .single();

    setLoading(false);

    if (error || !updatedClaim) {
      setMessage(error?.message || "Could not create phone verification link.");
      return;
    }

    setExistingClaim(updatedClaim as ExistingClaim);
    setVerificationCode(nextCode);
    setVerificationChallenge(nextChallenge);
    const baseUrl = getPublicSiteUrl() || window.location.origin;
    setPhoneVerificationLink(
      `${baseUrl}/verify-owner/${existingClaim.id}?token=${token}`
    );
    setStep("phone");
  }

  function closeModal() {
    setOpen(false);
    setMessage("");
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel || (existingClaim ? "Manage ownership" : "I own this product")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 md:items-center md:p-5">
          <div className="mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">
                  {step === "manage" ? "Manage ownership" : "Claim this product"}
                </h2>
                <p className="mt-2 text-sm font-bold text-muted">
                  {step === "manage"
                    ? "You already claimed this product. Manage your ownership, verification, and owner rating here."
                    : "Claim ownership to answer buyer questions, build trust, and help people decide before buying."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black"
                onClick={closeModal}
              >
                X
              </button>
            </div>

            {loading && <p className="mt-4 text-sm font-bold text-muted">Loading...</p>}

            {step === "signin" && !loading && (
              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <h3 className="font-black">Sign in to claim this product</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Create or sign in to your account, then come back to claim ownership
                  and build trust as a real owner.
                </p>
                <Link
                  href={`/auth?redirect=/product/${productSlug}`}
                  className="btn btn-dark mt-4 w-full justify-center"
                >
                  Sign in
                </Link>
              </div>
            )}

            {(step === "claim" || step === "manage") && !loading && (
              <div className="mt-5 space-y-4">
                {existingClaim && ownerLevel && (
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-black text-muted">Ownership status</p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${getOwnerLevelBadgeClass(
                        ownerLevel
                      )}`}
                    >
                      {getOwnerLevelLabel(ownerLevel)}
                    </span>
                    <p className="mt-3 text-sm font-bold text-muted">
                      Capture method:{" "}
                      {getCaptureMethodLabel(existingClaim.verification_capture_method)}
                    </p>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
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
                    <label className="label">Overall rating</label>
                    <select
                      className="input mt-2"
                      value={rating}
                      onChange={(event) => setRating(event.target.value)}
                      disabled={Boolean(existingClaim)}
                    >
                      <option value="5">5 · excellent</option>
                      <option value="4">4 · good</option>
                      <option value="3">3 · okay</option>
                      <option value="2">2 · bad</option>
                      <option value="1">1 · terrible</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Owner note optional</label>
                  <textarea
                    className="input mt-2 min-h-24"
                    value={reviewText}
                    onChange={(event) => setReviewText(event.target.value)}
                    placeholder="How do you use it, and what should buyers know?"
                    disabled={Boolean(existingClaim)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Pros</label>
                    <input
                      className="input mt-2"
                      value={pros}
                      onChange={(event) => setPros(event.target.value)}
                      placeholder="Comfort, battery, build quality"
                      disabled={Boolean(existingClaim)}
                    />
                  </div>

                  <div>
                    <label className="label">Cons</label>
                    <input
                      className="input mt-2"
                      value={cons}
                      onChange={(event) => setCons(event.target.value)}
                      placeholder="Price, setup, durability"
                      disabled={Boolean(existingClaim)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Would you buy it again?</label>
                  <select
                    className="input mt-2"
                    value={wouldBuyAgain}
                    onChange={(event) => setWouldBuyAgain(event.target.value)}
                    disabled={Boolean(existingClaim)}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                {!existingClaim ? (
                  <button
                    type="button"
                    className="btn btn-dark w-full justify-center"
                    onClick={submitClaim}
                    disabled={loading}
                  >
                    {loading ? "Claiming..." : "Claim product"}
                  </button>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      className="btn btn-dark justify-center"
                      onClick={() => setStep("verify")}
                    >
                      Verify ownership
                    </button>
                    <button
                      type="button"
                      className="btn justify-center"
                      onClick={() => setStep("rating")}
                    >
                      Add owner rating
                    </button>
                    <a href="#ask-question" className="btn justify-center" onClick={closeModal}>
                      Answer questions
                    </a>
                  </div>
                )}
              </div>
            )}

            {step === "success" && existingClaim && !loading && (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                  <h3 className="font-black">Product claimed</h3>
                  <p className="mt-2 text-sm font-bold">
                    Product claimed. You can now answer buyer questions for this product.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    className="btn btn-dark justify-center"
                    onClick={() => setStep("verify")}
                  >
                    Verify ownership
                  </button>
                  <button
                    type="button"
                    className="btn justify-center"
                    onClick={() => setStep("rating")}
                  >
                    Add owner rating
                  </button>
                  <button type="button" className="btn justify-center" onClick={closeModal}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {step === "verify" && existingClaim && !loading && (
              <div className="mt-5 space-y-4">
                <div>
                  <h3 className="font-black">Verify ownership</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Use photo proof to get a stronger owner badge.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    className="btn btn-dark justify-center"
                    onClick={preparePhoneVerification}
                  >
                    Verify with phone
                  </button>
                  <button
                    type="button"
                    className="btn justify-center"
                    onClick={() => setStep("camera")}
                  >
                    Verify on this device
                  </button>
                </div>
              </div>
            )}

            {step === "phone" && existingClaim && !loading && (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="font-black">Verify with phone</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Scan this QR code with your phone to capture proof using your
                    phone camera.
                  </p>
                  {phoneVerificationLink && (
                    <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl bg-white p-4">
                      <QRCodeSVG value={phoneVerificationLink} size={220} />
                      <a
                        href={phoneVerificationLink}
                        className="break-all text-sm font-bold underline"
                      >
                        Open on phone
                      </a>
                    </div>
                  )}
                  <p className="mt-3 text-xs font-bold text-muted">
                    This link expires in 30 minutes.
                  </p>
                  {phoneVerificationLink.includes("localhost") ||
                  phoneVerificationLink.includes("127.0.0.1") ? (
                    <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                      Phone verification needs a public HTTPS URL. Use the Vercel
                      deployment or an HTTPS tunnel like ngrok to test from a
                      phone.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn w-full justify-center"
                  onClick={() => setStep("verify")}
                >
                  Back to verification options
                </button>
              </div>
            )}

            {step === "camera" && existingClaim && !loading && (
              <div className="mt-5 space-y-4">
                <div>
                  <h3 className="font-black">Verify on this device</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Write this code on paper, place it next to your product, then
                    capture a clear proof photo.
                  </p>
                  <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-lg font-black">
                    {verificationCode}
                  </p>
                  <p className="mt-2 text-sm font-bold text-muted">
                    Challenge: {verificationChallenge}
                  </p>
                </div>
                <LiveCameraCapture onCapture={setCapturedPhoto} />
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    className="btn btn-dark justify-center"
                    onClick={uploadLiveCameraProof}
                    disabled={loading}
                  >
                    Submit for review
                  </button>
                  <button
                    type="button"
                    className="btn justify-center"
                    onClick={() => setStep("verify")}
                  >
                    Back to verification options
                  </button>
                </div>
              </div>
            )}

            {step === "rating" && existingClaim && !loading && (
              <div className="mt-5 space-y-4">
                <div>
                  <h3 className="font-black">Add your owner rating</h3>
                  <p className="mt-2 text-sm font-bold text-muted">
                    Rate the buying factors people ask real owners about.
                  </p>
                </div>
                <OwnerCriteriaRatingForm
                  productId={productId}
                  ownedProductId={existingClaim.id}
                  category={category}
                />
                <button type="button" className="btn w-full justify-center" onClick={closeModal}>
                  Do this later
                </button>
              </div>
            )}

            {message && (
              <p className="mt-4 rounded-2xl bg-slate-100 p-3 text-sm font-bold text-muted">
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
