import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProductIdentity,
  DuplicateCandidate,
  findDuplicateProducts,
  normalizeProductText,
} from "@/lib/productNormalization";
import { formatSpecLabel, normalizeSpecKey } from "@/lib/productSpecs";
import {
  resolveTaxonomyForProduct,
  slugifyTaxonomyLabel,
  getMainCategoryBySlug,
  guardProductTaxonomy
} from "@/lib/productTaxonomy";

export type FactoryRowStatus =
  | "parsed"
  | "missing_required_fields"
  | "duplicate_found"
  | "possible_duplicate"
  | "needs_review"
  | "ready_to_publish"
  | "published"
  | "rejected"
  | "failed";

export type FactorySpecItem = {
  key: string;
  label: string;
  value: string;
  source_url: string | null;
  source_type: string | null;
  confidence: number;
  status: "approved" | "needs_review";
};

export type ParsedFactoryRow = {
  row_index: number;
  raw_row: Record<string, string>;
  status: FactoryRowStatus;
  name: string;
  brand: string;
  model: string | null;
  category: string;
  product_type: string | null;
  main_category: string;
  main_category_slug: string;
  category_slug: string;
  product_type_slug: string | null;
  taxonomy_path: Record<string, any>;
  source_name: string | null;
  source_url: string | null;
  official_url: string | null;
  product_url: string | null;
  image_url_candidate: string | null;
  short_summary: string | null;
  specs: Record<string, unknown>;
  aliases: string[];
  duplicate_candidates: DuplicateCandidate[];
  duplicate_risk: number;
  warnings: string[];
};

export type ProductImportRowRecord = ParsedFactoryRow & {
  id: string;
  batch_id: string;
  linked_product_id: string | null;
  created_product_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const NAME_KEYS = ["name", "title", "model_name"];
const CORE_KEYS = new Set([
  ...NAME_KEYS,
  "brand",
  "category",
  "main_category",
  "main_category_slug",
  "category_slug",
  "product_type_slug",
  "taxonomy_path",
  "model",
  "variant",
  "product_type",
  "source_name",
  "source_url",
  "official_url",
  "product_url",
  "image_url",
  "image_url_candidate",
  "short_summary",
  "description",
  "aliases",
  "notes",
]);
const COMMON_SPEC_KEYS = new Set([
  "type",
  "enclosure",
  "wireless",
  "transducer",
  "noise_cancelling",
  "mic",
  "battery_life",
  "connectivity",
  "weight",
]);
const PRODUCT_TYPE_CORRECTED_WARNING = "Product type corrected from specs.";
const PRODUCT_TYPE_CONFLICT_WARNING = "Product type conflicts with specs.";

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getProductTypeSlug(productType?: string | null) {
  if (!productType) return "";
  return normalizeHeader(productType);
}

const HEADPHONES_PRODUCT_TYPES = [
  "True wireless earbuds",
  "Wireless earbuds",
  "Wireless in-ear headphones",
  "In-ear headphones",
  "Wireless over-ear headphones",
  "Over-ear headphones",
  "Wireless on-ear headphones",
  "On-ear headphones",
  "Bone conduction headphones",
  "Gaming headsets",
  "Studio headphones",
  "Audiophile headphones"
];

export function getProductTypeFromSlug(slug: string) {
  return HEADPHONES_PRODUCT_TYPES.find(type => getProductTypeSlug(type) === slug) || null;
}

export function resolveProductType(row: { product_type?: string | null, suggested_product_type?: string | null, specs?: Record<string, any> | null }) {
  const derived = deriveHeadphoneProductType({
    category: row.specs?.category || "Headphones",
    specs: row.specs
  });
  return clean(row.product_type) || clean(row.suggested_product_type) || derived || null;
}

function clean(value?: string | null) {
  return (value || "").trim();
}

function normalizeLoose(value?: string | null) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function readSpecValue(specs: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = specs[key];
    if (typeof value === "string" && clean(value)) return value;
  }

  const items = Array.isArray((specs as { _items?: unknown })._items)
    ? ((specs as { _items?: unknown })._items as Array<Record<string, unknown>>)
    : [];

  for (const item of items) {
    const itemKey = normalizeLoose(String(item.key || item.label || ""));
    const match = keys.some((key) => normalizeLoose(key) === itemKey);
    const value = item.value;
    if (match && typeof value === "string" && clean(value)) return value;
  }

  return "";
}

