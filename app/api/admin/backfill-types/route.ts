import { NextRequest, NextResponse } from "next/server";
import { createAuthorizedSupabaseClient } from "@/lib/adminAuth";
import { resolveProductType } from "@/lib/productFactory";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const supabase = createAuthorizedSupabaseClient(token);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!userData?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, product_type, suggested_product_type, specs")
      .ilike("category", "%headphone%");

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products || []) {
      const resolved = resolveProductType({
        product_type: product.product_type,
        suggested_product_type: product.suggested_product_type,
        specs: product.specs,
      });

      if (resolved && resolved !== product.product_type) {
        const { error: updateError } = await supabase
          .from("products")
          .update({ product_type: resolved })
          .eq("id", product.id);

        if (updateError) {
          console.error(`Failed to update ${product.id}:`, updateError);
        } else {
          updatedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    return NextResponse.json({ success: true, updatedCount, skippedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
