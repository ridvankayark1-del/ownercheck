import { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProductIdentity,
  ProductIdentityInput,
} from "@/lib/productNormalization";
import { guardProductTaxonomy } from "@/lib/productTaxonomy";
import {
  buildCategoryDescription,
  buildCategoryOverview,
  extractCategorySpecs,
  inferCategory as inferProfileCategory,
  normalizeCategory,
  normalizeBrand as normalizeProfileBrand,
  getProductLabel,
} from "@/lib/productCategoryProfiles";
import { findProductImage, isPlaceholderImage } from "@/lib/productImages";

type ProductRecord = ProductIdentityInput & {
  id: string;
  image_url?: string | null;
  source_url?: string | null;
  product_url?: string | null;
  description?: string | null;
  identity_approved_at?: string | null;
  specs_approved_at?: string | null;
  image_approved_at?: string | null;
  specs?: any | null;
};

type ImageCandidate = {
  url: string;
  source_url: string;
  source_type: "submitted" | "open_graph" | "json_ld" | "brave_search";
  score: number;
};

type SearchSource = {
  title: string;
  url: string;
  snippet: string;
  thumbnail?: { src?: string };
  profile?: { img?: string };
};

const REVIEW_SOURCE_SIGNALS = [
  "review",
  "rtings",
  "tomsguide",
  "techradar",
  "theverge",
  "pcmag",
  "trustedreviews",
  "soundguys",
  "dpreview",
  "youtube",
];

