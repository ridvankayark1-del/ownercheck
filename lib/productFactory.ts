import { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProductIdentity,
  DuplicateCandidate,
  findDuplicateProducts,
  normalizeProductText,
} from "@/lib/productNormalization";
import { guardProductTaxonomy } from "@/lib/productTaxonomy";

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

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value?: string | null) {
  return (value || "").trim();
}

function titleCaseSpec(value: string) {
  return value
    .replace(/^spec:/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

    const key = isPrefixedSpec ? header.replace(/^spec:/, "") : header;

    specs[key] = cleanValue;
    items.push({
      key,
      label: titleCaseSpec(key),
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
  if (warnings.length > 0) return "needs_review";
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
    const sourceName = clean(rawRow.source_name) || null;
    const sourceUrl = clean(rawRow.source_url || rawRow.official_url || rawRow.product_url) || null;
    const officialUrl = clean(rawRow.official_url) || null;
    const productUrl = clean(rawRow.product_url || rawRow.official_url || rawRow.source_url) || null;
    const imageUrlCandidate =
      clean(rawRow.image_url_candidate || rawRow.image_url) || null;
    const taxonomy = guardProductTaxonomy({
      title: name,
      brand,
      category,
      productType: clean(rawRow.product_type) || null,
    });
    const productType = taxonomy.productType || clean(rawRow.product_type) || null;
    const warnings = [...taxonomy.warnings];

    if (!name) warnings.push("Missing product name.");
    if (!brand) warnings.push("Missing brand.");
    if (!category) warnings.push("Missing category.");

    const specs = buildSpecs(rawRow, {
      brand,
      category: taxonomy.category || category,
      model,
      product_type: productType,
      source_name: sourceName,
      source_url: sourceUrl,
    });
    const aliases = parseAliases(rawRow.aliases);
    const status = getRowStatus({
      name,
      brand,
      category,
      warnings,
    });

    return {
      row_index: index + 1,
      raw_row: rawRow,
      status,
      name,
      brand,
      model,
      category: taxonomy.category || category,
      product_type: productType,
      source_name: sourceName,
      source_url: sourceUrl,
      official_url: officialUrl,
      product_url: productUrl,
      image_url_candidate: imageUrlCandidate,
      short_summary: clean(rawRow.short_summary || rawRow.description) || null,
      specs,
      aliases,
      duplicate_candidates: [],
      duplicate_risk: 0,
      warnings: Array.from(new Set(warnings)),
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
  const identity = buildProductIdentity({
    name: row.name,
    brand: row.brand,
    model: row.model,
    category: row.category,
  });
  const sourceUrl = row.source_url || row.official_url || row.product_url || null;
  const imageUrl = row.image_url_candidate || null;
  const specs = {
    ...(row.specs || {}),
    category: row.category,
    product_type: row.product_type,
    model: row.model,
  };
  const specContainer = specs as Record<string, unknown> & { _items?: unknown };
  const specItems = Array.isArray(specContainer._items)
    ? (specContainer._items as FactorySpecItem[])
    : [];
  const summary =
    row.short_summary ||
    `${[row.brand, row.name].filter(Boolean).join(" ")} is listed for real-owner questions. Buyers can ask about comfort, durability, setup, value, and long-term ownership before buying.`;
  const sourceUrls = sourceUrl
    ? [{ title: row.source_name || "CSV import source", url: sourceUrl }]
    : [];
  const aliases = Array.from(new Set([...identity.aliases, ...row.aliases]));
  const now = new Date().toISOString();

  return {
    slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    model: row.model,
    product_type: row.product_type || row.category,
    image_url: imageUrl,
    main_image_url: imageUrl,
    product_url: row.product_url || sourceUrl,
    source_url: sourceUrl,
    created_by: adminUserId,
    normalized_title: identity.normalizedTitle,
    normalized_brand: identity.normalizedBrand || null,
    normalized_model: identity.normalizedModel || null,
    canonical_slug: identity.canonicalSlug,
    aliases,
    canonical_title: row.name,
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
    search_keywords: [row.name, row.brand, row.model, row.category, row.product_type, ...aliases].filter(Boolean),
    source_urls: sourceUrls,
    image_source_url: imageUrl ? row.source_name || "csv_import" : null,
    image_candidates: imageUrl
      ? [
          {
            url: imageUrl,
            source_url: sourceUrl || "csv_import",
            source_type: row.source_name || "csv_import",
            score: 0.65,
          },
        ]
      : [],
    image_confidence: imageUrl ? 0.65 : null,
    enrichment_confidence: sourceUrl || specItems.length > 0 ? 0.55 : 0.2,
    category_confidence: row.category ? 0.75 : 0.25,
    specs_confidence: specItems.length > 0 ? Math.min(0.9, 0.55 + specItems.length * 0.04) : 0.2,
    product_verification_status: "community_created",
    verified_source: null,
    data_source: "admin_product_factory_csv",
    ai_generated: false,
    enrichment_status: sourceUrl || specItems.length > 0 ? "source_enriched" : "not_enriched",
    enrichment_sources: sourceUrls,
    external_summary_sources: sourceUrls,
    external_summary: sourceUrl
      ? `Imported from ${row.source_name || "CSV source"} for admin review.`
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
