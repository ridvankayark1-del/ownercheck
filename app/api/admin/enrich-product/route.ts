import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "reportkowalski1@gmail.com";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  source_url: string | null;
};

type BraveSearchResult = {
  title?: string;
  description?: string;
  url?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

type BraveErrorResponse = {
  message?: string;
  error?: string;
  errors?: Array<{
    detail?: string;
    message?: string;
  }>;
};

type SearchSource = {
  title: string;
  url: string;
  snippet: string;
};

type EnrichmentLink = {
  title: string;
  url: string;
};

type ProductSpecs = {
  brand: string | null;
  category: string | null;
  product_type: string | null;
  model: string | null;
  connectivity: string | null;
  battery_life: string | null;
  main_features: string[];
  best_for: string[];
  check_before_buying: string[];
};

type SignalRule = {
  keywords: string[];
  label: string;
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

const FEATURE_RULES: SignalRule[] = [
  {
    keywords: ["active noise cancellation", "noise cancelling", "noise canceling", "anc"],
    label: "Active noise cancellation",
  },
  {
    keywords: ["transparency mode", "aware mode", "ambient mode"],
    label: "Transparency or aware mode",
  },
  { keywords: ["bluetooth"], label: "Bluetooth" },
  { keywords: ["wireless"], label: "Wireless" },
  { keywords: ["usb-c"], label: "USB-C" },
  { keywords: ["xlr"], label: "XLR" },
  { keywords: ["microphone", "mic"], label: "Microphone" },
  { keywords: ["calls", "call quality"], label: "Calls" },
  { keywords: ["over-ear", "over ear"], label: "Over-ear design" },
  { keywords: ["in-ear", "in ear", "earbuds"], label: "In-ear design" },
  { keywords: ["condenser"], label: "Condenser microphone" },
  { keywords: ["dynamic microphone"], label: "Dynamic microphone" },
  { keywords: ["mirrorless"], label: "Mirrorless camera" },
  { keywords: ["4k"], label: "4K video" },
  { keywords: ["studio"], label: "Studio use" },
  { keywords: ["streaming"], label: "Streaming" },
  { keywords: ["travel"], label: "Travel use" },
  { keywords: ["gaming"], label: "Gaming" },
  { keywords: ["audio interface", "interface"], label: "Audio interface" },
  { keywords: ["lighting", "light", "led"], label: "Lighting control" },
  { keywords: ["keyboard"], label: "Keyboard layout" },
];

const BEST_FOR_RULES: SignalRule[] = [
  { keywords: ["travel"], label: "Travel" },
  { keywords: ["commute", "commuting"], label: "Commuting" },
  { keywords: ["studio"], label: "Studio work" },
  { keywords: ["streaming"], label: "Streaming" },
  { keywords: ["podcast", "podcasting"], label: "Podcasting" },
  { keywords: ["gaming"], label: "Gaming" },
  { keywords: ["calls", "call"], label: "Calls" },
  { keywords: ["video"], label: "Video" },
  { keywords: ["creator", "content creation"], label: "Content creation" },
  { keywords: ["music"], label: "Music listening" },
  { keywords: ["office", "work"], label: "Work" },
];

function createSupabaseClient(authorizationHeader: string | null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authorizationHeader
        ? {
            Authorization: authorizationHeader,
          }
        : {},
    },
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(value: string) {
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

function cleanText(value: string) {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[.\-–—:,;\s]+|[.\-–—:,;\s]+$/g, "")
    .trim();
}

function cleanProductText(product: Product, value: string) {
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

function getProductLabel(product: Product) {
  const name = product.name.trim();
  const brand = product.brand?.trim();

  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) {
    return name;
  }

  return `${brand} ${name}`;
}

function sourceMatchesReviewSignals(source: SearchSource | EnrichmentLink) {
  const haystack = `${source.title} ${source.url}`.toLowerCase();
  return REVIEW_SOURCE_SIGNALS.some((signal) => haystack.includes(signal));
}

function sortSourcesByUsefulness(firstSource: SearchSource, secondSource: SearchSource) {
  const firstIsReview = sourceMatchesReviewSignals(firstSource);
  const secondIsReview = sourceMatchesReviewSignals(secondSource);

  if (firstIsReview !== secondIsReview) {
    return firstIsReview ? -1 : 1;
  }

  return 0;
}

function extractSignals(snippets: string[], rules: SignalRule[], limit: number) {
  const haystack = snippets.join(" ").toLowerCase();
  const signals: string[] = [];

  rules.forEach((rule) => {
    if (
      rule.keywords.some((keyword) => haystack.includes(keyword)) &&
      !signals.includes(rule.label)
    ) {
      signals.push(rule.label);
    }
  });

  return signals.slice(0, limit);
}

function extractConnectivity(snippets: string[]) {
  const signals = extractSignals(
    snippets,
    [
      { keywords: ["bluetooth"], label: "Bluetooth" },
      { keywords: ["wireless"], label: "Wireless" },
      { keywords: ["wired"], label: "Wired" },
      { keywords: ["usb-c"], label: "USB-C" },
      { keywords: ["usb"], label: "USB" },
      { keywords: ["xlr"], label: "XLR" },
      { keywords: ["hdmi"], label: "HDMI" },
      { keywords: ["wi-fi", "wifi"], label: "Wi-Fi" },
      { keywords: ["3.5mm"], label: "3.5mm" },
    ],
    4
  );

  return signals.length > 0 ? signals.join(", ") : null;
}

function extractBatteryLife(snippets: string[]) {
  const haystack = snippets.join(" ");
  const batteryPatterns = [
    /(?:up to|rated for|offers|with)\s+(\d+(?:\.\d+)?\s*(?:hours|hour|hrs|hr|h))[^.]{0,60}\bbattery\b/i,
    /\bbattery\b[^.]{0,60}?(\d+(?:\.\d+)?\s*(?:hours|hour|hrs|hr|h))/i,
    /(\d+(?:\.\d+)?\s*(?:hours|hour|hrs|hr|h))[^.]{0,60}\bbattery life\b/i,
  ];

  for (const pattern of batteryPatterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1].replace(/\bhrs?\b/i, "hours"));
    }
  }

  return null;
}

