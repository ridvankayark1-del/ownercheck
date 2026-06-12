import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import { createCommunityProduct } from "@/lib/communityProductCreation";
import {
  buildProductIdentity,
  findDuplicateProducts,
} from "@/lib/productNormalization";

type ActionBody = {
  submissionId?: string;
  action?: "approve" | "reject" | "duplicate" | "needs_more_info" | "rerun_duplicate_check";
  linkedProductId?: string | null;
  adminNotes?: string | null;
  updates?: {
    name?: string;
    brand?: string;
    category?: string;
    model?: string | null;
    product_url?: string | null;
    image_url?: string | null;
  };
};

function cleanSubmissionInput(body: ActionBody, existing: Record<string, unknown>) {
  const name = body.updates?.name?.trim() || String(existing.name || "").trim();
  const brand = body.updates?.brand?.trim() || String(existing.brand || "").trim();
  const category =
    body.updates?.category?.trim() || String(existing.category || "").trim();
  const model =
    body.updates && "model" in body.updates
      ? body.updates.model?.trim() || null
      : (existing.model as string | null) || null;
  const productUrl =
    body.updates && "product_url" in body.updates
      ? body.updates.product_url?.trim() || null
      : (existing.product_url as string | null) || null;
  const imageUrl =
    body.updates && "image_url" in body.updates
      ? body.updates.image_url?.trim() || null
      : (existing.image_url as string | null) || null;

  return { name, brand, category, model, productUrl, imageUrl };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const { isAdmin } = await requireDatabaseAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("product_submissions")
      .select(
        "id, submitter_id, name, brand, category, model, product_url, image_url, duplicate_candidates, highest_duplicate_score, enrichment_status, enrichment_error, status, linked_product_id, admin_notes, reviewed_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const submitterIds = Array.from(
      new Set((data || []).map((item) => item.submitter_id).filter(Boolean))
    );
    const { data: profiles } =
      submitterIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", submitterIds)
        : { data: [] };
    const profileMap = new Map(
      (profiles || []).map((profile) => [profile.id, profile])
    );

    return NextResponse.json({
      submissions: (data || []).map((submission) => ({
        ...submission,
        submitter: profileMap.get(submission.submitter_id) || null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load product submissions.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ActionBody;
    const supabase = createAuthorizedSupabaseClient(
      request.headers.get("authorization")
    );
    const { isAdmin, user } = await requireDatabaseAdmin(supabase);

    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (!body.submissionId || !body.action) {
      return NextResponse.json(
        { error: "submissionId and action are required." },
        { status: 400 }
      );
    }

    const { data: submission, error: loadError } = await supabase
      .from("product_submissions")
      .select("*")
      .eq("id", body.submissionId)
      .single();

    if (loadError || !submission) {
      return NextResponse.json(
        { error: loadError?.message || "Submission not found." },
        { status: 404 }
      );
    }

    const input = cleanSubmissionInput(body, submission);

    if (!input.name || !input.brand || !input.category) {
      return NextResponse.json(
        { error: "Name, brand, and category are required." },
        { status: 400 }
      );
    }

    const identity = buildProductIdentity({
      name: input.name,
      brand: input.brand,
      model: input.model,
      category: input.category,
    });

    if (body.action === "rerun_duplicate_check") {
      const candidates = await findDuplicateProducts(supabase, input);
      const { error } = await supabase
        .from("product_submissions")
        .update({
          ...body.updates,
          normalized_title: identity.normalizedTitle,
          normalized_brand: identity.normalizedBrand || null,
          normalized_model: identity.normalizedModel || null,
          canonical_slug: identity.canonicalSlug,
          aliases: identity.aliases,
          duplicate_candidates: candidates,
          highest_duplicate_score: candidates[0]?.score || null,
          admin_notes: body.adminNotes ?? submission.admin_notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.submissionId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, candidates });
    }

    if (body.action === "approve") {
      const candidates = await findDuplicateProducts(supabase, input);
      const exact = candidates.find((candidate) => candidate.matchType === "exact");

      if (exact) {
        await supabase
          .from("product_submissions")
          .update({
            status: "duplicate",
            linked_product_id: exact.id,
            duplicate_candidates: candidates,
            highest_duplicate_score: exact.score,
            admin_notes:
              body.adminNotes ||
              `Duplicate detected during approval: ${exact.name}`,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.submissionId);

        return NextResponse.json(
          {
            error: "Exact duplicate found during approval.",
            duplicate: exact,
            candidates,
          },
          { status: 409 }
        );
      }

      const product = await createCommunityProduct(supabase, {
        name: input.name,
        brand: input.brand,
        category: input.category,
        model: input.model,
        productUrl: input.productUrl,
        imageUrl: input.imageUrl,
        createdBy: submission.submitter_id as string,
      });

      const { error } = await supabase
        .from("product_submissions")
        .update({
          ...body.updates,
          status: "approved",
          linked_product_id: product.id,
          duplicate_candidates: candidates,
          highest_duplicate_score: candidates[0]?.score || null,
          normalized_title: identity.normalizedTitle,
          normalized_brand: identity.normalizedBrand || null,
          normalized_model: identity.normalizedModel || null,
          canonical_slug: identity.canonicalSlug,
          aliases: identity.aliases,
          admin_notes: body.adminNotes ?? submission.admin_notes,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.submissionId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ product });
    }

    const status =
      body.action === "duplicate"
        ? "duplicate"
        : body.action === "needs_more_info"
          ? "needs_more_info"
          : "rejected";

    if (status === "duplicate" && !body.linkedProductId) {
      return NextResponse.json(
        { error: "Choose an existing product before marking duplicate." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("product_submissions")
      .update({
        ...body.updates,
        status,
        linked_product_id:
          status === "duplicate" ? body.linkedProductId || null : null,
        admin_notes: body.adminNotes ?? submission.admin_notes,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.submissionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update product submission.",
      },
      { status: 500 }
    );
  }
}
