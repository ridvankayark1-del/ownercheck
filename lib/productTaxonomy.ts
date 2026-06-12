export type TaxonomyResult = {
  category: string;
  productType: string | null;
  confidence: number;
  warnings: string[];
};

const ALLOWED_PRODUCT_TYPES: Record<string, string[]> = {
  Headphones: [
    "True wireless earbuds",
    "Wireless earbuds",
    "Over-ear headphones",
    "On-ear headphones",
    "Gaming headset",
    "Wired earbuds",
    "Noise-cancelling headphones",
    "Wired studio headphones",
  ],
  Camera: [
    "Mirrorless camera",
    "Action camera",
    "Pocket gimbal camera",
    "Compact camera",
    "Camera",
  ],
  Bags: [
    "Tote bag",
    "Shoulder bag",
    "Backpack",
    "Crossbody bag",
    "Travel bag",
    "Bag",
  ],
  Watches: ["Smartwatch", "Mechanical watch", "Quartz watch", "Watch"],
  Shoes: ["Running shoes", "Lifestyle shoes", "Sneakers", "Boots", "Shoes"],
  Keyboard: ["Mechanical keyboard", "Wireless keyboard", "Keyboard"],
  Mouse: ["Wireless mouse", "Gaming mouse", "Ergonomic mouse", "Mouse"],
  Speaker: ["Bluetooth speaker", "Smart speaker", "Bookshelf speakers", "Speaker"],
  Monitor: ["4K monitor", "Ultrawide monitor", "OLED monitor", "Gaming monitor", "Monitor"],
  Other: ["Product"],
};

function clean(value?: string | null) {
  return (value || "").trim();
}

function lower(value?: string | null) {
  return clean(value).toLowerCase();
}

export function getAllowedProductTypes(category?: string | null) {
  return ALLOWED_PRODUCT_TYPES[clean(category)] || ALLOWED_PRODUCT_TYPES.Other;
}

export function getCategorySpecKeys(category?: string | null) {
  const normalized = lower(category);

  if (normalized.includes("headphone") || normalized.includes("audio")) {
    return [
      "product_type",
      "fit_type",
      "connectivity",
      "noise_cancellation",
      "battery_life",
      "charging",
      "water_resistance",
      "microphone",
      "compatibility",
      "weight",
    ];
  }

  if (normalized.includes("camera")) {
    return [
      "sensor",
      "resolution",
      "lens_mount",
      "stabilization",
      "video_resolution",
      "autofocus",
      "weight",
      "battery",
      "storage",
    ];
  }

  if (normalized.includes("bag")) {
    return [
      "material",
      "dimensions",
      "size_variant",
      "closure",
      "strap_drop",
      "hardware",
      "interior",
    ];
  }

  if (normalized.includes("watch")) {
    return [
      "case_size",
      "movement",
      "water_resistance",
      "reference_number",
      "material",
      "bracelet_strap",
    ];
  }

  return ["product_type", "connectivity", "compatibility", "weight", "material"];
}

export function guardProductTaxonomy({
  title,
  brand,
  category,
  productType,
}: {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  productType?: string | null;
}): TaxonomyResult {
  const warnings: string[] = [];
  const titleText = lower(title);
  const brandText = lower(brand);
  let nextCategory = clean(category) || "Other";
  let nextProductType = clean(productType) || null;
  let confidence = 0.55;

  if (brandText === "apple" && titleText.includes("airpods")) {
    nextCategory = "Headphones";
    nextProductType = titleText.includes("max")
      ? "Over-ear headphones"
      : "True wireless earbuds";
    confidence = 0.95;
  }

  const allowed = getAllowedProductTypes(nextCategory);

  if (
    nextProductType &&
    !allowed.some((allowedType) => lower(allowedType) === lower(nextProductType))
  ) {
    warnings.push("Suggested product type conflicts with product identity.");
    nextProductType = allowed[0] || null;
    confidence = Math.min(confidence, 0.45);
  }

  if (
    brandText === "apple" &&
    titleText.includes("airpods") &&
    lower(productType).includes("gaming")
  ) {
    warnings.push("Suggested product type conflicts with product identity.");
    nextProductType = "True wireless earbuds";
    confidence = 0.95;
  }

  return {
    category: nextCategory,
    productType: nextProductType,
    confidence,
    warnings: Array.from(new Set(warnings)),
  };
}
