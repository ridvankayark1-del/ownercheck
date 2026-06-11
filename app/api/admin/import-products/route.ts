import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import { cleanImageUrl, findProductImage } from "@/lib/productImages";

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

      const { error } = await supabase.from("products").upsert(
        {
          slug: slugify(`${brand ? `${brand} ` : ""}${name}`),
          name,
          brand: brand || null,
          category,
          image_url: imageUrl,
          source_url: sourceUrl || null,
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
        message: error?.message || "Imported.",
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