export function deriveHeadphoneProductType(input: {
  name?: string | null;
  category?: string | null;
  productType?: string | null;
  specs?: Record<string, unknown> | null;
}) {
  const category = normalizeLoose(input.category);
  if (category !== "headphones") return clean(input.productType);

  const name = normalizeLoose(input.name);
  const specs = input.specs || {};
  const type = normalizeLoose(
    readSpecValue(specs, ["type", "spec:type", "Type"])
  );
  const wireless = normalizeLoose(
    readSpecValue(specs, ["wireless", "spec:wireless", "Wireless"])
  );

  if (type.includes("bone")) return "Bone conduction headphones";

  if (type.includes("in-ear") || type.includes("in ear") || type.includes("earbud")) {
    if (wireless.includes("truly") || wireless.includes("true wireless")) {
      return "True wireless earbuds";
    }
    if (wireless === "yes" || wireless.includes("bluetooth")) {
      return "Wireless in-ear headphones";
    }
    if (wireless === "no" || wireless.includes("wired")) {
      return "In-ear headphones";
    }
    return clean(input.productType);
  }

  if (type.includes("over-ear") || type.includes("over ear")) {
    if (wireless === "yes" || wireless.includes("bluetooth") || name.includes("wireless")) {
      return "Wireless over-ear headphones";
    }
    if (wireless === "no" || wireless.includes("wired")) {
      return "Over-ear headphones";
    }
    return clean(input.productType);
  }

  if (type.includes("on-ear") || type.includes("on ear")) {
    if (wireless === "yes" || wireless.includes("bluetooth") || name.includes("wireless")) {
      return "Wireless on-ear headphones";
    }
    if (wireless === "no" || wireless.includes("wired")) {
      return "On-ear headphones";
    }
    return clean(input.productType);
  }

  return clean(input.productType);
}

export function getHeadphoneProductTypeNormalization(input: {
  name?: string | null;
  category?: string | null;
  productType?: string | null;
  specs?: Record<string, unknown> | null;
}) {
  const derivedProductType = deriveHeadphoneProductType(input);
  const currentProductType = clean(input.productType);
  const shouldApply =
    Boolean(derivedProductType) &&
    normalizeLoose(derivedProductType) !== normalizeLoose(currentProductType);

  return {
    derivedProductType,
    currentProductType,
    shouldApply,
    hasConflict: shouldApply && Boolean(currentProductType),
  };
}

export function applyFactoryProductTypeNormalization<
  T extends {
    name: string;
    category: string;
    product_type: string | null;
    specs: Record<string, unknown>;
    warnings: string[];
    main_category?: string;
    main_category_slug?: string;
    category_slug?: string;
    product_type_slug?: string | null;
    taxonomy_path?: Record<string, any>;
  },
>(row: T): T {
  const normalization = getHeadphoneProductTypeNormalization({
    name: row.name,
    category: row.category,
    productType: row.product_type,
    specs: row.specs,
  });

  if (!normalization.shouldApply) return row;

  const warnings = Array.from(
    new Set([
      ...row.warnings.filter(
        (warning) =>
          warning !== PRODUCT_TYPE_CORRECTED_WARNING &&
          warning !== PRODUCT_TYPE_CONFLICT_WARNING
      ),
      normalization.hasConflict
        ? PRODUCT_TYPE_CONFLICT_WARNING
        : "Product type derived from specs.",
    ])
  );

  const specs: Record<string, unknown> = {
    ...row.specs,
    imported_product_type: row.product_type || null,
  };

  if (normalization.hasConflict) {
    specs.suggested_product_type = normalization.derivedProductType;
    return {
      ...row,
      specs,
      warnings,
    };
  } else {
    specs.product_type = normalization.derivedProductType;
    return {
      ...row,
      product_type: normalization.derivedProductType,
      specs,
      warnings,
    };
  }
}

function hasBlockingWarnings(warnings: string[]) {
  return warnings.some(
    (warning) =>
      warning !== PRODUCT_TYPE_CORRECTED_WARNING &&
      warning !== "Product type derived from specs." &&
      !warning.startsWith("Unknown")
  );
}

export function parseCsvRecords(csvText: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index++) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      field += '"';
      index++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") index++;
      row.push(field.trim());
      if (row.some((item) => item.length > 0)) records.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((item) => item.length > 0)) records.push(row);

  return records;
}

function getFirst(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }

  return "";
}

