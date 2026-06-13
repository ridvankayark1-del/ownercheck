import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ClaimProductModal } from "@/components/ClaimProductModal";
import { HelpfulButton } from "@/components/HelpfulButton";
import { OwnerTrustCard } from "@/components/OwnerTrustCard";
import { ProductImage } from "@/components/ProductImage";
import { ProductInsightsTabs } from "@/components/ProductInsightsTabs";
import { AskOwnersModal } from "@/components/AskOwnersModal";
import { getCategoryProfile } from "@/lib/productCategoryProfiles";
import { getOwnerEvaluationCriteria } from "@/lib/ownerEvaluationCriteria";
import { getGroupedSpecs, formatSpecLabel } from "@/lib/productSpecs";
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

function isKnownAirPods3(name?: string | null, brand?: string | null) {
  return /airpods\s*3|airpods\s*\(?3rd generation\)?/i.test(
    `${brand || ""} ${name || ""}`
  );
}

function getKeySpecsStrip(specs: ProductSpecs | null): string[] {
  if (!specs) return [];
  const list: string[] = [];

  const findVal = (keyNames: string[]): string | null => {
    for (const k of keyNames) {
      if (typeof specs[k] === "string" && specs[k]) return specs[k] as string;
      if (typeof specs[k] === "boolean") return specs[k] ? "Yes" : "No";
    }
    const items = Array.isArray(specs._items) ? specs._items : [];
    for (const item of items) {
      if (item && typeof item === "object") {
        const itemKey = String((item as any).key || "").toLowerCase().replace(/^spec:/, "");
        if (keyNames.map(k => k.toLowerCase()).includes(itemKey)) {
          if ((item as any).value) return String((item as any).value);
        }
      }
    }
    return null;
  };

  const typeVal = findVal(["type", "product_type"]);
  if (typeVal) {
    list.push(typeVal);
  }

  const wirelessVal = findVal(["wireless"]);
  if (wirelessVal) {
    if (/yes|true/i.test(wirelessVal)) list.push("Wireless");
    else if (/no|false/i.test(wirelessVal)) list.push("Wired");
    else list.push(wirelessVal);
  }

  const enclosureVal = findVal(["enclosure"]);
  if (enclosureVal) {
    list.push(enclosureVal);
  }

  const ncVal = findVal(["noise_cancelling", "noise_cancellation"]);
  if (ncVal) {
    if (/yes|true/i.test(ncVal)) list.push("Noise cancelling");
    else if (/no|false/i.test(ncVal)) list.push("No ANC");
    else list.push(ncVal);
  }

  const micVal = findVal(["mic", "microphone_type"]);
  if (micVal) {
    if (/yes|true/i.test(micVal)) list.push("Mic");
    else if (/no|false/i.test(micVal)) list.push("No mic");
    else list.push(micVal);
  }

  const ssVal = findVal(["sound_signature", "sound_profile"]);
  if (ssVal) {
    list.push(ssVal);
  }

  const batVal = findVal(["battery_life"]);
  if (batVal) {
    list.push(batVal.toLowerCase().includes("hour") ? batVal : `${batVal} battery`);
  }

  return list.slice(0, 6);
}

