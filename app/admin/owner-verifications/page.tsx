"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { supabase } from "@/lib/supabaseClient";

type ProductInfo = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
};

type ProfileInfo = {
  display_name: string | null;
  email: string | null;
};

type RawOwnerVerification = {
  id: string;
  ownership_months: number | null;
  rating: number | null;
  review_text: string | null;
  verification_code: string | null;
  verification_challenge: string | null;
  verification_capture_method: string | null;
  verification_token_expires_at: string | null;
  verification_photo_url: string | null;
  products: ProductInfo | ProductInfo[] | null;
  profiles: ProfileInfo | ProfileInfo[] | null;
};

type OwnerVerification = {
  id: string;
  ownership_months: number | null;
  rating: number | null;
  review_text: string | null;
  verification_code: string | null;
  verification_challenge: string | null;
  verification_capture_method: string | null;
  verification_token_expires_at: string | null;
  verification_photo_url: string | null;
  signed_photo_url: string | null;
  products: ProductInfo | null;
  profiles: ProfileInfo | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

function getOwnerName(profile: ProfileInfo | null) {
  if (!profile) return "Unknown owner";
  if (profile.display_name) return profile.display_name;
  if (profile.email) return profile.email;
  return "Unknown owner";
}

function getCaptureMethodLabel(method?: string | null) {
  if (method === "phone_camera") return "Phone camera";
  if (method === "live_camera") return "Live camera";
  if (method === "upload") return "Manual upload";
  return "Not recorded";
}

function getCaptureMethodBadgeClass(method?: string | null) {
  if (method === "phone_camera") return "bg-blue-100 text-blue-800";
  if (method === "live_camera") return "bg-emerald-100 text-emerald-800";
  if (method === "upload") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function getVerificationPhotoPath(value: string | null) {
  if (!value) return null;

  if (!value.startsWith("http")) {
    return value.replace(/^\/+/, "");
  }

  try {
    const url = new URL(value);
    const marker = "/owner-verifications/";
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    }
  } catch {
    return null;
  }

  return null;
}

export default function AdminOwnerVerificationsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [verifications, setVerifications] = useState<OwnerVerification[]>([]);
  const [message, setMessage] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>(
    {}
  );

  async function loadVerifications() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoggedIn(false);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const adminCheck = await checkCurrentUserIsAdmin();

    if (!adminCheck.isAdmin) {
      setIsAdmin(false);
      setMessage("You do not have admin access.");
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error } = await supabase
      .from("owned_products")
      .select(
        "id, ownership_months, rating, review_text, verification_code, verification_challenge, verification_capture_method, verification_token_expires_at, verification_photo_url, products(slug, name, brand, category), profiles(display_name, email)"
      )
      .eq("verification_status", "photo_submitted")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setVerifications([]);
    } else {
      const normalized = await Promise.all(
        ((data || []) as RawOwnerVerification[]).map(async (item) => {
          const photoPath = getVerificationPhotoPath(item.verification_photo_url);
          const signedPhotoUrl = photoPath
            ? await supabase.storage
                .from("owner-verifications")
                .createSignedUrl(photoPath, 60 * 60)
            : null;

          return {
          ...item,
          products: normalizeSingle(item.products),
          profiles: normalizeSingle(item.profiles),
          signed_photo_url: signedPhotoUrl?.data?.signedUrl || null,
          };
        })
      );

      setVerifications(normalized);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadVerifications();
  }, []);

  async function updateVerificationStatus(
    ownedProductId: string,
    status: "photo_verified" | "verification_rejected",
    adminNotes?: string
  ) {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You do not have admin access.");
      return;
    }

    const adminCheck = await checkCurrentUserIsAdmin();

    if (!adminCheck.isAdmin) {
      setMessage("You do not have admin access.");
      return;
    }

    const { error } = await supabase
      .from("owned_products")
      .update({ verification_status: status, admin_notes: adminNotes || null })
      .eq("id", ownedProductId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      status === "photo_verified"
        ? "Owner photo verified."
        : "Owner verification rejected."
    );
    await loadVerifications();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">
            Loading owner verifications...
          </h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Admin login required</h1>
          <p className="mt-3 text-muted">
            Log in before reviewing owner verification photos.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Access denied</h1>
          <p className="mt-3 text-muted">
            You do not have permission to review owner verifications.
          </p>
          {message && (
            <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
              {message}
            </p>
          )}
          <Link href="/" className="btn btn-dark mt-5">
            Go home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="mb-8">
        <p className="font-bold text-muted">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Owner verifications</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Review submitted owner proof photos and decide whether each product
          claim should become photo verified.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/products" className="btn">
            Product review
          </Link>

          <Link href="/explore" className="btn">
            Explore catalog
          </Link>
        </div>

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}
      </section>

      {verifications.length === 0 ? (
        <div className="card p-6">
          <h2 className="text-2xl font-black">No pending photos</h2>
          <p className="mt-3 text-muted">
            Submitted owner verification photos will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {verifications.map((verification) => (
            <div key={verification.id} className="card p-5">
              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="overflow-hidden rounded-2xl bg-slate-100">
                  {verification.signed_photo_url ? (
                    <a
                      href={verification.signed_photo_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={verification.signed_photo_url}
                        alt="Owner verification"
                        className="h-56 w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-56 items-center justify-center text-sm text-muted">
                      No photo
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
                    <span>
                      {verification.products?.brand || "Unknown brand"}
                    </span>
                    <span>·</span>
                    <span>
                      {verification.products?.category || "Uncategorized"}
                    </span>
                  </div>

                  <h2 className="mt-2 text-2xl font-black">
                    {verification.products?.name || "Unknown product"}
                  </h2>

                  <p className="mt-3 text-sm font-bold text-muted">
                    Owner: {getOwnerName(verification.profiles)}
                    {verification.profiles?.display_name &&
                    verification.profiles.email
                      ? ` · ${verification.profiles.email}`
                      : ""}
                  </p>

                  <span
                    className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${getCaptureMethodBadgeClass(
                      verification.verification_capture_method
                    )}`}
                  >
                    {getCaptureMethodLabel(
                      verification.verification_capture_method
                    )}
                  </span>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-muted">
                        Months owned
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {verification.ownership_months ?? 0}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-muted">
                        Rating
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {verification.rating ? `${verification.rating}/5` : "-"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-muted">
                        Verification code
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {verification.verification_code || "No code"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-muted">
                        Capture method
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {getCaptureMethodLabel(
                          verification.verification_capture_method
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-muted">
                        Token status
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {verification.verification_token_expires_at
                          ? new Date(
                              verification.verification_token_expires_at
                            ).getTime() > Date.now()
                            ? "Active"
                            : "Expired"
                          : "No active token"}
                      </p>
                    </div>
                  </div>

                  {verification.verification_challenge && (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase text-muted">
                        Verification challenge
                      </p>
                      <p className="mt-2 leading-7">
                        {verification.verification_challenge}
                      </p>
                    </div>
                  )}

                  {verification.review_text && (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase text-muted">
                        Review text
                      </p>
                      <p className="mt-2 leading-7">
                        {verification.review_text}
                      </p>
                    </div>
                  )}

                  {verification.verification_photo_url && (
                    <a
                      href={verification.verification_photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-bold underline"
                    >
                      Open verification photo
                    </a>
                  )}

                  <div className="mt-5">
                    <label className="label" htmlFor={`rejection-note-${verification.id}`}>
                      Reason for rejection
                    </label>
                    <textarea
                      id={`rejection-note-${verification.id}`}
                      className="input mt-2 min-h-24"
                      value={rejectionNotes[verification.id] || ""}
                      onChange={(event) =>
                        setRejectionNotes((current) => ({
                          ...current,
                          [verification.id]: event.target.value,
                        }))
                      }
                      placeholder="Reason for rejection (visible to user)..."
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={() =>
                        updateVerificationStatus(
                          verification.id,
                          "photo_verified"
                        )
                      }
                    >
                      Mark photo verified
                    </button>

                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        updateVerificationStatus(
                          verification.id,
                          "verification_rejected",
                          rejectionNotes[verification.id]
                        )
                      }
                    >
                      Reject verification
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