function isSafeFetchUrl(value?: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    return (
      ["http:", "https:"].includes(url.protocol) &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(host) &&
      !host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value?: string | null) {
  return decodeHtml(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[.\-–—:,;\s]+|[.\-–—:,;\s]+$/g, "")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanProductText(product: any, value: string) {
  let cleaned = cleanText(value);

  if (product.brand) {
    const brand = product.brand.trim();
    cleaned = cleaned.replace(
      new RegExp(`\\b${escapeRegExp(brand)}\\s+${escapeRegExp(brand)}\\b`, "gi"),
      brand
    );
  }

  return cleaned;
}

function firstMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return cleanText(match?.[1]);
}

function absolutizeUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractJsonLdProducts(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: Record<string, unknown>[] = [];

  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    const object = value as Record<string, unknown>;
    const type = object["@type"];

    if (
      type === "Product" ||
      (Array.isArray(type) && type.some((item) => item === "Product"))
    ) {
      products.push(object);
    }

    if (object["@graph"]) {
      collect(object["@graph"]);
    }
  }

  for (const block of blocks) {
    try {
      collect(JSON.parse(cleanText(block[1])));
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  return products;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return cleanText(value);
  if (value && typeof value === "object" && "name" in value) {
    return cleanText(String((value as { name?: unknown }).name || ""));
  }
  return "";
}

function imageValues(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (typeof value === "object" && "url" in value) {
    return [String((value as { url?: unknown }).url || "")];
  }
  return [];
}

async function extractSourceMetadata(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "OwnerCheckBot/1.0 (+https://ownercheck.dev)",
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`Source returned ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) {
    throw new Error("Source is not an HTML page.");
  }

  const html = await response.text();
  const jsonLdProducts = extractJsonLdProducts(html);
  const firstProduct = jsonLdProducts[0] || {};
  const ogImage = firstMatch(
    html,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const title =
    stringValue(firstProduct.name) ||
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    stringValue(firstProduct.description) ||
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const brand = stringValue(firstProduct.brand);
  const model = stringValue(firstProduct.model);
  const jsonLdImages = imageValues(firstProduct.image)
    .map((url) => absolutizeUrl(url, sourceUrl))
    .filter(Boolean);
  const imageCandidates: ImageCandidate[] = [
    ...jsonLdImages.map((url) => ({
      url,
      source_url: sourceUrl,
      source_type: "json_ld" as const,
      score: 0.92,
    })),
    ...(ogImage
      ? [
          {
            url: absolutizeUrl(ogImage, sourceUrl),
            source_url: sourceUrl,
            source_type: "open_graph" as const,
            score: 0.78,
          },
        ]
      : []),
  ].filter((candidate) => candidate.url);

  return {
    title,
    description,
    brand,
    model,
    imageCandidates,
  };
}

function inferProductType(category?: string | null) {
  const value = (category || "").toLowerCase();
  if (value.includes("airpods") || value.includes("earbud")) return "Wireless earbuds";
  if (value.includes("headphone") || value.includes("headset")) return "Headphones";
  if (value.includes("bag") || value.includes("backpack")) return "Bag";
  if (value.includes("watch")) return "Watch";
  if (value.includes("camera")) return "Camera";
  return category || "Product";
}

function buildFallbackCopy(product: ProductRecord, sourcedDescription?: string) {
  const label = [product.brand, product.name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const productType = inferProductType(product.category);
  const summary =
    sourcedDescription ||
    `${label || product.name} is being prepared for real-owner questions while product details are verified.`;

  return {
    productType,
    description: summary,
    aiSummary: summary,
    starterQuestions: [
      "What should buyers know before buying this?",
      "How is it after long-term use?",
      "What is the biggest problem you noticed?",
      "Is it worth the price?",
      "Would you buy it again?",
    ],
    evaluationCriteria: [
      "Build quality",
      "Ease of use",
      "Value for money",
      "Durability",
      "Long-term satisfaction",
      "Would buy again",
    ],
    bestFor: ["Real-owner buying advice"],
    concerns: ["Product details are still being verified."],
  };
}

// Brave Search Helpers
async function searchBrave(productLabel: string, apiKey: string): Promise<SearchSource[]> {
  const searchQuery = `${productLabel} official specs review pros cons`;
  const searchUrl = new URL("https://api.search.brave.com/res/v1/web/search");
  searchUrl.searchParams.set("q", searchQuery);
  searchUrl.searchParams.set("count", "10");

  const braveResponse = await fetch(searchUrl, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!braveResponse.ok) {
    throw new Error(`Brave Search failed with status ${braveResponse.status}`);
  }

  const braveJson = await braveResponse.json();
  return (braveJson.web?.results || [])
    .filter((item: any) => item.title && item.url)
    .map((item: any) => ({
      title: cleanText(item.title),
      url: cleanText(item.url),
      snippet: cleanText(item.description || ""),
      thumbnail: item.thumbnail,
      profile: item.profile,
    }));
}

function sourceMatchesReviewSignals(source: SearchSource | { title: string; url: string }) {
  const haystack = `${source.title} ${source.url}`.toLowerCase();
  return REVIEW_SOURCE_SIGNALS.some((signal) => haystack.includes(signal));
}

function uniqueLinks(sources: SearchSource[]) {
  return sources
    .filter(
      (source, index, allSources) =>
        allSources.findIndex((item) => item.url === source.url) === index
    )
    .map((source) => ({
      title: source.title,
      url: source.url,
    }));
}

function getFallbackSources(product: any, braveSources: SearchSource[]) {
  return [
    ...(product.source_url
      ? [
          {
            title: "Submitted product source",
            url: product.source_url,
            snippet: "",
          },
        ]
      : []),
    ...braveSources,
  ].filter(
    (source, index, allSources) =>
      allSources.findIndex((item) => item.url === source.url) === index
  );
}

function getSnippetTextForInference(sources: SearchSource[]) {
  return sources
    .flatMap((source) => [source.title, source.snippet])
    .map(cleanText)
    .filter(Boolean);
}

function buildStarterQuestions(productName: string, productBrand: string | null, specs: any) {
  const productLabel = getProductLabel(productName, productBrand);
  const bestFor = specs.best_for?.[0]?.toLowerCase();

  return [
    `How has ${productLabel} held up after long-term use?`,
    bestFor
      ? `How well does it work for ${bestFor}?`
      : "What should buyers know before buying this?",
    "What are the biggest downsides you noticed?",
    "Is it comfortable and practical for everyday use?",
    "Would you buy it again at the same price?",
  ];
}

function buildEvaluationCriteria(specs: any) {
  return Array.from(
    new Set([
      "Build quality",
      "Ease of use",
      "Value for money",
      ...(specs.main_features || []).slice(0, 3),
      "Long-term satisfaction",
    ])
  ).slice(0, 6);
}

function buildSearchKeywords(productName: string, productBrand: string | null, productCategory: string | null, specs: any) {
  return Array.from(
    new Set(
      [
        productName,
        productBrand || "",
        productCategory || "",
        specs.product_type || "",
        ...(specs.main_features || []),
        ...(specs.best_for || []),
        "real owner review",
        "buyer questions",
      ].filter(Boolean)
    )
  ).slice(0, 12);
}

export async function enrichProductRecord(
  supabase: SupabaseClient,
  productId: string
) {
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (productError || !product) {
    throw productError || new Error("Product not found.");
  }

  const record = product as ProductRecord;
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;

  let update: any;

  // Track enrichment status transition
  await supabase
    .from("products")
    .update({ enrichment_status: "running", enrichment_error: null })
    .eq("id", productId)
    .neq("enrichment_status", "running");

  if (braveApiKey) {
    try {
      const cleanProduct: ProductRecord = {
        ...record,
        name: cleanProductText(record, record.name),
        brand: normalizeProfileBrand(record.brand),
        category: record.category
          ? cleanProductText(record, record.category)
          : null,
      };

      if (
        /airpods\s*3|airpods\s*\(?3rd generation\)?/i.test(cleanProduct.name)
      ) {
        cleanProduct.name = "Apple AirPods (3rd generation)";
        cleanProduct.brand = "Apple";
        cleanProduct.category = "Headphones";
      }

      const productLabel = getProductLabel(cleanProduct.name, cleanProduct.brand);
      const braveSources = await searchBrave(productLabel, braveApiKey);
      const snippets = braveSources
        .map((source) => source.snippet)
        .filter((snippet) => snippet.length > 20);
      const inferenceSnippets = getSnippetTextForInference(braveSources);
      const correctedCategory = inferProfileCategory({
        name: cleanProduct.name,
        brand: cleanProduct.brand,
        sourceUrl: cleanProduct.source_url,
        existingCategory: cleanProduct.category,
        snippets: inferenceSnippets,
      });
      const enrichedProduct = {
        ...cleanProduct,
        category: correctedCategory,
      };
      const specs = extractCategorySpecs({
        category: correctedCategory,
        name: enrichedProduct.name,
        brand: enrichedProduct.brand,
        sourceUrl: enrichedProduct.source_url,
        snippets,
      });
      const taxonomy = guardProductTaxonomy({
        title: enrichedProduct.name,
        brand: enrichedProduct.brand,
        category: correctedCategory,
        productType: specs.product_type,
      });
      specs.category = normalizeCategory(taxonomy.category);
      specs.product_type = taxonomy.productType;
      const productType = specs.product_type;
      const categoryConfidence =
        correctedCategory && correctedCategory !== "Other"
          ? Math.max(0.25, taxonomy.confidence)
          : 0.25;
      const specsConfidence = snippets.length >= 2 && taxonomy.confidence >= 0.55 ? 0.6 : 0.25;
      const fallbackSources = getFallbackSources(cleanProduct, braveSources);
      const externalSummarySources = uniqueLinks(fallbackSources);
      const externalReviewLinks = uniqueLinks(
        braveSources.filter(sourceMatchesReviewSignals)
      );
      const description = cleanProductText(
        enrichedProduct,
        buildCategoryDescription({
          name: enrichedProduct.name,
          brand: enrichedProduct.brand,
          category: correctedCategory,
          productType,
          specs,
        })
      );
      const aiSummary = cleanProductText(
        enrichedProduct,
        buildCategoryOverview({
          name: enrichedProduct.name,
          brand: enrichedProduct.brand,
          category: correctedCategory,
          productType,
          specs,
        })
      );
      const imageUrl =
        !enrichedProduct.image_url || isPlaceholderImage(enrichedProduct.image_url)
          ? await findProductImage({
              sourceUrl: enrichedProduct.source_url,
              braveResults: braveSources,
              category: correctedCategory,
            })
          : enrichedProduct.image_url;
      const safeIdentityApply =
        !record.identity_approved_at && categoryConfidence >= 0.75;
      const safeSpecsApply =
        !record.specs_approved_at && specsConfidence >= 0.55;
      const safeImageApply =
        !record.image_approved_at &&
        imageUrl &&
        !isPlaceholderImage(imageUrl);
      const nextSpecs = safeSpecsApply ? specs : record.specs || specs;
      const warnings = Array.from(
        new Set([
          ...taxonomy.warnings,
          ...(safeSpecsApply ? [] : ["Specs saved as suggestions pending review."]),
        ])
      );

      update = {
        brand: safeIdentityApply ? enrichedProduct.brand : record.brand,
        category: safeIdentityApply ? taxonomy.category : record.category,
        image_url: safeImageApply ? imageUrl : record.image_url,
        description,
        ai_summary: aiSummary,
        specs: nextSpecs,
        suggested_title: enrichedProduct.name,
        suggested_brand: enrichedProduct.brand,
        suggested_category: taxonomy.category,
        suggested_product_type: productType,
        suggested_short_summary: aiSummary,
        suggested_specs: specs,
        suggested_image_url: imageUrl,
        enrichment_warnings: warnings,
        enrichment_sources: externalSummarySources,
        external_summary:
          "External source snippets were used to extract the product details and source links below.",
        common_praise: [],
        common_complaints: [],
        starter_questions: buildStarterQuestions(enrichedProduct.name, enrichedProduct.brand || null, specs),
        evaluation_criteria: buildEvaluationCriteria(specs),
        search_keywords: buildSearchKeywords(enrichedProduct.name, enrichedProduct.brand || null, enrichedProduct.category || null, specs),
        external_summary_sources: externalSummarySources,
        external_review_links: externalReviewLinks,
        external_summary_updated_at: new Date().toISOString(),
        enrichment_status: "snippet_enriched",
        category_confidence: categoryConfidence,
        specs_confidence: specsConfidence,
        enrichment_confidence: Math.max(categoryConfidence, specsConfidence),
      };
    } catch (error) {
      // If Brave enrichment fails, fall back to basic page crawler extraction
      console.error("Brave enrichment failed, falling back to page crawler:", error);
      update = await runPageCrawlerFallback(record);
      update.enrichment_error = error instanceof Error ? error.message : "Brave enrichment failed.";
    }
  } else {
    update = await runPageCrawlerFallback(record);
  }

  const { error: rpcError } = await supabase.rpc("apply_product_enrichment", {
    product_id: productId,
    product_patch: update,
  });

  const { error: updateError } =
    rpcError && /function .*apply_product_enrichment/i.test(rpcError.message)
      ? await supabase.from("products").update(update).eq("id", productId)
      : { error: rpcError };

  if (updateError) {
    throw updateError;
  }

  return update;
}

// Fallback HTML page scraper logic
async function runPageCrawlerFallback(record: ProductRecord) {
  const sourceUrl = record.source_url || record.product_url || null;
  const identity = buildProductIdentity(record);
  const submittedImage = record.image_url
    ? [
        {
          url: record.image_url,
          source_url: "user_submitted",
          source_type: "submitted" as const,
          score: 0.55,
        },
      ]
    : [];
  let metadata: Awaited<ReturnType<typeof extractSourceMetadata>> | null = null;
  let enrichmentError: string | null = null;

  if (isSafeFetchUrl(sourceUrl)) {
    try {
      metadata = await extractSourceMetadata(sourceUrl as string);
    } catch (error) {
      enrichmentError =
        error instanceof Error ? error.message : "Could not read source URL.";
    }
  }

  let canonicalTitle = metadata?.title || record.name;
  let brand = metadata?.brand || record.brand || null;
  const model = metadata?.model || record.model || null;
  let normalizedCategory = record.category || null;

  if (/airpods\s*3|airpods\s*\(?3rd generation\)?/i.test(canonicalTitle)) {
    canonicalTitle = "Apple AirPods (3rd generation)";
    brand = "Apple";
    normalizedCategory = "Headphones";
  }

  const copy = buildFallbackCopy(
    { ...record, brand, model, category: normalizedCategory },
    metadata?.description || record.description || undefined
  );
  const taxonomy = guardProductTaxonomy({
    title: canonicalTitle,
    brand,
    category: normalizedCategory || record.category,
    productType: copy.productType,
  });
  const imageCandidates = [
    ...submittedImage,
    ...(metadata?.imageCandidates || []),
  ].sort((a, b) => b.score - a.score);
  const bestImage = imageCandidates[0];
  const confidence = metadata ? 0.72 : sourceUrl ? 0.35 : 0.2;
  const sourceUrls = sourceUrl ? [{ title: "Product source", url: sourceUrl }] : [];
  const categoryConfidence = taxonomy.confidence >= 0.75 ? taxonomy.confidence : 0.35;
  const specsConfidence = metadata && taxonomy.confidence >= 0.55 ? 0.55 : 0.2;
  const suggestedSpecs = {
    brand,
    category: taxonomy.category,
    product_type: taxonomy.productType || copy.productType,
    model,
    main_features: [],
    best_for: copy.bestFor,
    check_before_buying: copy.concerns,
  };

  return {
    name: canonicalTitle,
    brand,
    category: taxonomy.category,
    image_url: bestImage?.url || record.image_url || null,
    description: copy.description,
    ai_summary: copy.aiSummary,
    specs: suggestedSpecs,
    starter_questions: copy.starterQuestions,
    evaluation_criteria: copy.evaluationCriteria,
    search_keywords: [
      canonicalTitle,
      brand || "",
      model || "",
      normalizedCategory || "",
      ...identity.aliases,
    ].filter(Boolean),
    normalized_title: identity.normalizedTitle,
    normalized_brand: identity.normalizedBrand || null,
    normalized_model: identity.normalizedModel || null,
    canonical_slug: identity.canonicalSlug,
    aliases: identity.aliases,
    canonical_title: canonicalTitle,
    model,
    product_type: taxonomy.productType || copy.productType,
    short_summary: copy.aiSummary,
    key_specs: {},
    main_features: [],
    best_for: copy.bestFor,
    common_buyer_concerns: copy.concerns,
    source_urls: sourceUrls,
    main_image_url: bestImage?.url || record.image_url || null,
    image_source_url: bestImage?.source_url || null,
    image_candidates: imageCandidates,
    image_confidence: bestImage?.score || null,
    enrichment_confidence: confidence,
    category_confidence: categoryConfidence,
    specs_confidence: specsConfidence,
    enrichment_status: metadata ? "source_enriched" : "pending_review",
    enrichment_error: enrichmentError,
    enriched_at: new Date().toISOString(),
    suggested_title: canonicalTitle,
    suggested_brand: brand,
    suggested_model: model,
    suggested_category: taxonomy.category,
    suggested_product_type: taxonomy.productType || copy.productType,
    suggested_short_summary: copy.aiSummary,
    suggested_specs: suggestedSpecs,
    suggested_image_url: bestImage?.url || record.image_url || null,
    enrichment_warnings: taxonomy.warnings,
    enrichment_sources: sourceUrls,
    external_summary_sources: sourceUrls,
    external_summary: metadata
      ? "Product details were extracted from the submitted source URL."
      : "Basic product info is being verified.",
    external_summary_updated_at: new Date().toISOString(),
  };
}
