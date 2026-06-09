"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  getOwnerLevel,
  getOwnerLevelBadgeClass,
  getOwnerLevelLabel,
} from "@/lib/ownerLevels";

type Profile = {
  display_name: string | null;
  email: string | null;
  credit_balance: number | null;
  trust_score: number | null;
};

type ProductInfo = {
  slug: string;
  name: string;
  brand: string | null;
};

type QuestionProductInfo = {
  slug: string;
  name: string;
};

type RawOwnedProduct = {
  id: string;
  ownership_months: number | null;
  verification_status: string;
  rating: number | null;
  review_text: string | null;
  products: ProductInfo | ProductInfo[] | null;
};

type OwnedProduct = {
  id: string;
  ownership_months: number | null;
  verification_status: string;
  rating: number | null;
  review_text: string | null;
  products: ProductInfo | null;
};

type RawQuestion = {
  id: string;
  question_text: string;
  status: string;
  products: QuestionProductInfo | QuestionProductInfo[] | null;
};

type Question = {
  id: string;
  question_text: string;
  status: string;
  products: QuestionProductInfo | null;
};

type RawAnswer = {
  id: string;
  answer_text: string;
  helpful_count: number;
  questions:
    | {
        question_text: string;
        products: QuestionProductInfo | QuestionProductInfo[] | null;
      }
    | {
        question_text: string;
        products: QuestionProductInfo | QuestionProductInfo[] | null;
      }[]
    | null;
};

type Answer = {
  id: string;
  answer_text: string;
  helpful_count: number;
  questions: {
    question_text: string;
    products: QuestionProductInfo | null;
  } | null;
};

type RawDirectQuestion = {
  id: string;
  question_text: string;
  answer_text: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
  products: QuestionProductInfo | QuestionProductInfo[] | null;
  profiles:
    | {
        display_name: string | null;
        email: string | null;
      }
    | {
        display_name: string | null;
        email: string | null;
      }[]
    | null;
};

