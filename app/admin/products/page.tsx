"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { normalizeCategory } from "@/lib/productCategoryProfiles";
import { isPlaceholderImage } from "@/lib/productImages";
import { getGroupedSpecs } from "@/lib/productSpecs";
import {
  normalizeProductText,
  scoreProductMatch,
} from "@/lib/productNormalization";
import { getCategorySpecKeys, PRODUCT_TAXONOMY, slugifyTaxonomyLabel, resolveTaxonomyForProduct } from "@/lib/productTaxonomy";
import { getIdentityIssues, getSpecsSummary } from "@/lib/productIssues";
import { getHeadphoneProductTypeNormalization } from "@/lib/productFactory";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: string;
  slug: string;
  name: string;
  model: string | null;
  brand: string | null;
  category: string | null;
  product_type: string | null;
  main_category: string | null;
  main_category_slug: string | null;
  category_slug: string | null;
  product_type_slug: string | null;
  taxonomy_path: Record<string, any> | null;
  specs: Record<string, unknown> & {
    product_type?: string | null;
    _items?: Array<Record<string, unknown>>;
  } | null;
  image_url: string | null;
  product_verification_status: string | null;
  canonical_id: string | null;
  source_url: string | null;
  product_url: string | null;
  verified_source: string | null;
  external_summary: string | null;
  enrichment_status: string | null;
  suggested_title: string | null;
  suggested_brand: string | null;
  suggested_model: string | null;
  suggested_category: string | null;
  suggested_product_type: string | null;
  suggested_short_summary: string | null;
  suggested_specs: Record<string, unknown> | null;
  suggested_image_url: string | null;
  enrichment_warnings: string[] | null;
  enrichment_sources: Array<{ title?: string; url?: string }> | null;
  category_confidence: number | null;
  specs_confidence: number | null;
  identity_approved_at: string | null;
  specs_approved_at: string | null;
  image_approved_at: string | null;
  duplicate_reviewed_at: string | null;
  created_at: string;
  data_source: string | null;
};

type SpecDraftRow = {
  key: string;
  label: string;
  value: string;
  source_url: string;
  confidence: string;
  source_type: string;
  status: "approved" | "needs_review" | "";
};

type ProductStatus =
  | "catalog_verified"
  | "community_created"
  | "user_submitted"
  | "pending_enrichment"
  | "needs_review"
  | "rejected"
  | "duplicate";

type QueueView =
  | "needs_attention"
  | "ready_to_verify"
  | "possible_duplicates"
  | "missing_specs"
  | "missing_images"
  | "needs_identity"
  | "recently_imported"
  | "catalog_verified"
  | "duplicate"
  | "rejected"
  | "all";

type ReviewTab =
  | "overview"
  | "identity"
  | "specs"
  | "image"
  | "duplicate"
  | "enrichment"
  | "status";

type DuplicateCandidateView = {
  product: Product;
  score: number;
  reasons: string[];
};

const QUEUE_VIEWS: Array<{ id: QueueView; label: string }> = [
  { id: "needs_attention", label: "Needs attention" },
  { id: "ready_to_verify", label: "Ready to verify" },
  { id: "possible_duplicates", label: "Possible duplicates" },
  { id: "missing_specs", label: "Missing specs" },
  { id: "missing_images", label: "Missing images" },
  { id: "needs_identity", label: "Needs identity review" },
  { id: "recently_imported", label: "Recently imported" },
  { id: "catalog_verified", label: "Catalog verified" },
  { id: "duplicate", label: "Duplicates" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All products" },
];

function formatStatus(value?: string | null) {
  return (value || "not set").replace(/_/g, " ");
}

/** Returns a human-readable admin label that distinguishes imported products from community-submitted ones. */
function formatAdminStatus(product: Pick<Product, "product_verification_status" | "data_source">): string {
  const status = product.product_verification_status;
  const source = product.data_source;
  if (status === "catalog_verified") return "Catalog verified";
  if (status === "rejected") return "Archived";
  if (status === "duplicate") return "Duplicate";
  if (status === "needs_review") return "Needs review";
  const isAdminImport =
    source === "admin_product_factory_csv" ||
    source === "admin_import" ||
    source === "admin_url_import";
  const isUserCreated = source === "user_created";
  if (status === "community_created" || status === "pending_enrichment") {
    if (isAdminImport) return "Imported product";
    if (isUserCreated) return "Community submitted";
    return "Pending review";
  }
  if (isAdminImport) return "Imported draft";
  return formatStatus(status);
}

function chipClass(tone: "good" | "warn" | "bad" | "neutral" = "neutral") {
  if (tone === "good") return "bg-emerald-100 text-emerald-800";
  if (tone === "warn") return "bg-amber-100 text-amber-800";
  if (tone === "bad") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function getImageStatus(product: Product) {
  if (!product.image_url) return "missing";
  if (isPlaceholderImage(product.image_url)) return "placeholder";
  if (!product.image_approved_at) return "needs_approval";
  return "approved";
}

function getImageStatusLabel(product: Product) {
  const status = getImageStatus(product);
  if (status === "approved") return "Image approved";
  if (status === "needs_approval") return "Image found, needs approval";
  if (status === "placeholder") return "Placeholder image";
  return "Image missing";
}

function formatEnrichmentStatus(value?: string | null) {
  if (value === "snippet_enriched") return "Enrichment source: Search snippets";
  if (value === "source_enriched") return "Enrichment source: Source URL";
  if (value === "pending_review") return "Enrichment needs review";
  if (value === "failed") return "Enrichment failed";
  if (!value || value === "not_enriched") return "Not enriched";
  return formatStatus(value);
}

function formatSpecLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSpecRows(product: Product): SpecDraftRow[] {
  const specs = product.specs || {};
  const itemRows = Array.isArray(specs._items)
    ? specs._items.map((item) => ({
        key: String(item.key || ""),
        label: String(item.label || item.key || ""),
        value: String(item.value || ""),
        source_url: String(item.source_url || ""),
        confidence:
          typeof item.confidence === "number" ? String(item.confidence) : "",
        source_type: String(item.source_type || ""),
        status:
          item.status === "approved" || item.status === "needs_review"
            ? item.status
            : ("" as SpecDraftRow["status"]),
      }))
    : [];

  if (itemRows.length > 0) return itemRows;

  const reserved = new Set([
    "brand",
    "category",
    "product_type",
    "model",
    "main_features",
    "best_for",
    "check_before_buying",
    "_items",
  ]);
  const keys = Array.from(
    new Set([
      "product_type",
      ...Object.keys(specs).filter((key) => !reserved.has(key)),
    ])
  );

  return keys
    .map((key) => ({
      key,
      label: formatSpecLabel(key),
      value:
        key === "product_type"
          ? String(specs.product_type || "")
          : typeof specs[key] === "string"
            ? String(specs[key])
            : "",
      source_url: "",
      confidence: "",
      source_type: "",
      status: "" as SpecDraftRow["status"],
    }))
    .filter((row) => row.key || row.value);
}

function rowsToSpecs(product: Product, rows: SpecDraftRow[]) {
  const specs: Record<string, unknown> = {
    ...(product.specs || {}),
    category: product.category,
  };
  const cleanRows = rows
    .map((row) => ({
      ...row,
      key: row.key.trim(),
      label: row.label.trim() || formatSpecLabel(row.key),
      value: row.value.trim(),
      source_url: row.source_url.trim(),
      source_type: row.source_type.trim(),
      confidence: row.confidence.trim(),
    }))
    .filter((row) => row.key && row.value);

  cleanRows.forEach((row) => {
    specs[row.key] = row.value;
  });
  specs._items = cleanRows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value,
    source_url: row.source_url || null,
    source_type: row.source_type || null,
    confidence: row.confidence ? Number(row.confidence) : null,
    status: row.status || "needs_review",
  }));

  return specs;
}

function getDuplicateCandidates(
  product: Product,
  products: Product[],
  manualSearch = ""
): DuplicateCandidateView[] {
  const searchText = manualSearch.trim();

  return products
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => {
      const reasons: string[] = [];
      const score = scoreProductMatch(
        {
          name: searchText || product.name,
          brand: product.brand,
          model: product.model,
          category: product.category,
        },
        {
          name: candidate.name,
          brand: candidate.brand,
          model: candidate.model,
          category: candidate.category,
        }
      );
      const productTitle = normalizeProductText(product.name);
      const candidateTitle = normalizeProductText(candidate.name);
      const productBrand = normalizeProductText(product.brand);
      const candidateBrand = normalizeProductText(candidate.brand);
      const productModel = normalizeProductText(product.model);
      const candidateModel = normalizeProductText(candidate.model);
      const productCategory = normalizeProductText(product.category);
      const candidateCategory = normalizeProductText(candidate.category);
      const haystack = normalizeProductText(
        [candidate.name, candidate.brand, candidate.category, candidate.model]
          .filter(Boolean)
          .join(" ")
      );

      if (productBrand && productBrand === candidateBrand) reasons.push("same brand");
      if (productCategory && productCategory === candidateCategory) {
        reasons.push("same category");
      }
      if (productModel && productModel === candidateModel) reasons.push("same model");
      if (productTitle && candidateTitle.includes(productTitle)) {
        reasons.push("similar title");
      } else if (candidateTitle && productTitle.includes(candidateTitle)) {
        reasons.push("similar title");
      }
      if (searchText && haystack.includes(normalizeProductText(searchText))) {
        reasons.push("manual search match");
      }

      return { product: candidate, score, reasons };
    })
    .filter((candidate) => candidate.score >= 0.35 || candidate.reasons.length >= 2)
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
}

