type OwnerTrustCardProps = {
  name: string;
  ownerLevel: string;
  photoVerified?: boolean;
  ownershipMonths?: number | null;
  rating?: number | null;
  scorecardRating?: number | null;
  answerCount?: number;
  helpfulCount?: number;
  compact?: boolean;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "O";
}

function getBadgeClass(ownerLevel: string) {
  const level = ownerLevel.toLowerCase();

  if (level.includes("trusted")) return "bg-emerald-100 text-emerald-800";
  if (level.includes("photo")) return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

export function OwnerTrustCard({
  name,
  ownerLevel,
  photoVerified,
  ownershipMonths,
  rating,
  scorecardRating,
  answerCount = 0,
  helpfulCount = 0,
  compact = false,
}: OwnerTrustCardProps) {
  const stats = [
    {
      label: "Months owned",
      value: ownershipMonths ?? 0,
    },
    {
      label: "Scorecard",
      value: scorecardRating ? scorecardRating.toFixed(1) : "-",
    },
    {
      label: "Answers",
      value: answerCount,
    },
    {
      label: "Helpful",
      value: helpfulCount,
    },
  ];

  return (
    <div className={`rounded-2xl border bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
          {getInitials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black">{name}</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${getBadgeClass(
                ownerLevel
              )}`}
            >
              {ownerLevel}
            </span>
            {photoVerified && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">
                Photo verified
              </span>
            )}
          </div>
          {rating && (
            <p className="mt-1 text-xs font-bold text-muted">
              Owner rating {rating}/5
            </p>
          )}
        </div>
      </div>

      <div
        className={`mt-3 grid gap-2 text-sm ${
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"
        }`}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-slate-50 p-3">
            <p className="font-black">{stat.value}</p>
            <p className="text-xs font-bold text-muted">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
