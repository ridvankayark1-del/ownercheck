import { NextRequest, NextResponse } from "next/server";
import { createAuthorizedSupabaseClient } from "@/lib/adminAuth";
import { createCommunityProduct } from "@/lib/communityProductCreation";
import {
  buildProductIdentity,
  findDuplicateProducts,
  normalizeProductText,
  scoreProductMatch,
} from "@/lib/productNormalization";

type CreateProductBody = {
  name?: string;
  brand?: string;
  category?: string;
  main_category?: string;
  product_type?: string;
  model?: string;
  product_url?: string;
  image_url?: string;
  submitForReview?: boolean;
};

type ProductSearchRow = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  canonical_title: string | null;
  normalized_title: string | null;
  normalized_brand: string | null;
  normalized_model: string | null;
  aliases: string[] | null;
  product_verification_status: string | null;
  created_at: string;
};

function isHttpUrl(value?: string | null) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function getProductDisplayName(product: ProductSearchRow) {
  if (product.canonical_title) return product.canonical_title;

  const name = normalizeProductText(product.name);
  const brand = normalizeProductText(product.brand);

  if (brand === "apple" && name.includes("airpods 3")) {
    return "Apple AirPods (3rd generation)";
  }

  return product.name;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() || "";
    const limit = Math.min(Number(searchParams.get("limit") || 8), 12);
    const cleanQuery = normalizeProductText(query);
    const supabase = createAuthorizedSupabaseClient(null);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, main_category, product_type, image_url, canonical_title, normalized_title, normalized_brand, normalized_model, aliases, product_verification_status, created_at"
      )
      .neq("product_verification_status", "rejected")
      .order("created_at", { ascending: false })
      .limit(cleanQuery ? 80 : limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as any[])
      .map((product) => {
        const haystack = normalizeProductText(
          [
            product.name,
            product.canonical_title,
            product.brand,
            product.main_category,
            product.category,
            product.product_type,
            product.normalized_title,
            product.normalized_brand,
            product.normalized_model,
            ...(Array.isArray(product.aliases) ? product.aliases : []),
          ]
            .filter(Boolean)
            .join(" ")
        );
        const fuzzyScore = cleanQuery
          ? scoreProductMatch(
              { name: query, brand: "", category: "" },
              {
                name: product.normalized_title || product.name,
                brand: product.normalized_brand || product.brand,
                model: product.normalized_model,
                category: product.category,
              }
            )
          : 0;
        const includesScore = cleanQuery && haystack.includes(cleanQuery) ? 0.95 : 0;
        const score = cleanQuery ? Math.max(fuzzyScore, includesScore) : 0.5;

        return {
          ...product,
          score,
        };
      })
      .filter((product) => !cleanQuery || product.score >= 0.28)
      .sort((first, second) => second.score - first.score)
      .slice(0, limit);

    const productIds = rows.map((product) => product.id);
    const ownerCounts = new Map<string, number>();
    const questionCounts = new Map<string, number>();
    const answerCounts = new Map<string, number>();

    if (productIds.length > 0) {
      const { data: ownedProducts } = await supabase
        .from("owned_products")
        .select("product_id, verification_status")
        .in("product_id", productIds)
        .in("verification_status", [
          "photo_verified",
          "receipt_verified",
          "trusted_owner",
        ]);

      (ownedProducts || []).forEach((item) => {
        ownerCounts.set(
          item.product_id,
          (ownerCounts.get(item.product_id) || 0) + 1
        );
      });

      const { data: questions } = await supabase
        .from("questions")
        .select("product_id, status")
        .in("product_id", productIds);

      (questions || []).forEach((item) => {
        questionCounts.set(
          item.product_id,
          (questionCounts.get(item.product_id) || 0) + 1
        );
        if (item.status === "answered") {
          answerCounts.set(
            item.product_id,
            (answerCounts.get(item.product_id) || 0) + 1
          );
        }
      });
    }

    return NextResponse.json({
      products: rows.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: getProductDisplayName(product),
        brand: product.brand,
        category: product.category,
        main_category: product.main_category,
        product_type: product.product_type,
        image_url: product.image_url,
        product_verification_status: product.product_verification_status,
        verified_owner_count: ownerCounts.get(product.id) || 0,
        public_question_count: questionCounts.get(product.id) || 0,
        public_answer_count: answerCounts.get(product.id) || 0,
        score: Number(product.score.toFixed(2)),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not search products.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateProductBody;
    const name = body.name?.trim() || "";
    const brand = body.brand?.trim() || "";
    const category = body.category?.trim() || "";
    const mainCategory = body.main_category?.trim() || null;
    const productType = body.product_type?.trim() || null;
    const model = body.model?.trim() || null;
    const productUrl = body.product_url?.trim() || null;
    const imageUrl = body.image_url?.trim() || null;

    if (!name || !brand || !category) {
      return NextResponse.json(
        { error: "Product name, brand, and category are required." },
        { status: 400 }
      );
    }

    if (!isHttpUrl(productUrl) || !isHttpUrl(imageUrl)) {
      return NextResponse.json(
        { error: "URLs must start with http or https." },
        { status: 400 }
      );
    }

    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to submit a product." },
        { status: 401 }
      );
    }

    const identity = buildProductIdentity({ name, brand, model, category });
    const duplicates = await findDuplicateProducts(supabase, {
      name,
      brand,
      model,
      category,
    });
    const exactDuplicate = duplicates.find(
      (candidate) => candidate.matchType === "exact"
    );

    if (exactDuplicate) {
      return NextResponse.json(
        {
          error: "Product already exists.",
          duplicate: exactDuplicate,
          candidates: duplicates,
        },
        { status: 409 }
      );
    }

    if (duplicates.length > 0) {
      if (body.submitForReview) {
        const { data: submission, error: submissionError } = await supabase
          .from("product_submissions")
          .insert({
            submitter_id: user.id,
            name,
            brand,
            category,
            model,
            product_url: productUrl,
            image_url: imageUrl,
            normalized_title: identity.normalizedTitle,
            normalized_brand: identity.normalizedBrand || null,
            normalized_model: identity.normalizedModel || null,
            canonical_slug: identity.canonicalSlug,
            aliases: identity.aliases,
            duplicate_candidates: duplicates,
            highest_duplicate_score: duplicates[0]?.score || null,
            enrichment_status: "not_started",
            status: "pending_review",
          })
          .select("id, status")
          .single();

        if (submissionError || !submission) {
          return NextResponse.json(
            {
              error:
                submissionError?.message ||
                "Could not submit this product for review.",
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          submission,
          candidates: duplicates,
        });
      }

      return NextResponse.json(
        {
          error: "Possible matching products found.",
          candidates: duplicates,
          requiresReview: true,
        },
        { status: 409 }
      );
    }

    const product = await createCommunityProduct(supabase, {
      name,
      brand,
      category,
      mainCategory,
      productType,
      model,
      productUrl,
      imageUrl,
      createdBy: user.id,
    });

    return NextResponse.json({
      product: {
        id: product.id,
        slug: product.slug,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not submit product.",
      },
      { status: 500 }
    );
  }
}