type DirectQuestion = {
  id: string;
  question_text: string;
  answer_text: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
  products: QuestionProductInfo | null;
  profiles: {
    display_name: string | null;
    email: string | null;
  } | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedProducts, setOwnedProducts] = useState<OwnedProduct[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [directQuestions, setDirectQuestions] = useState<DirectQuestion[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setErrorMessage(userError.message);
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      if (!user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, email, credit_balance, trust_score")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setErrorMessage(profileError.message);
      }

      const { data: ownedProductsData, error: ownedProductsError } =
        await supabase
          .from("owned_products")
          .select(
            "id, ownership_months, verification_status, rating, review_text, products(slug, name, brand)"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

      if (ownedProductsError) {
        setErrorMessage(ownedProductsError.message);
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select("id, question_text, status, products(slug, name)")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });

      if (questionsError) {
        setErrorMessage(questionsError.message);
      }

      const { data: answersData, error: answersError } = await supabase
        .from("answers")
        .select(
          "id, answer_text, helpful_count, questions(question_text, products(slug, name))"
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (answersError) {
        setErrorMessage(answersError.message);
      }

      const { data: directQuestionsData, error: directQuestionsError } =
        await supabase
          .from("direct_questions")
          .select(
            "id, question_text, answer_text, status, created_at, answered_at, products(slug, name), profiles!direct_questions_owner_id_fkey(display_name, email)"
          )
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false });

      if (directQuestionsError) {
        setErrorMessage(directQuestionsError.message);
      }

      const normalizedOwnedProducts = (
        (ownedProductsData || []) as RawOwnedProduct[]
      ).map((item) => ({
        ...item,
        products: normalizeSingle(item.products),
      }));

      const normalizedQuestions = ((questionsData || []) as RawQuestion[]).map(
        (question) => ({
          ...question,
          products: normalizeSingle(question.products),
        })
      );

      const normalizedAnswers = ((answersData || []) as RawAnswer[]).map(
        (answer) => {
          const question = normalizeSingle(answer.questions);

          return {
            ...answer,
            questions: question
              ? {
                  ...question,
                  products: normalizeSingle(question.products),
                }
              : null,
          };
        }
      );

      const normalizedDirectQuestions = (
        (directQuestionsData || []) as RawDirectQuestion[]
      ).map((question) => ({
        ...question,
        products: normalizeSingle(question.products),
        profiles: normalizeSingle(question.profiles),
      }));

      setProfile(profileData || null);
      setOwnedProducts(normalizedOwnedProducts);
      setQuestions(normalizedQuestions);
      setAnswers(normalizedAnswers);
      setDirectQuestions(normalizedDirectQuestions);
      setLoading(false);
    }

    loadProfile();
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading profile...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">You are not logged in</h1>
          <p className="mt-3 text-muted">
            Log in to see your profile, credits, products, questions, and
            answers.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const displayName =
    profile?.display_name || profile?.email?.split("@")[0] || "User";
  const verifiedProductsCount = ownedProducts.filter(
    (item) => item.verification_status === "photo_verified"
  ).length;
  const profileOwnerLevel =
    verifiedProductsCount > 0
      ? getOwnerLevel("photo_verified", profile?.trust_score)
      : null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="card p-6">
        <p className="font-bold text-muted">Profile</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-black">{displayName}</h1>
          {profileOwnerLevel && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${getOwnerLevelBadgeClass(
                profileOwnerLevel
              )}`}
            >
              {getOwnerLevelLabel(profileOwnerLevel)}
            </span>
          )}
        </div>
        <p className="mt-2 text-muted">{profile?.email}</p>

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">
              {profile?.credit_balance ?? 0}
            </p>
            <p className="text-sm font-bold text-muted">Credits</p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">{profile?.trust_score ?? 0}</p>
            <p className="text-sm font-bold text-muted">Trust score</p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">{ownedProducts.length}</p>
            <p className="text-sm font-bold text-muted">Products owned</p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">{verifiedProductsCount}</p>
            <p className="text-sm font-bold text-muted">Verified products</p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-2xl font-black">{answers.length}</p>
            <p className="text-sm font-bold text-muted">Answers given</p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-2xl font-black">Products I own</h2>

          {ownedProducts.length === 0 ? (
            <p className="mt-3 text-muted">No owned products yet.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {ownedProducts.map((item) => (
                <Link
                  key={item.id}
                  href={`/product/${item.products?.slug || ""}`}
                  className="block rounded-2xl border p-4 hover:bg-slate-50"
                >
                  <p className="font-black">
                    {item.products?.name || "Unknown product"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {item.products?.brand || "Unknown brand"} ·{" "}
                    {item.ownership_months || 0} months owned ·{" "}
                    {item.rating || "—"}/5
                  </p>
                  <span
                    className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${getOwnerLevelBadgeClass(
                      getOwnerLevel(
                        item.verification_status,
                        profile?.trust_score
                      )
                    )}`}
                  >
                    {getOwnerLevelLabel(
                      getOwnerLevel(
                        item.verification_status,
                        profile?.trust_score
                      )
                    )}
                  </span>
                  {item.review_text && (
                    <p className="mt-2 line-clamp-2 text-sm">
                      {item.review_text}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-2xl font-black">Questions I asked</h2>

          {questions.length === 0 ? (
            <p className="mt-3 text-muted">No questions asked yet.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {questions.map((question) => (
                <Link
                  key={question.id}
                  href={`/product/${question.products?.slug || ""}`}
                  className="block rounded-2xl border p-4 hover:bg-slate-50"
                >
                  <p className="font-bold">{question.question_text}</p>
                  <p className="mt-2 text-sm text-muted">
                    {question.products?.name || "Unknown product"} ·{" "}
                    {question.status}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card mt-8 p-6">
        <h2 className="text-2xl font-black">Answers I gave</h2>

        {answers.length === 0 ? (
          <p className="mt-3 text-muted">No answers yet.</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {answers.map((answer) => (
              <Link
                key={answer.id}
                href={`/product/${answer.questions?.products?.slug || ""}`}
                className="block rounded-2xl border p-4 hover:bg-slate-50"
              >
                <p className="text-sm font-bold text-muted">
                  Question: {answer.questions?.question_text}
                </p>
                <p className="mt-3 line-clamp-3">{answer.answer_text}</p>
                <p className="mt-2 text-sm text-muted">
                  {answer.questions?.products?.name || "Unknown product"} ·
                  Helpful: {answer.helpful_count}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-8 p-6">
        <h2 className="text-2xl font-black">Direct questions</h2>

        {directQuestions.length === 0 ? (
          <p className="mt-3 text-muted">No direct questions asked yet.</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {directQuestions.map((question) => {
              const ownerName =
                question.profiles?.display_name ||
                question.profiles?.email?.split("@")[0] ||
                "Owner";

              return (
                <Link
                  key={question.id}
                  href={`/product/${question.products?.slug || ""}`}
                  className="block rounded-2xl border p-4 hover:bg-slate-50"
                >
                  <p className="text-sm font-bold text-muted">
                    {question.products?.name || "Unknown product"} ·{" "}
                    {question.status} · Owner: {ownerName}
                  </p>
                  <p className="mt-3 font-bold">{question.question_text}</p>

                  {question.answer_text ? (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase text-muted">
                        Private answer
                      </p>
                      <p className="mt-2 line-clamp-4">
                        {question.answer_text}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      Waiting for the owner to answer.
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
