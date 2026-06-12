"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { supabase } from "@/lib/supabaseClient";

type FactoryBatch = {
  id: string;
  name: string;
  source_name: string | null;
  status: string;
  total_rows: number;
  ready_count: number;
  possible_duplicate_count: number;
  failed_count: number;
  published_count: number;
  created_at: string;
  updated_at: string;
};

type FactorySpecItem = {
  key: string;
  label: string;
  value: string;
  source_url: string | null;
  source_type: string | null;
  confidence: number | null;
  status: "approved" | "needs_review";
};

type DuplicateCandidate = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  matchType: "exact" | "possible";
  score: number;
  reasons?: string[];
};

type FactoryRow = {
  id: string;
  batch_id?: string;
  row_index: number;
  raw_row: Record<string, string>;
  status: string;
  name: string;
  brand: string;
  model: string | null;
  category: string;
  product_type: string | null;
  source_name: string | null;
  source_url: string | null;
  official_url: string | null;
  product_url: string | null;
  image_url_candidate: string | null;
  short_summary: string | null;
  specs: Record<string, unknown> & { _items?: FactorySpecItem[] };
  aliases: string[];
  duplicate_candidates: DuplicateCandidate[];
  duplicate_risk: number;
  warnings: string[];
  linked_product_id: string | null;
  created_product_id: string | null;
  error_message: string | null;
};

const SAMPLE_CSV = `source_name,source_url,brand,name,category,product_type,image_url_candidate,spec:type,spec:enclosure,spec:wireless,spec:transducer,spec:noise_cancelling,spec:mic
RTINGS,https://www.rtings.com/headphones/reviews/apple/airpods-3rd-generation-truly-wireless,Apple,AirPods (3rd generation),Headphones,True wireless earbuds,,Earbuds,Open-Back,Yes,Dynamic,No,Yes
RTINGS,https://www.rtings.com/headphones/reviews/sony/wh-1000xm5-wireless,Sony,WH-1000XM5,Headphones,Noise-cancelling headphones,,Over-ear,Closed-Back,Yes,Dynamic,Yes,Yes
RTINGS,https://www.rtings.com/headphones/reviews/bose/quietcomfort-ultra-headphones-wireless,Bose,QuietComfort Ultra Headphones,Headphones,Noise-cancelling headphones,,Over-ear,Closed-Back,Yes,Dynamic,Yes,Yes
RTINGS,https://www.rtings.com/headphones/reviews/sennheiser/momentum-4-wireless,Sennheiser,Momentum 4 Wireless,Headphones,Over-ear headphones,,Over-ear,Closed-Back,Yes,Dynamic,Yes,Yes
RTINGS,https://www.rtings.com/headphones/reviews/audeze/lcd-2-classic,Audeze,LCD-2 Classic,Headphones,Over-ear headphones,,Over-ear,Open-Back,No,Planar Magnetic,No,No`;

function formatStatus(value?: string | null) {
  return (value || "draft").replace(/_/g, " ");
}

