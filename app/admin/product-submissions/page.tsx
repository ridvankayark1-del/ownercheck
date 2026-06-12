"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { supabase } from "@/lib/supabaseClient";

type DuplicateCandidate = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  matchType: "exact" | "possible";
  score: number;
};

type ProductSubmission = {
  id: string;
  submitter_id: string;
  name: string;
  brand: string;
  category: string;
  model: string | null;
  product_url: string | null;
  image_url: string | null;
  duplicate_candidates: DuplicateCandidate[];
  highest_duplicate_score: number | null;
  enrichment_status: string;
  enrichment_error: string | null;
  status: string;
  linked_product_id: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  submitter: {
    display_name: string | null;
    email: string | null;
  } | null;
};

type Draft = {
  name: string;
  brand: string;
  category: string;
  model: string;
  product_url: string;
  image_url: string;
  admin_notes: string;
  linked_product_id: string;
};

function formatStatus(value: string | null | undefined) {
  return (value || "pending_review").replace(/_/g, " ");
}

function getBadgeClass(value: string) {
  if (value === "approved") return "bg-emerald-100 text-emerald-800";
  if (value === "duplicate" || value === "rejected") {
    return "bg-red-100 text-red-800";
  }
  if (value === "needs_more_info") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function buildDraft(submission: ProductSubmission): Draft {
  return {
    name: submission.name || "",
    brand: submission.brand || "",
    category: submission.category || "",
    model: submission.model || "",
    product_url: submission.product_url || "",
    image_url: submission.image_url || "",
    admin_notes: submission.admin_notes || "",
    linked_product_id: submission.linked_product_id || "",
  };
}

export default function AdminProductSubmissionsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [submissions, setSubmissions] = useState<ProductSubmission[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState("");
  const [actionId, setActionId] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending_review");

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Admin session is missing. Log in again.");
    }

    return session.access_token;
  }

  async function loadSubmissions() {
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

    try {
      const token = await getToken();
      const response = await fetch("/api/admin/product-submissions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not load submissions.");
      }

      const loaded = (payload.submissions || []) as ProductSubmission[];
      setSubmissions(loaded);
      setDrafts(
        Object.fromEntries(
          loaded.map((submission) => [submission.id, buildDraft(submission)])
        )
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load submissions."
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  const filteredSubmissions = useMemo(() => {
    if (statusFilter === "all") return submissions;
    return submissions.filter((submission) => submission.status === statusFilter);
  }, [statusFilter, submissions]);

  async function runAction(
    submission: ProductSubmission,
    action:
      | "approve"
      | "reject"
      | "duplicate"
      | "needs_more_info"
      | "rerun_duplicate_check"
  ) {
    setActionId(`${submission.id}:${action}`);
    setMessage("");

    try {
      const token = await getToken();
      const draft = drafts[submission.id] || buildDraft(submission);
      const response = await fetch("/api/admin/product-submissions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          submissionId: submission.id,
          action,
          linkedProductId: draft.linked_product_id || null,
          adminNotes: draft.admin_notes || null,
          updates: {
            name: draft.name,
            brand: draft.brand,
            category: draft.category,
            model: draft.model || null,
            product_url: draft.product_url || null,
            image_url: draft.image_url || null,
          },
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Action failed.");
      }

      await loadSubmissions();
      setMessage(
        action === "approve"
          ? "Submission approved and product created."
          : action === "rerun_duplicate_check"
            ? "Duplicate check rerun."
            : "Submission updated."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    }

    setActionId("");
  }

  if (loading) {
    return <main className="mx-auto max-w-6xl px-5 py-12">Loading...</main>;
  }

  if (!loggedIn || !isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-4xl font-black">Admin access required</h1>
        <p className="mt-3 text-muted">
          Log in with an admin account to review product submissions.
        </p>
        <Link href="/auth" className="btn btn-dark mt-6">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-bold text-muted">Admin</p>
          <h1 className="text-4xl font-black">Product submissions</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Review missing-product submissions before they become public
            product pages.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/products" className="btn">
            Product manager
          </Link>
          <Link href="/admin/import-products" className="btn">
            Import products
          </Link>
        </div>
      </section>

      {message && (
        <p className="mt-6 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
          {message}
        </p>
      )}

      <section className="card mt-6 p-5">
        <label className="label">Status</label>
        <select
          className="input mt-2 max-w-xs"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="pending_review">Pending review</option>
          <option value="needs_more_info">Needs more info</option>
          <option value="duplicate">Duplicate</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </section>

      <section className="mt-6 space-y-5">
        {filteredSubmissions.length === 0 ? (
          <div className="card p-8">
            <h2 className="text-2xl font-black">No submissions</h2>
            <p className="mt-2 text-muted">Nothing matches this filter.</p>
          </div>
        ) : (
          filteredSubmissions.map((submission) => {
            const draft = drafts[submission.id] || buildDraft(submission);

            return (
              <div key={submission.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${getBadgeClass(
                          submission.status
                        )}`}
                      >
                        {formatStatus(submission.status)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        Duplicate score:{" "}
                        {submission.highest_duplicate_score
                          ? Math.round(submission.highest_duplicate_score * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <h2 className="mt-3 text-2xl font-black">
                      {submission.name}
                    </h2>
                    <p className="mt-1 text-sm font-bold text-muted">
                      Submitted by{" "}
                      {submission.submitter?.display_name ||
                        submission.submitter?.email ||
                        "Unknown user"}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-muted">
                    {new Date(submission.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {[
                    ["Product name", "name"],
                    ["Brand", "brand"],
                    ["Category", "category"],
                    ["Model / variant", "model"],
                    ["Product URL", "product_url"],
                    ["Image URL", "image_url"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <input
                        className="input mt-2"
                        value={draft[key as keyof Draft]}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [submission.id]: {
                              ...draft,
                              [key]: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <label className="label">Admin notes</label>
                  <textarea
                    className="input mt-2 min-h-20"
                    value={draft.admin_notes}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [submission.id]: {
                          ...draft,
                          admin_notes: event.target.value,
                        },
                      }))
                    }
                    placeholder="Reason for approval, rejection, or duplicate decision..."
                  />
                </div>

                {submission.duplicate_candidates?.length > 0 && (
                  <div className="mt-5 rounded-2xl bg-amber-50 p-4">
                    <h3 className="font-black text-amber-900">
                      Duplicate candidates
                    </h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {submission.duplicate_candidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-2xl bg-white p-4">
                          <p className="text-xs font-black uppercase text-amber-700">
                            {candidate.matchType} -{" "}
                            {Math.round(candidate.score * 100)}%
                          </p>
                          <p className="mt-1 font-black">{candidate.name}</p>
                          <p className="text-sm text-muted">
                            {candidate.brand || "Unknown brand"} -{" "}
                            {candidate.category || "Uncategorized"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                              href={`/product/${candidate.slug}`}
                              className="btn"
                            >
                              View product
                            </Link>
                            <button
                              type="button"
                              className="btn"
                              onClick={() =>
                                setDrafts((current) => ({
                                  ...current,
                                  [submission.id]: {
                                    ...draft,
                                    linked_product_id: candidate.id,
                                  },
                                }))
                              }
                            >
                              Link duplicate
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <label className="label">Linked product ID for duplicate</label>
                  <input
                    className="input mt-2 max-w-xl"
                    value={draft.linked_product_id}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [submission.id]: {
                          ...draft,
                          linked_product_id: event.target.value,
                        },
                      }))
                    }
                    placeholder="Paste or select an existing product ID"
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {[
                    ["approve", "Approve and create product"],
                    ["rerun_duplicate_check", "Rerun duplicate check"],
                    ["duplicate", "Mark duplicate"],
                    ["needs_more_info", "Needs more info"],
                    ["reject", "Reject"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      type="button"
                      className={action === "approve" ? "btn btn-dark" : "btn"}
                      onClick={() =>
                        runAction(
                          submission,
                          action as
                            | "approve"
                            | "reject"
                            | "duplicate"
                            | "needs_more_info"
                            | "rerun_duplicate_check"
                        )
                      }
                      disabled={actionId === `${submission.id}:${action}`}
                    >
                      {actionId === `${submission.id}:${action}`
                        ? "Working..."
                        : label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
