"use client";

import { useState } from "react";
import { AskQuestionForm } from "@/components/AskQuestionForm";
import { DirectQuestionForm } from "@/components/DirectQuestionForm";

type OwnerOption = {
  userId: string;
  name: string;
  ownerLevel: string;
  ownershipMonths?: number | null;
  rating?: number | null;
  scorecardRating?: number | null;
  answerCount?: number;
  helpfulCount?: number;
  photoVerified?: boolean;
};

type UnifiedQuestionConsoleProps = {
  productId: string;
  starterQuestions?: string[];
  ownerOptions: OwnerOption[];
};

export function UnifiedQuestionConsole({
  productId,
  starterQuestions = [],
  ownerOptions,
}: UnifiedQuestionConsoleProps) {
  const [mode, setMode] = useState<"public" | "private">("public");

  return (
    <section id="ask-question" className="card p-4 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-muted">
          Ask real owners
        </p>
        <h2 className="mt-1 text-2xl font-black">Choose your route</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Public questions help every shopper. Private chat is one-to-one with a
          selected verified owner.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-full bg-slate-100 p-1">
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-black transition ${
            mode === "public" ? "bg-white shadow-sm" : "text-slate-600"
          }`}
          onClick={() => setMode("public")}
        >
          Public
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-black transition ${
            mode === "private" ? "bg-white shadow-sm" : "text-slate-600"
          }`}
          onClick={() => setMode("private")}
        >
          Private
        </button>
      </div>

      <div className="mt-4">
        {mode === "public" ? (
          <AskQuestionForm
            productId={productId}
            starterQuestions={starterQuestions}
          />
        ) : (
          <DirectQuestionForm
            productId={productId}
            ownerOptions={ownerOptions}
          />
        )}
      </div>
    </section>
  );
}
