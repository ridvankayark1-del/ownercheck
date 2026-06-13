"use client";

import { ReactNode, useState } from "react";

type ProductInsightsTabsProps = {
  overview: ReactNode;
  questions: ReactNode;
  scorecard: ReactNode;
  details: ReactNode;
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Questions" },
  { id: "scorecard", label: "Owner scorecard" },
  { id: "details", label: "Product details" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function ProductInsightsTabs({
  overview,
  questions,
  scorecard,
  details,
}: ProductInsightsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const content = {
    overview,
    questions,
    scorecard,
    details,
  };

  return (
    <section className="border-y border-slate-200 py-5">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          return (
            <button
              key={tab.id}
              type="button"
              className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-black transition ${
                activeTab === tab.id
                  ? "bg-slate-950 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">{content[activeTab] || content.overview}</div>
    </section>
  );
}
