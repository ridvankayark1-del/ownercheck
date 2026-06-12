import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { AskQuestionForm } from "@/components/AskQuestionForm";
import { ClaimProductModal } from "@/components/ClaimProductModal";
import { DirectQuestionForm } from "@/components/DirectQuestionForm";
import { HelpfulButton } from "@/components/HelpfulButton";
import { OwnerTrustCard } from "@/components/OwnerTrustCard";
import { ProductImage } from "@/components/ProductImage";
import { getCategoryProfile } from "@/lib/productCategoryProfiles";
import { getOwnerEvaluationCriteria } from "@/lib/ownerEvaluationCriteria";
import {
  getOwnerLevel,
  getOwnerLevelBadgeClass,
  getOwnerLevelLabel,
} from "@/lib/ownerLevels";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    claim?: string;
  }>;
};

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  trust_score: number | null;
};

type Answer = {
  id: string;
  question_id: string;
  owner_id: string | null;
  answer_text: string;
  helpful_count: number;
  created_at: string;
};

type Question = {
  id: string;
  buyer_id: string | null;
  question_text: string;
  credit_reward: number;
  status: string;
  created_at: string;
};

type OwnedProduct = {
  id: string;
  user_id: string | null;
  ownership_months: number | null;
  verification_status: string;
  verification_photo_url: string | null;
  verification_code: string | null;
  rating: number | null;
  review_text: string | null;
  pros: string | null;
  cons: string | null;
  would_buy_again: boolean | null;
  created_at: string;
};

type OwnerProductRating = {
  id: string;
  user_id: string | null;
  owned_product_id: string | null;
  criteria_scores: Record<string, number> | null;
  overall_rating: number | null;
  created_at: string;
};

type ExternalLink = {
  title: string;
  url: string;
};

type ProductSpecs = {
  brand?: string | null;
  category?: string | null;
  product_type?: string | null;
  model?: string | null;
  connectivity?: string | null;
  battery_life?: string | null;
  sensor?: string | null;
  video_resolution?: string | null;
  stabilization?: string | null;
  dynamic_range?: string | null;
  color_profile?: string | null;
  zoom?: string | null;
  storage?: string | null;
  noise_cancellation?: string | null;
  microphone_type?: string | null;
  polar_pattern?: string | null;
  main_features?: string[];
  best_for?: string[];
  check_before_buying?: string[];
  notable_features?: string[];
  use_cases?: string[];
  [key: string]: unknown;
};

function decodeEntities(value: string) {
  return value
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanDisplayText(value: string) {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map(cleanDisplayText)
    .filter(Boolean);
}

function getProductSpecs(value: unknown): ProductSpecs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as ProductSpecs;
}

function getSimpleSpecEntries(specs: ProductSpecs) {
  const profile = getCategoryProfile(specs.category);
  const profileKeys = new Set([
    ...profile.specFields.map((field) => field.key),
    "brand",
    "category",
    "product_type",
    "model",
    "main_features",
    "best_for",
    "check_before_buying",
    "notable_features",
    "use_cases",
  ]);

  return Object.entries(specs).filter(([key, value]) => {
    if (profileKeys.has(key)) {
      return false;
    }

    return typeof value === "string" && value.trim().length > 0;
  }) as Array<[string, string]>;
}

function formatSpecLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function splitSentences(value?: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function cleanOptionalSpec(value?: string | null) {
  return value ? cleanDisplayText(value) : null;
}

function getExternalLinks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ExternalLink => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return typeof candidate.title === "string" && typeof candidate.url === "string";
  }).map((item) => ({
    title: cleanDisplayText(item.title),
    url: item.url,
  }));
}

function getProfileName(profile?: Profile) {
  if (!profile) return "Anonymous user";
  if (profile.display_name) return profile.display_name;
  if (profile.email) return profile.email.split("@")[0];
  return "Anonymous user";
}

function getProductVerificationLabel(status?: string | null) {
  if (status === "catalog_verified") return "Catalog verified";
  if (status === "community_created") return "Community-created";
  if (status === "pending_enrichment") return "Community-created";
  if (status === "needs_review") return "Needs review";
  if (status === "rejected") return "Rejected";
  return "User-submitted product";
}

