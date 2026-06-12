import { SupabaseClient } from "@supabase/supabase-js";
import { enrichProductRecord } from "@/lib/productEnrichment";
import { buildProductIdentity } from "@/lib/productNormalization";

export type CommunityProductInput = {
  name: string;
  brand: string;
  category: string;
  model?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  createdBy?: string | null;
};

async function createUniqueSlug(
  supabase: SupabaseClient,
  baseSlug: string
) {
  for (let index = 0; index < 30; index++) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) {
      return slug;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}

function buildInitialCopy(name: string, brand: string, category: string) {
  const label = brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;

  return {
    description: `${label} is a community-created OwnerCheck product page. Basic product info is being verified while buyers can ask real owners for firsthand advice.`,
    ai_summary: `${label} is being prepared for real-owner questions. Specs and source details may still need verification.`,
    starter_questions: [
      "What should buyers know before buying this?",
      "How is it after long-term use?",
      "What is the biggest problem you noticed?",
      "Is it worth the price?",
      "Would you buy it again?",
    ],
    evaluation_criteria: [
      "Build quality",
      "Ease of use",
      "Value for money",
      "Durability",
      "Long-term satisfaction",
      "Would buy again",
    ],
  };
}

export async function createCommunityProduct(
  supabase: SupabaseClient,
  input: CommunityProductInput
) {
  const identity = buildProductIdentity({
    name: input.name,
    brand: input.brand,
    model: input.model,
    category: input.category,
  });
  const slug = await createUniqueSlug(supabase, identity.canonicalSlug);
  const initialCopy = buildInitialCopy(input.name, input.brand, input.category);
  const productUrl = input.productUrl || null;
  const imageUrl = input.imageUrl || null;

  const { data: product, error: insertError } = await supabase
    .from("products")
    .insert({
      slug,
      name: input.name,
      brand: input.brand,
      category: input.category,
      model: input.model || null,
      product_url: productUrl,
      source_url: productUrl,
      image_url: imageUrl,
      created_by: input.createdBy || null,
      normalized_title: identity.normalizedTitle,
      normalized_brand: identity.normalizedBrand || null,
      normalized_model: identity.normalizedModel || null,
      canonical_slug: identity.canonicalSlug,
      aliases: identity.aliases,
      canonical_title: input.name,
      product_type: input.category,
      short_summary: initialCopy.ai_summary,
      key_specs: {},
      main_features: [],
      best_for: ["Real-owner buying advice"],
      common_buyer_concerns: ["Basic product info is being verified."],
      source_urls: productUrl
        ? [{ title: "Submitted product source", url: productUrl }]
        : [],
      main_image_url: imageUrl,
      image_source_url: imageUrl ? "user_submitted" : null,
      image_candidates: imageUrl
        ? [
            {
              url: imageUrl,
              source_url: "user_submitted",
              source_type: "submitted",
              score: 0.55,
            },
          ]
        : [],
      image_confidence: imageUrl ? 0.55 : null,
      enrichment_confidence: productUrl ? 0.25 : 0.15,
      enrichment_status: "pending",
      product_verification_status: "community_created",
      data_source: "user_created",
      ai_generated: true,
      verified_source: null,
      external_product_id: null,
      enrichment_error: null,
      ...initialCopy,
      specs: {
        brand: input.brand,
        category: input.category,
        product_type: input.category,
        model: input.model || null,
        main_features: [],
        best_for: ["Real-owner buying advice"],
        check_before_buying: ["Basic product info is being verified."],
      },
    })
    .select("id, slug")
    .single();

  if (insertError || !product) {
    throw insertError || new Error("Could not create product.");
  }

  try {
    await enrichProductRecord(supabase, product.id);
  } catch {
    await supabase
      .from("products")
      .update({
        enrichment_status: "pending_review",
        enrichment_error: "Automatic enrichment could not complete.",
      })
      .eq("id", product.id);
  }

  return product as { id: string; slug: string };
}
