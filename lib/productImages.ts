export type BraveImageCandidate = {
  thumbnail?: {
    src?: string;
  };
  profile?: {
    img?: string;
  };
};

export function getCategoryPlaceholderImage(category?: string | null) {
  const normalized = (category || "").toLowerCase();

  if (normalized.includes("headphone") || normalized.includes("earbud")) {
    return "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1200&auto=format&fit=crop";
  }

  if (normalized.includes("microphone")) {
    return "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=1200&auto=format&fit=crop";
  }

  if (normalized.includes("camera")) {
    return "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=1200&auto=format&fit=crop";
  }

  if (normalized.includes("interface")) {
    return "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?q=80&w=1200&auto=format&fit=crop";
  }

  if (normalized.includes("lighting") || normalized.includes("light")) {
    return "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=1200&auto=format&fit=crop";
  }

  if (normalized.includes("keyboard")) {
    return "https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=1200&auto=format&fit=crop";
  }

  if (normalized.includes("controller")) {
    return "https://images.unsplash.com/photo-1605901309584-818e25960a8f?q=80&w=1200&auto=format&fit=crop";
  }

  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1200&auto=format&fit=crop";
}

export function cleanImageUrl(url?: string | null, baseUrl?: string | null) {
  const trimmed = (url || "").trim();

  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, baseUrl || undefined);

    if (parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function isPlaceholderImage(imageUrl?: string | null) {
  if (!imageUrl) {
    return false;
  }

  return imageUrl.includes("images.unsplash.com");
}

function getMetaContent(html: string, names: string[]) {
  for (const name of names) {
    const propertyPattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const contentPattern = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i"
    );
    const match = html.match(propertyPattern) || html.match(contentPattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function getJsonLdImages(html: string) {
  const images: string[] = [];
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  );

  (blocks || []).forEach((block) => {
    const jsonText = block
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(jsonText);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      candidates.forEach((item) => {
        const image = item?.image;

        if (typeof image === "string") {
          images.push(image);
        } else if (Array.isArray(image)) {
          image.forEach((entry) => {
            if (typeof entry === "string") {
              images.push(entry);
            } else if (typeof entry?.url === "string") {
              images.push(entry.url);
            }
          });
        } else if (typeof image?.url === "string") {
          images.push(image.url);
        }
      });
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  return images;
}

export function extractImageFromHtml(html: string, sourceUrl: string) {
  const metaImage = getMetaContent(html, [
    "og:image",
    "twitter:image",
    "product:image",
  ]);
  const cleanMetaImage = cleanImageUrl(metaImage, sourceUrl);

  if (cleanMetaImage) {
    return cleanMetaImage;
  }

  for (const image of getJsonLdImages(html)) {
    const cleanJsonImage = cleanImageUrl(image, sourceUrl);

    if (cleanJsonImage) {
      return cleanJsonImage;
    }
  }

  return null;
}

async function fetchSourceImage(sourceUrl?: string | null) {
  const cleanSourceUrl = cleanImageUrl(sourceUrl);

  if (!cleanSourceUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(cleanSourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OwnerCheckBot/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return extractImageFromHtml(html, cleanSourceUrl);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function findProductImage({
  sourceUrl,
  braveResults,
  category,
}: {
  sourceUrl?: string | null;
  braveResults?: BraveImageCandidate[];
  category?: string | null;
}) {
  const sourceImage = await fetchSourceImage(sourceUrl);

  if (sourceImage) {
    return sourceImage;
  }

  for (const result of braveResults || []) {
    const braveImage = cleanImageUrl(result.thumbnail?.src || result.profile?.img);

    if (braveImage) {
      return braveImage;
    }
  }

  return getCategoryPlaceholderImage(category);
}
