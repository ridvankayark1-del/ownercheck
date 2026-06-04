import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { AskQuestionForm } from "@/components/AskQuestionForm";
import { AnswerQuestionForm } from "@/components/AnswerQuestionForm";
import { ClaimProductForm } from "@/components/ClaimProductForm";
import { HelpfulButton } from "@/components/HelpfulButton";

type PageProps = {
  params: Promise<{
    slug: string;
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

function getProfileName(profile?: Profile) {
  if (!profile) return "Anonymous user";
  if (profile.display_name) return profile.display_name;
  if (profile.email) return profile.email.split("@")[0];
  return "Anonymous user";
}

function getProductVerificationLabel(status?: string | null) {
  if (status === "catalog_verified") return "Catalog verified";
  if (status === "needs_review") return "Needs review";
  if (status === "rejected") return "Rejected";
  return "User-submitted product";
}

function getOwnerVerificationLabel(status?: string | null) {
  if (status === "photo_verified") return "Photo verified owner";
  if (status === "photo_submitted") return "Photo submitted";
  return "Unverified owner";
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, brand, category, image_url, description, ai_summary, starter_questions, evaluation_criteria, product_verification_status, source_url, verified_source"
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

  const ownerCount = ownedProducts?.length || 0;

  const photoSubmittedCount =
    ownedProducts?.filter(
      (ownedProduct: OwnedProduct) =>
        ownedProduct.verification_status === "photo_submitted" ||
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

  function getAnswersForQuestion(questionId: string) {
    return (answers || []).filter(
      (answer: Answer) => answer.question_id === questionId
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <Link href="/explore" className="text-sm font-bold text-muted">
        ← Back to explore
      </Link>

      <section className="mt-6 grid gap-8 md:grid-cols-[360px_1fr]">
        <div className="card p-5">
          <div className="overflow-hidden rounded-3xl bg-slate-100">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-72 w-full object-cover"
              />
            ) : (
              <div className="flex h-72 items-center justify-center text-muted">
                No image
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-black">{ownerCount}</p>
              <p className="text-xs font-bold text-muted">Real owners</p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-black">{photoSubmittedCount}</p>
              <p className="text-xs font-bold text-muted">Photo proof</p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-black">
                {averageRating ? averageRating : "—"}
              </p>
              <p className="text-xs font-bold text-muted">Owner rating</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <a href="#claim-product" className="btn btn-dark">
              I own this
            </a>

            <a href="#ask-question" className="btn">
              Ask question
            </a>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-muted">
              {product.brand || "Unknown brand"} ·{" "}
              {product.category || "Uncategorized"}
            </p>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
              {getProductVerificationLabel(
                product.product_verification_status
              )}
            </span>
          </div>

          <h1 className="mt-2 text-5xl font-black">{product.name}</h1>

          <p className="mt-5 text-lg leading-8 text-muted">
            {product.description ||
              "Ask real owners about this product before buying."}
          </p>

          {product.source_url && (
            <a
              href={product.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm font-bold underline"
            >
              View submitted product source
            </a>
          )}

          {product.verified_source && (
            <p className="mt-3 text-sm font-bold text-muted">
              Verified source: {product.verified_source}
            </p>
          )}

          {product.ai_summary && (
            <div className="card mt-6 p-6">
              <h2 className="text-2xl font-black">Product overview</h2>
              <p className="mt-3 leading-7 text-muted">{product.ai_summary}</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-2xl font-black">Common buyer questions</h2>

          {starterQuestions.length === 0 ? (
            <p className="mt-3 text-muted">No starter questions yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {starterQuestions.map((question: string, index: number) => (
                <li key={index} className="rounded-2xl bg-slate-50 p-4">
                  {question}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-2xl font-black">Evaluation criteria</h2>

          {evaluationCriteria.length === 0 ? (
            <p className="mt-3 text-muted">No criteria yet.</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-3">
              {evaluationCriteria.map((item: string, index: number) => (
                <li
                  key={index}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold"
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card mt-10 p-6">
        <h2 className="text-2xl font-black">Real-owner evaluations</h2>

        {!ownedProducts || ownedProducts.length === 0 ? (
          <p className="mt-3 text-muted">
            No real owners have claimed this product yet. Be the first owner.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {ownedProducts.map((ownedProduct: OwnedProduct) => {
              const ownerProfile = ownedProduct.user_id
                ? profileMap.get(ownedProduct.user_id)
                : undefined;

              return (
                <div key={ownedProduct.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
                    <span>Owner review by {getProfileName(ownerProfile)}</span>
                    <span>·</span>
                    <span>
                      {ownedProduct.ownership_months || 0} months owned
                    </span>
                    <span>·</span>
                    {ownedProduct.rating && <span>{ownedProduct.rating}/5</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {getOwnerVerificationLabel(
                        ownedProduct.verification_status
                      )}
                    </span>

                    {ownedProduct.verification_photo_url && (
                      <a
                        href={ownedProduct.verification_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-black underline"
                      >
                        View verification photo
                      </a>
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

      <section className="mt-10 grid gap-6 md:grid-cols-[1fr_420px]">
        <div className="card p-6">
          <h2 className="text-2xl font-black">Real buyer questions</h2>

          {!questions || questions.length === 0 ? (
            <p className="mt-3 text-muted">
              No one has asked about this product yet. Be the first to ask a
              real owner.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {questions.map((question: Question) => {
                const questionAnswers = getAnswersForQuestion(question.id);
                const buyerProfile = question.buyer_id
                  ? profileMap.get(question.buyer_id)
                  : undefined;

                return (
                  <div key={question.id} className="rounded-2xl border p-4">
                    <p className="font-bold">{question.question_text}</p>
                    <p className="mt-2 text-sm text-muted">
                      Asked by {getProfileName(buyerProfile)} · Reward:{" "}
                      {question.credit_reward} credits · {question.status}
                    </p>

                    {questionAnswers.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <p className="text-sm font-black">Owner answers</p>

                        {questionAnswers.map((answer: Answer) => {
                          const answerProfile = answer.owner_id
                            ? profileMap.get(answer.owner_id)
                            : undefined;

                          return (
                            <div
                              key={answer.id}
                              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
                            >
                              <p className="leading-7">{answer.answer_text}</p>
                              <p className="mt-2 text-xs font-bold text-muted">
                                Answered by {getProfileName(answerProfile)}
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
                    )}

                    <AnswerQuestionForm questionId={question.id} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div id="ask-question">
            <AskQuestionForm productId={product.id} />
          </div>

          <div id="claim-product">
            <ClaimProductForm productId={product.id} />
          </div>
        </div>
      </section>
    </main>
  );
}