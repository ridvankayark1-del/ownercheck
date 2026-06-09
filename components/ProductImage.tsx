"use client";

import { useState } from "react";
import { getCategoryPlaceholderImage } from "@/lib/productImages";

type ProductImageProps = {
  src?: string | null;
  category?: string | null;
  alt: string;
  className?: string;
};

export function ProductImage({
  src,
  category,
  alt,
  className,
}: ProductImageProps) {
  const fallback = getCategoryPlaceholderImage(category);
  const [imageSrc, setImageSrc] = useState(src || fallback);

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setImageSrc(fallback)}
    />
  );
}
