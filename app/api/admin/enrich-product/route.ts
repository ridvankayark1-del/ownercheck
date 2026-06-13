import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import { enrichProductRecord } from "@/lib/productEnrichment";

export async function POST(request: NextRequest) {
  try {
    const { productId } = (await request.json()) as { productId?: string };

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required." },
        { status: 400 }
      );
    }

    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const { isAdmin } = await requireDatabaseAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const enriched = await enrichProductRecord(supabase, productId);

    return NextResponse.json({
      enrichmentStatus: enriched.enrichment_status || "snippet_enriched",
      reviewLinkCount: Array.isArray(enriched.external_review_links)
        ? enriched.external_review_links.length
        : 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not enrich product.",
      },
      { status: 500 }
    );
  }
}
