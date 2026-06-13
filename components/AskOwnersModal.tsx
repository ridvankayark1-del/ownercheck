"use client";

import { useEffect, useState } from "react";
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

type AskOwnersModalProps = {
  productId: string;
  starterQuestions?: string[];
  ownerOptions: OwnerOption[];
  triggerClassName?: string;
  triggerLabel?: string;
};

export function AskOwnersModal({
  productId,
  starterQuestions = [],
  ownerOptions,
  triggerClassName = "btn",
  triggerLabel = "Ask owners",
}: AskOwnersModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"public" | "private">("public");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const hasOwners = ownerOptions.length > 0;

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 backdrop-blur-sm p-0 md:items-center md:p-5">
          {/* Backdrop Dismissal */}
          <div className="absolute inset-0 -z-10" onClick={() => setOpen(false)} />

          <div className="mx-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl md:rounded-3xl flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Ask real owners</h2>
                <p className="mt-1 text-sm text-muted">
                  Choose between a public question or starting a private chat.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black hover:bg-slate-200 transition-colors"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Switcher tabs */}
            <div className="mt-5 grid grid-cols-2 rounded-full bg-slate-100 p-1">
              <button
                type="button"
                className={`rounded-full py-2.5 text-sm font-black transition-all ${
                  mode === "public" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setMode("public")}
              >
                Public question
              </button>
              <button
                type="button"
                className={`rounded-full py-2.5 text-sm font-black transition-all ${
                  mode === "private"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setMode("private")}
              >
                Private chat
              </button>
            </div>

            <div className="mt-5 flex-1">
              {mode === "public" ? (
                <AskQuestionForm
                  productId={productId}
                  starterQuestions={starterQuestions}
                />
              ) : (
                <div className="space-y-4">
                  {!hasOwners ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                      <p className="font-bold text-slate-800">Private chat unavailable</p>
                      <p className="mt-2 text-sm text-muted leading-6">
                        Private chat becomes available when a verified owner claims this product.
                      </p>
                    </div>
                  ) : (
                    <DirectQuestionForm
                      productId={productId}
                      ownerOptions={ownerOptions}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
