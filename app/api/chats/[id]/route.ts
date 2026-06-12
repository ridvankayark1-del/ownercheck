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
      return NextResponse.json({ error: "Log in to view this chat." }, { status: 401 });
    }

    const { data: participant } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("chat_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!participant) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select(
        "id, direct_question_id, product_id, buyer_id, owner_id, status, created_at, updated_at, products(slug, name, brand, category, image_url), direct_questions!chats_direct_question_id_fkey(question_text, status)"
      )
      .eq("id", id)
      .single();

    if (chatError || !chat) {
      return NextResponse.json(
        { error: chatError?.message || "Chat not found." },
        { status: 404 }
      );
    }

    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("id, chat_id, sender_id, message_text, created_at, profiles(display_name, email)")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    const { data: participants, error: participantsError } = await supabase
      .from("chat_participants")
      .select("chat_id, user_id, role, profiles(display_name, email)")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });

    if (participantsError) {
      return NextResponse.json({ error: participantsError.message }, { status: 500 });
    }

    return NextResponse.json({
      chat: {
        ...chat,
        products: normalizeSingle(chat.products),
        direct_questions: normalizeSingle(chat.direct_questions),
      },
      messages: (messages || []).map((message) => ({
        ...message,
        profiles: normalizeSingle(message.profiles),
      })),
      participants: (participants || []).map((item) => ({
        ...item,
        profiles: normalizeSingle(item.profiles),
      })),
      viewer: {
        id: user.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load this chat.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { messageText } = (await request.json()) as { messageText?: string };
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Log in to send a message." }, { status: 401 });
    }

    const { data: message, error } = await supabase.rpc("send_chat_message", {
      chat_id_input: id,
      message_text_input: messageText || "",
    });

    if (error || !message) {
      return NextResponse.json(
        { error: error?.message || "Could not send this message." },
        { status: 400 }
      );
    }

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not send this message.",
      },
      { status: 500 }
    );
  }
}
