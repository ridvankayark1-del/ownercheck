import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import {
  buildFactoryProductInsert,
  parseProductFactoryCsv,
  ProductImportRowRecord,
  runFactoryDuplicateCheck,
  summarizeFactoryRows,
} from "@/lib/productFactory";
import { buildProductIdentity } from "@/lib/productNormalization";

type ProductImportBatch = {
  id: string;
  created_by: string | null;
  name: string;
  source_name: string | null;
  import_mode: "csv";
  status: string;
  total_rows: number;
  ready_count: number;
  possible_duplicate_count: number;
  failed_count: number;
  published_count: number;
  created_at: string;
  updated_at: string;
};

async function requireAdmin(request: NextRequest) {
  const supabase = createAuthorizedSupabaseClient(
    request.headers.get("authorization")
  );
  const { isAdmin, user } = await requireDatabaseAdmin(supabase);

  if (!isAdmin || !user) {
    return { supabase, user: null, error: "Forbidden." };
  }

  return { supabase, user, error: null };
}

async function refreshBatchSummary(
  supabase: ReturnType<typeof createAuthorizedSupabaseClient>,
  batchId: string
) {
  const { data: rows, error: rowsError } = await supabase
    .from("product_import_rows")
    .select("status")
    .eq("batch_id", batchId);

  if (rowsError) throw rowsError;

  const summary = summarizeFactoryRows((rows || []) as Array<{ status: string }>);
  const status =
    summary.total_rows === 0
      ? "draft"
      : summary.published_count === summary.total_rows
        ? "completed"
        : summary.published_count > 0
          ? "partially_published"
          : summary.possible_duplicate_count > 0 || summary.failed_count > 0
            ? "review_needed"
            : "parsed";

  const { error } = await supabase
    .from("product_import_batches")
    .update({
      ...summary,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) throw error;
}

async function createUniqueSlug(
  supabase: ReturnType<typeof createAuthorizedSupabaseClient>,
  baseSlug: string
) {
  for (let index = 0; index < 50; index++) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return slug;
  }

  return `${baseSlug}-${Date.now()}`;
}

