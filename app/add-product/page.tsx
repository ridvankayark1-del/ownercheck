"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  description: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateProductData(name: string, brand: string, category: string) {
  const cleanCategory = category || "Product";

  return {
    description: `${name} is a ${cleanCategory.toLowerCase()} product. Ask real owners about long-term use, value, durability, setup, and everyday experience before buying.`,
    ai_summary: `${name} is listed in the ${cleanCategory} category. This page helps buyers collect real-owner answers before making a purchase decision.`,
    starter_questions: [
      "What should buyers know before buying this?",
      "How is it after long-term use?",
      "What is the biggest problem you noticed?",
      "Is it worth the price?",
      "Would you buy it again?",
    ],
    evaluation_criteria: [
      "Build quality",
      "Ease of use",
      "Value for money",
      "Durability",
      "Long-term satisfaction",
      "Would buy again",
    ],
    search_keywords: [
      name,
      brand,
      category,
      "real owner review",
      "buyer questions",
    ].filter(Boolean),
  };
}

export default function AddProductPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newCategory, setNewCategory] = useState("Headphones");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function searchProducts() {
    setLoading(true);
    setErrorMessage("");
    setHasSearched(true);

    const searchText = query.trim();

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

  async function createProduct() {
    setCreating(true);
    setErrorMessage("");

    const name = newName.trim() || query.trim();
    const brand = newBrand.trim();
    const category = newCategory.trim();
    const cleanSourceUrl = sourceUrl.trim();

    if (!name) {
      setErrorMessage("Product name is required.");
      setCreating(false);
      return;
    }

    const slug = slugify(`${brand ? `${brand} ` : ""}${name}`);
    const generated = generateProductData(name, brand, category);

    const { data, error } = await supabase
      .from("products")
      .insert({
        slug,
        name,
        brand: brand || null,
        category: category || null,
        image_url: newImageUrl.trim() || null,
        description: generated.description,
        ai_summary: generated.ai_summary,
        starter_questions: generated.starter_questions,
        evaluation_criteria: generated.evaluation_criteria,
        search_keywords: generated.search_keywords,
        data_source: "user_created",
        ai_generated: true,

        // Product verification fields
        product_verification_status: "user_submitted",
        source_url: cleanSourceUrl || null,
        verified_source: null,
        external_product_id: null,
      })
      .select("slug")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setCreating(false);
      return;
    }

    window.location.href = `/product/${data.slug}`;
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-bold text-muted">Product catalog</p>
      <h1 className="text-4xl font-black">
        Search or create a product page
      </h1>
      <p className="mt-3 max-w-2xl text-muted">
        First search the existing catalog. If the product does not exist, create
        a new product page. User-submitted products can be reviewed or verified
        later.
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
            onClick={searchProducts}
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
        </section>
      )}

      {hasSearched && results.length === 0 && (
        <section className="card mt-8 p-6">
          <h2 className="text-2xl font-black">No product found</h2>
          <p className="mt-2 text-muted">
            Create a new product page. Add an official product page or retailer
            URL if you have one. Products without a source URL will be marked as
            needs review.
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
              <label className="label">Category</label>
              <select
                className="input mt-2"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
              >
                <option>Headphones</option>
                <option>Microphones</option>
                <option>Camera</option>
                <option>Laptop</option>
                <option>Audio Interface</option>
                <option>Lighting</option>
                <option>Keyboard</option>
                <option>Monitor</option>
                <option>Other</option>
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
                This helps confirm the product is real. We will use it for
                manual/API verification later.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-dark mt-6"
            onClick={createProduct}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create product page"}
          </button>
        </section>
      )}
    </main>
  );
}
