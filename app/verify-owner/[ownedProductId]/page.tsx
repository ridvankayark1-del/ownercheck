"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LiveCameraCapture } from "@/components/LiveCameraCapture";
import { supabase } from "@/lib/supabaseClient";

type ProductInfo = {
  name: string;
  brand: string | null;
  category: string | null;
};

type RawVerificationClaim = {
  id: string;
  verification_status: string;
  verification_code: string | null;
  verification_challenge: string | null;
  verification_token_expires_at: string | null;
  products: ProductInfo | ProductInfo[] | null;
};

type VerificationClaim = {
  id: string;
  verification_status: string;
  verification_code: string | null;
  verification_challenge: string | null;
  verification_token_expires_at: string | null;
  product: ProductInfo | null;
};

function normalizeProduct(product: ProductInfo | ProductInfo[] | null) {
  if (Array.isArray(product)) {
    return product[0] || null;
  }

  return product;
}

export default function VerifyOwnerPage() {
  const params = useParams<{ ownedProductId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [claim, setClaim] = useState<VerificationClaim | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadClaim() {
      setLoading(true);
      setMessage("");

      if (!params.ownedProductId || !token) {
        setMessage(
          "This verification link expired. Please return to the product page and generate a new one."
        );
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("owned_products")
        .select(
          "id, verification_status, verification_code, verification_challenge, verification_token_expires_at, products(name, brand, category)"
        )
        .eq("id", params.ownedProductId)
        .eq("verification_token", token)
        .maybeSingle();

      if (error || !data) {
        setMessage(
          "This verification link expired. Please return to the product page and generate a new one."
        );
        setLoading(false);
        return;
      }

      const rawClaim = data as RawVerificationClaim;
      const expiresAt = rawClaim.verification_token_expires_at
        ? new Date(rawClaim.verification_token_expires_at).getTime()
        : 0;

      if (!expiresAt || expiresAt < Date.now()) {
        setMessage(
          "This verification link expired. Please return to the product page and generate a new one."
        );
        setLoading(false);
        return;
      }

      setClaim({
        id: rawClaim.id,
        verification_status: rawClaim.verification_status,
        verification_code: rawClaim.verification_code,
        verification_challenge: rawClaim.verification_challenge,
        verification_token_expires_at: rawClaim.verification_token_expires_at,
        product: normalizeProduct(rawClaim.products),
      });
      setLoading(false);
    }

    loadClaim();
  }, [params.ownedProductId, token]);

  async function submitPhoto() {
    setMessage("");

    if (!claim || !capturedPhoto) {
      setMessage("Capture a photo first.");
      return;
    }

    setSubmitting(true);

    const filePath = `phone-verifications/${claim.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("owner-verifications")
      .upload(filePath, capturedPhoto);

    if (uploadError) {
      setSubmitting(false);
      setMessage(uploadError.message);
      return;
    }

    const { error: rpcError } = await supabase.rpc(
      "submit_owner_phone_verification",
      {
        owned_product_id_input: claim.id,
        verification_token_input: token,
        photo_url_input: filePath,
      }
    );

    setSubmitting(false);

    if (rpcError) {
      setMessage(rpcError.message);
      return;
    }

    setSuccess(true);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading verification...</h1>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Photo submitted</h1>
          <p className="mt-3 leading-7 text-muted">
            Photo submitted. An admin will review your ownership evidence.
          </p>
        </div>
      </main>
    );
  }

  if (!claim) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Verification link expired</h1>
          <p className="mt-3 leading-7 text-muted">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <section className="card p-5">
        <p className="font-bold text-muted">OwnerCheck</p>
        <h1 className="mt-2 text-3xl font-black">Verify ownership</h1>
        <p className="mt-3 text-lg font-bold">
          {claim.product?.brand ? `${claim.product.brand} ` : ""}
          {claim.product?.name || "Product"}
        </p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <ol className="space-y-3 text-sm font-bold text-muted">
            <li>1. Write this code on paper: {claim.verification_code}</li>
            <li>2. Place the paper next to your product.</li>
            <li>
              3. Complete this challenge:{" "}
              {claim.verification_challenge || "Show the product clearly."}
            </li>
            <li>4. Take a clear photo.</li>
          </ol>
          <p className="mt-4 text-sm leading-6 text-muted">
            Take the photo in good light. Do not upload screenshots or edited
            images.
          </p>
        </div>

        <div className="mt-5">
          <LiveCameraCapture onCapture={setCapturedPhoto} />
        </div>

        <button
          type="button"
          className="btn btn-dark mt-5 w-full justify-center"
          onClick={submitPhoto}
          disabled={submitting}
        >
          {submitting
            ? "Submitting..."
            : claim.verification_status === "verification_rejected"
              ? "Re-submit Verification"
              : "Submit for review"}
        </button>

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-3 text-sm font-bold text-muted">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
