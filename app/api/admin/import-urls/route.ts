import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import { findProductImage } from "@/lib/productImages";
import {
  buildProductIdentity,
  findDuplicateProducts,
} from "@/lib/productNormalization";

type SupabaseClient = ReturnType<typeof createAuthorizedSupabaseClient>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferProductFromUrl(url: string, fallbackCategory: string) {
  const parsed = new URL(url);
  const hostnameParts = parsed.hostname.replace(/^www\./, "").split(".");
  const brand = titleCase(hostnameParts[0] || "Imported");
  const pathParts = parsed.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const lastUsefulPath = [...pathParts]
    .reverse()
    .find((part) => /[a-z0-9]/i.test(part));
  const rawName = lastUsefulPath || hostnameParts[0] || "Imported product";
  const name = titleCase(
    decodeURIComponent(rawName)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_+]/g, "-")
  );

  return {
    name: name || "Imported product",
    brand: brand || null,
    category: fallbackCategory || "Other",
  };
}

function buildImportedProductCopy(name: string, brand: string | null, category: string) {
  const label = brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;

  return {
    description: `${label} is listed on OwnerCheck so buyers can ask real owners about comfort, reliability, setup, and long-term value before buying.`,
    ai_summary: `${label} is ready for owner questions and product fact enrichment. Buyers can use this page to compare real-owner experience before making a purchase decision.`,
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
    ],
    search_keywords: [name, brand || "", category, "real owner review"].filter(Boolean),
  };
}

async function createUniqueSlug(
  supabase: SupabaseClient,
  baseSlug: string
) {
  let candidate = baseSlug || "imported-product";

  for (let index = 0; index < 20; index++) {
    const slug = index === 0 ? candidate : `${candidate}-${index + 1}`;
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) {
      return slug;
    }
  }

  return `${candidate}-${Date.now()}`;
}

export async function POST(request: NextRequest) {
  try {
    const { urls, category } = (await request.json()) as {
      urls?: string[];
      category?: string;
    };

    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const { isAdmin } = await requireDatabaseAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const cleanUrls = Array.from(
      new Set((urls || []).map((url) => url.trim()).filter(Boolean))
    );

    const rows = [];

    for (const url of cleanUrls) {
      try {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          rows.push({ url, status: "failed", message: "URL must be http or https." });
          continue;
        }

        const sourceUrl = parsedUrl.toString();
        const { data: existingBySource } = await supabase
          .from("products")
          .select("id, slug")
          .eq("source_url", sourceUrl)
          .maybeSingle();

        if (existingBySource) {
          rows.push({
            url,
            status: "skipped",
            message: "Product already exists for this source URL.",
            slug: existingBySource.slug,
          });
          continue;
        }

        const inferred = inferProductFromUrl(sourceUrl, category || "Other");
        const duplicateCandidates = await findDuplicateProducts(
          supabase,
          inferred
        );
        const exactDuplicate = duplicateCandidates.find(
          (candidate) => candidate.matchType === "exact"
        );

        if (exactDuplicate) {
          rows.push({
            url,
            status: "skipped",
            message: `Exact duplicate of ${exactDuplicate.name}.`,
            slug: exactDuplicate.slug,
          });
          continue;
        }

        const slug = await createUniqueSlug(
          supabase,
          slugify(`${inferred.brand ? `${inferred.brand} ` : ""}${inferred.name}`)
        );
        const copy = buildImportedProductCopy(
          inferred.name,
          inferred.brand,
          inferred.category
        );
        const identity = buildProductIdentity(inferred);
        const imageUrl = await findProductImage({
          sourceUrl,
          category: inferred.category,
        });

        const { error: insertError } = await supabase.from("products").insert({
          slug,
          name: inferred.name,
          brand: inferred.brand,
          category: inferred.category,
          image_url: imageUrl,
          product_url: sourceUrl,
          source_url: sourceUrl,
          normalized_title: identity.normalizedTitle,
          normalized_brand: identity.normalizedBrand || null,
          normalized_model: identity.normalizedModel || null,
          canonical_slug: identity.canonicalSlug,
          aliases: identity.aliases,
          canonical_title: inferred.name,
          product_type: inferred.category,
          short_summary: copy.ai_summary,
          key_specs: {},
          main_features: [],
          best_for: ["Real-owner buying advice"],
          common_buyer_concerns: [],
          source_urls: [{ title: "Admin import source", url: sourceUrl }],
          main_image_url: imageUrl,
          image_source_url: imageUrl ? "admin_url_import" : null,
          image_candidates: imageUrl
            ? [
                {
                  url: imageUrl,
                  source_url: sourceUrl,
                  source_type: "submitted",
                  score: 0.6,
                },
              ]
            : [],
          image_confidence: imageUrl ? 0.6 : null,
          enrichment_confidence: 0.5,
          product_verification_status: "catalog_verified",
          verified_source: "admin_import_source_url",
          enrichment_status: "not_enriched",
          data_source: "admin_url_import",
          ai_generated: false,
          ...copy,
        });

        if (insertError) {
          rows.push({ url, status: "failed", message: insertError.message });
        } else {
          rows.push({
            url,
            status: "created",
            message:
              duplicateCandidates.length > 0
                ? "Imported with possible duplicate matches for admin review."
                : "Imported.",
            slug,
          });
        }
      } catch (error) {
        rows.push({
          url,
          status: "failed",
          message: error instanceof Error ? error.message : "Could not import URL.",
        });
      }
    }

    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not import URLs.",
      },
      { status: 500 }
    );
  }
}