function extractProductType(product: Product, snippets: string[]) {
  const haystack = `${product.category || ""} ${snippets.join(" ")}`.toLowerCase();
  const typeRules: SignalRule[] = [
    { keywords: ["headphones", "headphone"], label: "Headphones" },
    { keywords: ["earbuds", "earbud"], label: "Earbuds" },
    { keywords: ["microphone", "mic"], label: "Microphone" },
    { keywords: ["audio interface", "interface"], label: "Audio Interface" },
    { keywords: ["lighting", "light", "led"], label: "Lighting" },
    { keywords: ["keyboard"], label: "Keyboard" },
    { keywords: ["camera", "mirrorless"], label: "Camera" },
    { keywords: ["laptop", "notebook"], label: "Laptop" },
    { keywords: ["monitor", "display"], label: "Monitor" },
    { keywords: ["speaker"], label: "Speaker" },
  ];

  return typeRules.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword))
  )?.label || product.category || null;
}

function extractModel(product: Product, snippets: string[]) {
  const haystack = snippets.join(" ").toLowerCase();
  const name = product.name.trim();

  if (name && haystack.includes(name.toLowerCase())) {
    return name;
  }

  return null;
}

function getCheckBeforeBuying(product: Product, productType: string | null) {
  const haystack = `${product.category || ""} ${productType || ""}`.toLowerCase();

  if (haystack.includes("headphone") || haystack.includes("earbud")) {
    return [
      "Long-term comfort",
      "Weight",
      "Noise cancellation performance",
      "Battery life",
      "App/device compatibility",
      "Price/value",
    ];
  }

  if (haystack.includes("microphone") || haystack.includes("mic")) {
    return [
      "Room noise pickup",
      "USB/XLR compatibility",
      "Mounting/setup",
      "Voice tone",
      "Background noise",
    ];
  }

  if (haystack.includes("camera")) {
    return [
      "Autofocus",
      "Overheating",
      "Low-light performance",
      "Lens ecosystem",
      "Battery life",
    ];
  }

  if (haystack.includes("laptop") || haystack.includes("notebook")) {
    return [
      "Fan noise",
      "Battery life",
      "Performance under load",
      "Ports",
      "Screen quality",
    ];
  }

  return ["Build quality", "Long-term reliability", "Compatibility", "Price/value"];
}

