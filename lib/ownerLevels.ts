export type OwnerLevel =
  | "claimed_owner"
  | "photo_submitted"
  | "photo_verified"
  | "trusted_owner";

export function getOwnerLevel(
  verificationStatus?: string | null,
  trustScore?: number | null
): OwnerLevel {
  if (verificationStatus === "photo_verified" && (trustScore || 0) >= 10) {
    return "trusted_owner";
  }

  if (verificationStatus === "photo_verified") {
    return "photo_verified";
  }

  if (verificationStatus === "photo_submitted") {
    return "photo_submitted";
  }

  return "claimed_owner";
}

export function getOwnerLevelLabel(level: OwnerLevel) {
  if (level === "trusted_owner") return "Trusted owner";
  if (level === "photo_verified") return "Photo verified";
  if (level === "photo_submitted") return "Photo submitted";
  return "Claimed owner";
}

export function getOwnerLevelBadgeClass(level: OwnerLevel) {
  if (level === "trusted_owner") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (level === "photo_verified") {
    return "bg-blue-100 text-blue-800";
  }

  if (level === "photo_submitted") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-slate-100 text-slate-700";
}
