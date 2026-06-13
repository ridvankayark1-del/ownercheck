import {
  ExploreCatalog,
  type Product,
} from "@/components/ExploreCatalog";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_TAXONOMY, slugifyTaxonomyLabel } from "@/lib/productTaxonomy";

const PAGE_SIZE = 24;

// Dynamically construct ALL_FEATURE_FILTERS from the central taxonomy config
const ALL_FEATURE_FILTERS = Array.from(
  new Set(
    Object.values(PRODUCT_TAXONOMY).flatMap((main) =>
      Object.values(main.categories).flatMap((cat) => cat.featureFilters)
    )
  )
);

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
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
    "id, slug, name, brand, category, product_type, specs, image_url, description, canonical_title, normalized_title, normalized_brand, normalized_model, aliases, product_verification_status, enrichment_status, created_at, main_category, main_category_slug, category_slug, product_type_slug, taxonomy_path";

  let productsQuery = supabase
    .from("products")
    .select(productSelect)
    .neq("product_verification_status", "duplicate");

  let countQuery = supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .neq("product_verification_status", "duplicate");

  const mainCategoryParam = query?.main_category ? slugifyTaxonomyLabel(query.main_category) : undefined;
  const categoryParam = query?.category ? slugifyTaxonomyLabel(query.category) : undefined;
  const productTypeParam = (query?.type || query?.product_type) ? slugifyTaxonomyLabel(query?.type || query?.product_type || "") : undefined;

  if (mainCategoryParam) {
    productsQuery = productsQuery.eq("main_category_slug", mainCategoryParam);
    countQuery = countQuery.eq("main_category_slug", mainCategoryParam);
  }

  if (categoryParam) {
    productsQuery = productsQuery.eq("category_slug", categoryParam);
    countQuery = countQuery.eq("category_slug", categoryParam);
  }

  if (productTypeParam) {
    productsQuery = productsQuery.eq("product_type_slug", productTypeParam);
    countQuery = countQuery.eq("product_type_slug", productTypeParam);
  }

  if (query?.q) {
    const cleanQ = query.q.trim();
    if (cleanQ) {
      const searchFilter = `name.ilike.%${cleanQ}%,brand.ilike.%${cleanQ}%,category.ilike.%${cleanQ}%,canonical_title.ilike.%${cleanQ}%,normalized_title.ilike.%${cleanQ}%`;
      productsQuery = productsQuery.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    }
  }

  // Apply JSONB feature filters
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (ALL_FEATURE_FILTERS.includes(key) && val) {
        productsQuery = productsQuery.eq(`specs->>${key}`, val);
        countQuery = countQuery.eq(`specs->>${key}`, val);
      }
    }
  }

  const sort = query?.sort || "newest";
  if (sort === "az") {
    productsQuery = productsQuery.order("name", { ascending: true });
  } else {
    productsQuery = productsQuery.order("created_at", { ascending: false });
  }

  const [{ data: productsData, error: productsError }, { count }] =
    await Promise.all([
      productsQuery.range(from, to),
      countQuery,
    ]);

  if (productsError) {
    throw new Error(productsError.message);
  }

  const totalProducts = count || 0;
  const totalPages = Math.ceil(totalProducts / PAGE_SIZE);

  // Extract feature filters to pass as initialFeatures
  const initialFeatures: Record<string, string[]> = {};
  if (query) {
    for (const key of ALL_FEATURE_FILTERS) {
      const val = query[key];
      if (val) {
        initialFeatures[key] = [val];
      }
    }
  }

  return (
    <ExploreCatalog
      initialProducts={(productsData as Product[]) || []}
      initialQuery={query?.q || ""}
      initialMainCategory={mainCategoryParam || "All"}
      initialCategory={categoryParam || "All"}
      initialProductType={productTypeParam || "All"}
      initialSort={sort}
      initialFeatures={initialFeatures}
      page={page}
      pageSize={PAGE_SIZE}
      totalProducts={totalProducts}
      totalPages={totalPages}
    />
  );
}
