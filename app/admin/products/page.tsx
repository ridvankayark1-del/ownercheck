"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_EMAIL = "reportkowalski1@gmail.com";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  product_verification_status: string | null;
  source_url: string | null;
  verified_source: string | null;
  external_summary: string | null;
  enrichment_status: string | null;
  created_at: string;
};

export default function AdminProductsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [externalSummaryDrafts, setExternalSummaryDrafts] = useState<
    Record<string, string>
  >({});
  const [enrichingProductId, setEnrichingProductId] = useState("");
  const [message, setMessage] = useState("");

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
        "id, slug, name, brand, category, image_url, product_verification_status, source_url, verified_source, external_summary, enrichment_status, created_at"
      )
      .order("created_at", { ascending: false });

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
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function updateProductStatus(
    productId: string,
    status: "catalog_verified" | "user_submitted" | "needs_review" | "rejected"
  ) {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email !== ADMIN_EMAIL) {
      setMessage("You do not have admin access.");
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email !== ADMIN_EMAIL) {
      setMessage("You do not have admin access.");
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
    setMessage("External summary saved.");
  }

  async function markEnriched(productId: string) {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email !== ADMIN_EMAIL) {
      setMessage("You do not have admin access.");
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({ enrichment_status: "enriched" })
      .eq("id", productId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProducts({ clearMessage: false });
    setMessage("Product marked enriched.");
  }

  async function enrichProduct(productId: string) {
    setMessage("");
    setEnrichingProductId(productId);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email !== ADMIN_EMAIL) {
      setEnrichingProductId("");
      setMessage("You do not have admin access.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setEnrichingProductId("");
      setMessage("Admin session is missing. Log in again.");
      return;
    }

    const response = await fetch("/api/admin/enrich-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
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
      return;
    }

    await loadProducts({ clearMessage: false });
    setMessage(
      `Product facts updated from external source snippets.${
        result.reviewLinkCount
          ? ` Found ${result.reviewLinkCount} external review/source links.`
          : ""
      }`
    );
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

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Admin login required</h1>
          <p className="mt-3 text-muted">
            Log in before reviewing product submissions.
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
            You do not have permission to review products.
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
        <h1 className="mt-2 text-4xl font-black">Product review</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Review products, verify real products, mark user-submitted entries, or
          reject bad entries.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/import-products" className="btn btn-dark">
            Bulk import products
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

      {products.length === 0 ? (
        <div className="card p-6">
          <h2 className="text-2xl font-black">No products found</h2>
          <p className="mt-3 text-muted">
            Products will appear here after they are added to the catalog.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {products.map((product) => (
            <div key={product.id} className="card p-5">
              <div className="grid gap-5 md:grid-cols-[120px_1fr]">
                <div className="h-28 w-full overflow-hidden rounded-2xl bg-slate-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      No image
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
                    <span>{product.brand || "Unknown brand"}</span>
                    <span>·</span>
                    <span>{product.category || "Uncategorized"}</span>
                    <span>·</span>
                    <span>
                      {product.product_verification_status || "No status"}
                    </span>
                    <span>·</span>
                    <span>
                      Enrichment: {product.enrichment_status || "not_enriched"}
                    </span>
                  </div>

                  <h2 className="mt-2 text-2xl font-black">{product.name}</h2>

                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
                    <Link
                      href={`/product/${product.slug}`}
                      className="underline"
                    >
                      View product page
                    </Link>

                    {product.source_url && (
                      <a
                        href={product.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        View source URL
                      </a>
                    )}
                  </div>

                  {product.verified_source && (
                    <p className="mt-3 text-sm font-bold text-muted">
                      Verified source: {product.verified_source}
                    </p>
                  )}

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <label className="label">External source note</label>
                    <textarea
                      className="input mt-2 min-h-32"
                      value={externalSummaryDrafts[product.id] || ""}
                      onChange={(event) =>
                        setExternalSummaryDrafts((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))
                      }
                      placeholder="Add a short external source note manually..."
                    />

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
                        onClick={() => markEnriched(product.id)}
                      >
                        Mark enrichment enriched
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
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={() =>
                        updateProductStatus(product.id, "catalog_verified")
                      }
                    >
                      Mark catalog verified
                    </button>

                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        updateProductStatus(product.id, "user_submitted")
                      }
                    >
                      Mark user submitted
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
