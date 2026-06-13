import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const supabase = createAuthorizedSupabaseClient(
    request.headers.get("authorization")
  );
  const { isAdmin, user } = await requireDatabaseAdmin(supabase);

  if (!isAdmin || !user) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    canonicalId?: string;
    duplicateId?: string;
  } | null;

  const canonicalId = body?.canonicalId;
  const duplicateId = body?.duplicateId;

  if (!canonicalId || !duplicateId) {
    return NextResponse.json(
      { error: "Choose both products before merging." },
      { status: 400 }
    );
  }

  if (canonicalId === duplicateId) {
    return NextResponse.json(
      { error: "Canonical and duplicate products must be different." },
      { status: 400 }
    );
  }

  const { error } = await supabase.rpc("merge_duplicate_product", {
    p_canonical_id: canonicalId,
    p_duplicate_id: duplicateId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