function joinReadableList(items: string[]) {
  if (items.length <= 1) {
    return items[0] || "";
  }

  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function getTopFacts(items: string[], fallbackItems: string[], limit: number) {
  return [...items, ...fallbackItems]
    .filter((item, index, allItems) => allItems.indexOf(item) === index)
    .slice(0, limit);
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

function getFallbackSources(product: Product, braveSources: SearchSource[]) {
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

function buildDescription(product: Product, specs: ProductSpecs) {
  const brand = product.brand?.trim();
  const category = product.category || "product";
  const hasSpecificCategory = category.toLowerCase() !== "product";
  const productLabel = getProductLabel(product);
  const type = specs.product_type?.toLowerCase() || category.toLowerCase();
  const features = getTopFacts(
    specs.main_features,
    specs.battery_life ? [`${specs.battery_life} battery life`] : [],
    2
  );
  const useCases = specs.best_for.slice(0, 2);
  const buyingFactors = getTopFacts(
    specs.main_features,
    specs.check_before_buying,
    2
  );
  const nameIncludesBrand =
    brand && product.name.toLowerCase().includes(brand.toLowerCase());

  if (type.includes("headphone") || type.includes("earbud")) {
    const descriptor = [
      specs.connectivity?.toLowerCase(),
      specs.main_features.some((item) => item.toLowerCase().includes("over-ear"))
        ? "over-ear"
        : null,
      type.includes("earbud") ? "earbuds" : "headphones",
    ]
      .filter(Boolean)
      .join(" ");
    const focus = features.length > 0 ? ` focused on ${joinReadableList(features.map(lowerFirst))}` : "";
    const useCaseText =
      useCases.length > 0
        ? ` They are mainly suited for ${joinReadableList(useCases.map(lowerFirst))}.`
        : "";
    return `${productLabel} are ${descriptor || "headphones"}${focus}.${useCaseText}`;
  }

  if (type.includes("microphone")) {
    const useCaseText =
      useCases.length > 0
        ? joinReadableList(useCases.map(lowerFirst))
        : "vocals, podcasts, streaming or studio recording";
    return `${productLabel} is a microphone designed for ${useCaseText}. Key buying factors include ${joinReadableList(buyingFactors.map(lowerFirst))}.`;
  }

  if (type.includes("camera")) {
    const useCaseText =
      useCases.length > 0 ? joinReadableList(useCases.map(lowerFirst)) : "photo and video work";
    return `${productLabel} is a camera aimed at ${useCaseText}. Key buying factors include ${joinReadableList(buyingFactors.map(lowerFirst))}.`;
  }

  if (type.includes("audio interface")) {
    return `${productLabel} is an audio interface for recording, streaming, and connecting microphones or instruments. Key buying factors include compatibility, input/output needs, and setup.`;
  }

  if (type.includes("lighting")) {
    return `${productLabel} is a lighting product for creators, streaming, video calls, or studio setups. Key buying factors include brightness, control options, and setup space.`;
  }

  if (type.includes("keyboard")) {
    return `${productLabel} is a keyboard for everyday work, typing, or creator setups. Key buying factors include layout, comfort, connectivity, and device compatibility.`;
  }

  if (brand && !nameIncludesBrand) {
    const categoryText = hasSpecificCategory ? `a ${category}` : "listed";
    return `${product.name} is ${categoryText} from ${brand}. OwnerCheck helps buyers ask real owners about comfort, reliability, setup, and long-term value before buying.`;
  }

  if (hasSpecificCategory) {
    return `${product.name} is a ${category}. OwnerCheck helps buyers ask real owners about comfort, reliability, setup, and long-term value before buying.`;
  }

  return `${product.name} is listed on OwnerCheck so buyers can ask real owners about comfort, reliability, setup, and long-term value before buying.`;
}

function buildAiSummary(product: Product, specs: ProductSpecs) {
  const productLabel = getProductLabel(product);
  const rawType = specs.product_type || product.category || "";
  const type = rawType.toLowerCase() === "product" ? "" : rawType.toLowerCase();
  const features = getTopFacts(
    specs.main_features,
    specs.battery_life ? [`${specs.battery_life} battery life`] : [],
    4
  );
  const useCases = specs.best_for.slice(0, 4);
  const checks = specs.check_before_buying.slice(0, 4);
  const sentences = [
    type
      ? `${productLabel} ${type.includes("headphone") || type.includes("earbud") ? "are" : "is"} ${
          product.brand ? `${product.brand}'s ` : ""
        }${type}.`
      : `${productLabel} is listed on OwnerCheck for real-owner buying questions.`,
  ];

  if (features.length > 0 || useCases.length > 0) {
    const featureText =
      features.length > 0
        ? `The product is associated with ${joinReadableList(features.map(lowerFirst))}`
        : "";
    const useCaseText =
      useCases.length > 0
        ? `${features.length > 0 ? " for " : "It is likely useful for "}${joinReadableList(useCases.map(lowerFirst))}`
        : "";
    sentences.push(`${featureText}${useCaseText}.`);
  }

  sentences.push(
    `Buyers should ask real owners about ${joinReadableList(checks.map(lowerFirst))}.`
  );

  return sentences.slice(0, 3).join(" ");
}

async function searchBrave(product: Product, apiKey: string) {
  const searchQuery = `${getProductLabel(product)} official specs review pros cons`;
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
    const braveError = (await braveResponse
      .json()
      .catch(() => null)) as BraveErrorResponse | null;
    const braveMessage =
      braveError?.message ||
      braveError?.error ||
      braveError?.errors?.[0]?.detail ||
      braveError?.errors?.[0]?.message ||
      "Brave Search request failed.";

    throw new Error(
      `Brave Search request failed (${braveResponse.status}): ${braveMessage}`
    );
  }

  const braveJson = (await braveResponse.json()) as BraveSearchResponse;

  return (braveJson.web?.results || [])
    .filter((item) => item.title && item.url)
    .map((item) => ({
      title: cleanText(item.title as string),
      url: cleanText(item.url as string),
      snippet: cleanText(item.description || ""),
    }))
    .sort(sortSourcesByUsefulness);
}

function buildStarterQuestions(product: Product, specs: ProductSpecs) {
  const productLabel = getProductLabel(product);
  const bestFor = specs.best_for[0]?.toLowerCase();

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

function buildEvaluationCriteria(specs: ProductSpecs) {
  return Array.from(
    new Set([
      "Build quality",
      "Ease of use",
      "Value for money",
      ...specs.main_features.slice(0, 3),
      "Long-term satisfaction",
    ])
  ).slice(0, 6);
}

function buildSearchKeywords(product: Product, specs: ProductSpecs) {
  return Array.from(
    new Set(
      [
        product.name,
        product.brand || "",
        product.category || "",
        specs.product_type || "",
        ...specs.main_features,
        ...specs.best_for,
        "real owner review",
        "buyer questions",
      ].filter(Boolean)
    )
  ).slice(0, 12);
}

export async function POST(request: NextRequest) {
  try {
    const { productId } = (await request.json()) as { productId?: string };

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient(
      request.headers.get("authorization")
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, brand, category, source_url")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: productError?.message || "Product not found." },
        { status: 404 }
      );
    }

    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;

    if (!braveApiKey) {
      return NextResponse.json(
        { error: "Missing Brave Search environment variable." },
        { status: 500 }
      );
    }

    const originalProduct = product as Product;
    const cleanProduct: Product = {
      ...originalProduct,
      name: cleanProductText(originalProduct, originalProduct.name),
      brand: originalProduct.brand
        ? cleanProductText(originalProduct, originalProduct.brand)
        : null,
      category: originalProduct.category
        ? cleanProductText(originalProduct, originalProduct.category)
        : null,
    };

    const braveSources = await searchBrave(cleanProduct, braveApiKey);
    const snippets = braveSources
      .map((source) => source.snippet)
      .filter((snippet) => snippet.length > 20);
    const productType = extractProductType(cleanProduct, snippets);
    const specs: ProductSpecs = {
      brand: cleanProduct.brand,
      category: cleanProduct.category,
      product_type: productType,
      model: extractModel(cleanProduct, snippets),
      connectivity: extractConnectivity(snippets),
      battery_life: extractBatteryLife(snippets),
      main_features: extractSignals(snippets, FEATURE_RULES, 8),
      best_for: extractSignals(snippets, BEST_FOR_RULES, 6),
      check_before_buying: getCheckBeforeBuying(cleanProduct, productType),
    };
    const fallbackSources = getFallbackSources(cleanProduct, braveSources);
    const externalSummarySources = uniqueLinks(fallbackSources);
    const externalReviewLinks = uniqueLinks(
      braveSources.filter(sourceMatchesReviewSignals)
    );
    const description = cleanProductText(
      cleanProduct,
      buildDescription(cleanProduct, specs)
    );
    const aiSummary = cleanProductText(
      cleanProduct,
      buildAiSummary(cleanProduct, specs)
    );

    const { error: updateError } = await supabase
      .from("products")
      .update({
        description,
        ai_summary: aiSummary,
        specs,
        external_summary:
          "External source snippets were used to extract the product details and source links below.",
        common_praise: [],
        common_complaints: [],
        starter_questions: buildStarterQuestions(cleanProduct, specs),
        evaluation_criteria: buildEvaluationCriteria(specs),
        search_keywords: buildSearchKeywords(cleanProduct, specs),
        external_summary_sources: externalSummarySources,
        external_review_links: externalReviewLinks,
        external_summary_updated_at: new Date().toISOString(),
        enrichment_status: "snippet_enriched",
      })
      .eq("id", productId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      enrichmentStatus: "snippet_enriched",
      reviewLinkCount: externalReviewLinks.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not enrich product.",
      },
      { status: 500 }
    );
  }
}
