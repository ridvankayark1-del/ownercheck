"use client";

import { ReactNode, useState } from "react";

type ProductInsightsTabsProps = {
  scorecard: ReactNode;
  details: ReactNode;
  buyingChecks?: ReactNode;
};

const tabs = [
  { id: "scorecard", label: "Owner scorecard" },
  { id: "details", label: "Product details" },
  { id: "checks", label: "Check before buying" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function ProductInsightsTabs({
  scorecard,
  details,
  buyingChecks,
}: ProductInsightsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("scorecard");

  const content = {
    scorecard,
    details,
    checks: buyingChecks,
  };

  return (
    <section className="border-y border-slate-200 py-5">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const disabled = tab.id === "checks" && !buyingChecks;

          return (
            <button
              key={tab.id}
              type="button"
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition ${
                activeTab === tab.id
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">{content[activeTab] || content.scorecard}</div>
    </section>
  );
}
