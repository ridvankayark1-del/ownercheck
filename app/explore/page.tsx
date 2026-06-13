import {
  ExploreCatalog,
  type Product,
} from "@/components/ExploreCatalog";
import { supabase } from "@/lib/supabaseClient";

const PAGE_SIZE = 24;

type PageProps = {
  searchParams?: Promise<{
    page?: string;
    q?: string;
  }>;
};

function getPageNumber(value?: string) {
  const page = Number(value || "1");
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const query = await searchParams;
  const page = getPageNumber(query?.page);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const productSelect =
    "id, slug, name, brand, category, image_url, description, canonical_title, normalized_title, normalized_brand, normalized_model, aliases, product_verification_status, enrichment_status, created_at";

  const [{ data: productsData, error: productsError }, { count }] =
    await Promise.all([
      supabase
        .from("products")
        .select(productSelect)
        .neq("product_verification_status", "duplicate")
        .order("created_at", { ascending: false })
        .range(from, to),
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .neq("product_verification_status", "duplicate"),
    ]);

  if (productsError) {
    throw new Error(productsError.message);
  }

  const totalProducts = count || 0;
  const totalPages = Math.ceil(totalProducts / PAGE_SIZE);

  return (
    <ExploreCatalog
      initialProducts={(productsData as Product[]) || []}
      initialQuery={query?.q || ""}
      page={page}
      pageSize={PAGE_SIZE}
      totalProducts={totalProducts}
      totalPages={totalPages}
    />
  );
}
