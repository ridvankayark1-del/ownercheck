import { NextRequest, NextResponse } from "next/server";
import { createAuthorizedSupabaseClient } from "@/lib/adminAuth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Log in to view this question." }, { status: 401 });
    }

    const { data: question, error } = await supabase
      .from("questions")
      .select(
        "id, product_id, buyer_id, winning_owner_id, winning_answer_id, question_text, status, credit_reward, created_at, answered_at, products(slug, name, brand, category), profiles!questions_buyer_id_fkey(display_name, email), answers!answers_question_id_fkey(id, owner_id, answer_text, created_at)"
      )
      .eq("id", id)
      .single();

    if (error || !question) {
      return NextResponse.json(
        { error: error?.message || "Question not found." },
        { status: 404 }
      );
    }

    const normalizedQuestion = {
      ...question,
      products: normalizeSingle(question.products),
      profiles: normalizeSingle(question.profiles),
    };

    const { data: ownerClaim } = await supabase
      .from("owned_products")
      .select("id, verification_status")
      .eq("product_id", normalizedQuestion.product_id)
      .eq("user_id", user.id)
      .in("verification_status", [
        "photo_verified",
        "receipt_verified",
        "trusted_owner",
      ])
      .maybeSingle();

    return NextResponse.json({
      question: normalizedQuestion,
      viewer: {
        id: user.id,
        canAnswer: Boolean(ownerClaim) && normalizedQuestion.status === "open",
        isWinningOwner: normalizedQuestion.winning_owner_id === user.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load question.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { answerText } = (await request.json()) as { answerText?: string };
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Log in to answer this question." }, { status: 401 });
    }

    const { data: answer, error } = await supabase.rpc(
      "answer_public_question",
      {
        question_id_input: id,
        answer_text_input: answerText || "",
      }
    );

    if (error || !answer) {
      return NextResponse.json(
        { error: error?.message || "Could not answer this question." },
        { status: 400 }
      );
    }

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not answer this question.",
      },
      { status: 500 }
    );
  }
}
