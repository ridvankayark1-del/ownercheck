"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_TAXONOMY } from "@/lib/productTaxonomy";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  description: string | null;
};

type DuplicateCandidate = Product & {
  matchType: "exact" | "possible";
  score: number;
};

export default function AddProductPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);

  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newMainCategory, setNewMainCategory] = useState("audio");
  const [newCategory, setNewCategory] = useState("headphones");
  const [newProductType, setNewProductType] = useState("true-wireless-earbuds");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const [canSubmitForReview, setCanSubmitForReview] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) {
      setQuery(initialQuery);
      setNewName(initialQuery);
      setHasSearched(true);
      searchProducts(initialQuery);
    }
  }, []);

  async function searchProducts(queryOverride?: string) {
    setLoading(true);
    setErrorMessage("");
    setHasSearched(true);
    setShowSubmissionForm(false);

    const searchText = (queryOverride || query).trim();

    if (!searchText) {
      setResults([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, slug, name, brand, category, image_url, description")
      .or(
        `name.ilike.%${searchText}%,brand.ilike.%${searchText}%,category.ilike.%${searchText}%`
      )
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      setErrorMessage(error.message);
      setResults([]);
    } else {
      setResults(data || []);
    }

    setLoading(false);
  }

  async function createProduct(submitForReview = false) {
    setCreating(true);
    setErrorMessage("");
    setDuplicateCandidates([]);
    setCanSubmitForReview(false);
    setSubmittedForReview(false);

    const name = newName.trim() || query.trim();
    const brand = newBrand.trim();
    const cleanSourceUrl = sourceUrl.trim();

    const mainConfig = PRODUCT_TAXONOMY[newMainCategory];
    const catConfig = mainConfig?.categories[newCategory];
    const typeConfig = catConfig?.productTypes.find((pt) => pt.slug === newProductType);

    const mainCategoryLabel = mainConfig?.label || "";
    const categoryLabel = catConfig?.label || "";
    const productTypeLabel = typeConfig?.label || "";

    if (!name || !brand || !categoryLabel) {
      setErrorMessage("Product name, brand, and category are required.");
      setCreating(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setErrorMessage("Log in before creating a product page.");
      setCreating(false);
      return;
    }

    const response = await fetch("/api/products", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name,
        brand,
        model: newModel.trim(),
        main_category: mainCategoryLabel,
        category: categoryLabel,
        product_type: productTypeLabel,
        product_url: cleanSourceUrl,
        image_url: newImageUrl.trim(),
        submitForReview,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      if (response.status === 409 && Array.isArray(payload.candidates)) {
        setDuplicateCandidates(payload.candidates);
        setCanSubmitForReview(Boolean(payload.requiresReview));
      }

      setErrorMessage(payload.error || "Could not create product.");
      setCreating(false);
      return;
    }

    if (payload.submission) {
      window.location.href = "/product-submitted";
      return;
    }

    window.location.href = `/product/${payload.product.slug}`;
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-bold text-muted">Product catalog</p>
      <h1 className="text-4xl font-black">Search or submit a product</h1>
      <p className="mt-3 max-w-2xl text-muted">
        This page is for missing products only. Search first, then submit if no
        existing match is correct. We check for duplicates before any public
        page is created.
      </p>

      <section className="card mt-8 p-6">
        <label className="label">Search product</label>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sony WH-1000XM5, Shure SM7B, MacBook Air..."
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchProducts();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => searchProducts()}
            disabled={loading}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        )}
      </section>

      {hasSearched && results.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-black">Matching products</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {results.map((product) => (
              <div key={product.id} className="card p-5">
                <div className="flex gap-4">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">
                        No image
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-muted">
                      {product.brand || "Unknown brand"} ·{" "}
                      {product.category || "Uncategorized"}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{product.name}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">
                      {product.description ||
                        "Ask real owners about this product."}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/product/${product.slug}`}
                    className="btn btn-dark"
                  >
                    View product
                  </Link>
                  <Link
                    href={`/product/${product.slug}?action=own`}
                    className="btn"
                  >
                    I own this
                  </Link>
                  <Link
                    href={`/product/${product.slug}?action=ask`}
                    className="btn"
                  >
                    Ask question
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="card mt-6 p-5">
            <h2 className="text-2xl font-black">Can't find this product?</h2>
            <p className="mt-2 text-muted">
              If none of these matches are correct, submit it to OwnerCheck.
              We will run a stricter duplicate check before creating anything
              public.
            </p>
            <button
              type="button"
              className="btn btn-dark mt-4"
              onClick={() => setShowSubmissionForm(true)}
            >
              Submit it to OwnerCheck
            </button>
          </div>
        </section>
      )}

      {hasSearched && (results.length === 0 || showSubmissionForm) && (
        <section className="card mt-8 p-6">
          <h2 className="text-2xl font-black">Can't find this product?</h2>
          <p className="mt-2 text-muted">
            Submit it to OwnerCheck. If duplicate checks pass, a
            community-created page appears immediately. If there are likely
            matches, your submission goes to admin review instead.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="label">Product name</label>
              <input
                className="input mt-2"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={query || "Sony WH-1000XM5"}
              />
            </div>

            <div>
              <label className="label">Brand</label>
              <input
                className="input mt-2"
                value={newBrand}
                onChange={(event) => setNewBrand(event.target.value)}
                placeholder="Sony"
              />
            </div>

            <div>
              <label className="label">Model or variant optional</label>
              <input
                className="input mt-2"
                value={newModel}
                onChange={(event) => setNewModel(event.target.value)}
                placeholder="WH-1000XM5, 13-inch M3, Pro Max..."
              />
            </div>

            <div>
              <label className="label">Department</label>
              <select
                className="input mt-2"
                value={newMainCategory}
                onChange={(event) => {
                  const mSlug = event.target.value;
                  setNewMainCategory(mSlug);
                  const mainConfig = PRODUCT_TAXONOMY[mSlug];
                  if (mainConfig) {
                    const firstCatKey = Object.keys(mainConfig.categories)[0];
                    if (firstCatKey) {
                      setNewCategory(firstCatKey);
                      const catConfig = mainConfig.categories[firstCatKey];
                      if (catConfig && catConfig.productTypes.length > 0) {
                        setNewProductType(catConfig.productTypes[0].slug);
                      } else {
                        setNewProductType("");
                      }
                    }
                  }
                }}
              >
                {Object.values(PRODUCT_TAXONOMY)
                  .filter((m) => m.isActive)
                  .map((main) => (
                    <option key={main.slug} value={main.slug}>
                      {main.label}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="label">Category</label>
              <select
                className="input mt-2"
                value={newCategory}
                onChange={(event) => {
                  const cSlug = event.target.value;
                  setNewCategory(cSlug);
                  const mainConfig = PRODUCT_TAXONOMY[newMainCategory];
                  const catConfig = mainConfig?.categories[cSlug];
                  if (catConfig && catConfig.productTypes.length > 0) {
                    setNewProductType(catConfig.productTypes[0].slug);
                  } else {
                    setNewProductType("");
                  }
                }}
              >
                {PRODUCT_TAXONOMY[newMainCategory] &&
                  Object.values(PRODUCT_TAXONOMY[newMainCategory].categories)
                    .filter((c) => c.isActive)
                    .map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.label}
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="label">Product Type</label>
              <select
                className="input mt-2"
                value={newProductType}
                onChange={(event) => setNewProductType(event.target.value)}
              >
                {PRODUCT_TAXONOMY[newMainCategory]?.categories[newCategory]?.productTypes.map((type) => (
                  <option key={type.slug} value={type.slug}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Image URL optional</label>
              <input
                className="input mt-2"
                value={newImageUrl}
                onChange={(event) => setNewImageUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Official or retailer URL optional</label>
              <input
                className="input mt-2"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.sony.com/... or Amazon/Best Buy product page"
              />
              <p className="mt-2 text-sm text-muted">
                Official product or retailer link helps us verify the product details, specs and images.
              </p>
            </div>
          </div>

          {duplicateCandidates.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-black text-amber-900">
                Possible matching products
              </h3>
              <p className="mt-1 text-sm font-bold text-amber-800">
                Product already exists or may already exist. Choose an existing
                product when it matches. If this is genuinely different, submit
                it for admin review.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {duplicateCandidates.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-2xl border bg-white p-4"
                  >
                    <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                      {product.matchType === "exact"
                        ? "Likely duplicate"
                        : `${Math.round(product.score * 100)}% similar`}
                    </p>
                    <p className="mt-1 font-black">{product.name}</p>
                    <p className="text-sm text-muted">
                      {product.brand || "Unknown brand"} -{" "}
                      {product.category || "Uncategorized"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/product/${product.slug}`}
                        className="btn btn-dark"
                      >
                        View existing product
                      </Link>
                      <Link
                        href={`/product/${product.slug}?claim=1`}
                        className="btn"
                      >
                        I own this product
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {submittedForReview && (
            <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-800">
              Submitted for review. No public product page was created yet.
            </p>
          )}

          <button
            type="button"
            className="btn btn-dark mt-6"
            onClick={() => createProduct(false)}
            disabled={creating}
          >
            {creating ? "Checking..." : "Submit to OwnerCheck"}
          </button>

          {canSubmitForReview && (
            <button
              type="button"
              className="btn ml-3 mt-6"
              onClick={() => createProduct(true)}
              disabled={creating}
            >
              Submit for admin review
            </button>
          )}
        </section>
      )}
    </main>
  );
}
