import { getHeadphoneProductTypeNormalization, resolveProductType } from "./productFactory";

export function getIdentityIssues(product: {
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  product_type?: string | null;
  suggested_product_type?: string | null;
  specs?: Record<string, unknown> | null;
  identity_approved_at?: string | null;
}) {
  const missing: string[] = [];
  if (!product.name?.trim()) missing.push("Missing name");
  if (!product.brand?.trim()) missing.push("Missing brand");
  if (!product.category?.trim()) missing.push("Missing category");

  const resolvedType = resolveProductType(product);
  if (!resolvedType?.trim()) missing.push("Missing product type");

  const normalization = getHeadphoneProductTypeNormalization({
    name: product.name,
    category: product.category,
    productType: product.product_type,
    specs: product.specs,
  });

  if (normalization.hasConflict) {
    missing.push("Product type conflict");
  }

  if (
    missing.length === 0 &&
    product.identity_approved_at !== undefined &&
    !product.identity_approved_at
  ) {
    missing.push("Identity needs approval");
  }

  return missing;
}

export function getSpecsSummary(
  product: { category?: string | null },
  specRows: { key: string; value: string }[]
) {
  let categoryKeys: string[] = [];
  if (product.category?.toLowerCase() === "headphones") {
    categoryKeys = ["type", "wireless", "enclosure", "noise_cancelling", "mic"];
  }

  const coreSpecsCount = categoryKeys.length;
  const filledCoreSpecs = specRows.filter(row => categoryKeys.includes(row.key) && row.value.trim()).length;
  const filledExtraSpecs = specRows.filter(row => !categoryKeys.includes(row.key) && row.value.trim()).length;
  const missingRecommended = categoryKeys.filter(key => !specRows.some(row => row.key === key && row.value.trim())).length;

  return {
    coreCount: coreSpecsCount,
    filledCore: filledCoreSpecs,
    filledExtra: filledExtraSpecs,
    missingRecommended,
    totalFilled: filledCoreSpecs + filledExtraSpecs,
  };
}
