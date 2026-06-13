"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { ProductSearch } from "@/components/ProductSearch";
import { normalizeProductText } from "@/lib/productNormalization";
import { supabase } from "@/lib/supabaseClient";

export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  description: string | null;
  canonical_title: string | null;
  normalized_title: string | null;
  normalized_brand: string | null;
  normalized_model: string | null;
  aliases: string[] | null;
  product_verification_status: string | null;
  enrichment_status: string | null;
  created_at: string;
};

type OwnedProduct = {
  product_id: string;
  verification_status: string;
};

type Question = {
  product_id: string;
  status: string;
  answered_at: string | null;
};

type SortOption =
  | "newest"
  | "az"
  | "most_owners"
  | "most_answers"
  | "recently_answered";

function getProductVerificationLabel(status?: string | null) {
  if (status === "catalog_verified") return "Catalog verified";
  if (status === "community_created" || status === "pending_enrichment") {
    return "Community-created";
  }
  return "Info being verified";
}

type ExploreCatalogProps = {
  initialProducts: Product[];
  initialQuery: string;
  page: number;
  pageSize: number;
  totalProducts: number;
  totalPages: number;
};

export function ExploreCatalog({
  initialProducts,
  initialQuery,
  page,
  pageSize,
  totalProducts,
  totalPages,
}: ExploreCatalogProps) {
  const [products] = useState<Product[]>(initialProducts);
  const [ownedProducts, setOwnedProducts] = useState<OwnedProduct[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [searchText, setSearchText] = useState(initialQuery);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [signalFilter, setSignalFilter] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (initialQuery) {
      setSearchText(initialQuery);
    }

    async function loadExploreData() {
      setLoading(true);
      setErrorMessage("");

      const { data: ownedProductsData } = await supabase
        .from("owned_products")
        .select("product_id, verification_status");

      const { data: questionsData } = await supabase
        .from("questions")
        .select("product_id, status, answered_at");

      setOwnedProducts((ownedProductsData as OwnedProduct[]) || []);
      setQuestions((questionsData as Question[]) || []);
      setLoading(false);
    }

    loadExploreData();
  }, [initialQuery]);

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
      if (
        ["photo_verified", "receipt_verified", "trusted_owner"].includes(
          item.verification_status
        )
      ) {
        counts.set(item.product_id, (counts.get(item.product_id) || 0) + 1);
      }
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

  const answerCountsByProductId = useMemo(() => {
    const counts = new Map<string, number>();

    questions.forEach((item) => {
      if (item.status === "answered") {
        counts.set(item.product_id, (counts.get(item.product_id) || 0) + 1);
      }
    });

    return counts;
  }, [questions]);

  const latestAnswerByProductId = useMemo(() => {
    const dates = new Map<string, number>();

    questions.forEach((item) => {
      if (!item.answered_at) return;
      const time = new Date(item.answered_at).getTime();
      dates.set(item.product_id, Math.max(dates.get(item.product_id) || 0, time));
    });

    return dates;
  }, [questions]);

  const filteredProducts = useMemo(() => {
    const cleanSearch = normalizeProductText(searchText);

    const matchesFilters = products.filter((product) => {
      const haystack = normalizeProductText(
        [
          product.name,
          product.canonical_title,
          product.brand,
          product.category,
          product.description,
          product.normalized_title,
          product.normalized_brand,
          product.normalized_model,
          ...(Array.isArray(product.aliases) ? product.aliases : []),
        ]
          .filter(Boolean)
          .join(" ")
      );
      const matchesSearch =
        !cleanSearch || haystack.includes(cleanSearch);

      const matchesCategory =
        categoryFilter === "All" || product.category === categoryFilter;

      const ownerCount = ownerCountsByProductId.get(product.id) || 0;
      const questionCount = questionCountsByProductId.get(product.id) || 0;
      const answerCount = answerCountsByProductId.get(product.id) || 0;
      const matchesSignal =
        signalFilter === "All" ||
        (signalFilter === "has_verified_owners" && ownerCount > 0) ||
        (signalFilter === "has_answered_questions" && answerCount > 0) ||
        (signalFilter === "private_chat_available" && ownerCount > 0) ||
        (signalFilter === "catalog_verified" &&
          product.product_verification_status === "catalog_verified") ||
        (signalFilter === "community_created" &&
          ["community_created", "pending_enrichment", "user_submitted"].includes(
            product.product_verification_status || ""
          )) ||
        (signalFilter === "needs_first_owner" && ownerCount === 0) ||
        (signalFilter === "has_public_questions" && questionCount > 0);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSignal
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

      if (sortBy === "most_answers") {
        const questionDifference =
          (answerCountsByProductId.get(secondProduct.id) || 0) -
          (answerCountsByProductId.get(firstProduct.id) || 0);

        if (questionDifference !== 0) return questionDifference;
      }

      if (sortBy === "recently_answered") {
        const answerDifference =
          (latestAnswerByProductId.get(secondProduct.id) || 0) -
          (latestAnswerByProductId.get(firstProduct.id) || 0);

        if (answerDifference !== 0) return answerDifference;
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
    signalFilter,
    sortBy,
    answerCountsByProductId,
    latestAnswerByProductId,
    ownerCountsByProductId,
    questionCountsByProductId,
  ]);

  function getOwnerCount(productId: string) {
    return ownerCountsByProductId.get(productId) || 0;
  }

  function getQuestionCount(productId: string) {
    return questionCountsByProductId.get(productId) || 0;
  }

  function getAnswerCount(productId: string) {
    return answerCountsByProductId.get(productId) || 0;
  }

  function handleSearch(query: string) {
    setSearchText(query);
    const target = query
      ? `/explore?q=${encodeURIComponent(query)}`
      : "/explore";
    window.history.pushState(null, "", target);
  }

  function getPageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (targetPage > 1) params.set("page", String(targetPage));
    if (searchText.trim()) params.set("q", searchText.trim());
    const query = params.toString();
    return query ? `/explore?${query}` : "/explore";
  }

  const showPagination = !(page === 1 && totalProducts <= pageSize);

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
          Search the catalog first. If no match is right, submit a missing
          product and OwnerCheck will check for duplicates before publishing.
        </p>

        <div className="mt-6 max-w-3xl">
          <ProductSearch
            initialQuery={searchText}
            onSearch={handleSearch}
            placeholder="Search for AirPods, Canon R5, Louis Vuitton Neverfull..."
            buttonLabel="Search"
          />
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        )}
      </section>

      <section className="card mb-8 p-5">
        <div className="grid gap-4 md:grid-cols-[160px_240px_180px]">
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
            <label className="label">Buyer signals</label>
            <select
              className="input mt-2"
              value={signalFilter}
              onChange={(event) => setSignalFilter(event.target.value)}
            >
              <option value="All">All</option>
              <option value="has_verified_owners">Has verified owners</option>
              <option value="has_answered_questions">Has answered questions</option>
              <option value="private_chat_available">Available for private chat</option>
              <option value="catalog_verified">Catalog verified</option>
              <option value="community_created">Community-created</option>
              <option value="needs_first_owner">Needs first owner</option>
              <option value="has_public_questions">Has public questions</option>
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
              <option value="most_answers">Most owner answers</option>
              <option value="recently_answered">Recently answered</option>
            </select>
          </div>
        </div>

        <p className="mt-4 text-sm font-bold text-muted">
          Showing {filteredProducts.length} of {products.length} loaded products
          {totalProducts > products.length ? ` / ${totalProducts} total` : ""}
        </p>
      </section>

      {filteredProducts.length === 0 ? (
        <section className="card p-6">
          <h2 className="text-2xl font-black">No products found</h2>
          <p className="mt-3 text-muted">
            Can't find this product? Submit it to OwnerCheck. We'll check for
            duplicates, add basic info, and review it.
          </p>
          <Link
            href={`/add-product${searchText ? `?q=${encodeURIComponent(searchText)}` : ""}`}
            className="btn btn-dark mt-5"
          >
            Submit it to OwnerCheck
          </Link>
        </section>
      ) : (
        <>
          {searchText.trim() && (
            <section className="card mb-6 p-5">
              <h2 className="text-2xl font-black">
                Can't find this product?
              </h2>
              <p className="mt-2 text-muted">
                If none of these matches are correct, submit it to OwnerCheck.
                We'll check for duplicates, add basic info, and review it.
              </p>
              <Link
                href={`/add-product?q=${encodeURIComponent(searchText)}`}
                className="btn btn-dark mt-4"
              >
                Submit it to OwnerCheck
              </Link>
            </section>
          )}

          <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => {
            const ownerCount = getOwnerCount(product.id);
            const questionCount = getQuestionCount(product.id);
            const answerCount = getAnswerCount(product.id);

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
                      {ownerCount} verified owners
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {answerCount} owner answers
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {questionCount} public questions
                    </span>
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
        </>
      )}

      {showPagination && (
        <nav className="mt-8 flex flex-wrap items-center justify-between gap-3">
          {page === 1 ? (
            <span className="btn pointer-events-none opacity-40">Previous</span>
          ) : (
            <Link href={getPageHref(page - 1)} className="btn">
              Previous
            </Link>
          )}

          <span className="text-sm font-bold text-muted">
            Page {page} of {Math.max(totalPages, 1)}
          </span>

          {page >= totalPages ? (
            <span className="btn pointer-events-none opacity-40">Next</span>
          ) : (
            <Link href={getPageHref(page + 1)} className="btn btn-dark">
              Next
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