function parseAliases(value?: string | null) {
  return Array.from(
    new Set(
      clean(value)
        .split(/[|;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function buildSpecs(row: Record<string, string>, parsed: {
  brand: string;
  category: string;
  model: string | null;
  product_type: string | null;
  source_name: string | null;
  source_url: string | null;
}) {
  const specs: Record<string, unknown> = {
    brand: parsed.brand || null,
    category: parsed.category || null,
    product_type: parsed.product_type || null,
    model: parsed.model || null,
  };
  const items: FactorySpecItem[] = [];

  Object.entries(row).forEach(([header, value]) => {
    const cleanValue = clean(value);
    if (!cleanValue) return;

    const isPrefixedSpec = header.startsWith("spec:");
    const isSimpleSpec = COMMON_SPEC_KEYS.has(header);

    if (!isPrefixedSpec && !isSimpleSpec) return;
    if (header === "product_type") return;

    const key = isPrefixedSpec
      ? normalizeSpecKey(header)
      : normalizeSpecKey(header);

    specs[key] = cleanValue;
    items.push({
      key,
      label: formatSpecLabel(key),
      value: cleanValue,
      source_url: parsed.source_url,
      source_type: parsed.source_name || "csv_import",
      confidence: 0.75,
      status: "needs_review",
    });
  });

  specs._items = items;
  return specs;
}

function getRowStatus({
  name,
  brand,
  category,
  warnings,
}: {
  name: string;
  brand: string;
  category: string;
  warnings: string[];
}): FactoryRowStatus {
  if (!name || !brand || !category) return "missing_required_fields";
  if (hasBlockingWarnings(warnings)) return "needs_review";
  return "parsed";
}

export function parseProductFactoryCsv(csvText: string): {
  headers: string[];
  rows: ParsedFactoryRow[];
} {
  const records = parseCsvRecords(csvText);

  if (records.length < 2) {
    throw new Error("CSV must include a header row and at least one product row.");
  }

  const headers = records[0].map(normalizeHeader);
  const rows = records.slice(1).map((values, index) => {
    const rawRow = Object.fromEntries(
      headers.map((header, headerIndex) => [header, clean(values[headerIndex])])
    );
    const name = getFirst(rawRow, NAME_KEYS);
    const brand = clean(rawRow.brand);
    const model = clean(rawRow.model || rawRow.variant) || null;
    const category = clean(rawRow.category);
    const mainCategory = clean(rawRow.main_category);
    const sourceName = clean(rawRow.source_name) || null;
    const sourceUrl = clean(rawRow.source_url || rawRow.official_url || rawRow.product_url) || null;
    const officialUrl = clean(rawRow.official_url) || null;
    const productUrl = clean(rawRow.product_url || rawRow.official_url || rawRow.source_url) || null;
    const imageUrlCandidate =
      clean(rawRow.image_url_candidate || rawRow.image_url) || null;

    // Resolve taxonomy
    const taxonomy = resolveTaxonomyForProduct({
      main_category: mainCategory || null,
      category: category || null,
      product_type: clean(rawRow.product_type) || null
    });

    let productType = taxonomy.product_type;
    if (slugifyTaxonomyLabel(taxonomy.category) === "headphones") {
      const derived = deriveHeadphoneProductType({
        name,
        category: taxonomy.category,
        productType: taxonomy.product_type,
        specs: rawRow
      });
      if (derived) {
        productType = derived;
      }
    }

    const finalTax = resolveTaxonomyForProduct({
      main_category: taxonomy.main_category,
      category: taxonomy.category,
      product_type: productType
    });

    const warnings = [];
    const mainConfig = getMainCategoryBySlug(finalTax.main_category_slug);
    if (!mainConfig) {
      warnings.push(`Unknown main category: "${finalTax.main_category}".`);
    } else {
      const catConfig = mainConfig.categories[finalTax.category_slug];
      if (!catConfig) {
        warnings.push(`Unknown category: "${finalTax.category}".`);
      } else if (finalTax.product_type) {
        const hasPt = catConfig.productTypes.some(
          (pt) => slugifyTaxonomyLabel(pt.label) === finalTax.product_type_slug
        );
        if (!hasPt) {
          warnings.push(`Unknown product type: "${finalTax.product_type}".`);
        }
      }
    }

    if (!name) warnings.push("Missing product name.");
    if (!brand) warnings.push("Missing brand.");
    if (!finalTax.category) warnings.push("Missing category.");

    const specs = buildSpecs(rawRow, {
      brand,
      category: finalTax.category,
      model,
      product_type: finalTax.product_type,
      source_name: sourceName,
      source_url: sourceUrl,
    });
    const aliases = parseAliases(rawRow.aliases);

    const normalizedRow = applyFactoryProductTypeNormalization({
      name,
      brand,
      model,
      category: finalTax.category,
      product_type: finalTax.product_type,
      main_category: finalTax.main_category,
      main_category_slug: finalTax.main_category_slug,
      category_slug: finalTax.category_slug,
      product_type_slug: finalTax.product_type_slug,
      taxonomy_path: finalTax.taxonomy_path,
      source_name: sourceName,
      source_url: sourceUrl,
      official_url: officialUrl,
      product_url: productUrl,
      image_url_candidate: imageUrlCandidate,
      short_summary: clean(rawRow.short_summary || rawRow.description) || null,
      specs,
      aliases,
      warnings,
    });

    const status = getRowStatus({
      name,
      brand,
      category: normalizedRow.category,
      warnings: normalizedRow.warnings,
    });

    return {
      row_index: index + 1,
      raw_row: rawRow,
      status,
      ...normalizedRow,
      duplicate_candidates: [],
      duplicate_risk: 0,
      warnings: Array.from(new Set(normalizedRow.warnings)),
    } satisfies ParsedFactoryRow;
  });

  return { headers, rows };
}

export function summarizeFactoryRows(rows: Array<{ status: string }>) {
  return {
    total_rows: rows.length,
    ready_count: rows.filter((row) => row.status === "ready_to_publish").length,
    possible_duplicate_count: rows.filter((row) =>
      ["duplicate_found", "possible_duplicate"].includes(row.status)
    ).length,
    failed_count: rows.filter((row) =>
      ["failed", "missing_required_fields"].includes(row.status)
    ).length,
    published_count: rows.filter((row) => row.status === "published").length,
  };
}

export function getDuplicateReasons(
  row: Pick<ParsedFactoryRow, "name" | "brand" | "model" | "category" | "source_url" | "aliases">,
  candidate: DuplicateCandidate
) {
  const reasons: string[] = [];
  const rowBrand = normalizeProductText(row.brand);
  const candidateBrand = normalizeProductText(candidate.brand);
  const rowTitle = normalizeProductText(row.name);
  const candidateTitle = normalizeProductText(candidate.name);
  const rowCategory = normalizeProductText(row.category);
  const candidateCategory = normalizeProductText(candidate.category);

  if (rowBrand && rowBrand === candidateBrand) reasons.push("same brand");
  if (rowCategory && rowCategory === candidateCategory) reasons.push("same category");
  if (rowTitle && candidateTitle.includes(rowTitle)) {
    reasons.push("existing title contains row title");
  }
  if (candidateTitle && rowTitle.includes(candidateTitle)) {
    reasons.push("row title contains existing title");
  }
  if (
    row.aliases?.some((alias) =>
      normalizeProductText(alias).includes(candidateTitle)
    )
  ) {
    reasons.push("alias match");
  }

  return reasons.length > 0 ? reasons : ["similar normalized identity"];
}

export async function runFactoryDuplicateCheck(
  supabase: SupabaseClient,
  row: Pick<
    ParsedFactoryRow,
    "name" | "brand" | "model" | "category" | "source_url" | "aliases"
  >
) {
  const candidates = await findDuplicateProducts(supabase, {
    name: row.name,
    brand: row.brand,
    model: row.model,
    category: row.category,
  });
  const topScore = candidates[0]?.score || 0;
  const exact = candidates.find((candidate) => candidate.matchType === "exact");
  const status: FactoryRowStatus = exact
    ? "duplicate_found"
    : topScore >= 0.48
      ? "possible_duplicate"
      : "ready_to_publish";

  return {
    status,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      reasons: getDuplicateReasons(row, candidate),
    })),
    risk: topScore,
  };
}

export function buildFactoryProductInsert(
  row: ProductImportRowRecord,
  slug: string,
  adminUserId: string,
  options: { approveDuplicate?: boolean; approveSpecs?: boolean; approveImage?: boolean } = {}
) {
  const normalizedRow = applyFactoryProductTypeNormalization(row);
  const identity = buildProductIdentity({
    name: normalizedRow.name,
    brand: normalizedRow.brand,
    model: normalizedRow.model,
    category: normalizedRow.category,
  });
  const sourceUrl =
    normalizedRow.source_url ||
    normalizedRow.official_url ||
    normalizedRow.product_url ||
    null;
  const imageUrl = normalizedRow.image_url_candidate || null;
  const resolvedProductType = resolveProductType(normalizedRow);

  const finalTax = resolveTaxonomyForProduct({
    main_category: normalizedRow.main_category,
    category: normalizedRow.category,
    product_type: resolvedProductType
  });

  const specs = {
    ...(normalizedRow.specs || {}),
    category: finalTax.category,
    product_type: finalTax.product_type,
    model: normalizedRow.model,
  };
  const specContainer = specs as Record<string, unknown> & { _items?: unknown };
  const specItems = Array.isArray(specContainer._items)
    ? (specContainer._items as FactorySpecItem[])
    : [];
  const summary =
    normalizedRow.short_summary ||
    `${[normalizedRow.brand, normalizedRow.name].filter(Boolean).join(" ")} is listed for real-owner questions. Buyers can ask about comfort, durability, setup, value, and long-term ownership before buying.`;
  const sourceUrls = sourceUrl
    ? [{ title: normalizedRow.source_name || "CSV import source", url: sourceUrl }]
    : [];
  const aliases = Array.from(new Set([...identity.aliases, ...normalizedRow.aliases]));
  const now = new Date().toISOString();

  return {
    slug,
    name: normalizedRow.name,
    brand: normalizedRow.brand,
    category: finalTax.category,
    model: normalizedRow.model,
    product_type: finalTax.product_type || finalTax.category,
    main_category: finalTax.main_category,
    main_category_slug: finalTax.main_category_slug,
    category_slug: finalTax.category_slug,
    product_type_slug: finalTax.product_type_slug,
    taxonomy_path: finalTax.taxonomy_path,
    image_url: imageUrl,
    main_image_url: imageUrl,
    product_url: normalizedRow.product_url || sourceUrl,
    source_url: sourceUrl,
    created_by: adminUserId,
    normalized_title: identity.normalizedTitle,
    normalized_brand: identity.normalizedBrand || null,
    normalized_model: identity.normalizedModel || null,
    canonical_slug: identity.canonicalSlug,
    aliases,
    canonical_title: normalizedRow.name,
    short_summary: summary,
    description: summary,
    ai_summary: summary,
    specs,
    key_specs: Object.fromEntries(
      specItems.slice(0, 8).map((item) => [item.key, item.value])
    ),
    main_features: [],
    best_for: ["Real-owner buying advice"],
    common_buyer_concerns: [
      "Ask verified owners about long-term comfort, quality, and value.",
    ],
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
      normalizedRow.name,
      normalizedRow.brand,
      normalizedRow.model,
      finalTax.category,
      finalTax.product_type,
      ...aliases,
    ].filter(Boolean),
    source_urls: sourceUrls,
    image_source_url: imageUrl ? normalizedRow.source_name || "csv_import" : null,
    image_candidates: imageUrl
      ? [
          {
            url: imageUrl,
            source_url: sourceUrl || "csv_import",
            source_type: normalizedRow.source_name || "csv_import",
            score: 0.65,
          },
        ]
      : [],
    image_confidence: imageUrl ? 0.65 : null,
    enrichment_confidence: sourceUrl || specItems.length > 0 ? 0.55 : 0.2,
    category_confidence: finalTax.category ? 0.75 : 0.25,
    specs_confidence: specItems.length > 0 ? Math.min(0.9, 0.55 + specItems.length * 0.04) : 0.2,
    product_verification_status: "community_created",
    verified_source: null,
    data_source: "admin_product_factory_csv",
    ai_generated: false,
    enrichment_status: sourceUrl || specItems.length > 0 ? "source_enriched" : "not_enriched",
    enrichment_sources: sourceUrls,
    external_summary_sources: sourceUrls,
    external_summary: sourceUrl
      ? `Imported from ${normalizedRow.source_name || "CSV source"} for admin review.`
      : "Imported from CSV for admin review.",
    external_summary_updated_at: now,
    specs_approved_at: options.approveSpecs ? now : null,
    specs_approved_by: options.approveSpecs ? adminUserId : null,
    image_approved_at: options.approveImage ? now : null,
    image_approved_by: options.approveImage ? adminUserId : null,
    duplicate_reviewed_at: options.approveDuplicate ? now : null,
    duplicate_reviewed_by: options.approveDuplicate ? adminUserId : null,
  };
}
