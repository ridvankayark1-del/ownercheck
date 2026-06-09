"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { isPlaceholderImage } from "@/lib/productImages";
import { normalizeCategory } from "@/lib/productCategoryProfiles";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_EMAIL = "reportkowalski1@gmail.com";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  specs: {
    product_type?: string | null;
    category?: string | null;
    [key: string]: unknown;
  } | null;
  image_url: string | null;
  product_verification_status: string | null;
  source_url: string | null;
  verified_source: string | null;
  external_summary: string | null;
  enrichment_status: string | null;
  created_at: string;
};

type ProductStatus =
  | "catalog_verified"
  | "user_submitted"
  | "needs_review"
  | "rejected";

function getImageStatus(product: Product) {
  if (!product.image_url) return "missing";
  if (isPlaceholderImage(product.image_url)) return "placeholder";
  return "has_image";
}

function getImageStatusLabel(status: string) {
  if (status === "has_image") return "Has image";
  if (status === "placeholder") return "Placeholder image";
  return "Missing image";
}

function getBadgeClass(value?: string | null) {
  if (value === "catalog_verified" || value === "snippet_enriched" || value === "enriched") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (value === "needs_review" || value === "placeholder") {
    return "bg-amber-100 text-amber-800";
  }

  if (value === "failed" || value === "rejected" || value === "missing") {
    return "bg-red-100 text-red-800";
  }

  return "bg-slate-100 text-slate-700";
}

function formatStatus(value?: string | null) {
  return (value || "not_enriched").replace(/_/g, " ");
}

