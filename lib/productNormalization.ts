import { SupabaseClient } from "@supabase/supabase-js";

export type ProductIdentityInput = {
  name: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
};

export type DuplicateCandidate = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  matchType: "exact" | "possible";
  score: number;
};

const COMMON_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bthird generation\b/g, "3"],
  [/\b3rd generation\b/g, "3"],
  [/\bthird gen\b/g, "3"],
  [/\b3rd gen\b/g, "3"],
  [/\bair pods\b/g, "airpods"],
  [/\bhead phones\b/g, "headphones"],
  [/\bear buds\b/g, "earbuds"],
  [/\bblu tooth\b/g, "bluetooth"],
  [/\bwire less\b/g, "wireless"],
  [/\bmac book\b/g, "macbook"],
  [/\bgo pro\b/g, "gopro"],
];

export function normalizeProductText(value?: string | null) {
  let normalized = (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|new|official)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of COMMON_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export function makeCanonicalSlug(input: ProductIdentityInput) {
  const parts = [input.brand, input.model, input.name]
    .map((part) => normalizeProductText(part))
    .filter(Boolean);
  const uniqueParts = Array.from(new Set(parts.join(" ").split(" ")));

  return uniqueParts.join("-").replace(/^-+|-+$/g, "") || "product";
}

export function buildProductIdentity(input: ProductIdentityInput) {
  const normalizedTitle = normalizeProductText(input.name);
  const normalizedBrand = normalizeProductText(input.brand);
  const normalizedModel = normalizeProductText(input.model);
  const normalizedCategory = normalizeProductText(input.category);
  const canonicalSlug = makeCanonicalSlug(input);
  const aliases = Array.from(
    new Set(
      [
        normalizedTitle,
        [normalizedBrand, normalizedTitle].filter(Boolean).join(" "),
        [normalizedBrand, normalizedModel].filter(Boolean).join(" "),
        [normalizedBrand, normalizedModel, normalizedCategory]
          .filter(Boolean)
          .join(" "),
      ].filter(Boolean)
    )
  );

  return {
    normalizedTitle,
    normalizedBrand,
    normalizedModel,
    canonicalSlug,
    aliases,
  };
}

function tokenSet(value: string) {
  return new Set(normalizeProductText(value).split(" ").filter(Boolean));
}

function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token));
  return intersection.length / union.size;
}

export function scoreProductMatch(
  input: ProductIdentityInput,
  candidate: ProductIdentityInput
) {
  const inputIdentity = buildProductIdentity(input);
  const candidateIdentity = buildProductIdentity(candidate);
  const titleScore = jaccard(
    tokenSet(inputIdentity.normalizedTitle),
    tokenSet(candidateIdentity.normalizedTitle)
  );
  const brandScore =
    inputIdentity.normalizedBrand &&
    candidateIdentity.normalizedBrand &&
    inputIdentity.normalizedBrand === candidateIdentity.normalizedBrand
      ? 0.25
      : 0;
  const modelScore =
    inputIdentity.normalizedModel &&
    candidateIdentity.normalizedModel &&
    inputIdentity.normalizedModel === candidateIdentity.normalizedModel
      ? 0.25
      : 0;

  return Math.min(1, titleScore * 0.7 + brandScore + modelScore);
}

export async function findDuplicateProducts(
  supabase: SupabaseClient,
  input: ProductIdentityInput
) {
  const identity = buildProductIdentity(input);
  const terms = Array.from(
    new Set(
      [
        input.name,
        input.brand,
        input.model,
        identity.normalizedTitle,
        identity.normalizedBrand,
      ]
        .filter(Boolean)
        .flatMap((term) => String(term).split(/\s+/))
        .map((term) => normalizeProductText(term))
        .filter((term) => term.length > 2)
    )
  ).slice(0, 8);

  const filters = [
    `slug.eq.${identity.canonicalSlug}`,
    `normalized_title.eq.${identity.normalizedTitle}`,
    ...terms.flatMap((term) => [
      `name.ilike.%${term}%`,
      `brand.ilike.%${term}%`,
      `category.ilike.%${term}%`,
    ]),
  ].join(",");

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, brand, category, image_url, normalized_title, normalized_brand, normalized_model"
    )
    .or(filters)
    .neq("product_verification_status", "rejected")
    .limit(20);

  if (error) {
    throw error;
  }

  return ((data || []) as Array<
    DuplicateCandidate & {
      normalized_title?: string | null;
      normalized_brand?: string | null;
      normalized_model?: string | null;
    }
  >)
    .map((product) => {
      const score = scoreProductMatch(input, {
        name: product.normalized_title || product.name,
        brand: product.normalized_brand || product.brand,
        model: product.normalized_model,
        category: product.category,
      });
      const exact =
        product.slug === identity.canonicalSlug ||
        (product.normalized_title === identity.normalizedTitle &&
          (!identity.normalizedBrand ||
            product.normalized_brand === identity.normalizedBrand));

      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        category: product.category,
        image_url: product.image_url,
        matchType: exact || score >= 0.92 ? "exact" : "possible",
        score: exact ? 1 : Number(score.toFixed(2)),
      } satisfies DuplicateCandidate;
    })
    .filter((product) => product.matchType === "exact" || product.score >= 0.48)
    .sort((a, b) => b.score - a.score);
}
