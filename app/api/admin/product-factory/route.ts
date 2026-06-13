import { NextRequest, NextResponse } from "next/server";
import {
  createAuthorizedSupabaseClient,
  requireDatabaseAdmin,
} from "@/lib/adminAuth";
import {
  applyFactoryProductTypeNormalization,
  buildFactoryProductInsert,
  parseProductFactoryCsv,
  ProductImportRowRecord,
  runFactoryDuplicateCheck,
  summarizeFactoryRows,
} from "@/lib/productFactory";
import { buildProductIdentity } from "@/lib/productNormalization";
import { resolveTaxonomyForProduct, slugifyTaxonomyLabel, getMainCategoryBySlug } from "@/lib/productTaxonomy";

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

  for (const rawRow of (rows || []) as ProductImportRowRecord[]) {
    let row = applyFactoryProductTypeNormalization(rawRow);

    if (
      row.product_type !== rawRow.product_type ||
      JSON.stringify(row.specs) !== JSON.stringify(rawRow.specs) ||
      JSON.stringify(row.warnings) !== JSON.stringify(rawRow.warnings)
    ) {
      const { data: normalizedRow, error: normalizeError } = await supabase
        .from("product_import_rows")
        .update({
          product_type: row.product_type,
          specs: row.specs,
          warnings: row.warnings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rawRow.id)
        .select("*")
        .single();

      if (normalizeError) throw normalizeError;
      row = normalizedRow as ProductImportRowRecord;
    }

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
      let patch: any = {
        ...body.rowPatch,
        updated_at: new Date().toISOString(),
      };

      if (
        patch.main_category !== undefined ||
        patch.category !== undefined ||
        patch.product_type !== undefined
      ) {
        const { data: currentRow } = await supabase
          .from("product_import_rows")
          .select("main_category, category, product_type, name, brand")
          .eq("id", body.rowId)
          .single();

        const merged = {
          main_category: patch.main_category !== undefined ? patch.main_category : (currentRow?.main_category || null),
          category: patch.category !== undefined ? patch.category : (currentRow?.category || null),
          product_type: patch.product_type !== undefined ? patch.product_type : (currentRow?.product_type || null),
        };

        const resolvedTax = resolveTaxonomyForProduct({
          main_category: merged.main_category,
          category: merged.category,
          product_type: merged.product_type
        });

        const name = currentRow?.name || "";
        const brand = currentRow?.brand || "";
        const warnings = [];

        const mainConfig = getMainCategoryBySlug(resolvedTax.main_category_slug);
        if (!mainConfig) {
          warnings.push(`Unknown main category: "${resolvedTax.main_category}".`);
        } else {
          const catConfig = mainConfig.categories[resolvedTax.category_slug];
          if (!catConfig) {
            warnings.push(`Unknown category: "${resolvedTax.category}".`);
          } else if (resolvedTax.product_type) {
            const hasPt = catConfig.productTypes.some(
              (pt) => slugifyTaxonomyLabel(pt.label) === resolvedTax.product_type_slug
            );
            if (!hasPt) {
              warnings.push(`Unknown product type: "${resolvedTax.product_type}".`);
            }
          }
        }

        if (!name) warnings.push("Missing product name.");
        if (!brand) warnings.push("Missing brand.");
        if (!resolvedTax.category) warnings.push("Missing category.");

        patch = {
          ...patch,
          main_category: resolvedTax.main_category,
          main_category_slug: resolvedTax.main_category_slug,
          category: resolvedTax.category,
          category_slug: resolvedTax.category_slug,
          product_type: resolvedTax.product_type,
          product_type_slug: resolvedTax.product_type_slug,
          taxonomy_path: resolvedTax.taxonomy_path,
          warnings: Array.from(new Set(warnings))
        };
      }

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

    if (body.action === "approve_specs" && body.rowId) {
      const { data: row, error: fetchError } = await supabase
        .from("product_import_rows")
        .select("specs, status")
        .eq("id", body.rowId)
        .single();

      if (fetchError || !row) {
        return NextResponse.json(
          { error: fetchError?.message || "Row not found." },
          { status: 404 }
        );
      }

      const specs = row.specs || {};
      const items = Array.isArray(specs._items) ? specs._items : [];
      const approvedItems = items.map((item: any) => ({
        ...item,
        status: "approved",
      }));
      const nextSpecs = {
        ...specs,
        _items: approvedItems,
      };

      let nextStatus = row.status;
      if (row.status === "needs_review") {
        nextStatus = "ready_to_publish";
      }

      const { data, error: updateError } = await supabase
        .from("product_import_rows")
        .update({
          specs: nextSpecs,
          status: nextStatus,
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

    if (body.action === "normalize_product_types") {
      const rowIds = body.rowIds || [];
      const query = supabase.from("product_import_rows").select("*");
      const { data: rows, error: rowsError } =
        rowIds.length > 0
          ? await query.in("id", rowIds)
          : await query.eq("batch_id", body.batchId);

      if (rowsError) {
        return NextResponse.json({ error: rowsError.message }, { status: 500 });
      }

      const normalizedRows = [];
      let corrected = 0;
      let skipped = 0;
      let manualReview = 0;

      for (const row of (rows || []) as ProductImportRowRecord[]) {
        if (row.category !== "Headphones") {
          skipped++;
          normalizedRows.push(row);
          continue;
        }

        const normalizedRow = applyFactoryProductTypeNormalization(row);
        const changed =
          normalizedRow.product_type !== row.product_type ||
          JSON.stringify(normalizedRow.specs) !== JSON.stringify(row.specs) ||
          JSON.stringify(normalizedRow.warnings) !== JSON.stringify(row.warnings);

        if (!changed) {
          skipped++;
          normalizedRows.push(row);
          continue;
        }

        const { data: updatedRow, error: updateError } = await supabase
          .from("product_import_rows")
          .update({
            product_type: normalizedRow.product_type,
            specs: normalizedRow.specs,
            warnings: normalizedRow.warnings,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .select("*")
          .single();

        if (updateError) throw updateError;

        corrected++;
        normalizedRows.push(updatedRow as ProductImportRowRecord);
      }

      if (normalizedRows.some((row) => row.warnings?.length)) {
        manualReview = normalizedRows.filter((row) =>
          (row.warnings || []).some((warning) =>
            warning.toLowerCase().includes("conflict")
          )
        ).length;
      }

      const batchId = normalizedRows[0]?.batch_id || body.batchId;
      if (batchId) await refreshBatchSummary(supabase, batchId);

      return NextResponse.json({
        rows: normalizedRows,
        summary: {
          checked: (rows || []).length,
          corrected,
          skipped,
          needsManualReview: manualReview,
        },
      });
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

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, error } = await requireAdmin(request);

    if (error) {
      return NextResponse.json({ error }, { status: 403 });
    }

    const batchId = request.nextUrl.searchParams.get("batchId");
    if (!batchId) {
      return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("product_import_batches")
      .delete()
      .eq("id", batchId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete batch" },
      { status: 500 }
    );
  }
}