export default function AdminProductsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [externalSummaryDrafts, setExternalSummaryDrafts] = useState<
    Record<string, string>
  >({});
  const [manualDrafts, setManualDrafts] = useState<
    Record<string, { category: string; productType: string }>
  >({});
  const [enrichingProductId, setEnrichingProductId] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pageLimit, setPageLimit] = useState(100);

  const [searchText, setSearchText] = useState("");
  const [enrichmentFilter, setEnrichmentFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [imageFilter, setImageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOption, setSortOption] = useState("newest");

  async function loadProducts({ clearMessage = true } = {}) {
    setLoading(true);
    if (clearMessage) {
      setMessage("");
    }

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

    if (user.email !== ADMIN_EMAIL) {
      setIsAdmin(false);
      setMessage("You do not have admin access.");
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, specs, image_url, product_verification_status, source_url, verified_source, external_summary, enrichment_status, created_at"
      )
      .order("created_at", { ascending: false })
      .range(0, pageLimit - 1);

    if (error) {
      setMessage(error.message);
      setProducts([]);
      setExternalSummaryDrafts({});
    } else {
      const loadedProducts = (data as Product[]) || [];
      setProducts(loadedProducts);
      setExternalSummaryDrafts(
        Object.fromEntries(
          loadedProducts.map((product) => [
            product.id,
            product.external_summary || "",
          ])
        )
      );
      setManualDrafts(
        Object.fromEntries(
          loadedProducts.map((product) => [
            product.id,
            {
              category: product.category || "",
              productType: product.specs?.product_type || "",
            },
          ])
        )
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [pageLimit]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(products.map((product) => product.category).filter(Boolean))
      ).sort() as string[],
    [products]
  );

  const enrichmentStatuses = useMemo(
    () =>
      Array.from(
        new Set(
          products.map((product) => product.enrichment_status || "not_enriched")
        )
      ).sort(),
    [products]
  );

  const counts = useMemo(() => {
    return {
      total: products.length,
      enriched: products.filter((product) =>
        ["enriched", "snippet_enriched"].includes(product.enrichment_status || "")
      ).length,
      notEnriched: products.filter(
        (product) => (product.enrichment_status || "not_enriched") === "not_enriched"
      ).length,
      failed: products.filter((product) => product.enrichment_status === "failed")
        .length,
      missingImage: products.filter((product) => getImageStatus(product) === "missing")
        .length,
      placeholderImage: products.filter(
        (product) => getImageStatus(product) === "placeholder"
      ).length,
      needsReview: products.filter(
        (product) => product.product_verification_status === "needs_review"
      ).length,
      catalogVerified: products.filter(
        (product) => product.product_verification_status === "catalog_verified"
      ).length,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const haystack = [
        product.name,
        product.brand,
        product.category,
        product.source_url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const enrichmentStatus = product.enrichment_status || "not_enriched";
      const imageStatus = getImageStatus(product);

      if (search && !haystack.includes(search)) return false;
      if (
        enrichmentFilter === "not_enriched" &&
        enrichmentStatus !== "not_enriched"
      ) {
        return false;
      }
      if (
        enrichmentFilter === "enriched" &&
        !["enriched", "snippet_enriched"].includes(enrichmentStatus)
      ) {
        return false;
      }
      if (enrichmentFilter === "failed" && enrichmentStatus !== "failed") {
        return false;
      }
      if (
        enrichmentFilter === "needs_enrichment" &&
        enrichmentStatus !== "not_enriched" &&
        imageStatus !== "missing" &&
        imageStatus !== "placeholder"
      ) {
        return false;
      }
      if (
        !["all", "not_enriched", "enriched", "failed", "needs_enrichment"].includes(
          enrichmentFilter
        ) &&
        enrichmentStatus !== enrichmentFilter
      ) {
        return false;
      }
      if (
        verificationFilter !== "all" &&
        product.product_verification_status !== verificationFilter
      ) {
        return false;
      }
      if (imageFilter !== "all" && imageStatus !== imageFilter) return false;
      if (sourceFilter === "has_source" && !product.source_url) return false;
      if (sourceFilter === "missing_source" && product.source_url) return false;
      if (categoryFilter !== "all" && product.category !== categoryFilter) {
        return false;
      }

      return true;
    });

    return filtered.sort((first, second) => {
      if (sortOption === "oldest") {
        return first.created_at.localeCompare(second.created_at);
      }
      if (sortOption === "name_az") {
        return first.name.localeCompare(second.name);
      }
      if (sortOption === "name_za") {
        return second.name.localeCompare(first.name);
      }
      if (sortOption === "not_enriched_first") {
        return Number(second.enrichment_status === "not_enriched") - Number(first.enrichment_status === "not_enriched");
      }
      if (sortOption === "missing_image_first") {
        return Number(getImageStatus(second) === "missing") - Number(getImageStatus(first) === "missing");
      }

      return second.created_at.localeCompare(first.created_at);
    });
  }, [
    categoryFilter,
    enrichmentFilter,
    imageFilter,
    products,
    searchText,
    sortOption,
    sourceFilter,
    verificationFilter,
  ]);

  async function getAdminSessionToken() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email !== ADMIN_EMAIL) {
      throw new Error("You do not have admin access.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Admin session is missing. Log in again.");
    }

    return session.access_token;
  }

  async function updateProductStatus(productId: string, status: ProductStatus) {
    setMessage("");

    try {
      await getAdminSessionToken();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin check failed.");
      return;
    }

    const verifiedSource =
      status === "catalog_verified" ? "manual_admin_review" : null;

    const { error } = await supabase
      .from("products")
      .update({
        product_verification_status: status,
        verified_source: verifiedSource,
      })
      .eq("id", productId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProducts({ clearMessage: false });
    setMessage("Product updated.");
  }

  async function saveExternalSummary(productId: string) {
    setMessage("");

    try {
      await getAdminSessionToken();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin check failed.");
      return;
    }

    const summary = externalSummaryDrafts[productId]?.trim() || null;

    const { error } = await supabase
      .from("products")
      .update({
        external_summary: summary,
        external_summary_updated_at: summary ? new Date().toISOString() : null,
      })
      .eq("id", productId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProducts({ clearMessage: false });
    setMessage("External source note saved.");
  }

  async function saveManualCategory(product: Product) {
    setMessage("");

    try {
      await getAdminSessionToken();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin check failed.");
      return;
    }

    const draft = manualDrafts[product.id];
    const category = normalizeCategory(draft?.category || product.category || "Other");
    const productType = draft?.productType?.trim() || null;
    const specs = {
      ...(product.specs || {}),
      category,
      product_type: productType,
    };

    const { error } = await supabase
      .from("products")
      .update({
        category,
        specs,
      })
      .eq("id", product.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProducts({ clearMessage: false });
    setMessage("Category and product type updated.");
  }

  async function enrichProduct(productId: string, reloadAfter = true) {
    setMessage("");
    setEnrichingProductId(productId);

    let token = "";
    try {
      token = await getAdminSessionToken();
    } catch (error) {
      setEnrichingProductId("");
      setMessage(error instanceof Error ? error.message : "Admin check failed.");
      return false;
    }

    const response = await fetch("/api/admin/enrich-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ productId }),
    });

    const result = (await response.json()) as {
      error?: string;
      reviewLinkCount?: number;
    };

    setEnrichingProductId("");

    if (!response.ok) {
      setMessage(result.error || "Could not enrich product.");
      return false;
    }

    if (reloadAfter) {
      await loadProducts({ clearMessage: false });
      setMessage(
        `Product facts updated from external source snippets.${
          result.reviewLinkCount
            ? ` Found ${result.reviewLinkCount} external review/source links.`
            : ""
        }`
      );
    }

    return true;
  }

  async function batchEnrich(limit: number) {
    setBatchLoading(true);
    setMessage(`Batch enrichment started for up to ${limit} products.`);

    const targets = filteredProducts.slice(0, limit);
    let enriched = 0;
    let failed = 0;
    let skipped = 0;

    for (const product of targets) {
      const ok = await enrichProduct(product.id, false);
      if (ok) enriched++;
      else failed++;
    }

    skipped = Math.max(filteredProducts.length - targets.length, 0);
    setBatchLoading(false);
    await loadProducts({ clearMessage: false });
    setMessage(
      `Batch complete. Enriched: ${enriched}. Failed: ${failed}. Skipped: ${skipped}.`
    );
  }

  async function batchMark(status: ProductStatus) {
    setBatchLoading(true);
    setMessage("");

    try {
      await getAdminSessionToken();
    } catch (error) {
      setBatchLoading(false);
      setMessage(error instanceof Error ? error.message : "Admin check failed.");
      return;
    }

    const ids = filteredProducts.slice(0, 100).map((product) => product.id);

    if (ids.length === 0) {
      setBatchLoading(false);
      setMessage("No filtered products to update.");
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({
        product_verification_status: status,
        verified_source:
          status === "catalog_verified" ? "manual_admin_review" : null,
      })
      .in("id", ids);

    setBatchLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProducts({ clearMessage: false });
    setMessage(`Updated ${ids.length} filtered products.`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading admin products...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn || !isAdmin) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">
            {loggedIn ? "Access denied" : "Admin login required"}
          </h1>
          <p className="mt-3 text-muted">
            Log in as the OwnerCheck admin before managing products.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-12">
      <section className="mb-8">
        <p className="font-bold text-muted">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Product manager</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Search, filter, enrich, and review imported product catalog entries.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/import-products" className="btn btn-dark">
            CSV import
          </Link>
          <Link href="/admin/import-urls" className="btn btn-dark">
            Import URLs
          </Link>
          <Link href="/admin/owner-verifications" className="btn">
            Owner verifications
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

      <section className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
        {[
          ["Total", counts.total],
          ["Enriched", counts.enriched],
          ["Not enriched", counts.notEnriched],
          ["Failed", counts.failed],
          ["Missing image", counts.missingImage],
          ["Placeholder", counts.placeholderImage],
          ["Needs review", counts.needsReview],
          ["Catalog verified", counts.catalogVerified],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">{value}</p>
            <p className="text-xs font-bold text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section className="card mt-6 p-5">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="label">Search</label>
            <input
              className="input mt-2"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Name, brand, category, source URL"
            />
          </div>

          <div>
            <label className="label">Enrichment</label>
            <select
              className="input mt-2"
              value={enrichmentFilter}
              onChange={(event) => setEnrichmentFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="not_enriched">Not enriched</option>
              <option value="enriched">Enriched</option>
              <option value="failed">Failed</option>
              <option value="needs_enrichment">Needs enrichment</option>
              {enrichmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Verification</label>
            <select
              className="input mt-2"
              value={verificationFilter}
              onChange={(event) => setVerificationFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="catalog_verified">Catalog verified</option>
              <option value="user_submitted">User submitted</option>
              <option value="needs_review">Needs review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="label">Image</label>
            <select
              className="input mt-2"
              value={imageFilter}
              onChange={(event) => setImageFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="has_image">Has image</option>
              <option value="missing">Missing image</option>
              <option value="placeholder">Placeholder image</option>
            </select>
          </div>

          <div>
            <label className="label">Source</label>
            <select
              className="input mt-2"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="has_source">Has source URL</option>
              <option value="missing_source">Missing source URL</option>
            </select>
          </div>

          <div>
            <label className="label">Category</label>
            <select
              className="input mt-2"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Sort</label>
            <select
              className="input mt-2"
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name_az">Name A-Z</option>
              <option value="name_za">Name Z-A</option>
              <option value="not_enriched_first">Not enriched first</option>
              <option value="missing_image_first">Missing image first</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => batchEnrich(10)}
            disabled={batchLoading}
          >
            Enrich filtered · 10
          </button>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => batchEnrich(50)}
            disabled={batchLoading}
          >
            Enrich filtered · 50
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => batchMark("needs_review")}
            disabled={batchLoading}
          >
            Mark filtered needs review
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => batchMark("catalog_verified")}
            disabled={batchLoading}
          >
            Mark filtered catalog verified
          </button>
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-3 text-sm font-bold text-muted">
          Showing {filteredProducts.length} of {products.length} loaded products.
        </p>

        {filteredProducts.length === 0 ? (
          <div className="card p-6">
            <h2 className="text-2xl font-black">No matching products</h2>
            <p className="mt-3 text-muted">Adjust filters or load more.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProducts.map((product) => {
              const imageStatus = getImageStatus(product);

              return (
                <div key={product.id} className="card p-5">
                  <div className="grid gap-5 md:grid-cols-[96px_1fr]">
                    <div className="h-24 w-full overflow-hidden rounded-2xl bg-slate-100">
                      <ProductImage
                        src={product.image_url}
                        category={product.category}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getBadgeClass(
                            product.enrichment_status || "not_enriched"
                          )}`}
                        >
                          {formatStatus(product.enrichment_status)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getBadgeClass(
                            product.product_verification_status
                          )}`}
                        >
                          {formatStatus(product.product_verification_status)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getBadgeClass(
                            imageStatus
                          )}`}
                        >
                          {getImageStatusLabel(imageStatus)}
                        </span>
                      </div>

                      <h2 className="mt-2 text-2xl font-black">
                        {product.name}
                      </h2>
                      <p className="mt-1 text-sm font-bold text-muted">
                        {product.brand || "Unknown brand"} ·{" "}
                        {product.category || "Uncategorized"}
                      </p>
                      {product.specs?.product_type && (
                        <p className="mt-1 text-sm font-bold text-slate-700">
                          Product type: {product.specs.product_type}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
                        <Link
                          href={`/product/${product.slug}`}
                          className="underline"
                        >
                          View product page
                        </Link>

                        {product.source_url ? (
                          <a
                            href={product.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Source URL
                          </a>
                        ) : (
                          <span className="text-muted">No source URL</span>
                        )}
                      </div>

                      <details className="mt-4 rounded-2xl bg-slate-50 p-4">
                        <summary className="cursor-pointer font-black">
                          Product actions
                        </summary>

                        <label className="label mt-4">External source note</label>
                        <textarea
                          className="input mt-2 min-h-24"
                          value={externalSummaryDrafts[product.id] || ""}
                          onChange={(event) =>
                            setExternalSummaryDrafts((current) => ({
                              ...current,
                              [product.id]: event.target.value,
                            }))
                          }
                          placeholder="Add a short external source note manually..."
                        />

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="label">Category</label>
                            <input
                              className="input mt-2"
                              value={manualDrafts[product.id]?.category || ""}
                              onChange={(event) =>
                                setManualDrafts((current) => ({
                                  ...current,
                                  [product.id]: {
                                    category: event.target.value,
                                    productType:
                                      current[product.id]?.productType ||
                                      product.specs?.product_type ||
                                      "",
                                  },
                                }))
                              }
                              placeholder="Camera, Headphones, Microphones..."
                            />
                          </div>

                          <div>
                            <label className="label">Product type</label>
                            <input
                              className="input mt-2"
                              value={manualDrafts[product.id]?.productType || ""}
                              onChange={(event) =>
                                setManualDrafts((current) => ({
                                  ...current,
                                  [product.id]: {
                                    category:
                                      current[product.id]?.category ||
                                      product.category ||
                                      "",
                                    productType: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Pocket gimbal camera"
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            className="btn btn-dark"
                            onClick={() => saveExternalSummary(product.id)}
                          >
                            Save source note
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => saveManualCategory(product)}
                          >
                            Save category/type
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => enrichProduct(product.id)}
                            disabled={enrichingProductId === product.id}
                          >
                            {enrichingProductId === product.id
                              ? "Enriching..."
                              : "Enrich product"}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              updateProductStatus(product.id, "catalog_verified")
                            }
                          >
                            Catalog verified
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              updateProductStatus(product.id, "needs_review")
                            }
                          >
                            Needs review
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              updateProductStatus(product.id, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="btn"
            onClick={() => setPageLimit((current) => current + 100)}
          >
            Load more
          </button>
        </div>
      </section>
    </main>
  );
}
