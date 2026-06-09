"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  description: string | null;
  product_verification_status: string | null;
  enrichment_status: string | null;
  created_at: string;
};

type OwnedProduct = {
  product_id: string;
};

type Question = {
  product_id: string;
};

type SortOption = "newest" | "az" | "most_owners" | "most_questions";

function getProductVerificationLabel(status?: string | null) {
  if (status === "catalog_verified") return "Catalog verified";
  if (status === "needs_review") return "Needs review";
  if (status === "rejected") return "Rejected";
  return "User-submitted";
}

export default function ExplorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ownedProducts, setOwnedProducts] = useState<OwnedProduct[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [verificationFilter, setVerificationFilter] = useState("All");
  const [enrichmentFilter, setEnrichmentFilter] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadExploreData() {
      setLoading(true);
      setErrorMessage("");

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select(
          "id, slug, name, brand, category, image_url, description, product_verification_status, enrichment_status, created_at"
        )
        .order("created_at", { ascending: false });

      if (productsError) {
        setErrorMessage(productsError.message);
        setProducts([]);
        setLoading(false);
        return;
      }

      const { data: ownedProductsData } = await supabase
        .from("owned_products")
        .select("product_id");

      const { data: questionsData } = await supabase
        .from("questions")
        .select("product_id");

      setProducts((productsData as Product[]) || []);
      setOwnedProducts((ownedProductsData as OwnedProduct[]) || []);
      setQuestions((questionsData as Question[]) || []);
      setLoading(false);
    }

    loadExploreData();
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(
        products
          .map((product) => product.category)
          .filter((category): category is string => Boolean(category))
      )
    ).sort();

    return ["All", ...uniqueCategories];
  }, [products]);

  const ownerCountsByProductId = useMemo(() => {
    const counts = new Map<string, number>();

    ownedProducts.forEach((item) => {
      counts.set(item.product_id, (counts.get(item.product_id) || 0) + 1);
    });

    return counts;
  }, [ownedProducts]);

  const questionCountsByProductId = useMemo(() => {
    const counts = new Map<string, number>();

    questions.forEach((item) => {
      counts.set(item.product_id, (counts.get(item.product_id) || 0) + 1);
    });

    return counts;
  }, [questions]);

  const filteredProducts = useMemo(() => {
    const cleanSearch = searchText.trim().toLowerCase();

    const matchesFilters = products.filter((product) => {
      const matchesSearch =
        !cleanSearch ||
        product.name.toLowerCase().includes(cleanSearch) ||
        product.brand?.toLowerCase().includes(cleanSearch) ||
        product.category?.toLowerCase().includes(cleanSearch) ||
        product.description?.toLowerCase().includes(cleanSearch);

      const matchesCategory =
        categoryFilter === "All" || product.category === categoryFilter;

      const matchesVerification =
        verificationFilter === "All" ||
        product.product_verification_status === verificationFilter;
      const matchesEnrichment =
        enrichmentFilter === "All" ||
        (enrichmentFilter === "enriched" &&
          ["enriched", "snippet_enriched"].includes(
            product.enrichment_status || ""
          )) ||
        product.enrichment_status === enrichmentFilter;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesVerification &&
        matchesEnrichment
      );
    });

    return [...matchesFilters].sort((firstProduct, secondProduct) => {
      if (sortBy === "az") {
        return firstProduct.name.localeCompare(secondProduct.name);
      }

      if (sortBy === "most_owners") {
        const ownerDifference =
          (ownerCountsByProductId.get(secondProduct.id) || 0) -
          (ownerCountsByProductId.get(firstProduct.id) || 0);

        if (ownerDifference !== 0) return ownerDifference;
      }

      if (sortBy === "most_questions") {
        const questionDifference =
          (questionCountsByProductId.get(secondProduct.id) || 0) -
          (questionCountsByProductId.get(firstProduct.id) || 0);

        if (questionDifference !== 0) return questionDifference;
      }

      return (
        new Date(secondProduct.created_at).getTime() -
        new Date(firstProduct.created_at).getTime()
      );
    });
  }, [
    products,
    searchText,
    categoryFilter,
    verificationFilter,
    enrichmentFilter,
    sortBy,
    ownerCountsByProductId,
    questionCountsByProductId,
  ]);

  function getOwnerCount(productId: string) {
    return ownerCountsByProductId.get(productId) || 0;
  }

  function getQuestionCount(productId: string) {
    return questionCountsByProductId.get(productId) || 0;
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading products...</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="mb-8">
        <p className="font-bold text-muted">Explore</p>
        <h1 className="mt-2 text-4xl font-black">
          Find products and ask real owners
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Search the catalog, filter by category, and open product pages to ask
          real owners before buying.
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        )}
      </section>

      <section className="card mb-8 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_160px_200px_180px_160px]">
          <div>
            <label className="label">Search</label>
            <input
              className="input mt-2"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search headphones, cameras, microphones..."
            />
          </div>

          <div>
            <label className="label">Category</label>
            <select
              className="input mt-2"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
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
              <option value="All">All</option>
              <option value="catalog_verified">Catalog verified</option>
              <option value="user_submitted">User-submitted</option>
              <option value="needs_review">Needs review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="label">Enrichment</label>
            <select
              className="input mt-2"
              value={enrichmentFilter}
              onChange={(event) => setEnrichmentFilter(event.target.value)}
            >
              <option value="All">All</option>
              <option value="not_enriched">Not enriched</option>
              <option value="enriched">Enriched</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <label className="label">Sort</label>
            <select
              className="input mt-2"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
            >
              <option value="newest">Newest</option>
              <option value="az">A-Z</option>
              <option value="most_owners">Most owners</option>
              <option value="most_questions">Most questions</option>
            </select>
          </div>
        </div>

        <p className="mt-4 text-sm font-bold text-muted">
          Showing {filteredProducts.length} of {products.length} products
        </p>
      </section>

      {filteredProducts.length === 0 ? (
        <section className="card p-6">
          <h2 className="text-2xl font-black">No products found</h2>
          <p className="mt-3 text-muted">
            Try changing the search or filters, or create a new product page.
          </p>
          <Link href="/add-product" className="btn btn-dark mt-5">
            Add product
          </Link>
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => {
            const ownerCount = getOwnerCount(product.id);
            const questionCount = getQuestionCount(product.id);

            return (
              <div
                key={product.id}
                className="card overflow-hidden hover:-translate-y-1 hover:shadow-md"
              >
                <div className="h-48 bg-slate-100">
                  <ProductImage
                    src={product.image_url}
                    category={product.category}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
                    <span>{product.brand || "Unknown brand"}</span>
                    <span>·</span>
                    <span>{product.category || "Uncategorized"} </span>
                  </div>

                  <h2 className="mt-2 text-xl font-black">{product.name}</h2>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {getProductVerificationLabel(
                        product.product_verification_status
                      )}
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {ownerCount} owners
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {questionCount} questions
                    </span>

                    {product.enrichment_status && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {product.enrichment_status.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
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
                      Ask owners
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