function getDuplicateRisk(candidates: DuplicateCandidateView[]) {
  const topScore = candidates[0]?.score || 0;
  if (topScore >= 0.8) return "High";
  if (topScore >= 0.55 || candidates.length >= 3) return "Medium";
  return "Low";
}

function isCatalogReady(product: Product) {
  return Boolean(
    product.identity_approved_at &&
      product.specs_approved_at &&
      product.image_approved_at &&
      product.duplicate_reviewed_at &&
      product.product_verification_status !== "rejected" &&
      product.product_verification_status !== "duplicate"
  );
}

function getMissingRecommendedSpecs(product: Product, rows: SpecDraftRow[]) {
  return getCategorySpecKeys(product.category).filter(
    (key) => !rows.some((row) => row.key === key && row.value.trim())
  );
}

function getSpecSourceSummary(product: Product, rows: SpecDraftRow[]) {
  const filledRows = rows.filter((row) => row.value.trim());
  const sources = Array.from(
    new Set(
      filledRows
        .map((row) => row.source_type || row.source_url)
        .filter(Boolean)
    )
  );
  const sourceUrls = Array.from(
    new Set(filledRows.map((row) => row.source_url).filter(Boolean))
  );
  const lowConfidenceCount = filledRows.filter((row) => {
    const confidence = Number(row.confidence);
    return row.confidence && !Number.isNaN(confidence) && confidence < 0.6;
  }).length;
  const unreviewedCount = filledRows.filter((row) => row.status !== "approved").length;

  return {
    filledCount: filledRows.length,
    sourceLabel:
      sources[0] ||
      (product.source_url ? "product source URL" : "No spec source recorded"),
    hasMixedSources: sourceUrls.length > 1,
    lowConfidenceCount,
    unreviewedCount,
    shouldShowAdvanced: lowConfidenceCount > 0 || sourceUrls.length > 1,
  };
}

function getIssueChips(product: Product, candidates: DuplicateCandidateView[]) {
  if (product.product_verification_status === "duplicate") {
    return [{ label: "Duplicate", tone: "neutral" as const }];
  }

  if (product.product_verification_status === "rejected") {
    return [{ label: "Rejected", tone: "bad" as const }];
  }

  if (
    product.product_verification_status === "catalog_verified" &&
    isCatalogReady(product)
  ) {
    return [{ label: "Catalog verified", tone: "good" as const }];
  }

  const chips: Array<{ label: string; tone: "good" | "warn" | "bad" | "neutral" }> = [];
  const duplicateRisk = getDuplicateRisk(candidates);

  if (duplicateRisk !== "Low" && !product.duplicate_reviewed_at) {
    chips.push({ label: "Possible duplicate", tone: "warn" });
  }

  const identityIssues = getIdentityIssues(product);
  identityIssues.forEach((issue) => {
    chips.push({ label: issue, tone: "warn" });
  });
  const specSummary = getSpecsSummary(product, getSpecRows(product));
  if (specSummary.missingRecommended > 0) {
    chips.push({ label: "Missing required specs", tone: "warn" });
  } else if (!product.specs_approved_at) {
    chips.push({ label: "Specs need review", tone: "warn" });
  }
  if (!product.image_approved_at) {
    chips.push({
      label: product.image_url ? "Image approval needed" : "Image missing",
      tone: product.image_url ? "warn" : "bad",
    });
  }
  if (!product.duplicate_reviewed_at) {
    chips.push({ label: "Duplicate check needed", tone: "warn" });
  }
  if ((product.specs_confidence || 0) < 0.5 || product.enrichment_warnings?.length) {
    chips.push({ label: "Low-confidence enrichment", tone: "warn" });
  }
  if (!product.source_url && !product.product_url) {
    chips.push({ label: "Missing source", tone: "neutral" });
  }
  if (chips.length === 0 && isCatalogReady(product)) {
    chips.push({ label: "Ready to verify", tone: "good" });
  }

  return chips.slice(0, 4);
}

function getSuggestedAction(product: Product, candidates: DuplicateCandidateView[]) {
  if (product.product_verification_status === "duplicate") return "View canonical";
  if (product.product_verification_status === "rejected") return "Review rejection";
  if (getDuplicateRisk(candidates) !== "Low" && !product.duplicate_reviewed_at) {
    return "Review duplicate candidates";
  }
  if (getIdentityIssues(product).length > 0) {
    return "Approve identity";
  }
  const specSummary = getSpecsSummary(product, getSpecRows(product));
  if (specSummary.missingRecommended > 0) {
    return "Edit missing specs";
  }
  if (!product.specs_approved_at) {
    return "Approve specs";
  }
  if (!product.image_approved_at) return "Review image";
  if (!product.duplicate_reviewed_at) return "Approve duplicate check";
  if (isCatalogReady(product)) return "Approve as Catalog verified";
  return "Mark needs review";
}

function getReadyBlocker(product: Product) {
  if (!product.identity_approved_at) return "Cannot verify yet: identity needs review";
  if (!product.specs_approved_at) return "Cannot verify yet: specs need approval";
  if (!product.image_approved_at) return "Cannot verify yet: image needs approval";
  if (!product.duplicate_reviewed_at) return "Cannot verify yet: duplicate check missing";
  if (product.product_verification_status === "rejected") return "Cannot verify rejected product";
  if (product.product_verification_status === "duplicate") return "Cannot verify duplicate product";
  return "";
}

