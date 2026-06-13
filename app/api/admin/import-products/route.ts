import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import { cleanImageUrl, findProductImage } from "@/lib/productImages";
import {
  buildProductIdentity,
  findDuplicateProducts,
} from "@/lib/productNormalization";
import { resolveTaxonomyForProduct } from "@/lib/productTaxonomy";

type ImportProduct = {
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  source_url?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateProductData(name: string, brand: string, category: string) {
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
      "Would buy again",
    ],
    search_keywords: [name, brand, category, "real owner review", "buyer questions"].filter(Boolean),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { products } = (await request.json()) as {
      products?: ImportProduct[];
    };
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const { isAdmin } = await requireDatabaseAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const rows = [];

    for (const product of products || []) {
      const name = product.name?.trim();

      if (!name) {
        rows.push({ name: "", status: "failed", message: "Name is required." });
        continue;
      }

      const brand = product.brand?.trim() || "";
      const category = product.category?.trim() || "Other";
      const sourceUrl = product.source_url?.trim() || "";
      const providedImage = cleanImageUrl(product.image_url);
      const imageUrl =
        providedImage ||
        (await findProductImage({
          sourceUrl,
          category,
        }));
      const generated = generateProductData(name, brand, category);
      const identity = buildProductIdentity({ name, brand, category });
      const duplicateCandidates = await findDuplicateProducts(supabase, {
        name,
        brand,
        category,
      });
      const exactDuplicate = duplicateCandidates.find(
        (candidate) => candidate.matchType === "exact"
      );

      if (exactDuplicate) {
        rows.push({
          name,
          status: "skipped",
          message: `Exact duplicate of ${exactDuplicate.name}.`,
          slug: exactDuplicate.slug,
        });
        continue;
      }

      const resolvedTax = resolveTaxonomyForProduct({
        category: category,
        product_type: null
      });

      const { error } = await supabase.from("products").upsert(
        {
          slug: slugify(`${brand ? `${brand} ` : ""}${name}`),
          name,
          brand: brand || null,
          category: resolvedTax.category,
          image_url: imageUrl,
          product_url: sourceUrl || null,
          source_url: sourceUrl || null,
          normalized_title: identity.normalizedTitle,
          normalized_brand: identity.normalizedBrand || null,
          normalized_model: identity.normalizedModel || null,
          canonical_slug: identity.canonicalSlug,
          aliases: identity.aliases,
          canonical_title: name,
          product_type: resolvedTax.product_type || resolvedTax.category,
          main_category: resolvedTax.main_category,
          main_category_slug: resolvedTax.main_category_slug,
          category_slug: resolvedTax.category_slug,
          product_type_slug: resolvedTax.product_type_slug,
          taxonomy_path: resolvedTax.taxonomy_path,
          short_summary: generated.ai_summary,
          key_specs: {},
          main_features: [],
          best_for: ["Real-owner buying advice"],
          common_buyer_concerns: sourceUrl
            ? []
            : ["Product details need a stronger source."],
          source_urls: sourceUrl
            ? [{ title: "Admin import source", url: sourceUrl }]
            : [],
          main_image_url: imageUrl,
          image_source_url: imageUrl ? "admin_import" : null,
          image_candidates: imageUrl
            ? [
                {
                  url: imageUrl,
                  source_url: sourceUrl || "admin_import",
                  source_type: "submitted",
                  score: 0.6,
                },
              ]
            : [],
          image_confidence: imageUrl ? 0.6 : null,
          enrichment_confidence: sourceUrl ? 0.5 : 0.2,
          product_verification_status: sourceUrl
            ? "catalog_verified"
            : "user_submitted",
          verified_source: sourceUrl ? "admin_import_source_url" : null,
          enrichment_status: "not_enriched",
          data_source: "admin_import",
          ai_generated: false,
          external_product_id: null,
          ...generated,
        },
        { onConflict: "slug" }
      );

      rows.push({
        name,
        status: error ? "failed" : "imported",
        message:
          error?.message ||
          (duplicateCandidates.length > 0
            ? "Imported with possible duplicate matches for admin review."
            : "Imported."),
      });
    }

    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not import products.",
      },
      { status: 500 }
    );
  }
}