function isKnownAirPods3(name?: string | null, brand?: string | null) {
  return /airpods\s*3|airpods\s*\(?3rd generation\)?/i.test(
    `${brand || ""} ${name || ""}`
  );
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const shouldOpenClaim = query?.claim === "1";

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, canonical_title, brand, category, image_url, description, ai_summary, short_summary, specs, external_summary, common_praise, common_complaints, external_review_links, external_summary_sources, starter_questions, evaluation_criteria, product_verification_status, enrichment_status, enrichment_confidence, category_confidence, specs_confidence, identity_approved_at, specs_approved_at, image_approved_at, duplicate_reviewed_at, source_url, verified_source"
    )
    .eq("slug", slug)
    .single();

  if (error || !product) {
    notFound();
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("id, buyer_id, question_text, credit_reward, status, created_at")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  const { data: ownedProducts } = await supabase
    .from("owned_products")
    .select(
      "id, user_id, ownership_months, verification_status, verification_photo_url, verification_code, rating, review_text, pros, cons, would_buy_again, created_at"
    )
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  const { data: ownerProductRatings } = await supabase
    .from("owner_product_ratings")
    .select(
      "id, user_id, owned_product_id, criteria_scores, overall_rating, created_at"
    )
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  const questionIds = questions?.map((question) => question.id) || [];

  const { data: answers } =
    questionIds.length > 0
      ? await supabase
          .from("answers")
          .select(
            "id, question_id, owner_id, answer_text, helpful_count, created_at"
          )
          .in("question_id", questionIds)
          .order("created_at", { ascending: true })
      : { data: [] as Answer[] };

  const userIds = Array.from(
    new Set(
      [
        ...(questions || []).map((question: Question) => question.buyer_id),
        ...(answers || []).map((answer: Answer) => answer.owner_id),
        ...(ownedProducts || []).map(
          (ownedProduct: OwnedProduct) => ownedProduct.user_id
        ),
      ].filter(Boolean) as string[]
    )
  );

  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email, trust_score")
          .in("id", userIds)
      : { data: [] as Profile[] };

  const profileMap = new Map<string, Profile>(
    (profiles || []).map((profile: Profile) => [profile.id, profile])
  );

  const starterQuestions = Array.isArray(product.starter_questions)
    ? product.starter_questions
    : [];

  const evaluationCriteria = Array.isArray(product.evaluation_criteria)
    ? product.evaluation_criteria
    : [];
  const externalReviewLinks = getExternalLinks(product.external_review_links);
  const externalSummarySources = getExternalLinks(
    product.external_summary_sources
  );
  const productSpecs = getProductSpecs(product.specs);
  const airPods3 = isKnownAirPods3(
    product.canonical_title || product.name,
    product.brand
  );
  const categoryConfidence = Number(product.category_confidence || 0);
  const specsConfidence = Number(
    product.specs_confidence || product.enrichment_confidence || 0
  );
  const displayName = airPods3
    ? "Apple AirPods (3rd generation)"
    : product.canonical_title || product.name;
  const displayBrand = airPods3 ? "Apple" : product.brand;
  const displayCategory = airPods3
    ? "Headphones"
    : categoryConfidence >= 0.5 || product.identity_approved_at
      ? cleanOptionalSpec(productSpecs?.category) ||
        cleanDisplayText(product.category || "")
      : cleanDisplayText(product.category || "");
  const displayProductType = airPods3
    ? "Wireless earbuds"
    : specsConfidence >= 0.5 || product.specs_approved_at
      ? cleanOptionalSpec(productSpecs?.product_type)
      : null;
  const categoryProfile = getCategoryProfile(
    displayCategory || product.category
  );
  const simpleSpecEntries = productSpecs
    ? getSimpleSpecEntries(productSpecs)
    : [];
  const baseSnapshotItems = [
    ["Brand", displayBrand || cleanOptionalSpec(productSpecs?.brand) || ""],
    ["Category", displayCategory],
    ["Product type", displayProductType],
    ["Model", cleanOptionalSpec(productSpecs?.model)],
  ];
  const categorySnapshotItems = productSpecs
    ? categoryProfile.specFields.map((field) => [
        field.label,
        cleanOptionalSpec(productSpecs[field.key] as string | null | undefined),
      ])
    : [];
  const snapshotItems = [...baseSnapshotItems, ...categorySnapshotItems].filter(
    (item): item is [string, string] => Boolean(item[1])
  );
  const mainFeatures = getStringList(
    productSpecs?.main_features || productSpecs?.notable_features || []
  );
  const bestFor = getStringList(productSpecs?.best_for || productSpecs?.use_cases || []);
  const checkBeforeBuying = getStringList(productSpecs?.check_before_buying);
  const overviewSentences = splitSentences(
    product.short_summary || product.ai_summary
  );
  const externalSourceLinks = [
    ...(product.source_url
      ? [
          {
            title: "Submitted product source",
            url: product.source_url,
          },
        ]
      : []),
    ...externalReviewLinks,
    ...externalSummarySources.filter(
      (source) =>
        !externalReviewLinks.some((reviewLink) => reviewLink.url === source.url)
    ),
  ];

  const ownerCount = ownedProducts?.length || 0;
  const directOwnerOptions =
    ownedProducts
      ?.filter(
        (ownedProduct: OwnedProduct) =>
          ownedProduct.user_id &&
          ["photo_verified", "receipt_verified", "trusted_owner"].includes(
            ownedProduct.verification_status
          )
      )
      .map((ownedProduct: OwnedProduct) => {
        const ownerProfile = ownedProduct.user_id
          ? profileMap.get(ownedProduct.user_id)
          : undefined;
        const ownerLevel = getOwnerLevel(
          ownedProduct.verification_status,
          ownerProfile?.trust_score
        );

        return {
          userId: ownedProduct.user_id as string,
          name: getProfileName(ownerProfile),
          ownerLevel: getOwnerLevelLabel(ownerLevel),
          ownershipMonths: ownedProduct.ownership_months,
          rating: ownedProduct.rating,
          scorecardRating:
            ((ownerProductRatings || []) as OwnerProductRating[]).find(
              (rating) =>
                rating.owned_product_id === ownedProduct.id ||
                rating.user_id === ownedProduct.user_id
            )?.overall_rating || null,
          answerCount: getOwnerHelpfulActivity(ownedProduct.user_id).answerCount,
          helpfulCount: getOwnerHelpfulActivity(ownedProduct.user_id)
            .helpfulCount,
          photoVerified: ownedProduct.verification_status === "photo_verified",
        };
      }) || [];

  const photoVerifiedCount =
    ownedProducts?.filter(
      (ownedProduct: OwnedProduct) =>
        ownedProduct.verification_status === "photo_verified"
    ).length || 0;
  const identityApproved = Boolean(
    product.identity_approved_at ||
      product.product_verification_status === "catalog_verified"
  );
  const specsApproved = Boolean(
    product.specs_approved_at && specsConfidence >= 0.5
  );
  const imageApproved = Boolean(product.image_approved_at);
  const duplicateReviewed = Boolean(
    product.duplicate_reviewed_at || product.verified_source
  );
  const fullyCatalogVerified = Boolean(
    product.product_verification_status === "catalog_verified" &&
      identityApproved &&
      specsApproved &&
      imageApproved &&
      duplicateReviewed
  );
  const catalogPageApproved = Boolean(
    product.product_verification_status === "catalog_verified" &&
      !fullyCatalogVerified
  );
  const isCommunityCreated = [
    "community_created",
    "pending_enrichment",
    "user_submitted",
  ].includes(product.product_verification_status || "");
  const isProductInfoPending =
    isCommunityCreated ||
    ["pending", "running", "pending_review", "failed"].includes(
      product.enrichment_status || ""
    ) ||
    !specsApproved ||
    categoryConfidence < 0.5;

  const ratings =
    ownedProducts
      ?.map((ownedProduct: OwnedProduct) => ownedProduct.rating)
      .filter((rating): rating is number => typeof rating === "number") || [];

  const averageRating =
    ratings.length > 0
      ? (
          ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        ).toFixed(1)
      : null;

  const scorecardCriteria = getOwnerEvaluationCriteria(
    displayCategory || product.category
  );
  const scorecardRatings = ((ownerProductRatings || []) as OwnerProductRating[])
    .filter((rating) => rating.criteria_scores && rating.overall_rating)
    .map((rating) => {
      const ownedProduct = (ownedProducts || []).find(
        (item: OwnedProduct) =>
          item.id === rating.owned_product_id || item.user_id === rating.user_id
      );

      return {
        ...rating,
        ownedProduct,
      };
    });
  const scorecardRatingCount = scorecardRatings.length;
  const scorecardOverall =
    scorecardRatingCount > 0
      ? scorecardRatings.reduce(
          (sum, rating) => sum + (rating.overall_rating || 0),
          0
        ) / scorecardRatingCount
      : null;
  const scorecardAverages = scorecardCriteria
    .map((criterion) => {
      const values = scorecardRatings
        .map((rating) => rating.criteria_scores?.[criterion])
        .filter((score): score is number => typeof score === "number");

      if (values.length === 0) {
        return null;
      }

      return {
        criterion,
        average:
          values.reduce((sum, score) => sum + score, 0) / values.length,
      };
    })
    .filter(
      (item): item is { criterion: string; average: number } => item !== null
    );
  const allScorecardsPhotoVerified =
    scorecardRatingCount > 0 &&
    scorecardRatings.every(
      (rating) => rating.ownedProduct?.verification_status === "photo_verified"
    );
  const answeredQuestionCount =
    questions?.filter((question: Question) =>
      question.status === "answered" || getAnswersForQuestion(question.id).length > 0
    ).length || 0;
  const mostHelpfulAnswer = [...(answers || [])].sort(
    (first, second) => second.helpful_count - first.helpful_count
  )[0];
  const mostHelpfulOwner = mostHelpfulAnswer?.owner_id
    ? profileMap.get(mostHelpfulAnswer.owner_id)
    : undefined;

  function getAnswersForQuestion(questionId: string) {
    return (answers || []).filter(
      (answer: Answer) => answer.question_id === questionId
    );
  }

  function getOwnerHelpfulActivity(ownerId?: string | null) {
    const ownerAnswers = (answers || []).filter(
      (answer: Answer) => answer.owner_id === ownerId
    );
    const helpfulCount = ownerAnswers.reduce(
      (sum, answer) => sum + answer.helpful_count,
      0
    );

    return {
      answerCount: ownerAnswers.length,
      helpfulCount,
    };
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-5 md:pb-12">
      <Link href="/explore" className="text-sm font-bold text-muted">
        ← Back to explore
      </Link>

      <section className="card mt-4 overflow-hidden p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[420px_1fr] lg:items-stretch">
          <div className="overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
            <ProductImage
              src={product.image_url}
              category={product.category}
              alt={product.name}
              className="h-72 w-full object-cover sm:h-96 lg:h-full"
            />
          </div>

          <div className="flex flex-col justify-between gap-6 py-1">
            <div>
              <div className="hidden">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-muted">
                  {product.brand || "Unknown brand"} ·{" "}
                  {product.category || "Uncategorized"}
                  {productSpecs?.product_type ? ` · ${productSpecs.product_type}` : ""}
                </p>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                  {getProductVerificationLabel(product.product_verification_status)}
                </span>
                {isProductInfoPending && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                    Specs being verified
                  </span>
                )}
              </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-muted">
                  {displayBrand || "Unknown brand"} ·{" "}
                  {displayCategory || "Uncategorized"}
                  {displayProductType ? ` · ${displayProductType}` : ""}
                </p>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${
                    fullyCatalogVerified
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {fullyCatalogVerified
                    ? "Catalog verified"
                    : catalogPageApproved
                      ? "Catalog page approved"
                      : getProductVerificationLabel(product.product_verification_status)}
                </span>
                {isProductInfoPending && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                    {isCommunityCreated
                      ? "Info being verified"
                      : "Specs being verified"}
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
                {displayName}
              </h1>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  [
                    "Verified owners",
                    photoVerifiedCount,
                  ],
                  ["Owner answers", answers?.length || 0],
                  ["Owner rating", averageRating || "No rating"],
                  ["Public questions", questions?.length || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border bg-white p-4">
                    <p className="text-2xl font-black">{value}</p>
                    <p className="text-xs font-bold text-muted">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 leading-7 text-muted">
                {isProductInfoPending && (
                  <p className="font-bold text-amber-800">
                    {isCommunityCreated
                      ? "Basic product info is being verified."
                      : "Catalog identity is approved, but specs are still being verified."}
                  </p>
                )}
                {(overviewSentences.length > 0
                  ? overviewSentences.slice(0, 2)
                  : [
                      product.description
                        ? cleanDisplayText(product.description)
                        : "Ask real owners about this product before buying.",
                    ]
                ).map((sentence) => (
                  <p key={sentence}>{cleanDisplayText(sentence)}</p>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="#ask-question"
                  className="btn btn-dark w-full justify-center sm:w-auto"
                >
                  Ask public question
                </a>
                {directOwnerOptions.length > 0 ? (
                  <a
                    href="#ask-question"
                    className="btn btn-dark w-full justify-center sm:w-auto"
                  >
                    Start private chat
                  </a>
                ) : (
                  <span className="btn w-full cursor-not-allowed justify-center opacity-60 sm:w-auto">
                    Private chat unavailable
                  </span>
                )}
              </div>
              {directOwnerOptions.length === 0 && (
                <p className="text-sm font-bold text-muted">
                  Private chat becomes available when a verified owner claims
                  this product.
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <ClaimProductModal
                  productId={product.id}
                  productSlug={product.slug}
                  category={product.category}
                  triggerClassName="btn w-full justify-center sm:w-auto"
                  triggerLabel={
                    photoVerifiedCount === 0
                      ? "Become the first verified owner"
                      : "I own this product"
                  }
                  defaultOpen={shouldOpenClaim}
                />
                {externalSourceLinks.length > 0 && (
                  <a
                    href="#external-sources"
                    className="btn w-full justify-center text-muted sm:w-auto"
                  >
                    View sources
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Owner scorecard</h2>
                <p className="mt-1 text-sm font-black text-muted">
                  Based on real-owner ratings.
                </p>
              </div>

              <div className="text-right">
                <p className="text-4xl font-black">
                  {scorecardOverall ? scorecardOverall.toFixed(1) : "—"}
                </p>
                <p className="text-xs font-black text-muted">
                  {scorecardRatingCount > 0
                    ? `${scorecardRatingCount} owner ${
                        scorecardRatingCount === 1 ? "rating" : "ratings"
                      }`
                    : "No ratings yet"}
                </p>
              </div>
            </div>

            {scorecardRatingCount > 0 ? (
              <>
                {allScorecardsPhotoVerified && (
                  <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                    Photo-verified owner ratings
                  </span>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {scorecardAverages.map((item) => (
                    <div key={item.criterion} className="rounded-2xl bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black">{item.criterion}</p>
                        <p className="font-black">{item.average.toFixed(1)}</p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{ width: `${Math.min(item.average * 20, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="font-bold">Own this product? Add the first owner rating.</p>
                <ClaimProductModal
                  productId={product.id}
                  productSlug={product.slug}
                  category={product.category}
                  triggerClassName="btn btn-dark mt-3"
                  triggerLabel="Add owner rating"
                />
              </div>
            )}
          </section>

          {checkBeforeBuying.length > 0 && (
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">Check before buying</h2>
                  <p className="mt-1 text-sm font-bold text-muted">
                    Use these as prompts when asking owners.
                  </p>
                </div>
                <a href="#ask-question" className="btn">
                  Ask owners about these
                </a>
              </div>
              <ul className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
                {checkBeforeBuying.map((item) => (
                  <li key={item}>
                    <a
                      href="#ask-question"
                      className="inline-flex rounded-full bg-slate-100 px-3 py-2"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="ask-question">
            <div className="mb-4">
              <h2 className="text-2xl font-black">Ask real owners</h2>
              <p className="mt-2 max-w-2xl leading-7 text-muted">
                Pick the public route when many buyers could use the answer, or
                start a private chat when your question is specific to your own
                situation.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <AskQuestionForm
                productId={product.id}
                starterQuestions={starterQuestions}
              />
              <DirectQuestionForm
                productId={product.id}
                ownerOptions={directOwnerOptions}
              />
            </div>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-muted">Owner insight</p>
                <h2 className="mt-1 text-2xl font-black">
                  What owners are saying
                </h2>
              </div>
              <span className="trust-badge trust-badge-neutral">
                Real-owner signals
              </span>
            </div>

            {mostHelpfulAnswer ? (
              <div className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-4">
                <p className="text-sm font-black text-muted">
                  Most helpful answer by {getProfileName(mostHelpfulOwner)}
                </p>
                <p className="mt-2 line-clamp-3 leading-7">
                  {mostHelpfulAnswer.answer_text}
                </p>
                <p className="mt-3 text-sm font-bold text-muted">
                  {mostHelpfulAnswer.helpful_count} helpful votes
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-4">
                <p className="font-bold">
                  No owner insights yet. Ask the first question.
                </p>
                <a href="#ask-question" className="btn btn-dark mt-3">
                  Ask a public question
                </a>
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Questions for real owners</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  {answeredQuestionCount} answered · {questions?.length || 0} total
                </p>
              </div>
              <a href="#ask-question" className="btn btn-dark">
                Ask a question
              </a>
            </div>

            {!questions || questions.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="font-bold">No one has asked about this product yet.</p>
                <a href="#ask-question" className="btn btn-dark mt-3">
                  Ask the first question
                </a>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {questions.map((question: Question) => {
                  const questionAnswers = getAnswersForQuestion(question.id);
                  const buyerProfile = question.buyer_id
                    ? profileMap.get(question.buyer_id)
                    : undefined;

                  return (
                    <div
                      key={question.id}
                      className={`rounded-2xl border p-4 ${
                        questionAnswers.length > 0
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-amber-200 bg-amber-50/30"
                      }`}
                    >
                      <p className="font-black">{question.question_text}</p>
                      <p className="mt-2 text-sm text-muted">
                        Asked by {getProfileName(buyerProfile)} · Reward:{" "}
                        {question.credit_reward} credits · {question.status}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            questionAnswers.length > 0
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {questionAnswers.length > 0
                            ? "Answered"
                            : "Waiting for verified owner"}
                        </span>
                        {questionAnswers.length === 0 && (
                          <span className="text-sm font-bold text-amber-900">
                            Waiting for a verified owner answer.
                          </span>
                        )}
                      </div>

                      {questionAnswers.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {questionAnswers.map((answer: Answer) => {
                            const answerProfile = answer.owner_id
                              ? profileMap.get(answer.owner_id)
                              : undefined;
                            const answerOwnedProduct = (ownedProducts || []).find(
                              (ownedProduct: OwnedProduct) =>
                                ownedProduct.user_id === answer.owner_id
                            );
                            const answerOwnerLevel = getOwnerLevel(
                              answerOwnedProduct?.verification_status,
                              answerProfile?.trust_score
                            );
                            const answerOwnerActivity = getOwnerHelpfulActivity(
                              answer.owner_id
                            );
                            const answerOwnerRating = (
                              (ownerProductRatings || []) as OwnerProductRating[]
                            ).find(
                              (rating) =>
                                rating.owned_product_id ===
                                  answerOwnedProduct?.id ||
                                rating.user_id === answer.owner_id
                            );

                            return (
                              <div
                                key={answer.id}
                                className="rounded-2xl bg-white p-4"
                              >
                                <OwnerTrustCard
                                  name={getProfileName(answerProfile)}
                                  ownerLevel={getOwnerLevelLabel(
                                    answerOwnerLevel
                                  )}
                                  photoVerified={
                                    answerOwnedProduct?.verification_status ===
                                    "photo_verified"
                                  }
                                  ownershipMonths={
                                    answerOwnedProduct?.ownership_months
                                  }
                                  rating={answerOwnedProduct?.rating}
                                  scorecardRating={
                                    answerOwnerRating?.overall_rating
                                  }
                                  answerCount={
                                    answerOwnerActivity.answerCount
                                  }
                                  helpfulCount={
                                    answerOwnerActivity.helpfulCount
                                  }
                                  compact
                                />
                                <p className="mt-3 leading-7">{answer.answer_text}</p>
                                <HelpfulButton
                                  answerId={answer.id}
                                  ownerId={answer.owner_id}
                                  currentHelpfulCount={answer.helpful_count}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {questionAnswers.length === 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <Link
                            href={`/owner/questions/${question.id}`}
                            className="btn btn-dark"
                          >
                            Answer question
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-2xl font-black">Real-owner evaluations</h2>

            {!ownedProducts || ownedProducts.length === 0 ? (
              <p className="mt-3 text-muted">
                No real owners have claimed this product yet. Be the first owner.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {ownedProducts.map((ownedProduct: OwnedProduct) => {
                  const ownerProfile = ownedProduct.user_id
                    ? profileMap.get(ownedProduct.user_id)
                    : undefined;
                  const ownerLevel = getOwnerLevel(
                    ownedProduct.verification_status,
                    ownerProfile?.trust_score
                  );
	                  const helpfulActivity = getOwnerHelpfulActivity(
	                    ownedProduct.user_id
	                  );
                    const ownerRating = (
                      (ownerProductRatings || []) as OwnerProductRating[]
                    ).find(
                      (rating) =>
                        rating.owned_product_id === ownedProduct.id ||
                        rating.user_id === ownedProduct.user_id
                    );

	                  return (
	                    <div key={ownedProduct.id} className="rounded-2xl border p-4">
                        <OwnerTrustCard
                          name={getProfileName(ownerProfile)}
                          ownerLevel={getOwnerLevelLabel(ownerLevel)}
                          photoVerified={
                            ownedProduct.verification_status ===
                            "photo_verified"
                          }
                          ownershipMonths={ownedProduct.ownership_months}
                          rating={ownedProduct.rating}
                          scorecardRating={ownerRating?.overall_rating}
                          answerCount={helpfulActivity.answerCount}
                          helpfulCount={helpfulActivity.helpfulCount}
                          compact
                        />

	                      <div className="mt-3 hidden flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getOwnerLevelBadgeClass(
                            ownerLevel
                          )}`}
                        >
                          {getOwnerLevelLabel(ownerLevel)}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                          Trust {ownerProfile?.trust_score ?? 0}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                          {ownedProduct.ownership_months || 0} months owned
                        </span>

                        {ownedProduct.rating && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {ownedProduct.rating}/5 rating
                          </span>
                        )}

                        {helpfulActivity.answerCount > 0 && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {helpfulActivity.answerCount} answers ·{" "}
                            {helpfulActivity.helpfulCount} helpful
                          </span>
                        )}
                      </div>

                      {ownedProduct.review_text && (
                        <p className="mt-3 leading-7">{ownedProduct.review_text}</p>
                      )}

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {ownedProduct.pros && (
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-xs font-black uppercase text-muted">
                              Pros
                            </p>
                            <p className="mt-1 text-sm">{ownedProduct.pros}</p>
                          </div>
                        )}

                        {ownedProduct.cons && (
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-xs font-black uppercase text-muted">
                              Cons
                            </p>
                            <p className="mt-1 text-sm">{ownedProduct.cons}</p>
                          </div>
                        )}
                      </div>

                      <p className="mt-4 text-sm font-bold text-muted">
                        Would buy again:{" "}
                        {ownedProduct.would_buy_again === true
                          ? "Yes"
                          : ownedProduct.would_buy_again === false
                          ? "No"
                          : "Not sure"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          {productSpecs && (
            <section className="card p-5">
	              <h2 className="text-xl font-black">Product details</h2>
	              {snapshotItems.length > 0 && (
	                <div className="mt-4 divide-y rounded-2xl bg-slate-50">
	                  {snapshotItems.map(([label, value]) => (
	                    <div
                        key={label}
                        className="flex items-start justify-between gap-4 p-3"
                      >
	                      <p className="text-xs font-black uppercase text-muted">
	                        {label}
	                      </p>
	                      <p className="text-right text-sm font-bold">{value}</p>
	                    </div>
	                  ))}

	                  {simpleSpecEntries.map(([key, value]) => (
	                    <div
                        key={key}
                        className="flex items-start justify-between gap-4 p-3"
                      >
	                      <p className="text-xs font-black uppercase text-muted">
	                        {formatSpecLabel(key)}
	                      </p>
	                      <p className="text-right text-sm font-bold">
	                        {cleanDisplayText(value)}
	                      </p>
	                    </div>
	                  ))}
                </div>
              )}

              {mainFeatures.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-black">Main features</h3>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    {mainFeatures.map((item) => (
                      <li key={item} className="rounded-full bg-slate-100 px-3 py-1">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {bestFor.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-black">Best for</h3>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    {bestFor.map((item) => (
                      <li key={item} className="rounded-full bg-slate-100 px-3 py-1">
                        {item}
                      </li>
                    ))}
	                  </ul>
	                </div>
	              )}

                {externalSourceLinks.length > 0 && (
                  <details id="external-sources" className="mt-5 rounded-2xl bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black">
                      External sources
                    </summary>
                    <p className="mt-2 text-xs font-bold leading-5 text-muted">
                      Used for product facts and source discovery. OwnerCheck
                      real-owner answers are separate.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                      {externalSourceLinks.slice(0, 8).map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {link.title}
                        </a>
                      ))}
                    </div>
                  </details>
                )}
	            </section>
	          )}

        </aside>
      </section>

	      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-lg backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3">
          <a href="#ask-question" className="btn btn-dark justify-center">
            Ask owners
          </a>
          <ClaimProductModal
            productId={product.id}
            productSlug={product.slug}
            category={product.category}
            triggerClassName="btn justify-center"
            triggerLabel="I own this"
          />
        </div>
      </div>
    </main>
  );
}