export default function AdminProductsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [pageLimit, setPageLimit] = useState(150);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [searchText, setSearchText] = useState("");
  const [queueView, setQueueView] = useState<QueueView>("needs_attention");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOption, setSortOption] = useState("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeProductId, setActiveProductId] = useState("");
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [activeTab, setActiveTab] = useState<ReviewTab>("overview");
  const [working, setWorking] = useState(false);
  const [enrichingProductId, setEnrichingProductId] = useState("");
  const [manualDrafts, setManualDrafts] = useState<
    Record<string, { name: string; brand: string; model: string; mainCategory: string; category: string; productType: string }>
  >({});
  const [specDrafts, setSpecDrafts] = useState<Record<string, SpecDraftRow[]>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});
  const [sourceNoteDrafts, setSourceNoteDrafts] = useState<Record<string, string>>({});
  const [duplicateSearches, setDuplicateSearches] = useState<Record<string, string>>({});
  const [mergeDuplicateProduct, setMergeDuplicateProduct] =
    useState<Product | null>(null);
  const [mergeCanonicalId, setMergeCanonicalId] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteValidation, setDeleteValidation] = useState<{
    loading: boolean;
    hasLinked: boolean;
    reasons: string[];
  }>({ loading: false, hasLinked: false, reasons: [] });

  async function getAdminSessionToken() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You do not have admin access.");
    const adminCheck = await checkCurrentUserIsAdmin();
    if (!adminCheck.isAdmin) throw new Error("You do not have admin access.");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) throw new Error("Admin session is missing. Log in again.");
    return session.access_token;
  }

  async function loadProducts({ clearMessage = true } = {}) {
    setLoading(true);
    if (clearMessage) setMessage("");

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

    if (!adminCheck.isAdmin) {
      setIsAdmin(false);
      setMessage("You do not have admin access.");
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, model, brand, category, product_type, main_category, main_category_slug, category_slug, product_type_slug, taxonomy_path, specs, image_url, product_verification_status, canonical_id, source_url, product_url, verified_source, external_summary, enrichment_status, suggested_title, suggested_brand, suggested_model, suggested_category, suggested_product_type, suggested_short_summary, suggested_specs, suggested_image_url, enrichment_warnings, enrichment_sources, category_confidence, specs_confidence, identity_approved_at, specs_approved_at, image_approved_at, duplicate_reviewed_at, created_at, data_source"
      )
      .order("created_at", { ascending: false })
      .range(0, pageLimit - 1);

    if (error) {
      setProducts([]);
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const loaded = (data as Product[]) || [];
    setProducts(loaded);
    setManualDrafts(
      Object.fromEntries(
        loaded.map((product) => [
          product.id,
          {
            name: product.name || "",
            brand: product.brand || "",
            model: product.model || "",
            mainCategory: product.main_category || "",
            category: product.category || "",
            productType: product.product_type || product.specs?.product_type || "",
          },
        ])
      )
    );
    setSpecDrafts(Object.fromEntries(loaded.map((product) => [product.id, getSpecRows(product)])));
    setImageDrafts(
      Object.fromEntries(
        loaded.map((product) => [
          product.id,
          product.image_url || product.suggested_image_url || "",
        ])
      )
    );
    setSourceNoteDrafts(
      Object.fromEntries(loaded.map((product) => [product.id, product.external_summary || ""]))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [pageLimit]);

  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort() as string[],
    [products]
  );

  const productMeta = useMemo(() => {
    const map = new Map<
      string,
      {
        duplicateCandidates: DuplicateCandidateView[];
        duplicateRisk: string;
        issueChips: ReturnType<typeof getIssueChips>;
        suggestedAction: string;
        specRows: SpecDraftRow[];
        missingSpecs: string[];
      }
    >();

    products.forEach((product) => {
      const duplicateCandidates = getDuplicateCandidates(
        product,
        products,
        duplicateSearches[product.id] || ""
      );
      const specRows = specDrafts[product.id] || getSpecRows(product);
      map.set(product.id, {
        duplicateCandidates,
        duplicateRisk: getDuplicateRisk(duplicateCandidates),
        issueChips: getIssueChips(product, duplicateCandidates),
        suggestedAction: getSuggestedAction(product, duplicateCandidates),
        specRows,
        missingSpecs: getMissingRecommendedSpecs(product, specRows),
      });
    });

    return map;
  }, [duplicateSearches, products, specDrafts]);

  const counts = useMemo(() => {
    const inView = (view: QueueView) =>
      products.filter((product) => productMatchesView(product, view)).length;

    return Object.fromEntries(QUEUE_VIEWS.map((view) => [view.id, inView(view.id)]));
  }, [productMeta, products]);

  function productMatchesView(product: Product, view: QueueView) {
    const meta = productMeta.get(product.id);
    const duplicateRisk = meta?.duplicateRisk || "Low";
    const specCount = meta?.specRows.length || 0;
    const importedRecently =
      new Date(product.created_at).getTime() > Date.now() - 1000 * 60 * 60 * 24 * 14;

    if (view === "all") return true;
    if (view === "catalog_verified") return product.product_verification_status === "catalog_verified";
    if (view === "duplicate") return product.product_verification_status === "duplicate";
    if (view === "rejected") return product.product_verification_status === "rejected";
    if (view === "ready_to_verify") return isCatalogReady(product) && product.product_verification_status !== "catalog_verified";
    if (view === "possible_duplicates") return duplicateRisk !== "Low" && !product.duplicate_reviewed_at;
    if (view === "missing_specs") return specCount === 0 || !product.specs_approved_at;
    if (view === "missing_images") return !product.image_url || !product.image_approved_at || isPlaceholderImage(product.image_url);
    if (view === "needs_identity") return !product.identity_approved_at || (product.category_confidence || 0) < 0.5;
    if (view === "recently_imported") return importedRecently;
    return (
      product.product_verification_status !== "catalog_verified" &&
      product.product_verification_status !== "rejected" &&
      product.product_verification_status !== "duplicate"
    );
  }

  const filteredProducts = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const haystack = [
        product.name,
        product.brand,
        product.model,
        product.category,
        product.source_url,
        product.product_url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!productMatchesView(product, queueView)) return false;
      if (search && !haystack.includes(search)) return false;
      if (categoryFilter !== "all" && product.category !== categoryFilter) return false;
      if (statusFilter !== "all" && product.product_verification_status !== statusFilter) return false;
      return true;
    });

    return [...filtered].sort((first, second) => {
      if (sortOption === "oldest") return first.created_at.localeCompare(second.created_at);
      if (sortOption === "name_az") return first.name.localeCompare(second.name);
      if (sortOption === "name_za") return second.name.localeCompare(first.name);
      if (sortOption === "issues_first") {
        return (
          (productMeta.get(second.id)?.issueChips.length || 0) -
          (productMeta.get(first.id)?.issueChips.length || 0)
        );
      }
      return second.created_at.localeCompare(first.created_at);
    });
  }, [categoryFilter, productMeta, products, queueView, searchText, sortOption, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, queueView, searchText, sortOption, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const activeProduct = products.find((product) => product.id === activeProductId) || null;
  const activeMeta = activeProduct ? productMeta.get(activeProduct.id) : null;
  const mergeCanonicalOptions = useMemo(() => {
    const search = mergeSearch.trim().toLowerCase();

    return products
      .filter(
        (product) =>
          product.id !== mergeDuplicateProduct?.id &&
          product.product_verification_status !== "duplicate"
      )
      .filter((product) => {
        if (!search) return true;
        return [
          product.name,
          product.brand,
          product.model,
          product.category,
          product.slug,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .slice(0, 40);
  }, [mergeDuplicateProduct?.id, mergeSearch, products]);

  function openMergeDialog(product: Product, canonicalId = "") {
    setMergeDuplicateProduct(product);
    setMergeCanonicalId(canonicalId);
    setMergeSearch("");
  }

  async function saveIdentity(product: Product) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const draft = manualDrafts[product.id];
      const category = draft?.category || product.category || "Other";
      const productType = draft?.productType || product.product_type || product.specs?.product_type || null;
      const mainCategory = draft?.mainCategory || product.main_category || null;

      const resolvedTax = resolveTaxonomyForProduct({
        main_category: mainCategory,
        category: category,
        product_type: productType
      });

      const specs = {
        ...(product.specs || {}),
        category: resolvedTax.category,
        product_type: resolvedTax.product_type,
      };
      const { error } = await supabase
        .from("products")
        .update({
          name: draft?.name?.trim() || product.name,
          brand: draft?.brand?.trim() || null,
          model: draft?.model?.trim() || null,
          category: resolvedTax.category,
          product_type: resolvedTax.product_type,
          main_category: resolvedTax.main_category,
          main_category_slug: resolvedTax.main_category_slug,
          category_slug: resolvedTax.category_slug,
          product_type_slug: resolvedTax.product_type_slug,
          taxonomy_path: resolvedTax.taxonomy_path,
          specs,
        })
        .eq("id", product.id);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setMessage("Identity saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save identity.");
    } finally {
      setWorking(false);
    }
  }

  async function applySuggestedIdentity(product: Product) {
    setManualDrafts((current) => ({
      ...current,
      [product.id]: {
        name: product.suggested_title || current[product.id]?.name || product.name,
        brand: product.suggested_brand || current[product.id]?.brand || product.brand || "",
        model: product.suggested_model || current[product.id]?.model || product.model || "",
        mainCategory: product.main_category || current[product.id]?.mainCategory || "",
        category: product.suggested_category || current[product.id]?.category || product.category || "",
        productType:
          product.suggested_product_type ||
          current[product.id]?.productType ||
          product.product_type ||
          product.specs?.product_type ||
          "",
      },
    }));
    setMessage("Suggested identity copied into the editor. Save it to apply.");
  }

  async function saveSpecs(product: Product) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const specs = rowsToSpecs(product, specDrafts[product.id] || []);
      const { error } = await supabase
        .from("products")
        .update({ specs, specs_confidence: 0.9 })
        .eq("id", product.id);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setMessage("Specs saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save specs.");
    } finally {
      setWorking(false);
    }
  }

  async function approveAllSpecs(product: Product) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const approvedRows = (specDrafts[product.id] || []).map((row) => ({
        ...row,
        status: "approved" as const,
      }));
      const specs = rowsToSpecs(product, approvedRows);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("products")
        .update({
          specs,
          specs_confidence: 0.9,
          specs_approved_at: now,
        })
        .eq("id", product.id);
      if (error) throw error;
      setSpecDrafts((current) => ({ ...current, [product.id]: approvedRows }));
      await loadProducts({ clearMessage: false });
      setMessage("All specs approved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not approve specs.");
    } finally {
      setWorking(false);
    }
  }

  async function saveImage(product: Product) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const imageUrl = imageDrafts[product.id]?.trim() || null;
      const { error } = await supabase
        .from("products")
        .update({
          image_url: imageUrl,
          main_image_url: imageUrl,
          image_confidence: imageUrl && !isPlaceholderImage(imageUrl) ? 0.9 : 0.2,
        })
        .eq("id", product.id);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setMessage("Image saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save image.");
    } finally {
      setWorking(false);
    }
  }

  async function saveSourceNote(product: Product) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const summary = sourceNoteDrafts[product.id]?.trim() || null;
      const { error } = await supabase
        .from("products")
        .update({
          external_summary: summary,
          external_summary_updated_at: summary ? new Date().toISOString() : null,
        })
        .eq("id", product.id);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setMessage("Source note saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save source note.");
    } finally {
      setWorking(false);
    }
  }

  async function approveProductReview(productId: string, field: "identity" | "specs" | "image" | "duplicate") {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const now = new Date().toISOString();
      const patch =
        field === "identity"
          ? { identity_approved_at: now }
          : field === "specs"
            ? { specs_approved_at: now }
            : field === "image"
              ? { image_approved_at: now }
              : { duplicate_reviewed_at: now };
      const { error } = await supabase.from("products").update(patch).eq("id", productId);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setMessage("Review approval saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not approve review.");
    } finally {
      setWorking(false);
    }
  }

  async function updateProductStatus(product: Product, status: ProductStatus) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      if (status === "catalog_verified" && !isCatalogReady(product)) {
        setMessage(getReadyBlocker(product) || "Product is not ready.");
        setWorking(false);
        return;
      }
      const { error } = await supabase
        .from("products")
        .update({
          product_verification_status: status,
          verified_source: status === "catalog_verified" ? "manual_admin_review" : null,
        })
        .eq("id", product.id);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setMessage("Product status updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update product.");
    } finally {
      setWorking(false);
    }
  }

  async function checkLinkedRecords(productId: string): Promise<{
    hasLinked: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    // 1. owned_products
    const { count: ownedCount, error: ownedErr } = await supabase
      .from("owned_products")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if (!ownedErr && ownedCount && ownedCount > 0) {
      reasons.push(`${ownedCount} owner claim(s) / owned product record(s)`);
    }

    // 2. questions & answers
    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("id")
      .eq("product_id", productId);
    if (!qErr && questions && questions.length > 0) {
      reasons.push(`${questions.length} public question(s)`);
      
      const qIds = questions.map((q) => q.id);
      const { count: answersCount, error: aErr } = await supabase
        .from("answers")
        .select("id", { count: "exact", head: true })
        .in("question_id", qIds);
      if (!aErr && answersCount && answersCount > 0) {
        reasons.push(`${answersCount} answer(s)`);
      }
    }

    // 4. direct_questions
    const { count: dqCount, error: dqErr } = await supabase
      .from("direct_questions")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if (!dqErr && dqCount && dqCount > 0) {
      reasons.push(`${dqCount} direct question(s)`);
    }

    // 5. chats & chat messages
    const { data: chats, error: chatErr } = await supabase
      .from("chats")
      .select("id")
      .eq("product_id", productId);
    if (!chatErr && chats && chats.length > 0) {
      reasons.push(`${chats.length} chat(s)`);
      
      const chatIds = chats.map((c) => c.id);
      const { count: msgCount, error: msgErr } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("chat_id", chatIds);
      if (!msgErr && msgCount && msgCount > 0) {
        reasons.push(`${msgCount} chat message(s)`);
      }
    }

    // 7. owner_product_ratings
    const { count: ratingCount, error: ratingErr } = await supabase
      .from("owner_product_ratings")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if (!ratingErr && ratingCount && ratingCount > 0) {
      reasons.push(`${ratingCount} owner rating(s)/scorecard(s)`);
    }

    // 8. reports
    const { count: reportCount, error: reportErr } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "product")
      .eq("target_id", productId);
    if (!reportErr && reportCount && reportCount > 0) {
      reasons.push(`${reportCount} report(s)`);
    }

    // 9. product_import_rows
    const { data: importRows, error: importErr } = await supabase
      .from("product_import_rows")
      .select("id")
      .or(`linked_product_id.eq.${productId},created_product_id.eq.${productId}`);
    if (!importErr && importRows && importRows.length > 0) {
      reasons.push(`${importRows.length} import row(s)`);
    }

    // 10. product_submissions
    const { count: subCount, error: subErr } = await supabase
      .from("product_submissions")
      .select("id", { count: "exact", head: true })
      .eq("linked_product_id", productId);
    if (!subErr && subCount && subCount > 0) {
      reasons.push(`${subCount} product submission(s)`);
    }

    return {
      hasLinked: reasons.length > 0,
      reasons,
    };
  }

  async function startProductDelete(product: Product) {
    setProductToDelete(product);
    setDeleteConfirmationName("");
    setDeleteValidation({ loading: true, hasLinked: false, reasons: [] });

    try {
      const { hasLinked, reasons } = await checkLinkedRecords(product.id);
      setDeleteValidation({ loading: false, hasLinked, reasons });
    } catch (error) {
      console.error(error);
      setDeleteValidation({ loading: false, hasLinked: true, reasons: ["Error checking database records"] });
    }
  }

  async function confirmProductDelete() {
    if (!productToDelete) return;
    if (deleteConfirmationName !== productToDelete.name) {
      setMessage("Product name confirmation does not match.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      await getAdminSessionToken();
      
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete.id);

      if (error) throw error;

      setProductToDelete(null);
      setActiveProductId("");
      await loadProducts({ clearMessage: false });
      setMessage(`Product "${productToDelete.name}" permanently deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete product.");
    } finally {
      setWorking(false);
    }
  }

  async function submitProductMerge() {
    if (!mergeDuplicateProduct || !mergeCanonicalId) {
      setMessage("Choose a canonical product before merging.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const token = await getAdminSessionToken();
      const response = await fetch("/api/admin/products/merge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          duplicateId: mergeDuplicateProduct.id,
          canonicalId: mergeCanonicalId,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Could not merge products.");
      }

      const duplicateName = mergeDuplicateProduct.name;
      setMergeDuplicateProduct(null);
      setMergeCanonicalId("");
      setMergeSearch("");
      setActiveProductId("");
      await loadProducts({ clearMessage: false });
      setMessage(`${duplicateName} merged into the canonical product.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not merge products.");
    } finally {
      setWorking(false);
    }
  }

  async function enrichProduct(productId: string, reloadAfter = true) {
    setMessage("");
    setEnrichingProductId(productId);
    try {
      const token = await getAdminSessionToken();
      const response = await fetch("/api/admin/enrich-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId }),
      });
      const result = (await response.json()) as { error?: string; reviewLinkCount?: number };
      if (!response.ok) throw new Error(result.error || "Could not enrich product.");
      if (reloadAfter) {
        await loadProducts({ clearMessage: false });
        setMessage(
          `Enrichment complete.${
            result.reviewLinkCount ? ` Found ${result.reviewLinkCount} source links.` : ""
          }`
        );
      }
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enrich product.");
      return false;
    } finally {
      setEnrichingProductId("");
    }
  }

  async function bulkEnrichSelected() {
    setWorking(true);
    let enriched = 0;
    let failed = 0;
    for (const id of selectedIds) {
      const ok = await enrichProduct(id, false);
      if (ok) enriched++;
      else failed++;
    }
    await loadProducts({ clearMessage: false });
    setWorking(false);
    setMessage(`Selected enrichment complete. Enriched: ${enriched}. Failed: ${failed}.`);
  }

  async function bulkMark(status: ProductStatus) {
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      const { error } = await supabase
        .from("products")
        .update({
          product_verification_status: status,
          verified_source: status === "catalog_verified" ? "manual_admin_review" : null,
        })
        .in("id", selectedIds);
      if (error) throw error;
      await loadProducts({ clearMessage: false });
      setSelectedIds([]);
      setMessage(`Updated ${selectedIds.length} selected products.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected products.");
    } finally {
      setWorking(false);
    }
  }

  async function bulkApproveReady() {
    const ready = products.filter((product) => selectedIds.includes(product.id) && isCatalogReady(product));
    const skipped = selectedIds.length - ready.length;
    setWorking(true);
    setMessage("");
    try {
      await getAdminSessionToken();
      if (ready.length > 0) {
        const { error } = await supabase
          .from("products")
          .update({
            product_verification_status: "catalog_verified",
            verified_source: "manual_admin_review",
          })
          .in(
            "id",
            ready.map((product) => product.id)
          );
        if (error) throw error;
      }
      await loadProducts({ clearMessage: false });
      setSelectedIds([]);
      setMessage(
        `Approved ${ready.length} ready products.${
          skipped ? ` ${skipped} selected products were not ready and were skipped.` : ""
        }`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not approve selected products.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading product review queue...</h1>
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
    <main className="mx-auto max-w-7xl px-5 py-10">
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-bold text-muted">Admin</p>
          <h1 className="mt-1 text-4xl font-black">Product review queue</h1>
          <p className="mt-3 max-w-3xl text-muted">
            Compact issue-first review for imported and community-created products.
            Open a product to edit identity, specs, images, duplicate checks, enrichment,
            and final status.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/product-factory" className="btn btn-dark">
            Product Factory
          </Link>
          <Link href="/admin/product-submissions" className="btn">
            Submissions
          </Link>
          <Link href="/admin/owner-verifications" className="btn">
            Owner verifications
          </Link>
        </div>
      </section>

      {message && (
        <p className="mb-5 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
          {message}
        </p>
      )}

      <section className="card p-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {QUEUE_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
                queueView === view.id ? "bg-black text-white" : "bg-slate-100 text-slate-700"
              }`}
              onClick={() => {
                setQueueView(view.id);
                setSelectedIds([]);
              }}
            >
              {view.label} ({counts[view.id] || 0})
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_160px_auto]">
          <input
            className="input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search name, brand, model, category, source URL..."
          />
          <select
            className="input"
            value={sortOption}
            onChange={(event) => setSortOption(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="issues_first">Most issues first</option>
            <option value="name_az">Name A-Z</option>
            <option value="name_za">Name Z-A</option>
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            Advanced filters
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setPageLimit((current) => current + 150)}
          >
            Load more
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              className="input"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="catalog_verified">Catalog verified</option>
              <option value="community_created">Imported / Community submitted</option>
              <option value="pending_enrichment">Pending enrichment</option>
              <option value="needs_review">Needs review</option>
              <option value="duplicate">Duplicate</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-black">{selectedIds.length} selected</p>
            <button className="btn" type="button" onClick={bulkEnrichSelected} disabled={working}>
              Run enrichment
            </button>
            <button className="btn" type="button" onClick={() => bulkMark("needs_review")} disabled={working}>
              Mark needs review
            </button>
            <button className="btn" type="button" onClick={() => bulkMark("rejected")} disabled={working}>
              Reject selected
            </button>
            <button className="btn btn-dark" type="button" onClick={bulkApproveReady} disabled={working}>
              Approve selected ready products
            </button>
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="card overflow-hidden p-0">
          <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-muted flex flex-wrap items-center justify-between gap-3">
            <p>Showing {filteredProducts.length} of {products.length} loaded products</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Prev
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button 
                  type="button" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-6">
              <h2 className="text-2xl font-black">No matching products</h2>
              <p className="mt-2 text-muted">Try another view or search.</p>
            </div>
          ) : (
            <div className="divide-y">
              {paginatedProducts.map((product) => {
                const meta = productMeta.get(product.id);
                const duplicateRisk = meta?.duplicateRisk || "Low";
                const specRows = meta?.specRows || [];
                const recommendedCount = Math.max(
                  getCategorySpecKeys(product.category).length,
                  specRows.length
                );
                const imageStatus = getImageStatus(product);
                const active = activeProductId === product.id;

                return (
                  <article
                    key={product.id}
                    className={`flex flex-col gap-3 p-4 ${active ? "bg-slate-50" : ""}`}
                  >
                    {/* Row 1: Thumbnail + Name/Status/Chips */}
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selectedIds.includes(product.id)}
                        onChange={(event) =>
                          setSelectedIds((current) =>
                            event.target.checked
                              ? [...current, product.id]
                              : current.filter((id) => id !== product.id)
                          )
                        }
                      />
                      <div className="shrink-0 h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                        <ProductImage
                          src={product.image_url}
                          category={product.category}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-black text-sm leading-snug">{product.name}</h2>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-black shrink-0 ${chipClass(product.product_verification_status === "catalog_verified" ? "good" : product.product_verification_status === "rejected" ? "bad" : "neutral")}`}>
                            {formatAdminStatus(product)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs font-bold text-muted leading-snug">
                          {product.brand || "Unknown brand"}
                        </p>
                        <p className="text-[10px] font-medium text-slate-500 leading-snug mt-0.5">
                          {[
                            product.main_category,
                            product.category,
                            product.product_type || product.specs?.product_type
                          ].filter(Boolean).join(" · ")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(meta?.issueChips || []).map((chip) => (
                            <span key={chip.label} className={`rounded-full px-2 py-0.5 text-[10px] font-black ${chipClass(chip.tone)}`}>
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Stats + Action Buttons */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pl-12 sm:pl-[calc(1rem+3.5rem+0.75rem)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-muted whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1">
                          Dupe: <strong className="text-foreground">{duplicateRisk}</strong>
                        </span>
                        <span className="text-xs font-bold text-muted whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1">
                          Specs <strong className="text-foreground">{specRows.filter((row) => row.value.trim()).length}/{recommendedCount || 1}</strong>
                        </span>
                        <span className="text-xs font-bold text-muted whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1">
                          {getImageStatusLabel(product)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto shrink-0">
                        <button
                          type="button"
                          className="btn btn-dark"
                          style={{ minHeight: "34px", padding: "6px 14px", fontSize: "0.8rem" }}
                          onClick={() => {
                            setActiveProductId(product.id);
                            setActiveTab("overview");
                          }}
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ minHeight: "34px", padding: "6px 14px", fontSize: "0.8rem" }}
                          onClick={() => {
                            setActiveProductId(product.id);
                            setActiveTab(
                              meta?.suggestedAction.includes("duplicate")
                                ? "duplicate"
                                : meta?.suggestedAction.includes("spec")
                                  ? "specs"
                                  : meta?.suggestedAction.includes("image")
                                    ? "image"
                                    : meta?.suggestedAction.includes("identity")
                                      ? "identity"
                                      : "status"
                            );
                          }}
                        >
                          {meta?.suggestedAction || "Review"}
                        </button>
                        {product.product_verification_status !== "duplicate" && (
                          <button
                            type="button"
                            className="btn"
                            style={{ minHeight: "34px", padding: "6px 14px", fontSize: "0.8rem" }}
                            onClick={() => openMergeDialog(product)}
                          >
                            Merge
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {totalPages > 1 && (
                <div className="border-t bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm font-bold text-muted">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button" 
                      className="btn px-4"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      Previous
                    </button>
                    <button 
                      type="button" 
                      className="btn px-4"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          {!activeProduct || !activeMeta ? (
            <section className="card p-6">
              <h2 className="text-2xl font-black">Review panel</h2>
              <p className="mt-2 text-muted">
                Select Review on a product row to open details without expanding the full queue.
              </p>
            </section>
          ) : (
            <section key={activeProduct.id} className="card max-h-[calc(100vh-7rem)] overflow-y-auto p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-muted">Product review</p>
                  <h2 className="mt-1 text-2xl font-black">{activeProduct.name}</h2>
                  <p className="mt-1 text-sm font-bold text-muted">
                    {activeProduct.brand || "Unknown brand"} / {activeProduct.category || "Uncategorized"}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm font-black underline"
                  onClick={() => setActiveProductId("")}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {(["overview", "identity", "specs", "image", "duplicate", "enrichment", "status"] as ReviewTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                      activeTab === tab ? "bg-black text-white" : "bg-slate-100 text-slate-700"
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {formatStatus(tab)}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <div className="mt-4 space-y-4">
                  <div className="h-56 overflow-hidden rounded-2xl bg-slate-100">
                    <ProductImage
                      src={activeProduct.image_url}
                      category={activeProduct.category}
                      alt={activeProduct.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase text-muted">Suggested next action</p>
                    <p className="mt-1 text-xl font-black">{activeMeta.suggestedAction}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeMeta.issueChips.map((chip) => (
                      <span key={chip.label} className={`rounded-full px-3 py-1 text-xs font-black ${chipClass(chip.tone)}`}>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Identity", activeProduct.identity_approved_at],
                      ["Specs", activeProduct.specs_approved_at],
                      ["Image", activeProduct.image_approved_at],
                      ["Duplicate", activeProduct.duplicate_reviewed_at],
                    ].map(([label, approved]) => (
                      <div key={label as string} className="rounded-2xl bg-slate-50 p-3">
                        <p className="font-black">{label}</p>
                        <p className={`text-sm font-bold ${approved ? "text-emerald-800" : "text-amber-800"}`}>
                          {approved ? "Approved" : "Needs review"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/product/${activeProduct.slug}`} className="btn">
                      View product
                    </Link>
                    {activeProduct.source_url && (
                      <a href={activeProduct.source_url} target="_blank" rel="noreferrer" className="btn">
                        Source
                      </a>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "identity" && (() => {
                const specRows = specDrafts[activeProduct.id] ? specDrafts[activeProduct.id] : getSpecRows(activeProduct);
                const activeTypeNormalization = getHeadphoneProductTypeNormalization({
                  name: manualDrafts[activeProduct.id]?.name || activeProduct.name,
                  category: manualDrafts[activeProduct.id]?.category || activeProduct.category,
                  productType: manualDrafts[activeProduct.id]?.productType || activeProduct.specs?.product_type,
                  specs: rowsToSpecs(activeProduct, specRows),
                });

                const activeDraft = manualDrafts[activeProduct.id] || {
                  name: activeProduct.name || "",
                  brand: activeProduct.brand || "",
                  model: activeProduct.model || "",
                  mainCategory: activeProduct.main_category || "",
                  category: activeProduct.category || "",
                  productType: activeProduct.product_type || activeProduct.specs?.product_type || "",
                };

                const selectedMainCategorySlug = activeDraft.mainCategory ? slugifyTaxonomyLabel(activeDraft.mainCategory) : "";
                const selectedCategorySlug = activeDraft.category ? slugifyTaxonomyLabel(activeDraft.category) : "";
                const selectedProductTypeSlug = activeDraft.productType ? slugifyTaxonomyLabel(activeDraft.productType) : "";

                const mainCategoriesList = Object.values(PRODUCT_TAXONOMY);
                const categoriesList = selectedMainCategorySlug ? Object.values(PRODUCT_TAXONOMY[selectedMainCategorySlug]?.categories || {}) : [];
                const productTypesList = (selectedMainCategorySlug && selectedCategorySlug) ? PRODUCT_TAXONOMY[selectedMainCategorySlug]?.categories[selectedCategorySlug]?.productTypes || [] : [];

                const updateDraftField = (key: string, value: string) => {
                  setManualDrafts((current) => {
                    const currentDraft = current[activeProduct.id] || {
                      name: activeProduct.name || "",
                      brand: activeProduct.brand || "",
                      model: activeProduct.model || "",
                      mainCategory: activeProduct.main_category || "",
                      category: activeProduct.category || "",
                      productType: activeProduct.product_type || activeProduct.specs?.product_type || "",
                    };
                    return {
                      ...current,
                      [activeProduct.id]: {
                        ...currentDraft,
                        [key]: value,
                      },
                    };
                  });
                };

                return (
                  <div className="mt-4 space-y-4">
                    {(activeProduct.suggested_title ||
                      activeProduct.suggested_brand ||
                      activeProduct.suggested_category ||
                      activeProduct.suggested_product_type) && (
                      <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">
                        Suggested: {[activeProduct.suggested_brand, activeProduct.suggested_title].filter(Boolean).join(" ")}
                        <br />
                        {[activeProduct.suggested_category, activeProduct.suggested_product_type].filter(Boolean).join(" / ")}
                        <button type="button" className="mt-3 block underline" onClick={() => applySuggestedIdentity(activeProduct)}>
                          Apply suggested identity to editor
                        </button>
                      </div>
                    )}
                        {/* Name Input */}
                        <div>
                          <label className="label">Product title</label>
                          <input
                            className="input mt-2"
                            value={activeDraft.name}
                            onChange={(e) => updateDraftField("name", e.target.value)}
                          />
                        </div>

                        {/* Brand Input */}
                        <div>
                          <label className="label">Brand</label>
                          <input
                            className="input mt-2"
                            value={activeDraft.brand}
                            onChange={(e) => updateDraftField("brand", e.target.value)}
                          />
                        </div>

                        {/* Model Input */}
                        <div>
                          <label className="label">Model / variant</label>
                          <input
                            className="input mt-2"
                            value={activeDraft.model || ""}
                            onChange={(e) => updateDraftField("model", e.target.value)}
                          />
                        </div>

                        {/* Main Category Dropdown */}
                        <div>
                          <label className="label">Main Category</label>
                          <select
                            className="input mt-2 bg-white select"
                            value={selectedMainCategorySlug}
                            onChange={(e) => {
                              const newMainSlug = e.target.value;
                              const newMainLabel = PRODUCT_TAXONOMY[newMainSlug]?.label || "";
                              
                              const oldCatSlug = selectedCategorySlug;
                              const isCatValid = newMainSlug && PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug];
                              const finalCatSlug = isCatValid ? oldCatSlug : "";
                              const finalCatLabel = isCatValid ? (PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug]?.label || "") : "";
                              
                              const oldPtSlug = selectedProductTypeSlug;
                              const isPtValid = isCatValid && PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug]?.productTypes.some(pt => pt.slug === oldPtSlug);
                              const finalPtSlug = isPtValid ? oldPtSlug : "";
                              const finalPtLabel = isPtValid ? (PRODUCT_TAXONOMY[newMainSlug]?.categories[oldCatSlug]?.productTypes.find(pt => pt.slug === oldPtSlug)?.label || "") : "";

                              setManualDrafts((current) => {
                                const currentDraft = current[activeProduct.id] || {
                                  name: activeProduct.name || "",
                                  brand: activeProduct.brand || "",
                                  model: activeProduct.model || "",
                                  mainCategory: activeProduct.main_category || "",
                                  category: activeProduct.category || "",
                                  productType: activeProduct.product_type || activeProduct.specs?.product_type || "",
                                };
                                return {
                                  ...current,
                                  [activeProduct.id]: {
                                    ...currentDraft,
                                    mainCategory: newMainLabel,
                                    category: finalCatLabel,
                                    productType: finalPtLabel || "",
                                  },
                                };
                              });
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
                            className="input mt-2 bg-white select"
                            disabled={!selectedMainCategorySlug}
                            value={selectedCategorySlug}
                            onChange={(e) => {
                              const newCatSlug = e.target.value;
                              const newCatLabel = selectedMainCategorySlug ? PRODUCT_TAXONOMY[selectedMainCategorySlug]?.categories[newCatSlug]?.label || "" : "";
                              
                              setManualDrafts((current) => {
                                const currentDraft = current[activeProduct.id] || {
                                  name: activeProduct.name || "",
                                  brand: activeProduct.brand || "",
                                  model: activeProduct.model || "",
                                  mainCategory: activeProduct.main_category || "",
                                  category: activeProduct.category || "",
                                  productType: activeProduct.product_type || activeProduct.specs?.product_type || "",
                                };
                                return {
                                  ...current,
                                  [activeProduct.id]: {
                                    ...currentDraft,
                                    category: newCatLabel,
                                    productType: "",
                                  },
                                };
                              });
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
                            className="input mt-2 bg-white select"
                            disabled={!selectedCategorySlug}
                            value={selectedProductTypeSlug}
                            onChange={(e) => {
                              const newPtSlug = e.target.value;
                              const newPtLabel = productTypesList.find(pt => pt.slug === newPtSlug)?.label || "";
                              
                              setManualDrafts((current) => {
                                const currentDraft = current[activeProduct.id] || {
                                  name: activeProduct.name || "",
                                  brand: activeProduct.brand || "",
                                  model: activeProduct.model || "",
                                  mainCategory: activeProduct.main_category || "",
                                  category: activeProduct.category || "",
                                  productType: activeProduct.product_type || activeProduct.specs?.product_type || "",
                                };
                                return {
                                  ...current,
                                  [activeProduct.id]: {
                                    ...currentDraft,
                                    productType: newPtLabel || "",
                                  },
                                };
                              });
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

                    {activeTypeNormalization.shouldApply && (
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
                        <button
                          type="button"
                          className="btn mt-3"
                          onClick={() =>
                            setManualDrafts((current) => ({
                              ...current,
                              [activeProduct.id]: {
                                ...current[activeProduct.id],
                                productType: activeTypeNormalization.derivedProductType || "",
                              },
                            }))
                          }
                        >
                          Apply suggested type
                        </button>
                      </div>
                    )}

                    {activeProduct.enrichment_warnings?.some((warning) =>
                      warning.toLowerCase().includes("product type")
                    ) && (
                      <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                        Product type may conflict with product identity. Review before approving identity.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="btn" onClick={() => saveIdentity(activeProduct)} disabled={working}>
                        Save identity
                      </button>
                      <button type="button" className="btn btn-dark" onClick={() => approveProductReview(activeProduct.id, "identity")} disabled={working}>
                        Approve identity
                      </button>
                      <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "needs_review")} disabled={working}>
                        Mark identity needs review
                      </button>
                    </div>
                  </div>
                );
              })()}

              {activeTab === "specs" && (
                <div className="mt-4 space-y-4">
                  {(() => {
                    const rows = specDrafts[activeProduct.id] || [];
                    const sourceSummary = getSpecSourceSummary(activeProduct, rows);

                    return (
                      <>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-sm font-black">
                            {sourceSummary.filledCount} specs imported
                            {sourceSummary.sourceLabel
                              ? ` from ${sourceSummary.sourceLabel}`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm font-bold text-muted">
                            Source: {activeProduct.source_url ? "product source URL" : sourceSummary.sourceLabel}
                          </p>
                          <p className="mt-1 text-sm font-bold text-muted">
                            Status:{" "}
                            {activeProduct.specs_approved_at
                              ? "Specs approved"
                              : sourceSummary.unreviewedCount > 0
                                ? "Specs need review"
                                : "Ready for approval"}
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-4">
                          <h3 className="font-black">
                            Specs
                          </h3>
                          <button
                            type="button"
                            className="text-xs font-black underline"
                            onClick={() => setIsEditingSpecs(!isEditingSpecs)}
                          >
                            {isEditingSpecs ? "Done editing" : "Edit specs"}
                          </button>
                        </div>
                        {rows.filter((row) => row.value.trim()).length === 0 ? (
                          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-muted">
                            No filled specs yet. Add a spec or use missing recommended specs below.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {getGroupedSpecs(
                              rows.map((row, index) => ({ ...row, index }))
                            ).map((group) => (
                              <div
                                key={group.label}
                                className="rounded-2xl bg-slate-50 p-3"
                              >
                                <h4 className="font-black text-sm">{group.label}</h4>
                                <div className="mt-2 space-y-1">
                                  {group.items.map((row) => (
                                    <div
                                      key={`${row.key}-${row.index}`}
                                      className={
                                        isEditingSpecs
                                          ? "mt-3 space-y-2 rounded border border-slate-200 bg-white p-2"
                                          : "flex items-start justify-between border-b border-slate-200 py-1 last:border-0"
                                      }
                                    >
                                      {isEditingSpecs ? (
                                        <>
                                          <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
                                            <input
                                              className="input text-xs"
                                              value={row.label || row.key}
                                              placeholder="Label or key"
                                              onChange={(event) =>
                                                setSpecDrafts((current) => ({
                                                  ...current,
                                                  [activeProduct.id]: (
                                                    current[activeProduct.id] || []
                                                  ).map((item, itemIndex) =>
                                                    itemIndex === row.index
                                                      ? {
                                                          ...item,
                                                          label: event.target.value,
                                                          key:
                                                            item.key ||
                                                            event.target.value
                                                              .toLowerCase()
                                                              .replace(/\s+/g, "_"),
                                                        }
                                                      : item
                                                  ),
                                                }))
                                              }
                                            />
                                            <input
                                              className="input text-xs"
                                              value={row.value}
                                              placeholder="Value"
                                              onChange={(event) =>
                                                setSpecDrafts((current) => ({
                                                  ...current,
                                                  [activeProduct.id]: (
                                                    current[activeProduct.id] || []
                                                  ).map((item, itemIndex) =>
                                                    itemIndex === row.index
                                                      ? {
                                                          ...item,
                                                          value: event.target.value,
                                                        }
                                                      : item
                                                  ),
                                                }))
                                              }
                                            />
                                            <button
                                              type="button"
                                              className="btn text-xs"
                                              onClick={() =>
                                                setSpecDrafts((current) => ({
                                                  ...current,
                                                  [activeProduct.id]: (
                                                    current[activeProduct.id] || []
                                                  ).filter(
                                                    (_item, itemIndex) =>
                                                      itemIndex !== row.index
                                                  ),
                                                }))
                                              }
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-1/3 pr-2 text-xs font-bold text-slate-500">
                                            {row.label || row.key}
                                          </span>
                                          <span className="w-2/3 text-xs text-slate-900">
                                            {row.value}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {isEditingSpecs && (
                          <details
                            className="rounded-2xl bg-slate-50 p-4"
                            open={sourceSummary.shouldShowAdvanced}
                          >
                            <summary className="cursor-pointer text-sm font-black">
                              Advanced spec metadata
                              {sourceSummary.lowConfidenceCount > 0
                                ? ` · ${sourceSummary.lowConfidenceCount} low confidence`
                                : ""}
                              {sourceSummary.hasMixedSources ? " · mixed sources" : ""}
                            </summary>
                            <div className="mt-3 space-y-3">
                              {rows.map((row, index) => (
                                <div
                                  key={`${row.key}-metadata-${index}`}
                                  className="rounded-2xl bg-white p-3"
                                >
                                  <p className="mb-2 text-sm font-black">
                                    {row.label || row.key || `Spec ${index + 1}`}
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <input
                                      className="input text-xs"
                                      value={row.key}
                                      placeholder="key"
                                      onChange={(event) =>
                                        setSpecDrafts((current) => ({
                                          ...current,
                                          [activeProduct.id]: (current[activeProduct.id] || []).map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, key: event.target.value } : item
                                          ),
                                        }))
                                      }
                                    />
                                    <input
                                      className="input text-xs"
                                      value={row.source_type}
                                      placeholder="source type"
                                      onChange={(event) =>
                                        setSpecDrafts((current) => ({
                                          ...current,
                                          [activeProduct.id]: (current[activeProduct.id] || []).map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, source_type: event.target.value } : item
                                          ),
                                        }))
                                      }
                                    />
                                    <input
                                      className="input text-xs"
                                      value={row.source_url}
                                      placeholder="source URL"
                                      onChange={(event) =>
                                        setSpecDrafts((current) => ({
                                          ...current,
                                          [activeProduct.id]: (current[activeProduct.id] || []).map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, source_url: event.target.value } : item
                                          ),
                                        }))
                                      }
                                    />
                                    <input
                                      className="input text-xs"
                                      value={row.confidence}
                                      placeholder="confidence"
                                      onChange={(event) =>
                                        setSpecDrafts((current) => ({
                                          ...current,
                                          [activeProduct.id]: (current[activeProduct.id] || []).map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, confidence: event.target.value } : item
                                          ),
                                        }))
                                      }
                                    />
                                    <select
                                      className="input sm:col-span-2 text-xs"
                                      value={row.status}
                                      onChange={(event) =>
                                        setSpecDrafts((current) => ({
                                          ...current,
                                          [activeProduct.id]: (current[activeProduct.id] || []).map((item, itemIndex) =>
                                            itemIndex === index
                                              ? { ...item, status: event.target.value as SpecDraftRow["status"] }
                                              : item
                                          ),
                                        }))
                                      }
                                    >
                                      <option value="">Unreviewed</option>
                                      <option value="needs_review">Needs review</option>
                                      <option value="approved">Approved</option>
                                    </select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </>
                    );
                  })()}

                  <details className="rounded-2xl bg-slate-50 p-4">
                    <summary className="cursor-pointer font-black">
                      {activeMeta.missingSpecs.length} missing recommended specs
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeMeta.missingSpecs.map((key) => (
                        <button
                          key={key}
                          type="button"
                          className="rounded-full bg-white px-3 py-1 text-xs font-black"
                          onClick={() =>
                            setSpecDrafts((current) => ({
                              ...current,
                              [activeProduct.id]: [
                                ...(current[activeProduct.id] || []),
                                {
                                  key,
                                  label: formatSpecLabel(key),
                                  value: "",
                                  source_url: "",
                                  confidence: "",
                                  source_type: "manual_admin_review",
                                  status: "needs_review",
                                },
                              ],
                            }))
                          }
                        >
                          Add {formatSpecLabel(key)}
                        </button>
                      ))}
                    </div>
                  </details>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setSpecDrafts((current) => ({
                          ...current,
                          [activeProduct.id]: [
                            ...(current[activeProduct.id] || []),
                            {
                              key: "",
                              label: "",
                              value: "",
                              source_url: "",
                              confidence: "",
                              source_type: "manual_admin_review",
                              status: "needs_review",
                            },
                          ],
                        }))
                      }
                    >
                      Add spec
                    </button>
                    <button type="button" className="btn" onClick={() => saveSpecs(activeProduct)} disabled={working}>
                      Save specs
                    </button>
                    <button type="button" className="btn btn-dark" onClick={() => approveAllSpecs(activeProduct)} disabled={working}>
                      Approve all specs
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "needs_review")} disabled={working}>
                      Mark specs needs review
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "image" && (
                <div className="mt-4 space-y-4">
                  <div className="h-56 overflow-hidden rounded-2xl bg-slate-100">
                    <ProductImage
                      src={imageDrafts[activeProduct.id] || activeProduct.image_url}
                      category={activeProduct.category}
                      alt={activeProduct.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="rounded-2xl bg-slate-50 p-3 text-sm font-bold">
                    {getImageStatusLabel(activeProduct)}
                  </p>
                  {activeProduct.suggested_image_url && (
                    <button
                      type="button"
                      className="text-sm font-black underline"
                      onClick={() =>
                        setImageDrafts((current) => ({
                          ...current,
                          [activeProduct.id]: activeProduct.suggested_image_url || "",
                        }))
                      }
                    >
                      Use suggested image candidate
                    </button>
                  )}
                  <input
                    className="input"
                    value={imageDrafts[activeProduct.id] || ""}
                    onChange={(event) =>
                      setImageDrafts((current) => ({
                        ...current,
                        [activeProduct.id]: event.target.value,
                      }))
                    }
                    placeholder="Image URL"
                  />
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn" onClick={() => saveImage(activeProduct)} disabled={working}>
                      Save image
                    </button>
                    <button type="button" className="btn btn-dark" onClick={() => approveProductReview(activeProduct.id, "image")} disabled={working}>
                      Approve image
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setImageDrafts((current) => ({
                          ...current,
                          [activeProduct.id]: "",
                        }))
                      }
                    >
                      Clear image
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "needs_review")} disabled={working}>
                      Mark image needs review
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "duplicate" && (
                <div className="mt-4 space-y-4">
                  <div className={`rounded-2xl p-4 ${chipClass(activeMeta.duplicateRisk === "High" ? "bad" : activeMeta.duplicateRisk === "Medium" ? "warn" : "good")}`}>
                    <p className="text-xs font-black uppercase">Duplicate risk</p>
                    <p className="mt-1 text-xl font-black">{activeMeta.duplicateRisk}</p>
                  </div>
                  <input
                    className="input"
                    value={duplicateSearches[activeProduct.id] || ""}
                    onChange={(event) =>
                      setDuplicateSearches((current) => ({
                        ...current,
                        [activeProduct.id]: event.target.value,
                      }))
                    }
                    placeholder="Search manually for duplicate products..."
                  />
                  {activeMeta.duplicateCandidates.length === 0 ? (
                    <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                      No likely matches in the loaded product set.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {activeMeta.duplicateCandidates.map((candidate) => (
                        <div key={candidate.product.id} className="rounded-2xl border p-3">
                          <div className="grid grid-cols-[56px_1fr] gap-3">
                            <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                              <ProductImage
                                src={candidate.product.image_url}
                                category={candidate.product.category}
                                alt={candidate.product.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div>
                              <p className="font-black">{candidate.product.name}</p>
                              <p className="text-xs font-bold text-muted">
                                {candidate.product.brand || "Unknown brand"} / {candidate.product.category || "Uncategorized"} / {Math.round(candidate.score * 100)}%
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {candidate.reasons.map((reason) => (
                                  <span key={reason} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-800">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                              <Link href={`/product/${candidate.product.slug}`} className="mt-2 inline-flex text-xs font-black underline">
                                View match
                              </Link>
                              <button
                                type="button"
                                className="mt-2 ml-3 text-xs font-black underline"
                                onClick={() =>
                                  openMergeDialog(
                                    activeProduct,
                                    candidate.product.id
                                  )
                                }
                              >
                                Merge into this product
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn btn-dark" onClick={() => approveProductReview(activeProduct.id, "duplicate")} disabled={working}>
                      Approve duplicate check / Not a duplicate
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "needs_review")} disabled={working}>
                      Needs review
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "rejected")} disabled={working}>
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "enrichment" && (
                <div className="mt-4 space-y-4">
                  <p className="rounded-2xl bg-slate-50 p-3 text-sm font-bold">
                    {formatEnrichmentStatus(activeProduct.enrichment_status)}
                  </p>
                  {activeProduct.enrichment_warnings?.length ? (
                    <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                      {activeProduct.enrichment_warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  {activeProduct.enrichment_sources?.length ? (
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="font-black">Enrichment sources</p>
                      {activeProduct.enrichment_sources.map((source, index) => (
                        <a
                          key={`${source.url}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block break-all text-sm font-bold underline"
                        >
                          {source.title || source.url}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    className="input min-h-28"
                    value={sourceNoteDrafts[activeProduct.id] || ""}
                    onChange={(event) =>
                      setSourceNoteDrafts((current) => ({
                        ...current,
                        [activeProduct.id]: event.target.value,
                      }))
                    }
                    placeholder="Source notes..."
                  />
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn" onClick={() => enrichProduct(activeProduct.id)} disabled={enrichingProductId === activeProduct.id}>
                      {enrichingProductId === activeProduct.id ? "Running..." : "Run enrichment"}
                    </button>
                    <button type="button" className="btn" onClick={() => saveSourceNote(activeProduct)} disabled={working}>
                      Save source note
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "needs_review")} disabled={working}>
                      Mark needs review
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "status" && (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Identity approved", activeProduct.identity_approved_at],
                      ["Specs approved", activeProduct.specs_approved_at],
                      ["Image approved", activeProduct.image_approved_at],
                      ["Duplicate checked", activeProduct.duplicate_reviewed_at],
                      ["Not rejected", activeProduct.product_verification_status !== "rejected"],
                      ["Not duplicate", activeProduct.product_verification_status !== "duplicate"],
                    ].map(([label, ok]) => (
                      <div key={label as string} className="rounded-2xl bg-slate-50 p-3">
                        <p className="font-black">{label}</p>
                        <p className={`text-sm font-bold ${ok ? "text-emerald-800" : "text-amber-800"}`}>
                          {ok ? "Ready" : "Needed"}
                        </p>
                      </div>
                    ))}
                  </div>
                  {!isCatalogReady(activeProduct) && (
                    <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                      {getReadyBlocker(activeProduct)}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={() => updateProductStatus(activeProduct, "catalog_verified")}
                      disabled={working || !isCatalogReady(activeProduct)}
                    >
                      Approve as Catalog verified
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "community_created")} disabled={working}>
                      Keep as Community-created
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "needs_review")} disabled={working}>
                      Mark needs review
                    </button>
                    <button type="button" className="btn" onClick={() => updateProductStatus(activeProduct, "rejected")} disabled={working}>
                      Reject
                    </button>
                  </div>
                </div>
              )}
              {/* Danger Zone */}
              <div className="mt-8 border-t border-red-100 pt-6">
                <h3 className="text-lg font-black text-red-600">Danger zone</h3>
                <p className="text-xs font-bold text-muted mt-1">
                  Actions below can hide the product from search or permanently remove it from the system.
                </p>
                
                <div className="mt-4 flex flex-wrap gap-3">
                  {activeProduct.product_verification_status === "rejected" ? (
                    <button
                      type="button"
                      className="btn py-2 px-4 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800"
                      onClick={() => updateProductStatus(activeProduct, "needs_review")}
                      disabled={working}
                    >
                      Restore / Un-archive product
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn py-2 px-4 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                      onClick={() => updateProductStatus(activeProduct, "rejected")}
                      disabled={working}
                    >
                      Archive / Hide product
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn py-2 px-4 text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                    onClick={() => startProductDelete(activeProduct)}
                    disabled={working}
                  >
                    Permanently delete product
                  </button>
                </div>
              </div>
            </section>
          )}
        </aside>
      </section>

      {mergeDuplicateProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-muted">
                  Merge duplicate product
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {mergeDuplicateProduct.name}
                </h2>
                <p className="mt-2 text-sm font-bold text-muted">
                  All questions, owner claims, chats, scorecards, and related
                  product links will move to the canonical product.
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-black underline"
                onClick={() => {
                  setMergeDuplicateProduct(null);
                  setMergeCanonicalId("");
                  setMergeSearch("");
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="label">Search canonical product</label>
                <input
                  className="input mt-2"
                  value={mergeSearch}
                  onChange={(event) => setMergeSearch(event.target.value)}
                  placeholder="Search by title, brand, model, category..."
                />
              </div>

              <div>
                <label className="label">Canonical product</label>
                <select
                  className="input mt-2"
                  value={mergeCanonicalId}
                  onChange={(event) => setMergeCanonicalId(event.target.value)}
                >
                  <option value="">Choose canonical product...</option>
                  {mergeCanonicalOptions.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} / {product.brand || "Unknown brand"} /{" "}
                      {product.category || "Uncategorized"}
                    </option>
                  ))}
                </select>
              </div>

              {mergeCanonicalId && (
                <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">
                  This cannot be undone from the UI. The duplicate product will
                  be marked as duplicate and linked to the selected canonical
                  product.
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={submitProductMerge}
                  disabled={working || !mergeCanonicalId}
                >
                  {working ? "Merging..." : "Merge product"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setMergeDuplicateProduct(null);
                    setMergeCanonicalId("");
                    setMergeSearch("");
                  }}
                  disabled={working}
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-red-600">
                  Permanently delete product
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {productToDelete.name}
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Warning: Deleting this product is permanent and cannot be undone. Linked records may be affected.
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-bold underline text-slate-400 hover:text-slate-600"
                onClick={() => setProductToDelete(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {deleteValidation.loading ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-center">
                  <p className="text-sm font-bold text-slate-600">
                    Checking database for linked records...
                  </p>
                </div>
              ) : deleteValidation.hasLinked ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-red-50 p-4 border border-red-200">
                    <p className="text-sm font-bold text-red-800">
                      Permanent deletion is BLOCKED.
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      This product is linked to the following records in the database:
                    </p>
                    <ul className="list-disc pl-5 mt-2 text-xs font-semibold text-red-800 space-y-1">
                      {deleteValidation.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    To preserve data integrity and prevent orphan records, you must <strong>Archive / Hide</strong> this product instead of deleting it.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="btn bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-bold"
                      onClick={() => {
                        updateProductStatus(productToDelete, "rejected");
                        setProductToDelete(null);
                      }}
                      disabled={working}
                    >
                      Archive / Hide product
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setProductToDelete(null)}
                      disabled={working}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 text-xs font-semibold text-emerald-800">
                    No linked records found. Safe to permanently delete.
                  </div>
                  
                  <div>
                    <label className="label text-slate-700 font-semibold">
                      To confirm, type the exact product name: <span className="font-bold text-slate-900 select-all">"{productToDelete.name}"</span>
                    </label>
                    <input
                      className="input mt-2 border-red-200 focus:border-red-500 focus:ring-red-500"
                      value={deleteConfirmationName}
                      onChange={(e) => setDeleteConfirmationName(e.target.value)}
                      placeholder="Type name here..."
                      disabled={working}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      className="btn py-2 px-4 bg-red-600 text-white hover:bg-red-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={confirmProductDelete}
                      disabled={working || deleteConfirmationName !== productToDelete.name}
                    >
                      {working ? "Deleting..." : "Permanently delete"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setProductToDelete(null)}
                      disabled={working}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