async function checkRows(
  supabase: ReturnType<typeof createAuthorizedSupabaseClient>,
  rows: ProductImportRowRecord[]
) {
  const checkedRows = [];

  for (const row of rows) {
    if (row.status === "missing_required_fields" || row.status === "published") {
      checkedRows.push(row);
      continue;
    }

    const result = await runFactoryDuplicateCheck(supabase, row);
    const warnings = Array.from(
      new Set([
        ...((row.warnings as string[]) || []),
        ...(result.status === "possible_duplicate"
          ? ["Possible duplicate needs admin review."]
          : []),
        ...(result.status === "duplicate_found"
          ? ["Exact duplicate found. Product creation is blocked."]
          : []),
      ])
    );
    const { data, error } = await supabase
      .from("product_import_rows")
      .update({
        status: result.status,
        duplicate_candidates: result.candidates,
        duplicate_risk: result.risk,
        warnings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (error) throw error;
    checkedRows.push(data as ProductImportRowRecord);
  }

  return checkedRows;
}

async function publishRows({
  supabase,
  rowIds,
  adminUserId,
  approveDuplicate,
  approveSpecs,
  approveImage,
}: {
  supabase: ReturnType<typeof createAuthorizedSupabaseClient>;
  rowIds: string[];
  adminUserId: string;
  approveDuplicate?: boolean;
  approveSpecs?: boolean;
  approveImage?: boolean;
}) {
  const { data: rows, error: rowsError } = await supabase
    .from("product_import_rows")
    .select("*")
    .in("id", rowIds);

  if (rowsError) throw rowsError;

  const published = [];

  for (const row of (rows || []) as ProductImportRowRecord[]) {
    if (row.status === "published") {
      published.push({ id: row.id, status: "published", message: "Already published." });
      continue;
    }

    if (!["ready_to_publish", "parsed"].includes(row.status)) {
      await supabase
        .from("product_import_rows")
        .update({
          error_message: "Only parsed or ready rows can be published.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      published.push({ id: row.id, status: "skipped", message: "Row is not ready." });
      continue;
    }

    const duplicateCheck = await runFactoryDuplicateCheck(supabase, row);

    if (duplicateCheck.status !== "ready_to_publish" && !approveDuplicate) {
      await supabase
        .from("product_import_rows")
        .update({
          status: duplicateCheck.status,
          duplicate_candidates: duplicateCheck.candidates,
          duplicate_risk: duplicateCheck.risk,
          error_message: "Duplicate risk must be reviewed before publishing.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      published.push({
        id: row.id,
        status: "skipped",
        message: "Duplicate risk found.",
      });
      continue;
    }

    const identity = buildProductIdentity({
      name: row.name,
      brand: row.brand,
      model: row.model,
      category: row.category,
    });
    const slug = await createUniqueSlug(supabase, identity.canonicalSlug);
    const productInsert = buildFactoryProductInsert(row, slug, adminUserId, {
      approveDuplicate: approveDuplicate || duplicateCheck.risk === 0,
      approveSpecs,
      approveImage,
    });
    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert(productInsert)
      .select("id, slug")
      .single();

    if (insertError || !product) {
      await supabase
        .from("product_import_rows")
        .update({
          status: "failed",
          error_message: insertError?.message || "Could not publish row.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      published.push({
        id: row.id,
        status: "failed",
        message: insertError?.message || "Could not publish row.",
      });
      continue;
    }

    await supabase
      .from("product_import_rows")
      .update({
        status: "published",
        created_product_id: product.id,
        duplicate_candidates: duplicateCheck.candidates,
        duplicate_risk: duplicateCheck.risk,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    published.push({
      id: row.id,
      status: "published",
      slug: product.slug,
      message: "Product published.",
    });
  }

  if ((rows || [])[0]?.batch_id) {
    await refreshBatchSummary(supabase, (rows || [])[0].batch_id);
  }

  return published;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, error } = await requireAdmin(request);

    if (error) {
      return NextResponse.json({ error }, { status: 403 });
    }

    const batchId = request.nextUrl.searchParams.get("batchId");

    const { data: batches, error: batchesError } = await supabase
      .from("product_import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (batchesError) {
      return NextResponse.json({ error: batchesError.message }, { status: 500 });
    }

    if (!batchId) {
      return NextResponse.json({ batches: batches || [], rows: [] });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("product_import_rows")
      .select("*")
      .eq("batch_id", batchId)
      .order("row_index", { ascending: true });

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    return NextResponse.json({
      batches: (batches || []) as ProductImportBatch[],
      rows: rows || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load Product Factory.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await requireAdmin(request);

    if (error || !user) {
      return NextResponse.json({ error: error || "Forbidden." }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      sourceName?: string;
      csvText?: string;
      runDuplicateCheck?: boolean;
      previewOnly?: boolean;
    };
    const csvText = body.csvText?.trim() || "";

    if (!csvText) {
      return NextResponse.json({ error: "CSV text is required." }, { status: 400 });
    }

    const parsed = parseProductFactoryCsv(csvText);

    if (body.previewOnly) {
      return NextResponse.json({
        headers: parsed.headers,
        rows: parsed.rows,
        summary: summarizeFactoryRows(parsed.rows),
      });
    }

    const { data: batch, error: batchError } = await supabase
      .from("product_import_batches")
      .insert({
        created_by: user.id,
        name: body.name?.trim() || `CSV import ${new Date().toLocaleString()}`,
        source_name: body.sourceName?.trim() || null,
        import_mode: "csv",
        status: "parsed",
        ...summarizeFactoryRows(parsed.rows),
      })
      .select("*")
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Could not create batch." },
        { status: 500 }
      );
    }

    const rows = parsed.rows.map((row) => ({
      ...row,
      batch_id: batch.id,
    }));
    const { data: insertedRows, error: rowsError } = await supabase
      .from("product_import_rows")
      .insert(rows)
      .select("*");

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    if (body.runDuplicateCheck !== false) {
      await supabase
        .from("product_import_batches")
        .update({ status: "checking_duplicates" })
        .eq("id", batch.id);
      await checkRows(supabase, (insertedRows || []) as ProductImportRowRecord[]);
    }

    await refreshBatchSummary(supabase, batch.id);

    const { data: refreshedRows } = await supabase
      .from("product_import_rows")
      .select("*")
      .eq("batch_id", batch.id)
      .order("row_index", { ascending: true });

    return NextResponse.json({
      batch,
      rows: refreshedRows || insertedRows || [],
      headers: parsed.headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create import batch.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user, error } = await requireAdmin(request);

    if (error || !user) {
      return NextResponse.json({ error: error || "Forbidden." }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: string;
      batchId?: string;
      rowId?: string;
      rowIds?: string[];
      rowPatch?: Partial<ProductImportRowRecord>;
      linkedProductId?: string;
      publishOptions?: {
        approveDuplicate?: boolean;
        approveSpecs?: boolean;
        approveImage?: boolean;
      };
    };

    if (body.action === "update_row" && body.rowId && body.rowPatch) {
      const patch = {
        ...body.rowPatch,
        updated_at: new Date().toISOString(),
      };
      const { data, error: updateError } = await supabase
        .from("product_import_rows")
        .update(patch)
        .eq("id", body.rowId)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      if (data?.batch_id) await refreshBatchSummary(supabase, data.batch_id);
      return NextResponse.json({ row: data });
    }

    if (body.action === "run_duplicate_check") {
      const query = supabase.from("product_import_rows").select("*");
      const { data: rows, error: rowsError } = body.rowId
        ? await query.eq("id", body.rowId)
        : await query.eq("batch_id", body.batchId);

      if (rowsError) {
        return NextResponse.json({ error: rowsError.message }, { status: 500 });
      }

      const checkedRows = await checkRows(
        supabase,
        (rows || []) as ProductImportRowRecord[]
      );

      if (checkedRows[0]?.batch_id) {
        await refreshBatchSummary(supabase, checkedRows[0].batch_id);
      }

      return NextResponse.json({ rows: checkedRows });
    }

    if (body.action === "mark_not_duplicate" && body.rowId) {
      const { data, error: updateError } = await supabase
        .from("product_import_rows")
        .update({
          status: "ready_to_publish",
          duplicate_risk: 0,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.rowId)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      if (data?.batch_id) await refreshBatchSummary(supabase, data.batch_id);
      return NextResponse.json({ row: data });
    }

    if (body.action === "link_existing" && body.rowId && body.linkedProductId) {
      const { data, error: updateError } = await supabase
        .from("product_import_rows")
        .update({
          status: "duplicate_found",
          linked_product_id: body.linkedProductId,
          error_message: "Linked to existing product.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.rowId)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      if (data?.batch_id) await refreshBatchSummary(supabase, data.batch_id);
      return NextResponse.json({ row: data });
    }

    if (body.action === "reject" && body.rowId) {
      const { data, error: updateError } = await supabase
        .from("product_import_rows")
        .update({
          status: "rejected",
          error_message: "Rejected by admin.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.rowId)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      if (data?.batch_id) await refreshBatchSummary(supabase, data.batch_id);
      return NextResponse.json({ row: data });
    }

    if (body.action === "publish_rows") {
      const rowIds = body.rowIds || [];

      if (rowIds.length === 0) {
        return NextResponse.json({ error: "Select at least one row." }, { status: 400 });
      }

      const results = await publishRows({
        supabase,
        rowIds,
        adminUserId: user.id,
        ...body.publishOptions,
      });

      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update Product Factory.",
      },
      { status: 500 }
    );
  }
}
