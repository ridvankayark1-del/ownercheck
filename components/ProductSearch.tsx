"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";

type ProductSuggestion = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  product_verification_status: string | null;
  verified_owner_count: number;
  public_question_count: number;
  public_answer_count: number;
};

type ProductSearchProps = {
  initialQuery?: string;
  placeholder?: string;
  buttonLabel?: string;
  className?: string;
  inputClassName?: string;
  compact?: boolean;
  onSearch?: (query: string) => void;
};

function getCatalogLabel(status?: string | null) {
  if (status === "catalog_verified") return "Catalog verified";
  if (status === "community_created" || status === "pending_enrichment") {
    return "Community-created";
  }
  return "Info being verified";
}

export function ProductSearch({
  initialQuery = "",
  placeholder = "Search products...",
  buttonLabel = "Search",
  className = "",
  inputClassName = "",
  compact = false,
  onSearch,
}: ProductSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoadingSuggestions(true);

      try {
        const response = await fetch(
          `/api/products?q=${encodeURIComponent(cleanQuery)}&limit=5`
        );
        const result = (await response.json()) as {
          products?: ProductSuggestion[];
        };

        setSuggestions(result.products || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();

    if (onSearch) {
      onSearch(cleanQuery);
      return;
    }

    const target = cleanQuery
      ? `/explore?q=${encodeURIComponent(cleanQuery)}`
      : "/explore";
    window.location.href = target;
  }

  return (
    <div className={`relative ${className}`}>
      <form
        onSubmit={submitSearch}
        className={`grid gap-2 ${compact ? "grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}
      >
        <input
          className={`input ${compact ? "h-10 text-sm" : ""} ${inputClassName}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          aria-label="Search products"
          autoComplete="off"
        />
        <button
          type="submit"
          className={`btn btn-dark ${compact ? "h-10 px-3 text-sm" : ""}`}
        >
          {buttonLabel}
        </button>
      </form>

      {focused && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {loadingSuggestions && (
            <p className="p-4 text-sm font-bold text-muted">Searching...</p>
          )}

          {!loadingSuggestions && suggestions.length > 0 && (
            <div className="divide-y divide-slate-100">
              {suggestions.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  className="grid grid-cols-[56px_1fr] gap-3 p-3 hover:bg-slate-50"
                >
                  <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                    <ProductImage
                      src={product.image_url}
                      category={product.category}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{product.name}</p>
                    <p className="truncate text-xs font-bold text-muted">
                      {product.brand || "Unknown brand"}
                      {product.category ? ` / ${product.category}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">
                        {product.verified_owner_count} owners
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">
                        {product.public_answer_count} answers
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">
                        {getCatalogLabel(product.product_verification_status)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!loadingSuggestions && (
            <div className="border-t border-slate-100 p-3">
              {suggestions.length === 0 && (
                <p className="text-sm font-black">Can't find this product?</p>
              )}
              <p className="text-xs font-bold text-muted">
                Submit it to OwnerCheck. We'll check for duplicates, add basic
                info, and review it.
              </p>
              <Link
                href={`/add-product?q=${encodeURIComponent(query.trim())}`}
                className="mt-2 inline-flex text-sm font-black underline"
              >
                Submit missing product
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