function getStatusClass(status: string) {
  if (["ready_to_publish", "published", "completed"].includes(status)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (
    [
      "possible_duplicate",
      "duplicate_found",
      "needs_review",
      "review_needed",
      "missing_required_fields",
    ].includes(status)
  ) {
    return "bg-amber-100 text-amber-800";
  }
  if (["failed", "rejected"].includes(status)) return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function getSpecs(row: FactoryRow) {
  return Array.isArray(row.specs?._items) ? row.specs._items : [];
}

function getRowPatchFromEditor(row: FactoryRow) {
  return {
    name: row.name,
    brand: row.brand,
    model: row.model,
    category: row.category,
    product_type: row.product_type,
    source_name: row.source_name,
    source_url: row.source_url,
    official_url: row.official_url,
    product_url: row.product_url,
    image_url_candidate: row.image_url_candidate,
    short_summary: row.short_summary,
    aliases: row.aliases,
    specs: row.specs,
  };
}

export default function AdminProductFactoryPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [batches, setBatches] = useState<FactoryBatch[]>([]);
  const [rows, setRows] = useState<FactoryRow[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [activeRow, setActiveRow] = useState<FactoryRow | null>(null);
  const [previewRows, setPreviewRows] = useState<FactoryRow[]>([]);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [batchName, setBatchName] = useState("Headphones CSV import");
  const [sourceName, setSourceName] = useState("RTINGS");
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [approveSpecs, setApproveSpecs] = useState(false);
  const [approveImage, setApproveImage] = useState(false);
  const [approveDuplicate, setApproveDuplicate] = useState(true);

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Admin session is missing. Log in again.");
    }

    return session.access_token;
  }

  async function loadFactory(batchId = selectedBatchId) {
    const token = await getToken();
    const url = batchId
      ? `/api/admin/product-factory?batchId=${encodeURIComponent(batchId)}`
      : "/api/admin/product-factory";
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as {
      batches?: FactoryBatch[];
      rows?: FactoryRow[];
      error?: string;
    };

    if (!response.ok) throw new Error(result.error || "Could not load factory.");

    setBatches(result.batches || []);
    setRows(result.rows || []);
  }

  useEffect(() => {
    async function checkAdmin() {
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
      setIsAdmin(adminCheck.isAdmin);

      if (adminCheck.isAdmin) {
        try {
          await loadFactory("");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not load.");
        }
      }

      setLoading(false);
    }

    checkAdmin();
  }, []);

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);

  const filteredRows = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesFilter = filter === "all" || row.status === filter;
      const haystack = [
        row.name,
        row.brand,
        row.category,
        row.source_url,
        row.product_url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!search || haystack.includes(search));
    });
  }, [filter, rows, searchText]);

  function replaceRow(row: FactoryRow) {
    setRows((current) => current.map((item) => (item.id === row.id ? row : item)));
    setActiveRow((current) => (current?.id === row.id ? row : current));
  }

  async function previewCsv() {
    setWorking(true);
    setMessage("");
    setPreviewRows([]);

    try {
      const token = await getToken();
      const response = await fetch("/api/admin/product-factory", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csvText, previewOnly: true }),
      });
      const result = (await response.json()) as {
        rows?: FactoryRow[];
        error?: string;
      };

      if (!response.ok) throw new Error(result.error || "Could not preview CSV.");

      setPreviewRows(result.rows || []);
      setMessage(`Preview ready: ${(result.rows || []).length} rows parsed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not preview CSV.");
    } finally {
      setWorking(false);
    }
  }

  async function createBatch() {
    setWorking(true);
    setMessage("");

    try {
      const token = await getToken();
      const response = await fetch("/api/admin/product-factory", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: batchName,
          sourceName,
          csvText,
          runDuplicateCheck: true,
        }),
      });
      const result = (await response.json()) as {
        batch?: FactoryBatch;
        rows?: FactoryRow[];
        error?: string;
      };

      if (!response.ok || !result.batch) {
        throw new Error(result.error || "Could not create batch.");
      }

      setSelectedBatchId(result.batch.id);
      setRows(result.rows || []);
      await loadFactory(result.batch.id);
      setMessage("Import batch created and duplicate checks started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create batch.");
    } finally {
      setWorking(false);
    }
  }

  async function chooseBatch(batchId: string) {
    setSelectedBatchId(batchId);
    setSelectedRowIds([]);
    setActiveRow(null);
    setWorking(true);
    setMessage("");

    try {
      await loadFactory(batchId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load batch.");
    } finally {
      setWorking(false);
    }
  }

  async function patchFactory(body: Record<string, unknown>) {
    const token = await getToken();
    const response = await fetch("/api/admin/product-factory", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Product Factory action failed.");
    }

    return result as { row?: FactoryRow; rows?: FactoryRow[]; results?: unknown[] };
  }

  async function saveActiveRow() {
    if (!activeRow) return;
    setWorking(true);
    setMessage("");

    try {
      const result = await patchFactory({
        action: "update_row",
        rowId: activeRow.id,
        rowPatch: getRowPatchFromEditor(activeRow),
      });

      if (result.row) replaceRow(result.row);
      await loadFactory(selectedBatchId);
      setMessage("Row saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save row.");
    } finally {
      setWorking(false);
    }
  }

  async function runDuplicateCheck(rowId?: string) {
    setWorking(true);
    setMessage("");

    try {
      const result = await patchFactory({
        action: "run_duplicate_check",
        batchId: selectedBatchId,
        rowId,
      });

      if (result.rows) {
        setRows((current) =>
          current.map(
            (row) => result.rows?.find((item) => item.id === row.id) || row
          )
        );
      }
      await loadFactory(selectedBatchId);
      setMessage("Duplicate check complete.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not run duplicate check."
      );
    } finally {
      setWorking(false);
    }
  }

  async function rowAction(action: string, row: FactoryRow) {
    setWorking(true);
    setMessage("");

    try {
      const result = await patchFactory({ action, rowId: row.id });
      if (result.row) replaceRow(result.row);
      await loadFactory(selectedBatchId);
      setMessage("Row updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update row.");
    } finally {
      setWorking(false);
    }
  }

  async function publishSelected(rowIds = selectedRowIds) {
    if (rowIds.length === 0) {
      setMessage("Select at least one row to publish.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const result = await patchFactory({
        action: "publish_rows",
        rowIds,
        publishOptions: {
          approveDuplicate,
          approveSpecs,
          approveImage,
        },
      });

      await loadFactory(selectedBatchId);
      setSelectedRowIds([]);
      setMessage(`Publish complete: ${(result.results || []).length} rows processed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish rows.");
    } finally {
      setWorking(false);
    }
  }

  function updateActiveSpec(index: number, patch: Partial<FactorySpecItem>) {
    setActiveRow((current) => {
      if (!current) return current;
      const specs = getSpecs(current);
      const nextSpecs = specs.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      );
      const specObject: Record<string, unknown> = {
        ...(current.specs || {}),
        _items: nextSpecs,
      };

      nextSpecs.forEach((item) => {
        if (item.key && item.value) specObject[item.key] = item.value;
      });

      return { ...current, specs: specObject };
    });
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading Product Factory...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn || !isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <section className="card p-6">
          <h1 className="text-3xl font-black">
            {loggedIn ? "Access denied" : "Admin login required"}
          </h1>
          <p className="mt-3 text-muted">
            Log in as an OwnerCheck admin to use Product Factory.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-bold text-muted">Admin</p>
          <h1 className="mt-1 text-4xl font-black">Product Factory</h1>
          <p className="mt-3 max-w-3xl text-muted">
            Import CSVs from any source, map specs dynamically, review duplicate
            risk, and bulk-publish safe community-created product pages.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/products" className="btn">
            Product manager
          </Link>
          <a
            href="/examples/product-factory-headphones-template.csv"
            className="btn"
          >
            Sample CSV
          </a>
        </div>
      </section>

      {message && (
        <p className="mb-5 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
          {message}
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Import new batch</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  Paste CSV text or upload a CSV file. Nothing is published until
                  you review and publish rows.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
                CSV mode
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Batch name</label>
                <input
                  className="input mt-2"
                  value={batchName}
                  onChange={(event) => setBatchName(event.target.value)}
                />
              </div>
              <div>
                <label className="label">Source name</label>
                <input
                  className="input mt-2"
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                  placeholder="RTINGS, Official site, Retailer..."
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="label">CSV file</label>
              <input
                className="input mt-2"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setCsvText(String(reader.result || ""));
                  reader.readAsText(file);
                }}
              />
            </div>

            <label className="label mt-4">CSV text</label>
            <textarea
              className="input mt-2 min-h-80 font-mono text-xs"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn"
                onClick={previewCsv}
                disabled={working}
              >
                Preview rows
              </button>
              <button
                type="button"
                className="btn btn-dark"
                onClick={createBatch}
                disabled={working}
              >
                Create import batch
              </button>
            </div>

            {previewRows.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <h3 className="text-xl font-black">Preview</h3>
                <table className="mt-3 min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-4">Row</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Brand</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Specs</th>
                      <th className="py-2 pr-4">Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 8).map((row) => (
                      <tr key={row.row_index} className="border-t">
                        <td className="py-3 pr-4">{row.row_index}</td>
                        <td className="py-3 pr-4 font-bold">{row.name || "-"}</td>
                        <td className="py-3 pr-4">{row.brand || "-"}</td>
                        <td className="py-3 pr-4">{row.category || "-"}</td>
                        <td className="py-3 pr-4">{getSpecs(row).length}</td>
                        <td className="py-3 pr-4">
                          {(row.warnings || []).join(", ") || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Batch review table</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  Select ready rows, review duplicates, and publish safely.
                </p>
              </div>
              {selectedBatch && (
                <span className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClass(selectedBatch.status)}`}>
                  {formatStatus(selectedBatch.status)}
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[180px_1fr_180px]">
              <select
                className="input"
                value={selectedBatchId}
                onChange={(event) => chooseBatch(event.target.value)}
              >
                <option value="">Choose batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search within batch..."
              />
              <select
                className="input"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="ready_to_publish">Ready to publish</option>
                <option value="possible_duplicate">Possible duplicates</option>
                <option value="duplicate_found">Exact duplicates</option>
                <option value="missing_required_fields">Missing required fields</option>
                <option value="needs_review">Needs review</option>
                <option value="published">Published</option>
                <option value="failed">Failed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {selectedBatch && (
              <div className="mt-5 grid gap-3 sm:grid-cols-5">
                {[
                  ["Rows", selectedBatch.total_rows],
                  ["Ready", selectedBatch.ready_count],
                  ["Duplicates", selectedBatch.possible_duplicate_count],
                  ["Failed", selectedBatch.failed_count],
                  ["Published", selectedBatch.published_count],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xl font-black">{value}</p>
                    <p className="text-xs font-bold text-muted">{label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn"
                onClick={() => runDuplicateCheck()}
                disabled={working || !selectedBatchId}
              >
                Run duplicate check
              </button>
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => publishSelected()}
                disabled={working || selectedRowIds.length === 0}
              >
                Publish selected
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  publishSelected(
                    rows
                      .filter((row) => row.status === "ready_to_publish")
                      .map((row) => row.id)
                  )
                }
                disabled={working || rows.every((row) => row.status !== "ready_to_publish")}
              >
                Publish all ready
              </button>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={approveDuplicate}
                  onChange={(event) => setApproveDuplicate(event.target.checked)}
                />
                approve duplicate check on publish
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={approveSpecs}
                  onChange={(event) => setApproveSpecs(event.target.checked)}
                />
                approve specs
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={approveImage}
                  onChange={(event) => setApproveImage(event.target.checked)}
                />
                approve images
              </label>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="py-2 pr-3">Select</th>
                    <th className="py-2 pr-3">Image</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Specs</th>
                    <th className="py-2 pr-3">Duplicate</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedRowIds.includes(row.id)}
                          onChange={(event) =>
                            setSelectedRowIds((current) =>
                              event.target.checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id)
                            )
                          }
                        />
                      </td>
                      <td className="py-3 pr-3">
                        {row.image_url_candidate ? (
                          <img
                            src={row.image_url_candidate}
                            alt={row.name}
                            className="h-12 w-12 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-slate-100" />
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-black">{row.name || "Missing name"}</p>
                        <p className="text-xs font-bold text-muted">
                          {row.brand || "Missing brand"} / {row.category || "Missing category"}
                        </p>
                        {row.product_type && (
                          <p className="text-xs text-muted">{row.product_type}</p>
                        )}
                      </td>
                      <td className="py-3 pr-3">{getSpecs(row).length}</td>
                      <td className="py-3 pr-3">
                        <p className="font-bold">
                          {Math.round((row.duplicate_risk || 0) * 100)}%
                        </p>
                        {row.duplicate_candidates?.[0] && (
                          <p className="max-w-44 text-xs text-muted">
                            {row.duplicate_candidates[0].name}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClass(row.status)}`}>
                          {formatStatus(row.status)}
                        </span>
                        {row.warnings?.length > 0 && (
                          <p className="mt-2 max-w-48 text-xs text-amber-800">
                            {row.warnings.slice(0, 2).join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs font-black underline"
                            onClick={() => setActiveRow(row)}
                          >
                            Preview / edit
                          </button>
                          <button
                            type="button"
                            className="text-xs font-black underline"
                            onClick={() => runDuplicateCheck(row.id)}
                          >
                            Check duplicate
                          </button>
                          <button
                            type="button"
                            className="text-xs font-black underline"
                            onClick={() => rowAction("mark_not_duplicate", row)}
                          >
                            Not duplicate
                          </button>
                          <button
                            type="button"
                            className="text-xs font-black underline"
                            onClick={() => publishSelected([row.id])}
                          >
                            Publish
                          </button>
                          <button
                            type="button"
                            className="text-xs font-black underline"
                            onClick={() => rowAction("reject", row)}
                          >
                            Reject
                          </button>
                          {row.created_product_id && (
                            <Link
                              href="/admin/products"
                              className="text-xs font-black underline"
                            >
                              Product manager
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="text-xl font-black">Recent batches</h2>
            <div className="mt-4 space-y-3">
              {batches.length === 0 ? (
                <p className="text-sm text-muted">No batches yet.</p>
              ) : (
                batches.map((batch) => (
                  <button
                    key={batch.id}
                    type="button"
                    className={`w-full rounded-2xl border p-4 text-left ${
                      selectedBatchId === batch.id ? "border-black" : ""
                    }`}
                    onClick={() => chooseBatch(batch.id)}
                  >
                    <p className="font-black">{batch.name}</p>
                    <p className="mt-1 text-xs font-bold text-muted">
                      {batch.source_name || "CSV"} / {batch.total_rows} rows
                    </p>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${getStatusClass(batch.status)}`}>
                      {formatStatus(batch.status)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          {activeRow && (
            <section className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Row editor</h2>
                  <p className="mt-1 text-xs font-bold text-muted">
                    Row {activeRow.row_index}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm font-black underline"
                  onClick={() => setActiveRow(null)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  ["name", "Name"],
                  ["brand", "Brand"],
                  ["model", "Model"],
                  ["category", "Category"],
                  ["product_type", "Product type"],
                  ["source_name", "Source name"],
                  ["source_url", "Source URL"],
                  ["image_url_candidate", "Image URL"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      className="input mt-1"
                      value={String((activeRow as unknown as Record<string, unknown>)[key] || "")}
                      onChange={(event) =>
                        setActiveRow((current) =>
                          current
                            ? { ...current, [key]: event.target.value || null }
                            : current
                        )
                      }
                    />
                  </div>
                ))}

                <div>
                  <label className="label">Short summary</label>
                  <textarea
                    className="input mt-1 min-h-24"
                    value={activeRow.short_summary || ""}
                    onChange={(event) =>
                      setActiveRow((current) =>
                        current
                          ? { ...current, short_summary: event.target.value || null }
                          : current
                      )
                    }
                  />
                </div>

                <details open className="rounded-2xl bg-slate-50 p-4">
                  <summary className="cursor-pointer font-black">Specs</summary>
                  <div className="mt-3 space-y-3">
                    {getSpecs(activeRow).map((spec, index) => (
                      <div key={`${spec.key}-${index}`} className="rounded-2xl bg-white p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            className="input"
                            value={spec.key}
                            onChange={(event) =>
                              updateActiveSpec(index, { key: event.target.value })
                            }
                            placeholder="key"
                          />
                          <input
                            className="input"
                            value={spec.label}
                            onChange={(event) =>
                              updateActiveSpec(index, { label: event.target.value })
                            }
                            placeholder="label"
                          />
                        </div>
                        <input
                          className="input mt-2"
                          value={spec.value}
                          onChange={(event) =>
                            updateActiveSpec(index, { value: event.target.value })
                          }
                          placeholder="value"
                        />
                        <input
                          className="input mt-2"
                          value={spec.source_url || ""}
                          onChange={(event) =>
                            updateActiveSpec(index, {
                              source_url: event.target.value || null,
                            })
                          }
                          placeholder="source URL"
                        />
                        <select
                          className="input mt-2"
                          value={spec.status}
                          onChange={(event) =>
                            updateActiveSpec(index, {
                              status: event.target.value as FactorySpecItem["status"],
                            })
                          }
                        >
                          <option value="needs_review">Needs review</option>
                          <option value="approved">Approved</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn mt-3"
                    onClick={() =>
                      setActiveRow((current) => {
                        if (!current) return current;
                        const nextSpecs = [
                          ...getSpecs(current),
                          {
                            key: "",
                            label: "",
                            value: "",
                            source_url: current.source_url,
                            source_type: current.source_name || "csv_import",
                            confidence: 0.75,
                            status: "needs_review" as const,
                          },
                        ];
                        return {
                          ...current,
                          specs: { ...(current.specs || {}), _items: nextSpecs },
                        };
                      })
                    }
                  >
                    Add spec
                  </button>
                </details>

                {activeRow.duplicate_candidates?.length > 0 && (
                  <details className="rounded-2xl bg-amber-50 p-4">
                    <summary className="cursor-pointer font-black text-amber-900">
                      Duplicate matches
                    </summary>
                    <div className="mt-3 space-y-3">
                      {activeRow.duplicate_candidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-2xl bg-white p-3">
                          <p className="font-black">{candidate.name}</p>
                          <p className="text-xs font-bold text-muted">
                            {candidate.brand || "Unknown brand"} /{" "}
                            {candidate.category || "Uncategorized"} /{" "}
                            {Math.round(candidate.score * 100)}%
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {(candidate.reasons || []).join(", ")}
                          </p>
                          <Link
                            href={`/product/${candidate.slug}`}
                            className="mt-2 inline-flex text-xs font-black underline"
                          >
                            View existing product
                          </Link>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={saveActiveRow}
                    disabled={working}
                  >
                    Save row
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => runDuplicateCheck(activeRow.id)}
                    disabled={working}
                  >
                    Run duplicate check
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => publishSelected([activeRow.id])}
                    disabled={working}
                  >
                    Publish row
                  </button>
                </div>
              </div>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
