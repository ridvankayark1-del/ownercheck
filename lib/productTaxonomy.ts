export type TaxonomyResult = {
  category: string;
  productType: string | null;
  confidence: number;
  warnings: string[];
};

export type ProductTypeConfig = {
  label: string;
  slug: string;
};

export type CategoryConfig = {
  label: string;
  slug: string;
  productTypes: ProductTypeConfig[];
  featureFilters: string[];
  isActive: boolean;
};

export type MainCategoryConfig = {
  label: string;
  slug: string;
  categories: Record<string, CategoryConfig>;
  isActive: boolean;
};

// Central Taxonomy Configuration
export const PRODUCT_TAXONOMY: Record<string, MainCategoryConfig> = {
  audio: {
    label: "Audio",
    slug: "audio",
    isActive: true,
    categories: {
      headphones: {
        label: "Headphones",
        slug: "headphones",
        isActive: true,
        productTypes: [
          { label: "True wireless earbuds", slug: "true-wireless-earbuds" },
          { label: "Wireless earbuds", slug: "wireless-earbuds" },
          { label: "Wireless in-ear headphones", slug: "wireless-in-ear-headphones" },
          { label: "In-ear headphones", slug: "in-ear-headphones" },
          { label: "Wireless over-ear headphones", slug: "wireless-over-ear-headphones" },
          { label: "Over-ear headphones", slug: "over-ear-headphones" },
          { label: "On-ear headphones", slug: "on-ear-headphones" },
          { label: "Wireless on-ear headphones", slug: "wireless-on-ear-headphones" },
          { label: "Bone conduction headphones", slug: "bone-conduction-headphones" },
          { label: "Gaming headsets", slug: "gaming-headsets" },
          { label: "Studio headphones", slug: "studio-headphones" },
          { label: "Audiophile headphones", slug: "audiophile-headphones" },
        ],
        featureFilters: [
          "wireless",
          "noise_cancelling",
          "mic",
          "enclosure",
          "sound_signature",
          "bass_amount",
          "treble_amount"
        ]
      },
      speakers: {
        label: "Speakers",
        slug: "speakers",
        isActive: true,
        productTypes: [
          { label: "Bluetooth speakers", slug: "bluetooth-speakers" },
          { label: "Smart speakers", slug: "smart-speakers" },
          { label: "Bookshelf speakers", slug: "bookshelf-speakers" },
          { label: "Portable speakers", slug: "portable-speakers" },
          { label: "Party speakers", slug: "party-speakers" },
          { label: "Computer speakers", slug: "computer-speakers" },
          { label: "Home speakers", slug: "home-speakers" },
        ],
        featureFilters: [
          "wireless",
          "bluetooth",
          "water_resistance",
          "battery_life"
        ]
      }
    }
  },
  "photo-and-video": {
    label: "Photo & Video",
    slug: "photo-and-video",
    isActive: true,
    categories: {
      cameras: {
        label: "Cameras",
        slug: "cameras",
        isActive: true,
        productTypes: [
          { label: "Mirrorless cameras", slug: "mirrorless-cameras" },
          { label: "DSLR cameras", slug: "dslr-cameras" },
          { label: "Compact cameras", slug: "compact-cameras" },
          { label: "Action cameras", slug: "action-cameras" },
          { label: "Instant cameras", slug: "instant-cameras" },
          { label: "Cinema cameras", slug: "cinema-cameras" },
          { label: "Vlogging cameras", slug: "vlogging-cameras" },
          { label: "Bridge cameras", slug: "bridge-cameras" },
        ],
        featureFilters: [
          "sensor_size",
          "lens_mount",
          "video_resolution",
          "stabilization",
          "weather_sealing",
          "viewfinder"
        ]
      }
    }
  },
  computers: {
    label: "Computers",
    slug: "computers",
    isActive: true,
    categories: {
      monitors: {
        label: "Monitors",
        slug: "monitors",
        isActive: true,
        productTypes: [
          { label: "Gaming monitors", slug: "gaming-monitors" },
          { label: "Office monitors", slug: "office-monitors" },
          { label: "Ultrawide monitors", slug: "ultrawide-monitors" },
          { label: "4K monitors", slug: "4k-monitors" },
          { label: "Portable monitors", slug: "portable-monitors" },
          { label: "Creator monitors", slug: "creator-monitors" },
          { label: "Curved monitors", slug: "curved-monitors" },
        ],
        featureFilters: [
          "screen_size",
          "resolution",
          "refresh_rate",
          "panel_type",
          "curved",
          "hdr",
          "ports"
        ]
      },
      mice: {
        label: "Mice",
        slug: "mice",
        isActive: true,
        productTypes: [
          { label: "Gaming mice", slug: "gaming-mice" },
          { label: "Wireless mice", slug: "wireless-mice" },
          { label: "Ergonomic mice", slug: "ergonomic-mice" },
          { label: "Productivity mice", slug: "productivity-mice" },
          { label: "Travel mice", slug: "travel-mice" },
          { label: "Trackballs", slug: "trackballs" },
        ],
        featureFilters: [
          "wireless",
          "sensor",
          "dpi",
          "weight",
          "buttons",
          "handedness",
          "connection"
        ]
      },
      keyboards: {
        label: "Keyboards",
        slug: "keyboards",
        isActive: true,
        productTypes: [
          { label: "Mechanical keyboards", slug: "mechanical-keyboards" },
          { label: "Gaming keyboards", slug: "gaming-keyboards" },
          { label: "Wireless keyboards", slug: "wireless-keyboards" },
          { label: "Ergonomic keyboards", slug: "ergonomic-keyboards" },
          { label: "Compact keyboards", slug: "compact-keyboards" },
          { label: "Full-size keyboards", slug: "full-size-keyboards" },
        ],
        featureFilters: [
          "switch_type",
          "layout",
          "wireless",
          "backlight",
          "hot_swappable",
          "keycap_profile"
        ]
      },
      printers: {
        label: "Printers",
        slug: "printers",
        isActive: true,
        productTypes: [
          { label: "Inkjet printers", slug: "inkjet-printers" },
          { label: "Laser printers", slug: "laser-printers" },
          { label: "Photo printers", slug: "photo-printers" },
          { label: "All-in-one printers", slug: "all-in-one-printers" },
          { label: "Portable printers", slug: "portable-printers" },
          { label: "Label printers", slug: "label-printers" },
        ],
        featureFilters: ["wireless", "color", "print_speed", "paper_size"]
      },
      "keyboard-switches": {
        label: "Keyboard Switches",
        slug: "keyboard-switches",
        isActive: true,
        productTypes: [
          { label: "Linear switches", slug: "linear-switches" },
          { label: "Tactile switches", slug: "tactile-switches" },
          { label: "Clicky switches", slug: "clicky-switches" },
          { label: "Silent switches", slug: "silent-switches" },
        ],
        featureFilters: ["type", "actuation_force", "travel_distance", "pre_travel"]
      },
      vpns: {
        label: "VPNs",
        slug: "vpns",
        isActive: true,
        productTypes: [
          { label: "Consumer VPN", slug: "consumer-vpn" },
          { label: "Business VPN", slug: "business-vpn" },
        ],
        featureFilters: ["servers", "protocols", "simultaneous_connections", "no_logs"]
      },
      routers: {
        label: "Routers",
        slug: "routers",
        isActive: true,
        productTypes: [
          { label: "Wi-Fi routers", slug: "wi-fi-routers" },
          { label: "Mesh routers", slug: "mesh-routers" },
          { label: "Gaming routers", slug: "gaming-routers" },
          { label: "Travel routers", slug: "travel-routers" },
          { label: "Modem router combos", slug: "modem-router-combos" },
        ],
        featureFilters: ["wi_fi_standard", "frequency_bands", "ethernet_ports", "mesh_compatible"]
      },
      laptops: {
        label: "Laptops",
        slug: "laptops",
        isActive: true,
        productTypes: [
          { label: "Gaming laptops", slug: "gaming-laptops" },
          { label: "Business laptops", slug: "business-laptops" },
          { label: "Ultrabooks", slug: "ultrabooks" },
          { label: "Creator laptops", slug: "creator-laptops" },
          { label: "Student laptops", slug: "student-laptops" },
          { label: "2-in-1 laptops", slug: "2-in-1-laptops" },
          { label: "Chromebooks", slug: "chromebooks" },
        ],
        featureFilters: ["screen_size", "cpu", "gpu", "ram", "storage", "battery_life"]
      }
    }
  },
  "home-entertainment": {
    label: "Home Entertainment",
    slug: "home-entertainment",
    isActive: true,
    categories: {
      tvs: {
        label: "TVs",
        slug: "tvs",
        isActive: true,
        productTypes: [
          { label: "OLED TVs", slug: "oled-tvs" },
          { label: "QLED TVs", slug: "qled-tvs" },
          { label: "Mini-LED TVs", slug: "mini-led-tvs" },
          { label: "LED TVs", slug: "led-tvs" },
          { label: "Gaming TVs", slug: "gaming-tvs" },
          { label: "Budget TVs", slug: "budget-tvs" },
          { label: "Large TVs", slug: "large-tvs" },
        ],
        featureFilters: [
          "screen_size",
          "display_type",
          "resolution",
          "refresh_rate",
          "hdr",
          "smart_platform",
          "gaming_features"
        ]
      },
      soundbars: {
        label: "Soundbars",
        slug: "soundbars",
        isActive: true,
        productTypes: [
          { label: "Dolby Atmos soundbars", slug: "dolby-atmos-soundbars" },
          { label: "Soundbars with subwoofer", slug: "soundbars-with-subwoofer" },
          { label: "Standalone soundbars", slug: "standalone-soundbars" },
          { label: "Budget soundbars", slug: "budget-soundbars" },
          { label: "Premium soundbars", slug: "premium-soundbars" },
        ],
        featureFilters: ["channels", "power_output", "subwoofer", "connectivity"]
      },
      projectors: {
        label: "Projectors",
        slug: "projectors",
        isActive: true,
        productTypes: [
          { label: "Home theater projectors", slug: "home-theater-projectors" },
          { label: "Portable projectors", slug: "portable-projectors" },
          { label: "Laser projectors", slug: "laser-projectors" },
          { label: "Short throw projectors", slug: "short-throw-projectors" },
          { label: "Ultra short throw projectors", slug: "ultra-short-throw-projectors" },
          { label: "Gaming projectors", slug: "gaming-projectors" },
        ],
        featureFilters: ["brightness", "resolution", "source_type", "throw_ratio"]
      }
    }
  },
  home: {
    label: "Home",
    slug: "home",
    isActive: true,
    categories: {
      vacuums: {
        label: "Vacuums",
        slug: "vacuums",
        isActive: true,
        productTypes: [
          { label: "Cordless vacuums", slug: "cordless-vacuums" },
          { label: "Upright vacuums", slug: "upright-vacuums" },
          { label: "Canister vacuums", slug: "canister-vacuums" },
        ],
        featureFilters: ["runtime", "weight", "dustbin_capacity", "cordless"]
      },
      "robot-vacuums": {
        label: "Robot Vacuums",
        slug: "robot-vacuums",
        isActive: true,
        productTypes: [
          { label: "Mapping robot vacuums", slug: "mapping-robot-vacuums" },
          { label: "Self-emptying robot vacuums", slug: "self-emptying-robot-vacuums" },
          { label: "Mop combo robot vacuums", slug: "mop-combo-robot-vacuums" },
        ],
        featureFilters: ["suction_power", "self_emptying", "runtime", "mop_combo"]
      },
      "air-purifiers": {
        label: "Air Purifiers",
        slug: "air-purifiers",
        isActive: true,
        productTypes: [
          { label: "HEPA air purifiers", slug: "hepa-air-purifiers" },
          { label: "Smart air purifiers", slug: "smart-air-purifiers" },
        ],
        featureFilters: ["coverage_area", "noise_level", "filter_type", "smart"]
      },
      "smart-home": {
        label: "Smart Home",
        slug: "smart-home",
        isActive: true,
        productTypes: [
          { label: "Smart speakers", slug: "smart-speakers-home" },
          { label: "Smart locks", slug: "smart-locks" },
          { label: "Smart thermostats", slug: "smart-thermostats" },
          { label: "Smart plugs", slug: "smart-plugs" },
        ],
        featureFilters: ["ecosystem", "connectivity", "power_source"]
      },
      mattresses: {
        label: "Mattresses",
        slug: "mattresses",
        isActive: true,
        productTypes: [
          { label: "Memory foam mattresses", slug: "memory-foam-mattresses" },
          { label: "Hybrid mattresses", slug: "hybrid-mattresses" },
          { label: "Innerspring mattresses", slug: "innerspring-mattresses" },
          { label: "Latex mattresses", slug: "latex-mattresses" },
        ],
        featureFilters: ["firmness", "thickness", "material", "cooling"]
      }
    }
  },
  kitchen: {
    label: "Kitchen",
    slug: "kitchen",
    isActive: true,
    categories: {
      "coffee-makers": {
        label: "Coffee Makers",
        slug: "coffee-makers",
        isActive: true,
        productTypes: [
          { label: "Espresso machines", slug: "espresso-machines" },
          { label: "Drip coffee makers", slug: "drip-coffee-makers" },
          { label: "Single serve brewers", slug: "single-serve-brewers" },
          { label: "Cold brew makers", slug: "cold-brew-makers" },
        ],
        featureFilters: ["capacity", "pressure_bars", "programmable", "grinder_built_in"]
      },
      blenders: {
        label: "Blenders",
        slug: "blenders",
        isActive: true,
        productTypes: [
          { label: "Countertop blenders", slug: "countertop-blenders" },
          { label: "Personal blenders", slug: "personal-blenders" },
          { label: "Immersion blenders", slug: "immersion-blenders" },
        ],
        featureFilters: ["power", "speeds", "capacity", "pulse_mode"]
      },
      "air-fryers": {
        label: "Air Fryers",
        slug: "air-fryers",
        isActive: true,
        productTypes: [
          { label: "Basket air fryers", slug: "basket-air-fryers" },
          { label: "Toaster oven air fryers", slug: "toaster-oven-air-fryers" },
          { label: "Dual zone air fryers", slug: "dual-zone-air-fryers" },
        ],
        featureFilters: ["capacity", "wattage", "presets", "dual_zone"]
      },
      cookware: {
        label: "Cookware",
        slug: "cookware",
        isActive: true,
        productTypes: [
          { label: "Nonstick cookware", slug: "nonstick-cookware" },
          { label: "Stainless steel cookware", slug: "stainless-steel-cookware" },
          { label: "Cast iron cookware", slug: "cast-iron-cookware" },
        ],
        featureFilters: ["material", "induction_compatible", "oven_safe_temp"]
      },
      "kitchen-appliances": {
        label: "Kitchen Appliances",
        slug: "kitchen-appliances",
        isActive: true,
        productTypes: [
          { label: "Toasters", slug: "toasters" },
          { label: "Kettles", slug: "kettles" },
          { label: "Slow cookers", slug: "slow-cookers" },
          { label: "Food processors", slug: "food-processors" },
        ],
        featureFilters: ["capacity", "power", "material"]
      }
    }
  },
  shoes: {
    label: "Shoes",
    slug: "shoes",
    isActive: true,
    categories: {
      "running-shoes": {
        label: "Running Shoes",
        slug: "running-shoes",
        isActive: true,
        productTypes: [
          { label: "Road running shoes", slug: "road-running-shoes" },
          { label: "Trail running shoes", slug: "trail-running-shoes" },
          { label: "Track spikes", slug: "track-spikes" },
        ],
        featureFilters: ["cushioning", "drop_mm", "weight_g", "support_type"]
      },
      "walking-shoes": {
        label: "Walking Shoes",
        slug: "walking-shoes",
        isActive: true,
        productTypes: [
          { label: "Daily walking shoes", slug: "daily-walking-shoes" },
          { label: "Fitness walking shoes", slug: "fitness-walking-shoes" },
        ],
        featureFilters: ["cushioning", "support", "material"]
      },
      "hiking-shoes": {
        label: "Hiking Shoes",
        slug: "hiking-shoes",
        isActive: true,
        productTypes: [
          { label: "Hiking shoes", slug: "hiking-shoes-type" },
          { label: "Hiking boots", slug: "hiking-boots" },
          { label: "Trail runners", slug: "trail-runners" },
        ],
        featureFilters: ["waterproofing", "ankle_support", "weight_g"]
      },
      sneakers: {
        label: "Sneakers",
        slug: "sneakers",
        isActive: true,
        productTypes: [
          { label: "Lifestyle sneakers", slug: "lifestyle-sneakers" },
          { label: "Skate shoes", slug: "skate-shoes" },
          { label: "Retro sneakers", slug: "retro-sneakers" },
        ],
        featureFilters: ["material", "style", "fastener"]
      },
      "training-shoes": {
        label: "Training Shoes",
        slug: "training-shoes",
        isActive: true,
        productTypes: [
          { label: "Cross-training shoes", slug: "cross-training-shoes" },
          { label: "Weightlifting shoes", slug: "weightlifting-shoes" },
        ],
        featureFilters: ["stability", "heel_raise_mm", "material"]
      }
    }
  }
};

