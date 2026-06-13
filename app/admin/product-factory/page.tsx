"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { getHeadphoneProductTypeNormalization, resolveProductType } from "@/lib/productFactory";
import { getGroupedSpecs } from "@/lib/productSpecs";
import { getIdentityIssues, getSpecsSummary } from "@/lib/productIssues";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_TAXONOMY, slugifyTaxonomyLabel } from "@/lib/productTaxonomy";

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
  main_category: string | null;
  main_category_slug: string | null;
  category_slug: string | null;
  product_type_slug: string | null;
  taxonomy_path: Record<string, any> | null;
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

function formatRowStatus(value?: string | null) {
  const status = value || "draft";
  if (status === "parsed" || status === "draft") return "Imported draft";
  if (status === "ready_to_publish") return "Ready to publish";
  if (status === "published" || status === "completed") return "Published";
  if (
    [
      "possible_duplicate",
      "duplicate_found",
      "needs_review",
      "review_needed",
      "missing_required_fields",
    ].includes(status)
  ) {
    return "Needs review";
  }
  if (["failed", "rejected"].includes(status)) return "Failed";
  return status.replace(/_/g, " ");
}

function getRowImage(row: FactoryRow): string | null {
  if (row.image_url_candidate) return row.image_url_candidate;
  
  const rowAny = row as any;
  if (rowAny.main_image_url) return rowAny.main_image_url;
  if (rowAny.image_url) return rowAny.image_url;
  
  if (row.specs) {
    if (typeof row.specs.main_image_url === "string" && row.specs.main_image_url) return row.specs.main_image_url;
    if (typeof row.specs.image_url === "string" && row.specs.image_url) return row.specs.image_url;
    
    const specsItems = Array.isArray(row.specs._items) ? row.specs._items : [];
    const imageSpec = specsItems.find(
      (s) =>
        s.key &&
        (s.key.toLowerCase().includes("image") || s.key.toLowerCase().includes("img")) &&
        typeof s.value === "string" &&
        s.value.startsWith("http")
    );
    if (imageSpec) return imageSpec.value;
  }

  if (row.raw_row) {
    if (row.raw_row.image_url_candidate) return row.raw_row.image_url_candidate;
    if (row.raw_row.main_image_url) return row.raw_row.main_image_url;
    if (row.raw_row.image_url) return row.raw_row.image_url;
    
    const imgKey = Object.keys(row.raw_row).find(
      (k) =>
        (k.toLowerCase().includes("image") || k.toLowerCase().includes("img")) &&
        row.raw_row[k]?.startsWith("http")
    );
    if (imgKey) return row.raw_row[imgKey];
  }

  return null;
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

function getIssueChips(row: FactoryRow) {
  const chips: { label: string; type: "error" | "warning" | "info" }[] = [];
  
  const identityIssues = getIdentityIssues(row);
  identityIssues.forEach((issue) => {
    chips.push({ label: issue, type: "error" });
  });

  const specs = getSpecs(row);
  const specSummary = getSpecsSummary(row, specs);
  if (specSummary.missingRecommended > 0) {
    chips.push({ label: "Missing required specs", type: "warning" });
  } else if (specs.some((s) => s.status === "needs_review")) {
    chips.push({ label: "Specs need review", type: "warning" });
  }

  if (row.image_url_candidate && row.status !== "published") {
    chips.push({ label: "Image approval needed", type: "info" });
  }

  return chips;
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
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const activeRow = rows.find(r => r.id === activeRowId) || null;
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "identity" | "specs" | "image" | "duplicate">("overview");
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveRowId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
  }

  function openRowEditor(row: FactoryRow) {
    setActiveRowId(row.id);
    setIsEditingSpecs(false);
    setActiveTab("overview");
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
    setActiveRowId(null);
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

  async function deleteBatch(batchId: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this batch and all its rows?")) return;

    setWorking(true);
    setMessage("");

    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/product-factory?batchId=${encodeURIComponent(batchId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete batch.");

      setMessage("Batch deleted.");
      if (selectedBatchId === batchId) {
        setSelectedBatchId("");
        setRows([]);
        setActiveRowId(null);
      }
      await loadFactory("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete batch.");
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

    return result as {
      row?: FactoryRow;
      rows?: FactoryRow[];
      results?: unknown[];
      summary?: {
        checked: number;
        corrected: number;
        skipped: number;
        needsManualReview: number;
      };
    };
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

  async function rowAction(action: string, row: FactoryRow, linkedProductId?: string) {
    setWorking(true);
    setMessage("");

    try {
      const result = await patchFactory({ action, rowId: row.id, linkedProductId });
      if (result.row) replaceRow(result.row);
      await loadFactory(selectedBatchId);
      setMessage("Row updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update row.");
    } finally {
      setWorking(false);
    }
  }

  async function normalizeProductTypes() {
    if (!selectedBatchId && selectedRowIds.length === 0) {
      setMessage("Choose a batch or select rows first.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const result = await patchFactory({
        action: "normalize_product_types",
        batchId: selectedBatchId,
        rowIds: selectedRowIds,
      });

      if (result.rows) {
        setRows((current) =>
          current.map(
            (row) => result.rows?.find((item) => item.id === row.id) || row
          )
        );
      }
      await loadFactory(selectedBatchId);
      const summary = result.summary;
      setMessage(
        summary
          ? `${summary.checked} rows checked. ${summary.corrected} product types corrected. ${summary.skipped} rows skipped. ${summary.needsManualReview} rows need manual review.`
          : "Product type normalization complete."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not normalize product types."
      );
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
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== activeRowId) return row;
        const specs = getSpecs(row);
        const nextSpecs = specs.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        );
        const specObject: Record<string, unknown> = {
          ...(row.specs || {}),
          _items: nextSpecs,
        };

        nextSpecs.forEach((item) => {
          if (item.key && item.value) specObject[item.key] = item.value;
        });

        return { ...row, specs: specObject };
      })
    );
  }

  const activeTypeNormalization = activeRow
    ? getHeadphoneProductTypeNormalization({
        name: activeRow.name,
        category: activeRow.category,
        productType: activeRow.product_type,
        specs: activeRow.specs,
      })
    : null;

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
            risk, and bulk-publish safe product pages.
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
        <div className="space-y-6 min-w-0">
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
                  {formatRowStatus(selectedBatch.status)}
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
                className="btn"
                onClick={normalizeProductTypes}
                disabled={working || (!selectedBatchId && selectedRowIds.length === 0)}
              >
                Normalize product types
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

            <div className="mt-5 space-y-4">
              {filteredRows.map((row) => {
                const rowImage = getRowImage(row);
                const s = getSpecsSummary(row, getSpecs(row));
                const issues = getIssueChips(row);
                const isSelected = selectedRowIds.includes(row.id);
                const isEditing = activeRowId === row.id;

                return (
                  <div
                    key={row.id}
                    className={`flex flex-col gap-4 rounded-2xl border p-5 transition-all ${
                      isEditing
                        ? "border-black bg-slate-50/50 ring-1 ring-black"
                        : isSelected
                          ? "border-slate-300 bg-slate-50/30"
                          : "border-slate-200/60 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
                      {/* Checkbox, Thumbnail, Product Name & Status */}
                      <div className="flex items-start gap-3 md:col-span-4 min-w-0">
                        <div className="pt-1 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) =>
                              setSelectedRowIds((current) =>
                                event.target.checked
                                  ? [...current, row.id]
                                  : current.filter((id) => id !== row.id)
                              )
                            }
                            className="rounded border-slate-300 text-black focus:ring-black"
                          />
                        </div>

                        {/* Thumbnail */}
                        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                          {rowImage ? (
                            <img
                              src={rowImage}
                              alt={row.name || "Product"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-400">
                              No Img
                            </div>
                          )}
                        </div>

                        {/* Title & Meta Info */}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-bold text-slate-900" title={row.name}>
                            {row.name || "Missing name"}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {[
                              row.brand,
                              row.main_category || "Missing main category",
                              row.category || "Missing category",
                              row.product_type || "Missing product type",
                            ].filter(Boolean).join(" · ")}
                          </p>
                          <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusClass(row.status)}`}>
                            {formatRowStatus(row.status)}
                          </span>
                        </div>
                      </div>

                      {/* Duplicate check */}
                      <div className="flex flex-col gap-0.5 md:col-span-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duplicate</span>
                        <span className={`text-sm font-semibold ${
                          row.duplicate_risk >= 0.6 ? "text-red-600" : row.duplicate_risk >= 0.2 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {row.duplicate_risk < 0.2 ? "Low" : row.duplicate_risk < 0.6 ? "Medium" : "High"}
                        </span>
                        {row.duplicate_candidates?.[0] && (
                          <p className="truncate text-[10px] font-medium text-slate-400" title={`Possible match: ${row.duplicate_candidates[0].name} (${Math.round((row.duplicate_risk || 0) * 100)}%)`}>
                            Possible match: {row.duplicate_candidates[0].name} {Math.round((row.duplicate_risk || 0) * 100)}%
                          </p>
                        )}
                      </div>

                      {/* Specs */}
                      <div className="flex flex-col gap-0.5 md:col-span-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Specs</span>
                        <span className="text-sm font-semibold text-slate-700">
                          Core {s.filledCore}/{s.coreCount} · Extra {s.filledExtra} · Total {s.totalFilled}
                        </span>
                      </div>

                      {/* Image Status */}
                      <div className="flex flex-col gap-0.5 md:col-span-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Image</span>
                        <span className={`text-sm font-semibold ${
                          rowImage ? (row.status === "published" ? "text-emerald-600" : "text-blue-600") : "text-amber-600"
                        }`}>
                          {rowImage ? (row.status === "published" ? "Approved" : "Found, needs approval") : "Missing"}
                        </span>
                      </div>

                      {/* Issues */}
                      <div className="flex flex-col gap-1 md:col-span-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Issues</span>
                        <div className="flex flex-wrap gap-1">
                          {issues.length === 0 ? (
                            <span className="text-xs font-semibold text-emerald-600">No issues</span>
                          ) : (
                            issues.map((chip, i) => (
                              <span
                                key={i}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                  chip.type === "error"
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : chip.type === "warning"
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}
                              >
                                {chip.label}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions block */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 md:flex-row md:justify-end md:border-0 md:pt-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn py-1.5 px-3 text-xs"
                          onClick={() => openRowEditor(row)}
                        >
                          Review
                        </button>
                        {getSpecs(row).some((s) => s.status === "needs_review") && (
                          <button
                            type="button"
                            className="btn py-1.5 px-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            onClick={() => rowAction("approve_specs", row)}
                            disabled={working}
                          >
                            Approve Specs
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-dark py-1.5 px-3 text-xs"
                          onClick={() => publishSelected([row.id])}
                        >
                          Approve
                        </button>

                        {/* More dropdown */}
                        <div className="relative inline-block text-left">
                          <details className="relative">
                            <summary className="list-none cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-50 focus:outline-none">
                              More
                            </summary>
                            <div className="absolute right-0 bottom-full z-10 mb-2 w-48 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl focus:outline-none md:bottom-auto md:top-full md:mt-2">
                              <button
                                type="button"
                                className="w-full text-left rounded-xl px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                                onClick={() => rowAction("reject", row)}
                              >
                                Reject draft
                              </button>
                              <button
                                type="button"
                                className="w-full text-left rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                onClick={() => rowAction("mark_not_duplicate", row)}
                              >
                                Mark not duplicate
                              </button>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-5">
            <h2 className="text-xl font-black">Recent batches</h2>
            <div className="mt-4 space-y-3">
              {batches.length === 0 ? (
                <p className="text-sm text-muted">No batches yet.</p>
              ) : (
                batches.map((batch) => (
                  <div
                    key={batch.id}
                    className={`relative rounded-2xl border p-4 text-left hover:border-slate-300 transition-all ${
                      selectedBatchId === batch.id ? "border-black bg-slate-50/30" : "border-slate-200"
                    }`}
                  >
                    <div 
                      className="cursor-pointer"
                      onClick={() => chooseBatch(batch.id)}
                    >
                      <p className="font-black pr-8">{batch.name}</p>
                      <p className="mt-1 text-xs font-bold text-muted">
                        {batch.source_name || "CSV"} / {batch.total_rows} rows
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        {new Date(batch.created_at).toLocaleString()}
                      </p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusClass(batch.status)}`}>
                        {formatRowStatus(batch.status)}
                      </span>
                    </div>
                    {/* Delete Batch Button */}
                    <button
                      type="button"
                      onClick={(e) => deleteBatch(batch.id, e)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-red-600 transition-colors px-1"
                      title="Delete batch"
                    >
                      <span className="text-xs font-bold">✕</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

        </aside>
      </section>

      {activeRow && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300" 
              onClick={() => setActiveRowId(null)}
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              {/* Drawer Container */}
              <div className="pointer-events-auto w-screen max-w-2xl transform transition-transform duration-300 bg-white shadow-2xl flex flex-col h-full border-l border-slate-100">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 p-6 flex-shrink-0">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">Row Editor</h2>
                    <p className="mt-1 text-xs font-bold text-slate-400">Row index: {activeRow.row_index}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold hover:bg-slate-50 transition-all duration-200"
                    onClick={() => setActiveRowId(null)}
                  >
                    Close
                  </button>
                </div>

                {/* Tabs header */}
                <div className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50 px-6 py-2 flex-shrink-0">
                  {(["overview", "identity", "specs", "image", "duplicate"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-black transition-all ${
                        activeTab === tab ? "bg-black text-white" : "bg-slate-200/60 text-slate-700 hover:bg-slate-200"
                      }`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Body (scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {activeTab === "overview" && (() => {
                    const rowImage = getRowImage(activeRow);
                    const issues = getIssueChips(activeRow);
                    let suggestedAction = "Ready to publish";
                    if (activeRow.duplicate_risk >= 0.6) {
                      suggestedAction = "Review duplicate candidates";
                    } else if (getSpecs(activeRow).some((s) => s.status === "needs_review")) {
                      suggestedAction = "Approve specs";
                    } else if (rowImage && activeRow.status !== "published") {
                      suggestedAction = "Approve image";
                    }

                    return (
                      <div className="space-y-6">
                        {/* Image Preview Detail */}
                        {rowImage ? (
                          <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50 flex items-center gap-4">
                            <img
                              src={rowImage}
                              alt="Candidate image"
                              className="h-24 w-24 rounded-xl object-cover border border-slate-200 bg-white shadow-sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Image Preview</p>
                              <span className="text-xs font-medium text-slate-400 block break-all mt-1">{rowImage}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 bg-slate-50/50 flex items-center justify-center text-sm font-bold text-slate-400">
                            No Image Candidate Available
                          </div>
                        )}

                        {/* Suggested next action from Product Manager */}
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-black uppercase text-muted">Suggested next action</p>
                          <p className="mt-1 text-xl font-black">{suggestedAction}</p>
                        </div>

                        {/* Status Grid (Overview) from Product Manager */}
                        <div className="grid gap-3 grid-cols-3">
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Duplicate Match</p>
                            <p className={`text-sm font-black mt-1 ${
                              activeRow.duplicate_risk >= 0.6 ? "text-red-700" : activeRow.duplicate_risk >= 0.2 ? "text-amber-700" : "text-emerald-700"
                            }`}>
                              {activeRow.duplicate_risk < 0.2 ? "Low" : activeRow.duplicate_risk < 0.6 ? "Medium" : "High"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Specs Review</p>
                            <p className={`text-sm font-black mt-1 ${
                              getSpecs(activeRow).some(s => s.status === "needs_review") ? "text-amber-700" : "text-emerald-700"
                            }`}>
                              {getSpecs(activeRow).some(s => s.status === "needs_review") ? "Needs review" : "Approved"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Image Status</p>
                            <p className={`text-sm font-black mt-1 ${
                              rowImage ? (activeRow.status === "published" ? "text-emerald-700" : "text-blue-700") : "text-amber-700"
                            }`}>
                              {rowImage ? (activeRow.status === "published" ? "Approved" : "Needs approval") : "Missing"}
                            </p>
                          </div>
                        </div>

                        {/* Issue Chips from Product Manager */}
                        {issues.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {issues.map((chip, idx) => (
                              <span
                                key={idx}
                                className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
                                  chip.type === "error"
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : chip.type === "warning"
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}
                              >
                                {chip.label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                          <button
                            type="button"
                            className="btn btn-dark"
                            onClick={() => publishSelected([activeRow.id])}
                            disabled={working}
                          >
                            Publish row
                          </button>
                          {activeRow.source_url && (
                            <a href={activeRow.source_url} target="_blank" rel="noreferrer" className="btn">
                              Source URL
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {activeTab === "identity" && (() => {
                    const activeTypeNormalization = getHeadphoneProductTypeNormalization({
                      name: activeRow.name,
                      category: activeRow.category,
                      productType: activeRow.product_type,
                      specs: activeRow.specs,
                    });
                    const selectedMainCategorySlug = activeRow.main_category_slug || (activeRow.main_category ? slugifyTaxonomyLabel(activeRow.main_category) : "");
                    const selectedCategorySlug = activeRow.category_slug || (activeRow.category ? slugifyTaxonomyLabel(activeRow.category) : "");
                    const selectedProductTypeSlug = activeRow.product_type_slug || (activeRow.product_type ? slugifyTaxonomyLabel(activeRow.product_type) : "");

                    const mainCategoriesList = Object.values(PRODUCT_TAXONOMY);
                    const categoriesList = selectedMainCategorySlug ? Object.values(PRODUCT_TAXONOMY[selectedMainCategorySlug]?.categories || {}) : [];
                    const productTypesList = (selectedMainCategorySlug && selectedCategorySlug) ? PRODUCT_TAXONOMY[selectedMainCategorySlug]?.categories[selectedCategorySlug]?.productTypes || [] : [];

                    return (
                      <div className="space-y-4">
                        {/* Name Input */}
                        <div>
                          <label className="label">Name</label>
                          <input
                            className="input mt-1"
                            value={activeRow.name || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((r) =>
                                  r.id === activeRow.id ? { ...r, name: event.target.value || "" } : r
                                )
                              )
                            }
                          />
                        </div>

                        {/* Brand Input */}
                        <div>
                          <label className="label">Brand</label>
                          <input
                            className="input mt-1"
                            value={activeRow.brand || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((r) =>
                                  r.id === activeRow.id ? { ...r, brand: event.target.value || "" } : r
                                )
                              )
                            }
                          />
                        </div>

                        {/* Model Input */}
                        <div>
                          <label className="label">Model</label>
                          <input
                            className="input mt-1"
                            value={activeRow.model || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((r) =>
                                  r.id === activeRow.id ? { ...r, model: event.target.value || null } : r
                                )
                              )
                            }
                          />
                        </div>

                        {/* Main Category Dropdown */}
                        <div>
                          <label className="label">Main Category</label>
                          <select
                            className="input mt-1 bg-white select"
                            value={selectedMainCategorySlug}
                            onChange={(event) => {
                              const newMainSlug = event.target.value;
                              const newMainLabel = PRODUCT_TAXONOMY[newMainSlug]?.label || "";
                              
                              const oldCatSlug = selectedCategorySlug;
                              const isCatValid = newMainSlug && PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug];
                              const finalCatSlug = isCatValid ? oldCatSlug : "";
                              const finalCatLabel = isCatValid ? (PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug]?.label || "") : "";
                              
                              const oldPtSlug = selectedProductTypeSlug;
                              const isPtValid = isCatValid && PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug]?.productTypes.some(pt => pt.slug === oldPtSlug);
                              const finalPtSlug = isPtValid ? oldPtSlug : "";
                              const finalPtLabel = isPtValid ? (PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug]?.productTypes.find(pt => pt.slug === oldPtSlug)?.label || "") : "";

                              setRows((current) =>
                                current.map(r => r.id === activeRow.id
                                  ? {
                                      ...r,
                                      main_category: newMainLabel,
                                      main_category_slug: newMainSlug,
                                      category: finalCatLabel,
                                      category_slug: finalCatSlug,
                                      product_type: finalPtLabel || null,
                                      product_type_slug: finalPtSlug || null,
                                    }
                                  : r
                                )
                              );
                            }}
                          >
                            <option value="">-- Select Main Category --</option>
                            {mainCategoriesList.map((main) => (
                              <option key={main.slug} value={main.slug}>
                                {main.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Category Dropdown */}
                        <div>
                          <label className="label">Category</label>
                          <select
                            className="input mt-1 bg-white select"
                            disabled={!selectedMainCategorySlug}
                            value={selectedCategorySlug}
                            onChange={(event) => {
                              const newCatSlug = event.target.value;
                              const newCatLabel = selectedMainCategorySlug ? PRODUCT_TAXONOMY[selectedMainCategorySlug]?.categories[newCatSlug]?.label || "" : "";
                              
                              setRows((current) =>
                                current.map(r => r.id === activeRow.id
                                  ? {
                                      ...r,
                                      category: newCatLabel,
                                      category_slug: newCatSlug,
                                      product_type: null,
                                      product_type_slug: null,
                                    }
                                  : r
                                )
                              );
                            }}
                          >
                            <option value="">-- Select Category --</option>
                            {categoriesList.map((cat) => (
                              <option key={cat.slug} value={cat.slug}>
                                {cat.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Product Type Dropdown */}
                        <div>
                          <label className="label">Product Type</label>
                          <select
                            className="input mt-1 bg-white select"
                            disabled={!selectedCategorySlug}
                            value={selectedProductTypeSlug || ""}
                            onChange={(event) => {
                              const newPtSlug = event.target.value;
                              const newPtLabel = productTypesList.find(pt => pt.slug === newPtSlug)?.label || "";
                              
                              setRows((current) =>
                                current.map(r => r.id === activeRow.id
                                  ? {
                                      ...r,
                                      product_type: newPtLabel || null,
                                      product_type_slug: newPtSlug || null,
                                    }
                                  : r
                                )
                              );
                            }}
                          >
                            <option value="">-- Select Product Type --</option>
                            {productTypesList.map((pt) => (
                              <option key={pt.slug} value={pt.slug}>
                                {pt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Source Name Input */}
                        <div>
                          <label className="label">Source name</label>
                          <input
                            className="input mt-1"
                            value={activeRow.source_name || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((r) =>
                                  r.id === activeRow.id ? { ...r, source_name: event.target.value || null } : r
                                )
                              )
                            }
                          />
                        </div>

                        {/* Source URL Input */}
                        <div>
                          <label className="label">Source URL</label>
                          <input
                            className="input mt-1"
                            value={activeRow.source_url || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((r) =>
                                  r.id === activeRow.id ? { ...r, source_url: event.target.value || null } : r
                                )
                              )
                            }
                          />
                        </div>

                        {activeTypeNormalization?.shouldApply && (
                          <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">
                            <p className="font-black">
                              Product type conflicts with specs.
                            </p>
                            <p className="mt-2">
                              Current: {activeTypeNormalization.currentProductType || "-"}
                            </p>
                            <p>
                              Suggested from specs:{" "}
                              {activeTypeNormalization.derivedProductType}
                            </p>
                            <p className="mt-2 text-xs">
                              Evidence: Type{" "}
                              {String(
                                activeRow.specs?.type ||
                                  getSpecs(activeRow).find((spec) => spec.key === "type")
                                    ?.value ||
                                  "-"
                              )}{" "}
                              / Wireless{" "}
                              {String(
                                activeRow.specs?.wireless ||
                                  getSpecs(activeRow).find(
                                    (spec) => spec.key === "wireless"
                                  )?.value ||
                                  "-"
                              )}
                            </p>
                            <button
                              type="button"
                              className="btn mt-3"
                              onClick={() =>
                                setRows((current) =>
                                  current.map(r => r.id === activeRow.id
                                    ? {
                                        ...r,
                                        product_type:
                                          activeTypeNormalization.derivedProductType,
                                        specs: {
                                          ...(r.specs || {}),
                                          product_type:
                                            activeTypeNormalization.derivedProductType,
                                        },
                                        warnings: Array.from(
                                          new Set([
                                            ...(r.warnings || []),
                                            "Product type corrected from specs.",
                                          ])
                                        ),
                                      }
                                    : r
                                  )
                                )
                              }
                            >
                              Apply suggested type
                            </button>
                          </div>
                        )}

                        <div>
                          <label className="label">Short summary</label>
                          <textarea
                            className="input mt-1 min-h-24"
                            value={activeRow.short_summary || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map(r => r.id === activeRow.id
                                  ? { ...r, short_summary: event.target.value || null }
                                  : r
                                )
                              )
                            }
                          />
                        </div>

                        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                          <button
                            type="button"
                            className="btn btn-dark"
                            onClick={saveActiveRow}
                            disabled={working}
                          >
                            Save row
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {activeTab === "specs" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-black text-slate-900">
                            Specs {getSpecsSummary(activeRow, getSpecs(activeRow)).coreCount > 0 ? `· Core ${getSpecsSummary(activeRow, getSpecs(activeRow)).filledCore}/${getSpecsSummary(activeRow, getSpecs(activeRow)).coreCount} · Total ${getSpecsSummary(activeRow, getSpecs(activeRow)).totalFilled}` : `· ${getSpecs(activeRow).length}`}
                          </h3>
                          <div className="flex items-center gap-3">
                            {getSpecs(activeRow).some((s) => s.status === "needs_review") && (
                              <button
                                type="button"
                                className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100 transition-colors"
                                onClick={() => rowAction("approve_specs", activeRow)}
                                disabled={working}
                              >
                                Approve all specs
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-xs font-black underline"
                              onClick={() => setIsEditingSpecs(!isEditingSpecs)}
                            >
                              {isEditingSpecs ? "Done editing" : "Edit specs"}
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-3 space-y-4">
                          {getGroupedSpecs(
                            getSpecs(activeRow).map((spec, index) => ({
                              ...spec,
                              index,
                            }))
                          ).map((group) => (
                            <div key={group.label} className="rounded-2xl bg-white p-3">
                              <h4 className="text-sm font-black">{group.label}</h4>
                              <div className="mt-2 space-y-1">
                                {group.items.map((spec) => (
                                  <div
                                    key={`${spec.key}-${spec.index}`}
                                    className={
                                      isEditingSpecs
                                        ? "mt-3 space-y-2 rounded border border-slate-200 p-2"
                                        : "flex items-start justify-between border-b border-slate-100 py-1 last:border-0"
                                    }
                                  >
                                    {isEditingSpecs ? (
                                      <>
                                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                          <input
                                            className="input text-xs"
                                            value={spec.key}
                                            onChange={(event) =>
                                              updateActiveSpec(spec.index, {
                                                key: event.target.value,
                                              })
                                            }
                                            placeholder="key"
                                          />
                                          <input
                                            className="input text-xs"
                                            value={spec.label}
                                            onChange={(event) =>
                                              updateActiveSpec(spec.index, {
                                                label: event.target.value,
                                              })
                                            }
                                            placeholder="label"
                                          />
                                          <button
                                            type="button"
                                            className="btn text-xs"
                                            onClick={() =>
                                              setRows((currentRows) =>
                                                currentRows.map((row) => {
                                                  if (row.id !== activeRowId) return row;
                                                  const specs = getSpecs(row).filter(
                                                    (_item, itemIndex) => itemIndex !== spec.index
                                                  );
                                                  const specObject: Record<string, unknown> = {
                                                    ...(row.specs || {}),
                                                    _items: specs,
                                                  };
                                                  specs.forEach((item) => {
                                                    if (item.key && item.value) {
                                                      specObject[item.key] = item.value;
                                                    }
                                                  });
                                                  return { ...row, specs: specObject };
                                                })
                                              )
                                            }
                                          >
                                            Remove
                                          </button>
                                        </div>
                                        <input
                                          className="input text-xs"
                                          value={spec.value}
                                          onChange={(event) =>
                                            updateActiveSpec(spec.index, {
                                              value: event.target.value,
                                            })
                                          }
                                          placeholder="value"
                                        />
                                      </>
                                    ) : (
                                      <>
                                        <span className="w-1/3 pr-2 text-xs font-bold text-slate-500">
                                          {spec.label || spec.key}
                                        </span>
                                        <span className="w-2/3 text-xs text-slate-900">
                                          {spec.value}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {isEditingSpecs && (
                          <details className="mt-3 rounded-2xl bg-white p-3">
                            <summary className="cursor-pointer text-sm font-black">
                              Advanced spec metadata
                            </summary>
                            <div className="mt-3 space-y-3">
                              {getSpecs(activeRow).map((spec, index) => (
                                <div
                                  key={`${spec.key}-${index}-metadata`}
                                  className="rounded-2xl bg-slate-50 p-3"
                                >
                                  <p className="mb-2 text-sm font-black">
                                    {spec.label || spec.key || `Spec ${index + 1}`}
                                  </p>
                                  <input
                                    className="input text-xs"
                                    value={spec.source_url || ""}
                                    onChange={(event) =>
                                      updateActiveSpec(index, {
                                        source_url: event.target.value || null,
                                      })
                                    }
                                    placeholder="source URL"
                                  />
                                  <input
                                    className="input mt-2 text-xs"
                                    value={spec.source_type || ""}
                                    onChange={(event) =>
                                      updateActiveSpec(index, {
                                        source_type: event.target.value || null,
                                      })
                                    }
                                    placeholder="source type"
                                  />
                                  <input
                                    className="input mt-2 text-xs"
                                    value={String(spec.confidence ?? "")}
                                    onChange={(event) =>
                                      updateActiveSpec(index, {
                                        confidence: Number(event.target.value) || 0.75,
                                      })
                                    }
                                    placeholder="confidence"
                                  />
                                  <select
                                    className="input mt-2 text-xs"
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
                          </details>
                        )}
                        {isEditingSpecs && (
                          <button
                            type="button"
                            className="btn mt-3"
                            onClick={() =>
                              setRows((currentRows) =>
                                currentRows.map((row) => {
                                  if (row.id !== activeRowId) return row;
                                  const nextSpecs = [
                                    ...getSpecs(row),
                                    {
                                      key: "",
                                      label: "",
                                      value: "",
                                      source_url: row.source_url,
                                      source_type: row.source_name || "csv_import",
                                      confidence: 0.75,
                                      status: "needs_review" as const,
                                    },
                                  ];
                                  return {
                                    ...row,
                                    specs: { ...(row.specs || {}), _items: nextSpecs },
                                  };
                                })
                              )
                            }
                          >
                            Add spec
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          className="btn btn-dark"
                          onClick={saveActiveRow}
                          disabled={working}
                        >
                          Save row
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === "image" && (() => {
                    const rowImage = getRowImage(activeRow);
                    return (
                      <div className="space-y-4">
                        {rowImage ? (
                          <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50 flex flex-col items-center gap-4">
                            <img
                              src={rowImage}
                              alt="Candidate image"
                              className="max-h-64 rounded-xl object-contain border border-slate-200 bg-white shadow-sm"
                            />
                            <a
                              href={rowImage}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold underline text-slate-600 hover:text-black"
                            >
                              View full size
                            </a>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-8 bg-slate-50/50 flex items-center justify-center text-sm font-bold text-slate-400">
                            No Image Candidate Available
                          </div>
                        )}

                        <div>
                          <label className="label">Image URL candidate</label>
                          <input
                            className="input mt-1"
                            value={activeRow.image_url_candidate || ""}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map(r => r.id === activeRow.id
                                  ? { ...r, image_url_candidate: event.target.value || null }
                                  : r
                                )
                              )
                            }
                          />
                        </div>

                        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                          <button
                            type="button"
                            className="btn btn-dark"
                            onClick={saveActiveRow}
                            disabled={working}
                          >
                            Save row
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {activeTab === "duplicate" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase text-muted">Duplicate risk</p>
                        <p className={`text-xl font-black mt-1 ${
                          activeRow.duplicate_risk >= 0.6 ? "text-red-700" : activeRow.duplicate_risk >= 0.2 ? "text-amber-700" : "text-emerald-700"
                        }`}>
                          {activeRow.duplicate_risk < 0.2 ? "Low Risk" : activeRow.duplicate_risk < 0.6 ? "Medium Risk" : "High Risk"} ({Math.round((activeRow.duplicate_risk || 0) * 100)}%)
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => rowAction("mark_not_duplicate", activeRow)}
                          disabled={working}
                        >
                          Mark not duplicate
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => runDuplicateCheck(activeRow.id)}
                          disabled={working}
                        >
                          Run duplicate check
                        </button>
                      </div>

                      {activeRow.duplicate_candidates?.length > 0 ? (
                        <div className="space-y-3">
                          <p className="font-bold text-sm text-slate-800">Duplicate candidates</p>
                          {activeRow.duplicate_candidates.map((candidate) => (
                            <div key={candidate.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <p className="font-black text-slate-900">{candidate.name}</p>
                              <p className="text-xs font-bold text-muted mt-1">
                                {candidate.brand || "Unknown brand"} / {candidate.category || "Uncategorized"} / {Math.round(candidate.score * 100)}% match
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                Reasons: {(candidate.reasons || []).join(", ")}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Link
                                  href={`/product/${candidate.slug}`}
                                  target="_blank"
                                  className="btn py-1 px-3 text-xs"
                                >
                                  View existing product
                                </Link>
                                <button
                                  type="button"
                                  className="btn btn-dark py-1 px-3 text-xs"
                                  onClick={() => {
                                    rowAction("link_existing", activeRow, candidate.id);
                                  }}
                                  disabled={working}
                                >
                                  Link to this product
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted">No duplicate candidates found.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
