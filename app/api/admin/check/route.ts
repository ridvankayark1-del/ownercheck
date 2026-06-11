import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const { isAdmin } = await requireDatabaseAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ isAdmin: false }, { status: 403 });
    }

    return NextResponse.json({ isAdmin: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not check admin access.",
      },
      { status: 500 }
    );
  }
}
