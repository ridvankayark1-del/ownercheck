"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  getOwnerLevel,
  getOwnerLevelBadgeClass,
  getOwnerLevelLabel,
} from "@/lib/ownerLevels";

type ProductInfo = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
};

type OwnerRating = {
  id: string;
  owned_product_id: string | null;
  criteria_scores: Record<string, number> | null;
  overall_rating: number | null;
  updated_at: string;
};

type OwnedProduct = {
  id: string;
  product_id: string;
  ownership_months: number | null;
  verification_status: string;
  verification_photo_url: string | null;
  rating: number | null;
  review_text: string | null;
  created_at: string;
  products: ProductInfo | null;
};

type BuyerProfile = {
  display_name: string | null;
  email: string | null;
};

type DirectQuestion = {
  id: string;
  product_id: string | null;
  owner_id: string | null;
  chat_id: string | null;
  question_text: string;
  answer_text: string | null;
  status: string;
  credit_reward: number | null;
  created_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  answered_at: string | null;
  products: {
    slug: string;
    name: string;
  } | null;
  profiles: BuyerProfile | null;
};

type PublicQuestion = {
  id: string;
  product_id: string;
  buyer_id: string | null;
  winning_owner_id: string | null;
  winning_answer_id: string | null;
  question_text: string;
  status: string;
  credit_reward: number | null;
  created_at: string;
  answered_at: string | null;
  products: {
    slug: string;
    name: string;
  } | null;
  profiles: BuyerProfile | null;
};

type DashboardData = {
  user: {
    id: string;
    email?: string;
  };
  profile: {
    display_name: string | null;
    email: string | null;
    credit_balance: number | null;
    trust_score: number | null;
  } | null;
  ownedProducts: OwnedProduct[];
  ownerRatingsByClaimId: Record<string, OwnerRating>;
  publicQuestions: PublicQuestion[];
  directQuestions: DirectQuestion[];
  summary: {
    claimedProductCount: number;
    verifiedClaimCount: number;
    pendingClaimCount: number;
    unansweredPublicQuestionCount: number;
    unansweredDirectQuestionCount: number;
  };
};

function getVerificationLabel(status: string) {
  if (status === "trusted_owner") return "Trusted owner";
  if (status === "photo_verified") return "Photo verified";
  if (status === "receipt_verified") return "Receipt verified";
  if (status === "photo_submitted") return "Verification pending";
  if (status === "verification_rejected") return "Verification rejected";
  return "Verification needed";
}

