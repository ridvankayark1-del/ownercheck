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
      .from("direct_questions")
      .select(
        "id, product_id, buyer_id, owner_id, chat_id, question_text, answer_text, status, credit_reward, created_at, accepted_at, declined_at, answered_at, products(slug, name, brand, category), profiles!direct_questions_buyer_id_fkey(display_name, email)"
      )
      .eq("id", id)
      .single();

    if (error || !question) {
      return NextResponse.json(
        { error: error?.message || "Direct question not found." },
        { status: 404 }
      );
    }

    const normalizedQuestion = {
      ...question,
      products: normalizeSingle(question.products),
      profiles: normalizeSingle(question.profiles),
    };

    const isSelectedOwner = normalizedQuestion.owner_id === user.id;
    const isBuyer = normalizedQuestion.buyer_id === user.id;

    if (!isSelectedOwner && !isBuyer) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json({
      question: normalizedQuestion,
      viewer: {
        id: user.id,
        canAccept: isSelectedOwner && normalizedQuestion.status === "pending",
        canDecline: isSelectedOwner && normalizedQuestion.status === "pending",
        canOpenChat:
          Boolean(normalizedQuestion.chat_id) && (isSelectedOwner || isBuyer),
        isSelectedOwner,
        isBuyer,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load direct question.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { action } = (await request.json()) as { action?: "accept" | "decline" };
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Log in to manage this direct request." }, { status: 401 });
    }

    if (action === "accept") {
      const { data: chat, error } = await supabase.rpc(
        "accept_direct_question",
        {
          direct_question_id_input: id,
        }
      );

      if (error || !chat) {
        return NextResponse.json(
          { error: error?.message || "Could not accept this direct request." },
          { status: 400 }
        );
      }

      return NextResponse.json({ chat });
    }

    if (action === "decline") {
      const { data: question, error } = await supabase.rpc(
        "decline_direct_question",
        {
          direct_question_id_input: id,
        }
      );

      if (error || !question) {
        return NextResponse.json(
          { error: error?.message || "Could not decline this direct request." },
          { status: 400 }
        );
      }

      return NextResponse.json({ question });
    }

    return NextResponse.json(
      { error: "Choose accept or decline." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not manage this direct request.",
      },
      { status: 500 }
    );
  }
}