// Helper Functions
export function slugifyTaxonomyLabel(label: string): string {
  if (!label) return "";
  return label
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getMainCategoryBySlug(slug: string): MainCategoryConfig | null {
  const norm = slugifyTaxonomyLabel(slug);
  return PRODUCT_TAXONOMY[norm] || null;
}

export function getCategoryBySlug(mainCategorySlug: string, categorySlug: string): CategoryConfig | null {
  const main = getMainCategoryBySlug(mainCategorySlug);
  if (!main) return null;
  const normCat = slugifyTaxonomyLabel(categorySlug);
  return main.categories[normCat] || null;
}

export function getProductTypesForCategory(mainCategorySlug: string, categorySlug: string): ProductTypeConfig[] {
  const cat = getCategoryBySlug(mainCategorySlug, categorySlug);
  return cat ? cat.productTypes : [];
}

export function getFeatureFiltersForCategory(mainCategorySlug: string, categorySlug: string): string[] {
  const cat = getCategoryBySlug(mainCategorySlug, categorySlug);
  return cat ? cat.featureFilters : ["wireless", "connectivity", "compatibility", "weight"];
}

export function inferMainCategoryFromCategory(category: string): string {
  const norm = slugifyTaxonomyLabel(category);
  for (const [mainKey, mainVal] of Object.entries(PRODUCT_TAXONOMY)) {
    if (mainVal.categories[norm]) {
      return mainVal.label;
    }
  }

  // Fallback checks
  if (norm.includes("headphone") || norm.includes("speaker") || norm.includes("audio")) {
    return "Audio";
  }
  if (norm.includes("camera") || norm.includes("lens") || norm.includes("video")) {
    return "Photo & Video";
  }
  if (norm.includes("tv") || norm.includes("soundbar") || norm.includes("projector") || norm.includes("entertainment")) {
    return "Home Entertainment";
  }
  if (norm.includes("monitor") || norm.includes("mouse") || norm.includes("keyboard") || norm.includes("printer") || norm.includes("laptop") || norm.includes("switch") || norm.includes("vpn") || norm.includes("router") || norm.includes("computer")) {
    return "Computers";
  }
  if (norm.includes("vacuum") || norm.includes("purifier") || norm.includes("smart") || norm.includes("mattress") || norm.includes("home")) {
    return "Home";
  }
  if (norm.includes("coffee") || norm.includes("blend") || norm.includes("fryer") || norm.includes("cook") || norm.includes("kitchen")) {
    return "Kitchen";
  }
  if (norm.includes("shoe") || norm.includes("sneaker") || norm.includes("boot") || norm.includes("walk") || norm.includes("run") || norm.includes("hike")) {
    return "Shoes";
  }

  return "Audio"; // default fallback
}

export function inferCategoryFromProductType(productType: string): string {
  const norm = slugifyTaxonomyLabel(productType);
  for (const mainVal of Object.values(PRODUCT_TAXONOMY)) {
    for (const catVal of Object.values(mainVal.categories)) {
      if (catVal.productTypes.some(pt => pt.slug === norm || slugifyTaxonomyLabel(pt.label) === norm)) {
        return catVal.label;
      }
    }
  }

  // Fallback checks
  if (norm.includes("earbud") || norm.includes("headphone") || norm.includes("headset")) {
    return "Headphones";
  }
  if (norm.includes("speaker")) {
    return "Speakers";
  }
  if (norm.includes("camera")) {
    return "Cameras";
  }
  if (norm.includes("monitor")) {
    return "Monitors";
  }
  if (norm.includes("mouse")) {
    return "Mice";
  }
  if (norm.includes("keyboard")) {
    return "Keyboards";
  }
  if (norm.includes("printer")) {
    return "Printers";
  }
  if (norm.includes("router")) {
    return "Routers";
  }
  if (norm.includes("laptop")) {
    return "Laptops";
  }
  if (norm.includes("tv")) {
    return "TVs";
  }
  if (norm.includes("soundbar")) {
    return "Soundbars";
  }
  if (norm.includes("projector")) {
    return "Projectors";
  }

  return "Headphones"; // default fallback
}

export function resolveTaxonomyForProduct(product: {
  main_category?: string | null;
  category?: string | null;
  product_type?: string | null;
}): {
  main_category: string;
  main_category_slug: string;
  category: string;
  category_slug: string;
  product_type: string | null;
  product_type_slug: string | null;
  taxonomy_path: Record<string, any>;
} {
  let cat = product.category || "";
  let pt = product.product_type || null;

  if (!cat && pt) {
    cat = inferCategoryFromProductType(pt);
  } else if (!cat) {
    cat = "Headphones"; // default
  }

  let mainCat = product.main_category || inferMainCategoryFromCategory(cat);

  const mainCategorySlug = slugifyTaxonomyLabel(mainCat);
  const categorySlug = slugifyTaxonomyLabel(cat);
  const productTypeSlug = pt ? slugifyTaxonomyLabel(pt) : null;

  const taxonomyPath = {
    main_category: mainCat,
    main_category_slug: mainCategorySlug,
    category: cat,
    category_slug: categorySlug,
    product_type: pt,
    product_type_slug: productTypeSlug
  };

  return {
    main_category: mainCat,
    main_category_slug: mainCategorySlug,
    category: cat,
    category_slug: categorySlug,
    product_type: pt,
    product_type_slug: productTypeSlug,
    taxonomy_path: taxonomyPath
  };
}

export function normalizeTaxonomyForImport(row: {
  main_category?: string | null;
  category?: string | null;
  product_type?: string | null;
}): {
  main_category: string;
  main_category_slug: string;
  category: string;
  category_slug: string;
  product_type: string | null;
  product_type_slug: string | null;
  taxonomy_path: Record<string, any>;
} {
  return resolveTaxonomyForProduct(row);
}

// Retain compatibility with guardProductTaxonomy in older systems
export function getAllowedProductTypes(category?: string | null) {
  const normCat = slugifyTaxonomyLabel(category || "");
  for (const mainVal of Object.values(PRODUCT_TAXONOMY)) {
    if (mainVal.categories[normCat]) {
      return mainVal.categories[normCat].productTypes.map(pt => pt.label);
    }
  }
  return [];
}

export function getCategorySpecKeys(category?: string | null) {
  const normCat = slugifyTaxonomyLabel(category || "");
  for (const mainVal of Object.values(PRODUCT_TAXONOMY)) {
    if (mainVal.categories[normCat]) {
      return mainVal.categories[normCat].featureFilters;
    }
  }
  return ["wireless", "connectivity", "compatibility", "weight"];
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
  const titleText = (title || "").toLowerCase();
  const brandText = (brand || "").toLowerCase();
  let nextCategory = category || "Headphones";
  let nextProductType = productType || null;
  let confidence = 0.55;

  if (brandText === "apple" && titleText.includes("airpods")) {
    nextCategory = "Headphones";
    nextProductType = titleText.includes("max")
      ? "Wireless over-ear headphones"
      : "True wireless earbuds";
    confidence = 0.95;
  }

  const allowed = getAllowedProductTypes(nextCategory);
  if (nextProductType && allowed.length > 0) {
    const isAllowed = allowed.some(
      (allowedType) => allowedType.toLowerCase() === (nextProductType || "").toLowerCase()
    );
    if (!isAllowed) {
      warnings.push("Suggested product type conflicts with product identity.");
      confidence = Math.min(confidence, 0.45);
    }
  }

  return {
    category: nextCategory,
    productType: nextProductType,
    confidence,
    warnings: Array.from(new Set(warnings)),
  };
}