function getShortSummaryFallback(product: any, specs: ProductSpecs | null): string {
  if (product.short_summary) return product.short_summary;
  
  const findVal = (keyNames: string[]): string | null => {
    for (const k of keyNames) {
      if (typeof specs?.[k] === "string" && specs[k]) return specs[k] as string;
      if (typeof specs?.[k] === "boolean") return specs[k] ? "Yes" : "No";
    }
    const items = specs && Array.isArray(specs._items) ? specs._items : [];
    for (const item of items) {
      if (item && typeof item === "object") {
        const itemKey = String((item as any).key || "").toLowerCase().replace(/^spec:/, "");
        if (keyNames.map(k => k.toLowerCase()).includes(itemKey)) {
          if ((item as any).value) return String((item as any).value);
        }
      }
    }
    return null;
  };

  const isWireless = /yes|true/i.test(findVal(["wireless"]) || "");
  const isNoiseCancelling = /yes|true/i.test(findVal(["noise_cancelling", "noise_cancellation"]) || "");
  const hasMic = /yes|true/i.test(findVal(["mic", "microphone_type"]) || "");
  const enclosure = findVal(["enclosure"])?.toLowerCase() || "";
  const type = findVal(["type", "product_type"])?.toLowerCase() || "headphones";

  const parts = [];
  parts.push(isWireless ? "Wireless" : "Wired");
  if (enclosure) {
    parts.push(`${enclosure} ${type}`);
  } else {
    parts.push(type);
  }

  const features = [];
  if (hasMic) features.push("built-in mic");
  features.push(isNoiseCancelling ? "active noise cancelling" : "no active noise cancelling");

  let summary = parts.join(" ");
  if (features.length > 0) {
    summary += ` with a ${features.join(" and ")}`;
  }
  summary += ".";

  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const shouldOpenClaim = query?.claim === "1";

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, canonical_title, brand, category, main_category, main_category_slug, category_slug, product_type_slug, product_type, image_url, description, ai_summary, short_summary, specs, external_summary, common_praise, common_complaints, external_review_links, external_summary_sources, starter_questions, evaluation_criteria, product_verification_status, enrichment_status, enrichment_confidence, category_confidence, specs_confidence, identity_approved_at, specs_approved_at, image_approved_at, duplicate_reviewed_at, source_url, verified_source"
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
    ? (product.starter_questions as string[])
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

  const mainFeatures = getStringList(
    productSpecs?.main_features || productSpecs?.notable_features || []
  );
  const bestFor = getStringList(productSpecs?.best_for || productSpecs?.use_cases || []);
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

  // Key spec strip and short summary fallback
  const keySpecsStrip = getKeySpecsStrip(productSpecs);
  const shortSummary = getShortSummaryFallback(product, productSpecs);

  // Tab 1: Overview
  const overviewTab = (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-slate-900">Product overview</h3>
        <p className="mt-2 text-base leading-7 text-slate-700">{shortSummary}</p>
      </div>

      {keySpecsStrip.length > 0 && (
        <div className="rounded-2xl bg-slate-50 p-4">
          <h4 className="text-xs font-black uppercase text-muted">Key specifications</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {keySpecsStrip.map((spec) => (
              <span key={spec} className="rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-bold text-slate-800">
                {spec}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Owner activity stats block */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          ["Verified Owners", photoVerifiedCount],
          ["Owner Answers", answers?.length || 0],
          ["Average Rating", averageRating || "No ratings"],
          ["Public Questions", questions?.length || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black text-slate-900">{value}</p>
            <p className="text-xs font-bold text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Latest Questions */}
      <div className="space-y-3">
        <h4 className="text-sm font-black text-slate-800">Recent Q&A</h4>
        {questions && questions.length > 0 ? (
          <div className="space-y-3">
            {questions.slice(0, 3).map((q) => {
              const qAnswers = getAnswersForQuestion(q.id);
              return (
                <div key={q.id} className="rounded-2xl border border-slate-100 p-4 bg-white shadow-sm">
                  <p className="font-bold text-slate-900">{q.question_text}</p>
                  {qAnswers.length > 0 ? (
                    <p className="mt-2 text-sm text-slate-600 italic">
                      "{qAnswers[0].answer_text.slice(0, 160)}..."
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-600 font-bold">Waiting for answer</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted">No questions asked yet.</p>
        )}
      </div>

      {externalSourceLinks.length > 0 && (
        <div className="pt-2">
          <a href="#external-sources" className="text-sm font-bold underline text-slate-600 hover:text-black">
            View all {externalSourceLinks.length} external sources
          </a>
        </div>
      )}
    </div>
  );

  // Tab 2: Questions
  const questionsTab = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900">
            Questions for real owners
          </h2>
          <p className="mt-1 text-sm font-bold text-muted">
            {answeredQuestionCount} answered / {questions?.length || 0} total
          </p>
        </div>
      </div>

      {!questions || questions.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-5 text-center">
          <p className="font-bold text-slate-800">
            No one has asked about this product yet.
          </p>
          <AskOwnersModal
            productId={product.id}
            starterQuestions={starterQuestions}
            ownerOptions={directOwnerOptions}
            triggerClassName="btn btn-dark mt-3"
            triggerLabel="Ask the first question"
          />
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {questions.map((question: Question) => {
            const questionAnswers = getAnswersForQuestion(question.id);
            const buyerProfile = question.buyer_id
              ? profileMap.get(question.buyer_id)
              : undefined;

            return (
              <article key={question.id} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">
                      {question.question_text}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Asked by {getProfileName(buyerProfile)} / Reward:{" "}
                      {question.credit_reward} credits
                    </p>
                  </div>
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
                </div>

                {questionAnswers.length > 0 ? (
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
                          className="rounded-2xl bg-slate-50 p-4 border border-slate-100/60"
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
                            answerCount={answerOwnerActivity.answerCount}
                            helpfulCount={
                              answerOwnerActivity.helpfulCount
                            }
                            compact
                          />
                          <p className="mt-3 leading-7 text-slate-800">
                            {answer.answer_text}
                          </p>
                          <HelpfulButton
                            answerId={answer.id}
                            ownerId={answer.owner_id}
                            currentHelpfulCount={answer.helpful_count}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-amber-900">
                      Waiting for a verified owner answer.
                    </span>
                    <Link
                      href={`/owner/questions/${question.id}`}
                      className="btn btn-dark text-xs py-1.5 px-3"
                    >
                      Answer question
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  // Tab 3: Owner Scorecard
  const scorecardTab = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Owner scorecard</h2>
          <p className="mt-1 text-sm font-black text-muted">
            Based on real-owner ratings.
          </p>
        </div>

        <div className="text-right">
          <p className="text-4xl font-black text-slate-950">
            {scorecardOverall ? scorecardOverall.toFixed(1) : "-"}
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
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
              Photo-verified owner ratings
            </span>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {scorecardAverages.map((item) => (
              <div
                key={item.criterion}
                className="rounded-2xl bg-slate-50 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-slate-800">{item.criterion}</p>
                  <p className="font-black text-slate-955">
                    {item.average.toFixed(1)}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{
                      width: `${Math.min(item.average * 20, 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Real-owner evaluations list */}
          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Real-owner reviews</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {ownedProducts?.filter(op => op.rating !== null || op.review_text).map((ownedProduct: OwnedProduct) => {
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
                  <article
                    key={ownedProduct.id}
                    className="rounded-2xl bg-slate-50 p-4 border border-slate-100"
                  >
                    <OwnerTrustCard
                      name={getProfileName(ownerProfile)}
                      ownerLevel={getOwnerLevelLabel(ownerLevel)}
                      photoVerified={
                        ownedProduct.verification_status === "photo_verified"
                      }
                      ownershipMonths={ownedProduct.ownership_months}
                      rating={ownedProduct.rating}
                      scorecardRating={ownerRating?.overall_rating}
                      answerCount={helpfulActivity.answerCount}
                      helpfulCount={helpfulActivity.helpfulCount}
                      compact
                    />

                    {ownedProduct.review_text && (
                      <p className="mt-3 leading-7 text-sm text-slate-700">
                        {ownedProduct.review_text}
                      </p>
                    )}

                    <div className="mt-4 grid gap-3 grid-cols-2">
                      {ownedProduct.pros && (
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted">
                            Pros
                          </p>
                          <p className="mt-1 text-sm text-slate-800">{ownedProduct.pros}</p>
                        </div>
                      )}

                      {ownedProduct.cons && (
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted">
                            Cons
                          </p>
                          <p className="mt-1 text-sm text-slate-800">{ownedProduct.cons}</p>
                        </div>
                      )}
                    </div>

                    <p className="mt-4 text-xs font-bold text-muted">
                      Would buy again:{" "}
                      {ownedProduct.would_buy_again === true
                        ? "Yes"
                        : ownedProduct.would_buy_again === false
                          ? "No"
                          : "Not sure"}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-slate-50 p-5 text-center">
          <p className="font-bold text-slate-800">
            No owner ratings yet.
          </p>
          <ClaimProductModal
            productId={product.id}
            productSlug={product.slug}
            category={product.category}
            triggerClassName="btn btn-dark mt-3"
            triggerLabel="Add owner rating"
          />
        </div>
      )}
    </div>
  );

  // Tab 4: Details
  const specItems: any[] = [];
  if (productSpecs) {
    if (Array.isArray(productSpecs._items)) {
      productSpecs._items.forEach((item: any) => {
        if (item && item.key) {
          specItems.push({
            key: item.key,
            label: item.label || formatSpecLabel(item.key),
            value: item.value,
          });
        }
      });
    } else {
      Object.entries(productSpecs).forEach(([key, value]) => {
        if (key !== "_items" && typeof value === "string") {
          specItems.push({
            key,
            label: formatSpecLabel(key),
            value,
          });
        }
      });
    }
  }

  const detailsTab = (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900">Product details</h2>
      {specItems.length > 0 ? (
        <div className="mt-4 space-y-6">
          {getGroupedSpecs(specItems).map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1">{group.label}</h3>
              <div className="divide-y divide-slate-100">
                {group.items.map((spec) => (
                  <div key={spec.key} className="flex justify-between py-2.5 text-sm">
                    <span className="text-slate-500 font-medium">{spec.label || spec.key}</span>
                    <span className="text-slate-900 font-bold text-right">{String(spec.value || "")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted">
          Product details are still being verified.
        </p>
      )}

      {mainFeatures.length > 0 && (
        <div>
          <h3 className="font-black text-slate-900">Main features</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            {mainFeatures.map((item) => (
              <li
                key={item}
                className="rounded-full bg-slate-100 px-3 py-1 text-slate-800"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {bestFor.length > 0 && (
        <div>
          <h3 className="font-black text-slate-900">Best for</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            {bestFor.map((item) => (
              <li
                key={item}
                className="rounded-full bg-slate-100 px-3 py-1 text-slate-800"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {externalSourceLinks.length > 0 && (
        <div id="external-sources" className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
          <h3 className="text-sm font-black text-slate-800">External sources</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-muted">
            Used for product facts and source discovery. OwnerCheck real-owner answers are separate.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
            {externalSourceLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="underline text-slate-600 hover:text-black"
              >
                {link.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-5 md:pb-12">
      <nav className="text-sm font-bold text-muted flex items-center gap-1.5 flex-wrap">
        <Link href="/explore" className="hover:text-slate-950 transition-colors">
          Explore
        </Link>
        {product.main_category && (
          <>
            <span className="text-slate-300">/</span>
            <Link
              href={`/explore?main_category=${product.main_category_slug}`}
              className="hover:text-slate-950 transition-colors"
            >
              {product.main_category}
            </Link>
          </>
        )}
        {product.category && (
          <>
            <span className="text-slate-300">/</span>
            <Link
              href={`/explore?category=${product.category_slug}`}
              className="hover:text-slate-950 transition-colors"
            >
              {product.category}
            </Link>
          </>
        )}
        {product.product_type && (
          <>
            <span className="text-slate-300">/</span>
            <Link
              href={`/explore?category=${product.category_slug}&type=${product.product_type_slug}`}
              className="hover:text-slate-950 transition-colors"
            >
              {product.product_type}
            </Link>
          </>
        )}
      </nav>

      <section className="mt-5 grid gap-7 lg:grid-cols-[380px_1fr] lg:items-center">
        <div className="overflow-hidden rounded-3xl bg-slate-100">
          <ProductImage
            src={product.image_url}
            category={product.category}
            alt={product.name}
            className="h-72 w-full object-cover sm:h-96 lg:h-[430px]"
          />
        </div>

        <div className="flex flex-col justify-between gap-6 py-1">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-muted">
                {displayBrand || "Unknown brand"} ·{" "}
                {displayCategory || "Uncategorized"}
                {displayProductType ? ` · ${displayProductType}` : ""}
              </p>
              {product.product_verification_status === "catalog_verified" && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                  Catalog verified
                </span>
              )}
            </div>

            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
              {displayName}
            </h1>

            {/* Elegant Key Spec Strip under Product Name */}
            {keySpecsStrip.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-700">
                {keySpecsStrip.map((spec, index) => (
                  <span key={index} className="inline-flex items-center">
                    {index > 0 && <span className="mr-1.5 text-slate-300">·</span>}
                    {spec}
                  </span>
                ))}
              </div>
            )}

            {/* Stats Row */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-muted">
              {[
                [`${photoVerifiedCount}`, "verified owners"],
                [`${answers?.length || 0}`, "owner answers"],
                [averageRating ? `${averageRating} rating` : "No ratings yet", ""],
                [`${questions?.length || 0}`, "public questions"],
              ].map(([value, label], index) => (
                <div key={index} className="flex items-center gap-3">
                  {index > 0 && <span className="h-4 w-px bg-slate-200" />}
                  <p>
                    <span className="font-black text-slate-950">{value}</span>{" "}
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Short Product Summary */}
            <div className="mt-4 leading-7 text-muted">
              <p>{shortSummary}</p>
            </div>
          </div>

          {/* Hero Action Row */}
          <div className="flex flex-wrap gap-3">
            <AskOwnersModal
              productId={product.id}
              starterQuestions={starterQuestions}
              ownerOptions={directOwnerOptions}
              triggerClassName="btn btn-dark px-6 py-2.5 text-sm"
              triggerLabel="Ask owners"
            />
            
            <ClaimProductModal
              productId={product.id}
              productSlug={product.slug}
              category={product.category}
              triggerClassName="btn px-6 py-2.5 text-sm"
              defaultOpen={shouldOpenClaim}
            />

            {externalSourceLinks.length > 0 && (
              <a
                href="#external-sources"
                className="btn px-6 py-2.5 text-sm text-muted"
              >
                View sources
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main insights Horizontal Tabbed section */}
      <div className="mt-8 max-w-4xl">
        <ProductInsightsTabs
          overview={overviewTab}
          questions={questionsTab}
          scorecard={scorecardTab}
          details={detailsTab}
        />
      </div>

      {/* Sticky Bottom bar for mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-lg backdrop-blur md:hidden">
        <div className="mx-auto grid grid-cols-2 gap-3">
          <AskOwnersModal
            productId={product.id}
            starterQuestions={starterQuestions}
            ownerOptions={directOwnerOptions}
            triggerClassName="btn btn-dark justify-center"
            triggerLabel="Ask owners"
          />
          <ClaimProductModal
            productId={product.id}
            productSlug={product.slug}
            category={product.category}
            triggerClassName="btn justify-center"
          />
        </div>
      </div>
    </main>
  );
}
