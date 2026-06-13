"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { ProductSearch } from "@/components/ProductSearch";
import { supabase } from "@/lib/supabaseClient";
import {
  PRODUCT_TAXONOMY,
  getCategoryBySlug,
  getFeatureFiltersForCategory,
  slugifyTaxonomyLabel,
} from "@/lib/productTaxonomy";

export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  product_type?: string | null;
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
  specs?: Record<string, unknown> | null;
  main_category?: string | null;
  main_category_slug?: string | null;
  category_slug?: string | null;
  product_type_slug?: string | null;
  taxonomy_path?: Record<string, any> | null;
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

/** Returns a buyer-facing badge label, or null if no public badge should be shown. */
function getPublicVerificationBadge(status?: string | null): string | null {
  if (status === "catalog_verified") return "Catalog verified";
  return null;
}

function getFilterLabel(key: string): string {
  if (key === "product_type_slug") return "Product Type";
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function getProductSpecChips(product: Product): string[] {
  const chips: string[] = [];
  const specs = product.specs as Record<string, unknown> | null;
  if (!specs) return chips;

  // Dynamically resolve keys from taxonomy feature filters
  const mainSlug = product.main_category_slug || "";
  const catSlug = product.category_slug || "";
  const keys = getFeatureFiltersForCategory(mainSlug, catSlug);

  for (const key of keys) {
    const value = specs[key];
    if (value === undefined || value === null || value === "") continue;

    if (value === "Yes") {
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      chips.push(label);
    } else if (value !== "No") {
      chips.push(String(value));
    }

    if (chips.length >= 4) break;
  }

  return chips;
}

function getResultsCountText(total: number, categorySlug: string, query: string) {
  if (query.trim()) {
    return `${total} ${total === 1 ? 'result' : 'results'} for "${query.trim()}"`;
  }
  let display = "product";
  if (categorySlug !== "All") {
    let label = categorySlug;
    for (const mainVal of Object.values(PRODUCT_TAXONOMY)) {
      if (mainVal.categories[categorySlug]) {
        label = mainVal.categories[categorySlug].label;
        break;
      }
    }
    display = label.toLowerCase();
  }
  const suffix = total === 1 ? "" : (display === "lenses" || display === "headphones" || display.endsWith("s") ? "" : "s");
  return `${total} ${display}${suffix} found`;
}

type ExploreCatalogProps = {
  initialProducts: Product[];
  initialQuery: string;
  initialMainCategory: string;
  initialCategory: string;
  initialProductType: string;
  initialSort: string;
  initialFeatures: Record<string, string[]>;
  page: number;
  pageSize: number;
  totalProducts: number;
  totalPages: number;
};

export function ExploreCatalog({
  initialProducts,
  initialQuery,
  initialMainCategory,
  initialCategory,
  initialProductType,
  initialSort,
  initialFeatures,
  page,
  pageSize,
  totalProducts,
  totalPages,
}: ExploreCatalogProps) {
  const [products] = useState<Product[]>(initialProducts);
  const [ownedProducts, setOwnedProducts] = useState<OwnedProduct[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [searchText, setSearchText] = useState(initialQuery);
  const [mainCategoryFilter, setMainCategoryFilter] = useState(initialMainCategory);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [productTypeFilter, setProductTypeFilter] = useState(initialProductType);
  const [sortBy, setSortBy] = useState(initialSort);
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, string[]>>(initialFeatures);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const mouseLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const handleMouseEnter = () => {
    if (mouseLeaveTimeoutRef.current) {
      clearTimeout(mouseLeaveTimeoutRef.current);
    }
  };

  const handleMouseLeave = () => {
    if (mouseLeaveTimeoutRef.current) {
      clearTimeout(mouseLeaveTimeoutRef.current);
    }
    mouseLeaveTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 200);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdown(null);
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      if (mouseLeaveTimeoutRef.current) {
        clearTimeout(mouseLeaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (initialQuery) {
      setSearchText(initialQuery);
    }

    async function loadExploreData() {
      setErrorMessage("");

      const { data: ownedProductsData } = await supabase
        .from("owned_products")
        .select("product_id, verification_status");

      const { data: questionsData } = await supabase
        .from("questions")
        .select("product_id, status, answered_at");

      setOwnedProducts((ownedProductsData as OwnedProduct[]) || []);
      setQuestions((questionsData as Question[]) || []);
    }

    loadExploreData();
  }, [initialQuery]);

  // Hierarchical lists
  const mainCategoriesList = useMemo(() => {
    return Object.values(PRODUCT_TAXONOMY)
      .filter((m) => m.isActive)
      .map((m) => ({ slug: m.slug, label: m.label }));
  }, []);

  const categoriesList = useMemo(() => {
    if (mainCategoryFilter === "All") {
      return Object.values(PRODUCT_TAXONOMY)
        .filter((m) => m.isActive)
        .flatMap((m) => Object.values(m.categories))
        .filter((c) => c.isActive)
        .map((c) => ({ slug: c.slug, label: c.label }));
    }
    const mainConfig = PRODUCT_TAXONOMY[mainCategoryFilter];
    if (!mainConfig) return [];
    return Object.values(mainConfig.categories)
      .filter((c) => c.isActive)
      .map((c) => ({ slug: c.slug, label: c.label }));
  }, [mainCategoryFilter]);

  const [dbProductTypes, setDbProductTypes] = useState<{ slug: string; label: string }[]>([]);

  useEffect(() => {
    async function loadProductTypes() {
      if (categoryFilter === "All") {
        setDbProductTypes([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("products")
          .select("product_type, product_type_slug")
          .eq("category_slug", categoryFilter)
          .neq("product_verification_status", "duplicate");
        
        if (!error && data) {
          const seenSlugs = new Set<string>();
          const typesList: { slug: string; label: string }[] = [];
          
          let configTypes: { label: string; slug: string }[] = [];
          if (mainCategoryFilter !== "All") {
            const catConfig = getCategoryBySlug(mainCategoryFilter, categoryFilter);
            if (catConfig) {
              configTypes = catConfig.productTypes;
            }
          } else {
            for (const mainCat of Object.values(PRODUCT_TAXONOMY)) {
              if (mainCat.categories[categoryFilter]) {
                configTypes = mainCat.categories[categoryFilter].productTypes;
                break;
              }
            }
          }
          
          data.forEach((p) => {
            const slug = p.product_type_slug || slugifyTaxonomyLabel(p.product_type || "");
            if (!slug || seenSlugs.has(slug)) return;
            seenSlugs.add(slug);
            
            const configMatch = configTypes.find((ct) => ct.slug === slug);
            const label = configMatch ? configMatch.label : (p.product_type || slug);
            typesList.push({ slug, label });
          });
          
          setDbProductTypes(typesList);
        } else {
          setDbProductTypes([]);
        }
      } catch (err) {
        console.error("Error loading product types:", err);
        setDbProductTypes([]);
      }
    }
    loadProductTypes();
  }, [categoryFilter, mainCategoryFilter]);

  const availableProductTypes = useMemo(() => {
    return dbProductTypes;
  }, [dbProductTypes]);

  const availableFeatures = useMemo(() => {
    const features = new Map<string, Set<string>>();
    if (categoryFilter === "All") return features;

    let mainSlug = mainCategoryFilter;
    if (mainSlug === "All") {
      for (const [mKey, mVal] of Object.entries(PRODUCT_TAXONOMY)) {
        if (mVal.categories[categoryFilter]) {
          mainSlug = mKey;
          break;
        }
      }
    }

    const featureFiltersKeys = getFeatureFiltersForCategory(mainSlug, categoryFilter);

    featureFiltersKeys.forEach((key) => {
      features.set(key, new Set<string>());
    });

    products.forEach((product) => {
      const specs = product.specs as Record<string, unknown> | null;
      if (!specs) return;

      featureFiltersKeys.forEach((key) => {
        const value = specs[key];
        if (value !== undefined && value !== null && value !== "") {
          features.get(key)!.add(String(value));
        }
      });
    });

    return features;
  }, [products, categoryFilter, mainCategoryFilter]);

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
    return [...products].sort((firstProduct, secondProduct) => {
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
    sortBy,
    answerCountsByProductId,
    latestAnswerByProductId,
    ownerCountsByProductId,
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

  function updateUrl(newParams: {
    query?: string;
    main_category?: string;
    category?: string;
    type?: string;
    sort?: string;
    features?: Record<string, string[]>;
    page?: number;
  }) {
    const params = new URLSearchParams();
    
    const q = newParams.query !== undefined ? newParams.query : searchText;
    const mc = newParams.main_category !== undefined ? newParams.main_category : mainCategoryFilter;
    
    const isMcChanged = newParams.main_category !== undefined && newParams.main_category !== mainCategoryFilter;
    const c = isMcChanged ? "All" : (newParams.category !== undefined ? newParams.category : categoryFilter);
    
    const isCatChanged = isMcChanged || (newParams.category !== undefined && newParams.category !== categoryFilter);
    const pt = isCatChanged ? "All" : (newParams.type !== undefined ? newParams.type : productTypeFilter);
    
    const s = newParams.sort !== undefined ? newParams.sort : sortBy;
    const p = newParams.page !== undefined ? newParams.page : page;
    
    const activeFeatures = isCatChanged ? {} : (newParams.features !== undefined ? newParams.features : selectedFeatures);

    if (q.trim()) params.set("q", q.trim());
    if (mc !== "All") params.set("main_category", mc);
    if (c !== "All") params.set("category", c);
    if (pt !== "All") params.set("type", pt);
    if (s !== "newest") params.set("sort", s);
    if (p > 1) params.set("page", String(p));
    
    Object.entries(activeFeatures).forEach(([key, values]) => {
      if (values && values.length > 0) {
        params.set(key, values[0]);
      }
    });

    const target = params.toString() ? `/explore?${params.toString()}` : "/explore";
    window.location.href = target;
  }

  function handleSearch(query: string) {
    setSearchText(query);
    updateUrl({ query });
  }

  function getPageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (targetPage > 1) params.set("page", String(targetPage));
    if (searchText.trim()) params.set("q", searchText.trim());
    if (mainCategoryFilter !== "All") params.set("main_category", mainCategoryFilter);
    if (categoryFilter !== "All") params.set("category", categoryFilter);
    if (productTypeFilter !== "All") params.set("type", productTypeFilter);
    if (sortBy !== "newest") params.set("sort", sortBy);
    
    Object.entries(selectedFeatures).forEach(([key, values]) => {
      if (values && values.length > 0) {
        params.set(key, values[0]);
      }
    });

    const query = params.toString();
    return query ? `/explore?${query}` : "/explore";
  }

  const showPagination = !(page === 1 && totalProducts <= pageSize);

  return (
    <main className="mx-auto max-w-7xl px-5 py-12">
      {/* Search-First Hero Header */}
      <section className="mb-12 text-center pt-20 pb-12 max-w-3xl mx-auto">
        <p className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">Explore</p>
        <h1 className="mt-3 text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
          Find products and ask real owners
        </h1>
        <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
          Search the catalog first. If no match is right, submit a missing
          product and OwnerCheck will check for duplicates before publishing.
        </p>

        <div className="mt-8 max-w-2xl mx-auto">
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

      {/* Filter Section - Toolbar */}
      <section className="mb-12 border-b border-slate-200/60 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Desktop Toolbar */}
          <div ref={toolbarRef} className="hidden md:flex flex-wrap items-center gap-3">
            {/* Department (Main Category) Dropdown */}
            <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <button
                type="button"
                aria-expanded={activeDropdown === "mainCategory"}
                aria-haspopup="listbox"
                onClick={() => setActiveDropdown(activeDropdown === "mainCategory" ? null : "mainCategory")}
                className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm transition-all duration-200"
              >
                <span>
                  Department:{" "}
                  {mainCategoryFilter === "All"
                    ? "All Departments"
                    : Object.values(PRODUCT_TAXONOMY).find((m) => m.slug === mainCategoryFilter)?.label || mainCategoryFilter}
                </span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>
              {activeDropdown === "mainCategory" && (
                <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 py-2">
                  <button
                    onClick={() => {
                      setMainCategoryFilter("All");
                      setCategoryFilter("All");
                      setProductTypeFilter("All");
                      setActiveDropdown(null);
                      updateUrl({ main_category: "All" });
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                  >
                    All Departments
                  </button>
                  {mainCategoriesList.map((m) => (
                    <button
                      key={m.slug}
                      onClick={() => {
                        setMainCategoryFilter(m.slug);
                        setCategoryFilter("All");
                        setProductTypeFilter("All");
                        setActiveDropdown(null);
                        updateUrl({ main_category: m.slug });
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category Dropdown */}
            <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <button
                type="button"
                aria-expanded={activeDropdown === "category"}
                aria-haspopup="listbox"
                onClick={() => setActiveDropdown(activeDropdown === "category" ? null : "category")}
                className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm transition-all duration-200"
              >
                <span>
                  Category:{" "}
                  {categoryFilter === "All"
                    ? "All Categories"
                    : categoriesList.find((c) => c.slug === categoryFilter)?.label || categoryFilter}
                </span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>
              {activeDropdown === "category" && (
                <div className="absolute left-0 mt-2 w-56 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-30 py-2">
                  <button
                    onClick={() => {
                      setCategoryFilter("All");
                      setProductTypeFilter("All");
                      setActiveDropdown(null);
                      updateUrl({ category: "All" });
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                  >
                    All Categories
                  </button>
                  {categoriesList.map((c) => (
                    <button
                      key={c.slug}
                      onClick={() => {
                        setCategoryFilter(c.slug);
                        setProductTypeFilter("All");
                        setActiveDropdown(null);
                        updateUrl({ category: c.slug });
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Type Dropdown */}
            {categoryFilter !== "All" && availableProductTypes.length > 0 && (
              <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                <button
                  type="button"
                  aria-expanded={activeDropdown === "productType"}
                  aria-haspopup="listbox"
                  onClick={() => setActiveDropdown(activeDropdown === "productType" ? null : "productType")}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm transition-all duration-200"
                >
                  <span>
                    Type:{" "}
                    {productTypeFilter === "All"
                      ? "All types"
                      : availableProductTypes.find((t) => t.slug === productTypeFilter)?.label || "All"}
                  </span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </button>
                {activeDropdown === "productType" && (
                  <div className="absolute left-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-30 py-2">
                    <button
                      onClick={() => {
                        setProductTypeFilter("All");
                        setActiveDropdown(null);
                        updateUrl({ type: "All" });
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                    >
                      All Types
                    </button>
                    {availableProductTypes.map((type) => (
                      <button
                        key={type.slug}
                        onClick={() => {
                          setProductTypeFilter(type.slug);
                          setActiveDropdown(null);
                          updateUrl({ type: type.slug });
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Features Popover */}
            {categoryFilter !== "All" && availableFeatures.size > 0 && (
              <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                <button
                  type="button"
                  aria-expanded={activeDropdown === "features"}
                  aria-haspopup="dialog"
                  onClick={() => setActiveDropdown(activeDropdown === "features" ? null : "features")}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm transition-all duration-200"
                >
                  <span>Features</span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </button>
                {activeDropdown === "features" && (
                  <div className="absolute left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-4 space-y-4">
                    {Array.from(availableFeatures.entries()).map(([key, values]) => {
                      if (values.size === 0) return null;
                      return (
                        <div key={key} className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {getFilterLabel(key)}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Array.from(values).map((val) => {
                              const active = selectedFeatures[key]?.[0] === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    const nextFeatures = { ...selectedFeatures };
                                    if (active) {
                                      delete nextFeatures[key];
                                    } else {
                                      nextFeatures[key] = [val];
                                    }
                                    setSelectedFeatures(nextFeatures);
                                    updateUrl({ features: nextFeatures });
                                  }}
                                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all duration-200 ${
                                    active
                                      ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  {val}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Done Button */}
                    <div className="flex justify-end pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveDropdown(null)}
                        className="px-4 py-1.5 bg-slate-900 text-white rounded-full text-xs font-semibold hover:bg-slate-800 transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <button
                type="button"
                aria-expanded={activeDropdown === "sort"}
                aria-haspopup="listbox"
                onClick={() => setActiveDropdown(activeDropdown === "sort" ? null : "sort")}
                className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm transition-all duration-200"
              >
                <span>
                  Sort:{" "}
                  {sortBy === "newest"
                    ? "Newest"
                    : sortBy === "az"
                      ? "A-Z"
                      : sortBy === "most_owners"
                        ? "Most Owners"
                        : sortBy === "most_answers"
                          ? "Most Answers"
                          : "Recently Answered"}
                </span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>
              {activeDropdown === "sort" && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 py-2">
                  {[
                    { value: "newest", label: "Newest" },
                    { value: "az", label: "A-Z" },
                    { value: "most_owners", label: "Most Owners" },
                    { value: "most_answers", label: "Most Owner Answers" },
                    { value: "recently_answered", label: "Recently Answered" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortBy(opt.value);
                        setActiveDropdown(null);
                        updateUrl({ sort: opt.value });
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-semibold text-slate-700"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mobile Toolbar Trigger */}
          <div className="flex md:hidden items-center justify-between w-full gap-2">
            <select
              className="input rounded-full bg-white border border-slate-200 py-1.5 px-4 text-sm font-semibold flex-1"
              value={mainCategoryFilter}
              onChange={(e) => {
                setMainCategoryFilter(e.target.value);
                setCategoryFilter("All");
                setProductTypeFilter("All");
                updateUrl({ main_category: e.target.value });
              }}
            >
              <option value="All">All Departments</option>
              {mainCategoriesList.map((m) => (
                <option key={m.slug} value={m.slug}>{m.label}</option>
              ))}
            </select>
            
            <select
              className="input rounded-full bg-white border border-slate-200 py-1.5 px-4 text-sm font-semibold flex-1"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setProductTypeFilter("All");
                updateUrl({ category: e.target.value });
              }}
            >
              <option value="All">All Categories</option>
              {categoriesList.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
            
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-semibold shadow-sm flex items-center gap-1.5"
            >
              Filters
            </button>
          </div>

          {/* Buyer Friendly Wording Results Count */}
          <p className="text-sm font-bold text-slate-400">
            {getResultsCountText(totalProducts, categoryFilter, searchText)}
          </p>
        </div>
      </section>

      {/* Mobile Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="w-full max-w-md bg-white h-full flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black">Filters</h2>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="text-sm font-bold underline"
                >
                  Close
                </button>
              </div>

              {/* Department */}
              <div className="space-y-2">
                <label className="label">Department</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMainCategoryFilter("All");
                      setCategoryFilter("All");
                      setProductTypeFilter("All");
                      updateUrl({ main_category: "All" });
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                      mainCategoryFilter === "All"
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200 text-slate-600"
                    }`}
                  >
                    All Departments
                  </button>
                  {mainCategoriesList.map((m) => {
                    const active = mainCategoryFilter === m.slug;
                    return (
                      <button
                        key={m.slug}
                        type="button"
                        onClick={() => {
                          setMainCategoryFilter(m.slug);
                          setCategoryFilter("All");
                          setProductTypeFilter("All");
                          updateUrl({ main_category: m.slug });
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                          active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600"
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="label">Category</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter("All");
                      setProductTypeFilter("All");
                      updateUrl({ category: "All" });
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                      categoryFilter === "All"
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200 text-slate-600"
                    }`}
                  >
                    All Categories
                  </button>
                  {categoriesList.map((c) => {
                    const active = categoryFilter === c.slug;
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(c.slug);
                          setProductTypeFilter("All");
                          updateUrl({ category: c.slug });
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                          active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Product Type */}
              {categoryFilter !== "All" && availableProductTypes.length > 0 && (
                <div className="space-y-2">
                  <label className="label">Product Type</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProductTypeFilter("All");
                        updateUrl({ type: "All" });
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                        productTypeFilter === "All"
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      All Types
                    </button>
                    {availableProductTypes.map((type) => {
                      const active = productTypeFilter === type.slug;
                      return (
                        <button
                          key={type.slug}
                          type="button"
                          onClick={() => {
                            setProductTypeFilter(type.slug);
                            updateUrl({ type: type.slug });
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                            active
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white border-slate-200 text-slate-600"
                          }`}
                        >
                          {type.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Features */}
              {categoryFilter !== "All" && availableFeatures.size > 0 && (
                <div className="space-y-4">
                  <label className="label">Features</label>
                  {Array.from(availableFeatures.entries()).map(([key, values]) => {
                    if (values.size === 0) return null;
                    return (
                      <div key={key} className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {getFilterLabel(key)}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(values).map((val) => {
                            const active = selectedFeatures[key]?.[0] === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => {
                                  const nextFeatures = { ...selectedFeatures };
                                  if (active) {
                                    delete nextFeatures[key];
                                  } else {
                                    nextFeatures[key] = [val];
                                  }
                                  setSelectedFeatures(nextFeatures);
                                  updateUrl({ features: nextFeatures });
                                }}
                                className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                                  active
                                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                                    : "bg-white border-slate-200 text-slate-600"
                                }`}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sort */}
              <div className="space-y-2">
                <label className="label">Sort</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "newest", label: "Newest" },
                    { value: "az", label: "A-Z" },
                    { value: "most_owners", label: "Most Owners" },
                    { value: "most_answers", label: "Most Answers" },
                    { value: "recently_answered", label: "Recently Answered" },
                  ].map((opt) => {
                    const active = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSortBy(opt.value);
                          updateUrl({ sort: opt.value });
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                          active
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 text-slate-600"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(false)}
              className="btn btn-dark w-full mt-8 rounded-full"
            >
              Show Results
            </button>
          </div>
        </div>
      )}

      {/* Grid Results */}
      {filteredProducts.length === 0 ? (
        <section className="card p-6 text-center max-w-lg mx-auto">
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
            <section className="card mb-10 p-6 max-w-3xl mx-auto text-center">
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

          {/* Grid Layout - 4 Columns */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredProducts.map((product) => {
              const ownerCount = getOwnerCount(product.id);
              const questionCount = getQuestionCount(product.id);
              const answerCount = getAnswerCount(product.id);
              const specChips = getProductSpecChips(product);

              return (
                <div
                  key={product.id}
                  className="group flex flex-col h-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-1"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-slate-50">
                    <ProductImage
                      src={product.image_url}
                      category={product.category}
                      alt={product.name}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                    {getPublicVerificationBadge(product.product_verification_status) && (
                      <span className="absolute right-3 top-3 rounded-full backdrop-blur-sm bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 shadow-sm border border-white/40">
                        Verified
                      </span>
                    )}
                  </div>

                  <div className="p-5 flex flex-col flex-grow justify-between">
                    <div>
                      {/* Brand and category info */}
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold leading-none">
                        {product.brand || "Unknown"} · {product.product_type || product.category || "Uncategorized"}
                      </p>

                      <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-900 line-clamp-1 leading-snug">
                        {product.name}
                      </h2>

                      {/* Spec Chips */}
                      {specChips.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {specChips.map((chip, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-[9px] font-bold text-slate-500 uppercase tracking-wider"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Verified stats */}
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-400">
                        <span>{ownerCount} owners</span>
                        <span>·</span>
                        <span>{answerCount} answers</span>
                        {questionCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{questionCount} questions</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                      <Link
                        href={`/product/${product.slug}`}
                        className="btn btn-dark flex-1 rounded-xl text-center text-xs font-bold py-2.5 shadow-sm transition-all duration-300"
                      >
                        View Product
                      </Link>
                      <Link
                        href={`/product/${product.slug}#ask-question`}
                        className="btn bg-transparent border border-slate-200 text-slate-700 hover:bg-slate-50 flex-1 rounded-xl text-center text-xs font-bold py-2.5 transition-all duration-300"
                      >
                        Ask Owners
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
        <nav className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-8">
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