function getVerificationTone(status: string) {
  if (["trusted_owner", "photo_verified", "receipt_verified"].includes(status)) {
    return "bg-emerald-50 text-emerald-800";
  }

  if (status === "photo_submitted") {
    return "bg-amber-50 text-amber-800";
  }

  if (status === "verification_rejected") {
    return "bg-red-50 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

function getBuyerName(profile: BuyerProfile | null) {
  if (!profile) return "Unknown buyer";
  if (profile.display_name) return profile.display_name;
  if (profile.email) return profile.email.split("@")[0];
  return "Unknown buyer";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default function OwnerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setErrorMessage(sessionError.message);
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      if (!session?.access_token) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      const response = await fetch("/api/owner/dashboard", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as DashboardData & {
        error?: string;
      };

      if (!response.ok) {
        setErrorMessage(result.error || "Could not load owner dashboard.");
        setLoading(false);
        return;
      }

      setData(result);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const displayName = useMemo(() => {
    if (!data?.profile) return "Owner";
    return (
      data.profile.display_name ||
      data.profile.email?.split("@")[0] ||
      "Owner"
    );
  }, [data]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading owner dashboard...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <p className="font-bold text-muted">Owner dashboard</p>
          <h1 className="mt-2 text-3xl font-black">Log in to continue</h1>
          <p className="mt-3 text-muted">
            Your claimed products, verification status, owner questions, and
            credits will appear here.
          </p>
          <Link href="/auth?redirect=/owner/dashboard" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Owner dashboard unavailable</h1>
          <p className="mt-3 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage || "Could not load owner dashboard."}
          </p>
        </div>
      </main>
    );
  }

  const openPublicQuestions = data.publicQuestions.filter(
    (question) => question.status === "open"
  );
  const answeredPublicQuestions = data.publicQuestions.filter(
    (question) => question.status === "answered"
  );
  const pendingDirectQuestions = data.directQuestions.filter(
    (question) => question.status === "pending"
  );
  const activeDirectQuestions = data.directQuestions.filter(
    (question) => ["accepted", "answered"].includes(question.status)
  );
  const declinedDirectQuestions = data.directQuestions.filter(
    (question) => question.status === "declined"
  );
  const productsNeedingVerification = data.ownedProducts.filter(
    (item) =>
      !["photo_verified", "receipt_verified", "trusted_owner"].includes(
        item.verification_status
      )
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-bold text-muted">Owner dashboard</p>
            <h1 className="mt-2 text-4xl font-black">{displayName}</h1>
            <p className="mt-3 max-w-2xl text-muted">
              Track your claimed products, verification status, scorecards, and
              private owner questions.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/explore" className="btn">
              Find products
            </Link>
            <Link href="/direct-requests" className="btn btn-dark">
              Answer questions
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {data.profile?.credit_balance ?? 0}
            </p>
            <p className="text-sm font-bold text-muted">Credits</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {data.profile?.trust_score ?? 0}
            </p>
            <p className="text-sm font-bold text-muted">Trust</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {data.summary.claimedProductCount}
            </p>
            <p className="text-sm font-bold text-muted">Claimed</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {data.summary.verifiedClaimCount}
            </p>
            <p className="text-sm font-bold text-muted">Verified</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {data.summary.unansweredDirectQuestionCount}
            </p>
            <p className="text-sm font-bold text-muted">Directs</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Claimed products</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  Products connected to your owner profile.
                </p>
              </div>
              <Link href="/add-product" className="btn">
                Add product
              </Link>
            </div>

            {data.ownedProducts.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title="No claimed products yet"
                  description="Claim a product you own to receive owner questions and start building credibility."
                  action={
                    <Link href="/explore" className="btn btn-dark">
                      Explore products
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {data.ownedProducts.map((item) => {
                  const product = item.products;
                  const ownerLevel = getOwnerLevel(
                    item.verification_status,
                    data.profile?.trust_score
                  );
                  const ownerRating = data.ownerRatingsByClaimId[item.id];
                  const scoreCount = ownerRating?.criteria_scores
                    ? Object.keys(ownerRating.criteria_scores).length
                    : 0;

                  return (
                    <article key={item.id} className="rounded-2xl border p-4">
                      <div className="flex gap-4">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {product?.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-bold text-muted">
                              No image
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-muted">
                            {product?.brand || "Unknown brand"}
                            {product?.category ? ` / ${product.category}` : ""}
                          </p>
                          <h3 className="mt-1 text-lg font-black">
                            {product?.name || "Unknown product"}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${getOwnerLevelBadgeClass(
                                ownerLevel
                              )}`}
                            >
                              {getOwnerLevelLabel(ownerLevel)}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${getVerificationTone(
                                item.verification_status
                              )}`}
                            >
                              {getVerificationLabel(item.verification_status)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="font-black">
                            {item.ownership_months || 0}
                          </p>
                          <p className="text-xs font-bold text-muted">Months</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="font-black">{item.rating || "-"}/5</p>
                          <p className="text-xs font-bold text-muted">Review</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="font-black">
                            {ownerRating?.overall_rating
                              ? ownerRating.overall_rating.toFixed(1)
                              : "-"}
                          </p>
                          <p className="text-xs font-bold text-muted">
                            Scorecard
                          </p>
                        </div>
                      </div>

                      {ownerRating ? (
                        <p className="mt-3 text-sm font-bold text-muted">
                          Owner scorecard saved with {scoreCount} criteria.
                        </p>
                      ) : (
                        <p className="mt-3 text-sm font-bold text-muted">
                          Owner scorecard not completed yet.
                        </p>
                      )}

                      {item.verification_status === "photo_submitted" && (
                        <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                          Verification pending. Admin review can upgrade this to
                          photo verified.
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-3">
                        {product?.slug && (
                          <>
                            <Link
                              href={`/product/${product.slug}`}
                              className="btn btn-dark"
                            >
                              View product
                            </Link>
                            <Link
                              href={`/product/${product.slug}#ask-question`}
                              className="btn"
                            >
                              Answer questions
                            </Link>
                            {![
                              "photo_verified",
                              "receipt_verified",
                              "trusted_owner",
                            ].includes(item.verification_status) && (
                              <Link
                                href={`/product/${product.slug}?claim=1`}
                                className="btn"
                              >
                                Complete verification
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Public Questions</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  Open buyer questions for products you verified.
                </p>
              </div>
            </div>

            {data.publicQuestions.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title="No questions yet"
                  description="When buyers ask public questions about products you verified, they will appear here."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {[...openPublicQuestions, ...answeredPublicQuestions]
                  .slice(0, 8)
                  .map((question) => {
                    const answeredByViewer =
                      question.winning_owner_id === data.user.id;
                    const answeredByAnother =
                      question.status === "answered" && !answeredByViewer;

                    return (
                      <article key={question.id} className="rounded-2xl border p-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-black text-muted">
                          <span>{question.products?.name || "Unknown product"}</span>
                          <span>/</span>
                          <span>{getBuyerName(question.profiles)}</span>
                          <span>/</span>
                          <span>{formatDate(question.created_at)}</span>
                        </div>
                        <p className="mt-3 font-bold">{question.question_text}</p>

                        {question.status === "open" && (
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                              Open
                            </span>
                            <Link
                              href={`/owner/questions/${question.id}`}
                              className="btn btn-dark"
                            >
                              Answer question
                            </Link>
                          </div>
                        )}

                        {answeredByViewer && (
                          <div className="mt-4 rounded-2xl bg-emerald-50 p-4">
                            <p className="text-xs font-black uppercase text-emerald-800">
                              Answered by you
                            </p>
                          </div>
                        )}

                        {answeredByAnother && (
                          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-black uppercase text-muted">
                              Answered by another verified owner
                            </p>
                            <Link
                              href={`/owner/questions/${question.id}`}
                              className="mt-3 inline-flex text-sm font-bold underline"
                            >
                              View question
                            </Link>
                          </div>
                        )}
                      </article>
                    );
                  })}
              </div>
            )}
          </section>

          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Direct Requests</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  Private one-to-one requests sent only to you.
                </p>
              </div>
              <Link href="/direct-requests" className="btn">
                Directs
              </Link>
            </div>

            {data.directQuestions.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title="No direct requests yet"
                  description="When a buyer selects you for a private request, it will appear here."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {[...pendingDirectQuestions, ...activeDirectQuestions, ...declinedDirectQuestions]
                  .slice(0, 8)
                  .map((question) => (
                    <article key={question.id} className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-black text-muted">
                        <span>{question.products?.name || "Unknown product"}</span>
                        <span>/</span>
                        <span>{getBuyerName(question.profiles)}</span>
                        <span>/</span>
                        <span>{formatDate(question.created_at)}</span>
                      </div>
                      <p className="mt-3 font-bold">{question.question_text}</p>

                      {question.status === "pending" ? (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                            Pending Direct Request
                          </span>
                          <Link
                            href={`/owner/direct-questions/${question.id}`}
                            className="btn btn-dark"
                          >
                            Review request
                          </Link>
                        </div>
                      ) : ["accepted", "answered"].includes(question.status) ? (
                        <div className="mt-4 rounded-2xl bg-emerald-50 p-4">
                          <p className="text-xs font-black uppercase text-emerald-800">
                            Private Chat Open
                          </p>
                          {question.chat_id ? (
                            <Link
                              href={`/chats/${question.chat_id}`}
                              className="mt-3 inline-flex text-sm font-bold underline"
                            >
                              Open chat
                            </Link>
                          ) : (
                            <Link
                              href={`/owner/direct-questions/${question.id}`}
                              className="mt-3 inline-flex text-sm font-bold underline"
                            >
                              View request
                            </Link>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-black uppercase text-muted">
                            Declined
                          </p>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-6">
            <h2 className="text-xl font-black">Credibility</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Verification and useful answers raise buyer confidence in your
              owner profile.
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-2xl font-black">
                  {data.summary.verifiedClaimCount}
                </p>
                <p className="text-sm font-bold text-muted">
                  Verified ownership claims
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-2xl font-black">
                  {Object.keys(data.ownerRatingsByClaimId).length}
                </p>
                <p className="text-sm font-bold text-muted">
                  Saved owner scorecards
                </p>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-xl font-black">Verification</h2>
            {productsNeedingVerification.length === 0 &&
            data.ownedProducts.length > 0 ? (
              <p className="mt-3 text-sm font-bold text-emerald-800">
                All claimed products are verified or under trusted status.
              </p>
            ) : productsNeedingVerification.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                Claim a product first, then submit photo proof to become a
                verified owner.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {productsNeedingVerification.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-2xl bg-slate-50 p-4">
                    <p className="font-black">
                      {item.products?.name || "Unknown product"}
                    </p>
                    <p className="mt-1 text-sm font-bold text-muted">
                      {getVerificationLabel(item.verification_status)}
                    </p>
                    {item.products?.slug && (
                      <Link
                        href={`/product/${item.products.slug}?claim=1`}
                        className="mt-3 inline-flex text-sm font-bold underline"
                      >
                        Complete verification
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}
