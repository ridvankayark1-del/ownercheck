import { NextRequest, NextResponse } from "next/server";
import { createAuthorizedSupabaseClient } from "@/lib/adminAuth";

type ProductInfo = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
};

type BuyerProfile = {
  display_name: string | null;
  email: string | null;
};

type RawOwnedProduct = {
  id: string;
  product_id: string;
  ownership_months: number | null;
  verification_status: string;
  verification_photo_url: string | null;
  rating: number | null;
  review_text: string | null;
  created_at: string;
  products: ProductInfo | ProductInfo[] | null;
};

type RawOwnerRating = {
  id: string;
  owned_product_id: string | null;
  criteria_scores: Record<string, number> | null;
  overall_rating: number | null;
  updated_at: string;
};

type RawDirectQuestion = {
  id: string;
  product_id: string | null;
  owner_id: string | null;
  chat_id: string | null;
  question_text: string;
  answer_text: string | null;
  status: string;
  credit_reward: number | null;
  created_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  answered_at: string | null;
  products: Pick<ProductInfo, "slug" | "name"> | Pick<ProductInfo, "slug" | "name">[] | null;
  profiles: BuyerProfile | BuyerProfile[] | null;
};

type RawPublicQuestion = {
  id: string;
  product_id: string;
  buyer_id: string | null;
  winning_owner_id: string | null;
  winning_answer_id: string | null;
  question_text: string;
  status: string;
  credit_reward: number | null;
  created_at: string;
  answered_at: string | null;
  products: Pick<ProductInfo, "slug" | "name"> | Pick<ProductInfo, "slug" | "name">[] | null;
  profiles: BuyerProfile | BuyerProfile[] | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Log in to view owner dashboard." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, email, credit_balance, trust_score")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { data: ownedProductsData, error: ownedProductsError } =
      await supabase
        .from("owned_products")
        .select(
          "id, product_id, ownership_months, verification_status, verification_photo_url, rating, review_text, created_at, products(slug, name, brand, category, image_url)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (ownedProductsError) {
      return NextResponse.json(
        { error: ownedProductsError.message },
        { status: 500 }
      );
    }

    const ownedProducts = ((ownedProductsData || []) as RawOwnedProduct[]).map(
      (item) => ({
        ...item,
        products: normalizeSingle(item.products),
      })
    );

    const ownedProductIds = ownedProducts.map((item) => item.id);
    const verifiedProductIds = Array.from(
      new Set(
        ownedProducts
          .filter((item) =>
            ["photo_verified", "receipt_verified", "trusted_owner"].includes(
              item.verification_status
            )
          )
          .map((item) => item.product_id)
      )
    );

    const { data: ownerRatingsData, error: ownerRatingsError } =
      ownedProductIds.length > 0
        ? await supabase
            .from("owner_product_ratings")
            .select(
              "id, owned_product_id, criteria_scores, overall_rating, updated_at"
            )
            .eq("user_id", user.id)
            .in("owned_product_id", ownedProductIds)
        : { data: [] as RawOwnerRating[], error: null };

    if (ownerRatingsError) {
      return NextResponse.json(
        { error: ownerRatingsError.message },
        { status: 500 }
      );
    }

    const ownerRatingsByClaimId = Object.fromEntries(
      ((ownerRatingsData || []) as RawOwnerRating[])
        .filter((rating) => rating.owned_product_id)
        .map((rating) => [rating.owned_product_id as string, rating])
    );

    const { data: publicQuestionsData, error: publicQuestionsError } =
      verifiedProductIds.length > 0
        ? await supabase
            .from("questions")
            .select(
              "id, product_id, buyer_id, winning_owner_id, winning_answer_id, question_text, status, credit_reward, created_at, answered_at, products(slug, name), profiles!questions_buyer_id_fkey(display_name, email)"
            )
            .in("product_id", verifiedProductIds)
            .order("created_at", { ascending: false })
        : { data: [] as RawPublicQuestion[], error: null };

    if (publicQuestionsError) {
      return NextResponse.json(
        { error: publicQuestionsError.message },
        { status: 500 }
      );
    }

    const publicQuestions = ((publicQuestionsData || []) as RawPublicQuestion[]).map(
      (question) => ({
        ...question,
        products: normalizeSingle(question.products),
        profiles: normalizeSingle(question.profiles),
      })
    );

    const { data: directQuestionsData, error: directQuestionsError } =
      await supabase
        .from("direct_questions")
        .select(
          "id, product_id, owner_id, chat_id, question_text, answer_text, status, credit_reward, created_at, accepted_at, declined_at, answered_at, products(slug, name), profiles!direct_questions_buyer_id_fkey(display_name, email)"
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

    if (directQuestionsError) {
      return NextResponse.json(
        { error: directQuestionsError.message },
        { status: 500 }
      );
    }

    const directQuestions = (
      (directQuestionsData || []) as RawDirectQuestion[]
    ).map((question) => ({
      ...question,
      products: normalizeSingle(question.products),
      profiles: normalizeSingle(question.profiles),
    }));

    const verifiedClaimCount = ownedProducts.filter((item) =>
      ["photo_verified", "receipt_verified", "trusted_owner"].includes(
        item.verification_status
      )
    ).length;
    const pendingClaimCount = ownedProducts.filter(
      (item) => item.verification_status === "photo_submitted"
    ).length;
    const unansweredDirectQuestionCount = directQuestions.filter(
      (question) => question.status === "pending"
    ).length;
    const unansweredPublicQuestionCount = publicQuestions.filter(
      (question) => question.status === "open"
    ).length;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
      ownedProducts,
      ownerRatingsByClaimId,
      publicQuestions,
      directQuestions,
      summary: {
        claimedProductCount: ownedProducts.length,
        verifiedClaimCount,
        pendingClaimCount,
        unansweredPublicQuestionCount,
        unansweredDirectQuestionCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load owner dashboard.",
      },
      { status: 500 }
    );
  }
}
