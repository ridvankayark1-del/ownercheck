export type CategoryName =
  | "Headphones"
  | "Microphones"
  | "Camera"
  | "Audio Interface"
  | "Lighting"
  | "Keyboard"
  | "Controller"
  | "Laptop"
  | "Monitor"
  | "Mouse"
  | "Speaker"
  | "Other";

export type ProductSpecs = {
  brand: string | null;
  category: CategoryName;
  product_type: string | null;
  model: string | null;
  main_features: string[];
  best_for: string[];
  check_before_buying: string[];
  [key: string]: string | string[] | null;
};

type ProductTypeRule = {
  keywords: string[];
  productType: string;
};

type FeatureRule = {
  keywords: string[];
  label: string;
};

export type SpecField = {
  key: string;
  label: string;
  patterns?: RegExp[];
};

export type CategoryProfile = {
  category: CategoryName;
  aliases: string[];
  productTypeRules: ProductTypeRule[];
  specFields: SpecField[];
  featureKeywords: FeatureRule[];
  bestForDefaults: string[];
  checkBeforeBuyingDefaults: string[];
};

const BRAND_MAP: Record<string, string> = {
  dji: "DJI",
  sony: "Sony",
  bose: "Bose",
  sennheiser: "Sennheiser",
  apple: "Apple",
  shure: "Shure",
  rode: "Rode",
  "røde": "Rode",
  "audio-technica": "Audio-Technica",
  audiotechnica: "Audio-Technica",
  beyerdynamic: "Beyerdynamic",
  canon: "Canon",
  fujifilm: "Fujifilm",
  panasonic: "Panasonic",
  logitech: "Logitech",
  elgato: "Elgato",
  focusrite: "Focusrite",
  "universal audio": "Universal Audio",
  audient: "Audient",
  hyperx: "HyperX",
  aputure: "Aputure",
};

const CONNECTIVITY_PATTERNS = [
  /\b(Bluetooth(?:\s+\d(?:\.\d)?)?)\b/i,
  /\b(Wi-?Fi)\b/i,
  /\b(USB-C)\b/i,
  /\b(USB)\b/i,
  /\b(XLR)\b/i,
  /\b(Thunderbolt)\b/i,
  /\b(HDMI)\b/i,
  /\b(DisplayPort)\b/i,
  /\b(3\.5mm)\b/i,
  /\b(wireless)\b/i,
  /\b(wired)\b/i,
];

const BATTERY_PATTERNS = [
  /(?:up to|rated for|offers|with)\s+(\d+(?:\.\d+)?\s*(?:hours|hour|hrs|hr|h))[^.]{0,80}\bbattery\b/i,
  /\bbattery\b[^.]{0,80}?(\d+(?:\.\d+)?\s*(?:hours|hour|hrs|hr|h))/i,
  /(\d+(?:\.\d+)?\s*(?:hours|hour|hrs|hr|h))[^.]{0,80}\bbattery life\b/i,
];

export const CATEGORY_PROFILES: CategoryProfile[] = [
  {
    category: "Headphones",
    aliases: [
      "headphones",
      "headphone",
      "headset",
      "earbuds",
      "airpods",
      "quietcomfort",
      "momentum wireless",
      "wh-1000xm",
      "dt 770",
      "in-ear",
      "over-ear",
    ],
    productTypeRules: [
      { keywords: ["gaming headset"], productType: "Gaming headset" },
      { keywords: ["earbuds", "earbud", "in-ear", "airpods"], productType: "Wireless earbuds" },
      { keywords: ["wired", "studio monitoring", "dt 770"], productType: "Wired studio headphones" },
      { keywords: ["noise-cancelling", "noise cancelling", "anc"], productType: "Noise-cancelling headphones" },
      { keywords: ["over-ear", "over ear", "airpods max", "quietcomfort", "momentum wireless", "wh-1000xm"], productType: "Wireless over-ear headphones" },
    ],
    specFields: [
      { key: "connectivity", label: "Connectivity", patterns: CONNECTIVITY_PATTERNS },
      { key: "battery_life", label: "Battery life", patterns: BATTERY_PATTERNS },
      { key: "noise_cancellation", label: "Noise cancellation", patterns: [/\b(active noise cancellation)\b/i, /\b(adaptive noise cancellation)\b/i, /\b(ANC)\b/i] },
      { key: "driver_size", label: "Driver size", patterns: [/\b(\d+\s*mm\s+drivers?)\b/i] },
      { key: "weight", label: "Weight", patterns: [/\b(\d+(?:\.\d+)?\s*(?:g|grams|oz))\b/i] },
      { key: "microphone", label: "Microphone", patterns: [/\b(built-in microphone)\b/i, /\b(microphone)\b/i] },
      { key: "app_support", label: "App support", patterns: [/\b(app support)\b/i, /\b(companion app)\b/i] },
    ],
    featureKeywords: [
      { keywords: ["active noise cancellation", "adaptive noise cancellation", "anc"], label: "Active noise cancellation" },
      { keywords: ["transparency mode", "aware mode"], label: "Transparency or aware mode" },
      { keywords: ["bluetooth"], label: "Bluetooth" },
      { keywords: ["wireless"], label: "Wireless" },
      { keywords: ["wired"], label: "Wired listening" },
      { keywords: ["spatial audio"], label: "Spatial audio" },
      { keywords: ["hi-res audio", "hi res audio"], label: "Hi-res audio" },
      { keywords: ["multipoint"], label: "Multipoint pairing" },
      { keywords: ["over-ear", "over ear"], label: "Over-ear design" },
      { keywords: ["in-ear", "in ear", "earbuds"], label: "In-ear design" },
      { keywords: ["studio monitoring"], label: "Studio monitoring" },
      { keywords: ["low latency"], label: "Low latency" },
      { keywords: ["built-in microphone"], label: "Built-in microphone" },
    ],
    bestForDefaults: ["Music listening", "Calls", "Travel", "Office work", "Commuting"],
    checkBeforeBuyingDefaults: ["Long-term comfort", "Weight", "Noise cancellation performance", "Battery life", "App/device compatibility", "Microphone quality", "Price/value"],
  },
  {
    category: "Microphones",
    aliases: ["microphone", " mic ", "/mic", "-mic", "sm7b", "podmic", "quadcast", "yeti", "nt1", "mv7", "condenser", "dynamic microphone"],
    productTypeRules: [
      { keywords: ["sm7b", "broadcast", "dynamic microphone"], productType: "Dynamic broadcast microphone" },
      { keywords: ["condenser", "nt1"], productType: "Condenser microphone" },
      { keywords: ["usb"], productType: "USB microphone" },
      { keywords: ["xlr"], productType: "XLR microphone" },
      { keywords: ["lavalier"], productType: "Lavalier microphone" },
      { keywords: ["shotgun"], productType: "Shotgun microphone" },
    ],
    specFields: [
      { key: "connection", label: "Connection", patterns: CONNECTIVITY_PATTERNS },
      { key: "microphone_type", label: "Microphone type", patterns: [/\b(dynamic microphone)\b/i, /\b(condenser microphone)\b/i, /\b(dynamic mic)\b/i, /\b(condenser mic)\b/i] },
      { key: "polar_pattern", label: "Polar pattern", patterns: [/\b(cardioid)\b/i, /\b(supercardioid)\b/i, /\b(omnidirectional)\b/i] },
      { key: "frequency_response", label: "Frequency response", patterns: [/\b(\d+\s*Hz\s*[-–]\s*\d+\s*kHz)\b/i] },
    ],
    featureKeywords: [
      { keywords: ["usb"], label: "USB connection" },
      { keywords: ["xlr"], label: "XLR connection" },
      { keywords: ["dynamic"], label: "Dynamic capsule" },
      { keywords: ["condenser"], label: "Condenser capsule" },
      { keywords: ["cardioid"], label: "Cardioid pickup" },
      { keywords: ["broadcast"], label: "Broadcast vocals" },
      { keywords: ["podcast"], label: "Podcasting" },
      { keywords: ["studio"], label: "Studio recording" },
      { keywords: ["streaming"], label: "Streaming" },
      { keywords: ["pop filter"], label: "Pop filter" },
      { keywords: ["shock mount"], label: "Shock mount" },
    ],
    bestForDefaults: ["Podcasts", "Streaming", "Voice recording", "Vocals", "Studio recording"],
    checkBeforeBuyingDefaults: ["Room noise pickup", "USB/XLR compatibility", "Mounting/setup", "Voice tone", "Background noise", "Need for audio interface", "Desk space"],
  },
  {
    category: "Camera",
    aliases: ["osmo pocket", "action camera", "pocket camera", "gimbal camera", "camera", "mirrorless", "dslr", "eos", "lumix", "zv-e", "creator combo", "4k camera", "webcam"],
    productTypeRules: [
      { keywords: ["osmo pocket", "gimbal camera", "pocket camera"], productType: "Pocket gimbal camera" },
      { keywords: ["mirrorless", "zv-e", "eos r", "lumix"], productType: "Mirrorless camera" },
      { keywords: ["action camera"], productType: "Action camera" },
      { keywords: ["webcam"], productType: "Webcam" },
      { keywords: ["cinema camera"], productType: "Cinema camera" },
      { keywords: ["compact camera"], productType: "Compact camera" },
    ],
    specFields: [
      { key: "sensor", label: "Sensor", patterns: [/\b(1-inch CMOS sensor)\b/i, /\b(1 inch CMOS sensor)\b/i, /\b(APS-C)\b/i, /\b(full-frame)\b/i, /\b([0-9.]+-inch [^,.]{0,30}sensor)\b/i] },
      { key: "video_resolution", label: "Video", patterns: [/\b(4K\/240fps)\b/i, /\b(4K\/120)\b/i, /\b(4K\/60)\b/i, /\b(4K\s*(?:at)?\s*240fps)\b/i, /\b(4K(?:\s+video|\s+recording)?)\b/i] },
      { key: "photo_resolution", label: "Photo", patterns: [/\b(\d+\s*MP)\b/i, /\b(\d+\s*megapixel)\b/i] },
      { key: "stabilization", label: "Stabilization", patterns: [/\b(3-axis stabilization)\b/i, /\b(3 axis stabilization)\b/i, /\b(3-axis gimbal)\b/i, /\b(gimbal stabilization)\b/i] },
      { key: "autofocus", label: "Autofocus", patterns: [/\b(autofocus)\b/i, /\b(phase detection autofocus)\b/i] },
      { key: "lens_mount", label: "Lens mount", patterns: [/\b(E-mount)\b/i, /\b(RF mount)\b/i, /\b(X mount)\b/i, /\b(Micro Four Thirds)\b/i] },
      { key: "dynamic_range", label: "Dynamic range", patterns: [/\b(\d+(?:\.\d+)?\s*stops?\s+of\s+dynamic\s+range)\b/i, /\b(dynamic range)\b/i] },
      { key: "color_profile", label: "Color profile", patterns: [/\b(10-bit D-Log[^\s,.]*)\b/i, /\b(D-Log[^\s,.]*)\b/i, /\b(S-Log[^\s,.]*)\b/i] },
      { key: "zoom", label: "Zoom", patterns: [/\b(lossless zoom)\b/i, /\b(\d+x\s+zoom)\b/i] },
      { key: "storage", label: "Storage", patterns: [/\b(internal storage)\b/i, /\b(\d+\s*GB\s+storage)\b/i] },
      { key: "battery_life", label: "Battery", patterns: BATTERY_PATTERNS },
    ],
    featureKeywords: [
      { keywords: ["1-inch cmos", "1 inch cmos", "aps-c", "full-frame"], label: "Large sensor" },
      { keywords: ["4k/240", "4k 240"], label: "4K/240fps video" },
      { keywords: ["4k"], label: "4K video" },
      { keywords: ["10-bit"], label: "10-bit recording" },
      { keywords: ["d-log"], label: "D-Log color profile" },
      { keywords: ["3-axis stabilization", "gimbal"], label: "3-axis stabilization" },
      { keywords: ["autofocus"], label: "Autofocus" },
      { keywords: ["activetrack", "active track"], label: "ActiveTrack subject tracking" },
      { keywords: ["touchscreen"], label: "Touchscreen controls" },
      { keywords: ["lossless zoom"], label: "Lossless zoom" },
      { keywords: ["internal storage"], label: "Internal storage" },
      { keywords: ["creator combo"], label: "Creator Combo accessories" },
    ],
    bestForDefaults: ["Vlogging", "Travel video", "Solo content creation", "Handheld filming", "YouTube videos"],
    checkBeforeBuyingDefaults: ["Low-light performance", "Battery life", "Audio/mic setup", "Overheating", "Accessory compatibility", "Stabilization quality", "Lens ecosystem"],
  },
  makeProfile("Audio Interface", ["scarlett", "volt", "audient", "interface", "audio interface", "2i2", "solo"], ["USB audio interface", "Thunderbolt audio interface", "Portable audio interface"], ["connection", "inputs", "outputs", "preamps", "phantom_power", "sample_rate"], ["USB-C", "USB", "Thunderbolt", "XLR", "Instrument input", "Phantom power", "Preamp", "24-bit", "192kHz", "Loopback", "Direct monitoring", "Low latency", "MIDI"], ["Home recording", "Podcasting", "Streaming", "Vocals", "Instruments"], ["Input/output count", "Driver compatibility", "Latency", "Preamp quality", "Phantom power needs", "Software bundle", "Desk setup"]),
  makeProfile("Lighting", ["key light", "amaran", "light", "lighting", "led panel", "softbox"], ["LED panel light", "Key light", "Studio light", "RGB light", "Softbox kit"], ["brightness", "color_temperature", "rgb", "control", "mounting", "power"], ["LED", "RGB", "Color temperature", "Adjustable brightness", "App control", "Desk mount", "Soft light", "Diffusion", "Battery powered", "AC power", "CRI"], ["Streaming", "Video calls", "YouTube videos", "Desk setups", "Studio lighting"], ["Brightness", "Color temperature range", "Mounting options", "Desk space", "Heat", "Power source", "App/control compatibility"]),
  makeProfile("Keyboard", ["keyboard", "mx keys", "magic keyboard", "mechanical keyboard"], ["Wireless keyboard", "Mechanical keyboard", "Compact keyboard", "Creator keyboard"], ["layout", "connectivity", "switch_type", "backlighting", "battery_life", "compatibility"], ["Wireless", "Bluetooth", "USB-C", "Mechanical", "Low profile", "Backlit", "Rechargeable", "Multi-device", "Full-size", "Compact", "macOS", "Windows", "Quiet typing"], ["Everyday work", "Writing", "Productivity", "Creator setups", "Multi-device use"], ["Layout", "Key feel", "Device compatibility", "Battery life", "Desk space", "Noise level", "Backlighting"]),
  makeProfile("Controller", ["stream deck", "controller", "control surface", "midi controller"], ["Stream controller", "MIDI controller", "Creator control surface", "Game controller"], ["connection", "buttons_or_pads", "software_support", "compatibility"], ["Programmable buttons", "LCD keys", "Macros", "Streaming", "Shortcuts", "MIDI", "USB-C", "Software profiles", "Plugins", "OBS", "Editing workflow"], ["Streaming", "Video editing", "Productivity shortcuts", "Music production", "Creator workflows"], ["Software compatibility", "Button count", "Setup time", "Plugin support", "Desk space", "Workflow fit"]),
  makeProfile("Laptop", ["macbook", "laptop", "notebook", "thinkpad", "surface laptop"], ["Creator laptop", "Gaming laptop", "Ultrabook", "Business laptop", "MacBook"], ["processor", "gpu", "ram", "storage", "display", "battery_life", "ports", "weight"], ["Apple Silicon", "Intel", "AMD", "RTX", "OLED", "Mini-LED", "High refresh rate", "Long battery life", "Lightweight", "Thunderbolt", "USB-C", "HDMI", "Creator laptop", "Gaming"], ["Work", "Study", "Content creation", "Travel", "Gaming"], ["Battery life", "Fan noise", "Performance under load", "Screen quality", "Ports", "Keyboard/trackpad", "Upgradeability", "Weight"]),
  makeProfile("Monitor", ["monitor", "display", "ultrawide", "oled monitor"], ["4K monitor", "Ultrawide monitor", "OLED monitor", "Gaming monitor", "Creator monitor"], ["screen_size", "resolution", "refresh_rate", "panel_type", "hdr", "ports"], ["4K", "1440p", "Ultrawide", "OLED", "IPS", "VA", "HDR", "High refresh rate", "144Hz", "240Hz", "USB-C", "HDMI", "DisplayPort", "Color accuracy"], ["Productivity", "Gaming", "Video editing", "Design", "Multi-window work"], ["Resolution", "Refresh rate", "Panel type", "Brightness", "Color accuracy", "Ports", "Stand adjustability", "Desk space"]),
  makeProfile("Mouse", ["mouse", "mx master", "gaming mouse"], ["Wireless mouse", "Gaming mouse", "Ergonomic mouse", "Productivity mouse"], ["connectivity", "sensor", "dpi", "buttons", "battery_life", "weight"], ["Wireless", "Bluetooth", "USB receiver", "Ergonomic", "High DPI", "Programmable buttons", "Lightweight", "Rechargeable", "Silent clicks", "Gaming sensor"], ["Productivity", "Gaming", "Office work", "Travel", "Ergonomic setups"], ["Hand size", "Grip style", "Button layout", "Battery life", "Software compatibility", "Weight", "Scroll wheel feel"]),
  makeProfile("Speaker", ["speaker", "soundbar", "bluetooth speaker"], ["Bluetooth speaker", "Smart speaker", "Studio monitor", "Soundbar", "Portable speaker"], ["connectivity", "power", "battery_life", "water_resistance", "channels"], ["Bluetooth", "Wi-Fi", "Portable", "Waterproof", "IP rating", "Battery", "Stereo", "Dolby Atmos", "Smart assistant", "Studio monitor", "Bass", "Soundbar"], ["Music listening", "Home audio", "Travel", "Desk setup", "TV audio"], ["Sound quality", "Bass level", "Battery life", "Connectivity", "Room size", "Water resistance", "Latency", "App support"]),
  makeProfile("Other", [], [], [], [], ["Everyday use", "Setup-specific use"], ["Compatibility", "Build quality", "Long-term reliability", "Setup difficulty", "Price/value"]),
];

function makeProfile(
  category: CategoryName,
  aliases: string[],
  productTypes: string[],
  specKeys: string[],
  featureLabels: string[],
  bestForDefaults: string[],
  checkBeforeBuyingDefaults: string[]
): CategoryProfile {
  return {
    category,
    aliases,
    productTypeRules: productTypes.map((productType) => ({
      productType,
      keywords: productType.toLowerCase().split(/\s+/),
    })),
    specFields: specKeys.map((key) => ({
      key,
      label: labelFromKey(key),
      patterns: defaultPatternsForKey(key),
    })),
    featureKeywords: featureLabels.map((label) => ({
      label,
      keywords: [label.toLowerCase()],
    })),
    bestForDefaults,
    checkBeforeBuyingDefaults,
  };
}

export function normalizeBrand(brand?: string | null) {
  if (!brand) return null;
  const cleaned = cleanText(brand);
  return BRAND_MAP[cleaned.toLowerCase()] || cleaned;
}

export function normalizeCategory(category?: string | null): CategoryName {
  const cleaned = cleanText(category || "");
  const normalized = cleaned.toLowerCase();
  const direct = CATEGORY_PROFILES.find(
    (profile) => profile.category.toLowerCase() === normalized
  );

  if (direct) return direct.category;

  const aliasMatch = CATEGORY_PROFILES.find((profile) =>
    profile.aliases.some((alias) => normalized === alias || normalized.includes(alias))
  );

  return aliasMatch?.category || "Other";
}

export function getCategoryProfile(category?: string | null) {
  const normalized = normalizeCategory(category);
  return (
    CATEGORY_PROFILES.find((profile) => profile.category === normalized) ||
    CATEGORY_PROFILES[CATEGORY_PROFILES.length - 1]
  );
}

export function inferCategory({
  name,
  brand,
  sourceUrl,
  existingCategory,
  snippets,
}: {
  name: string;
  brand?: string | null;
  sourceUrl?: string | null;
  existingCategory?: string | null;
  snippets: string[];
}) {
  const existing = cleanText(existingCategory || "");
  if (existing && existing.toLowerCase() !== "other") {
    return normalizeCategory(existing);
  }

  const primaryHaystack = normalizeHaystack([name, brand, sourceUrl]);
  const snippetHaystack = normalizeHaystack(snippets);

  return inferCategoryFromHaystack(primaryHaystack) || inferCategoryFromHaystack(snippetHaystack) || "Other";
}

export function inferProductType({
  name,
  brand,
  category,
  snippets,
}: {
  name: string;
  brand?: string | null;
  category?: string | null;
  snippets: string[];
}) {
  const profile = getCategoryProfile(category);
  const haystack = normalizeHaystack([name, brand, ...snippets]);
  const rule = profile.productTypeRules.find((candidate) =>
    candidate.keywords.every((keyword) => haystack.includes(keyword))
  );

  if (rule) return rule.productType;

  if (profile.category === "Other") return null;
  return profile.productTypeRules[0]?.productType || profile.category;
}

export function extractCategorySpecs({
  category,
  name,
  brand,
  snippets,
}: {
  category?: string | null;
  name: string;
  brand?: string | null;
  sourceUrl?: string | null;
  snippets: string[];
}) {
  const profile = getCategoryProfile(category);
  const productType = inferProductType({ name, brand, category: profile.category, snippets });
  const specs: ProductSpecs = {
    brand: normalizeBrand(brand),
    category: profile.category,
    product_type: productType,
    model: inferModel(name, snippets),
    main_features: extractFeatures(snippets, profile.featureKeywords, 8),
    best_for: mergeUnique(extractBestFor(snippets), profile.bestForDefaults).slice(0, 6),
    check_before_buying: profile.checkBeforeBuyingDefaults,
  };

  profile.specFields.forEach((field) => {
    const value = extractFirstMatch(snippets, field.patterns || defaultPatternsForKey(field.key));
    specs[field.key] = value;
  });

  return specs;
}

export function buildCategoryDescription({
  name,
  brand,
  category,
  productType,
  specs,
}: {
  name: string;
  brand?: string | null;
  category?: string | null;
  productType?: string | null;
  specs: ProductSpecs;
}) {
  const profile = getCategoryProfile(category);
  const productLabel = getProductLabel(name, brand);
  const type = productType || specs.product_type || profile.category.toLowerCase();
  const features = getTopFacts(specs.main_features, getSpecHighlights(specs), 3);
  const useCases = specs.best_for.slice(0, 3);
  const checks = specs.check_before_buying.slice(0, 3);

  if (profile.category === "Headphones") {
    return `${productLabel} are ${lowerFirst(type)} focused on ${readableList(features.map(lowerFirst)) || "everyday listening"}. They are best suited for ${readableList(useCases.map(lowerFirst)) || "music, calls and travel"}.`;
  }

  if (profile.category === "Microphones") {
    return `${productLabel} is ${withArticle(lowerFirst(type))} designed for ${readableList(useCases.map(lowerFirst)) || "vocals, podcasts, streaming or studio recording"}. Key buying factors include ${readableList(checks.map(lowerFirst))}.`;
  }

  if (profile.category === "Camera") {
    return `${productLabel} is ${withArticle(lowerFirst(type))} designed for ${readableList(useCases.map(lowerFirst)) || "vlogging, travel video and handheld content creation"}. Key details include ${readableList(features.map(lowerFirst)) || "stabilization, image quality and creator-focused handling"}.`;
  }

  if (profile.category === "Other") {
    const brandText = brand ? ` from ${normalizeBrand(brand)}` : "";
    return `${productLabel} is listed${brandText} for real-owner buying questions. OwnerCheck helps buyers ask about setup, reliability, comfort, and long-term value.`;
  }

  return `${productLabel} is ${withArticle(lowerFirst(type))} for ${readableList(useCases.map(lowerFirst)) || lowerFirst(profile.category)}. Key buying factors include ${readableList(checks.map(lowerFirst))}.`;
}

export function buildCategoryOverview({
  name,
  brand,
  category,
  productType,
  specs,
}: {
  name: string;
  brand?: string | null;
  category?: string | null;
  productType?: string | null;
  specs: ProductSpecs;
}) {
  const profile = getCategoryProfile(category);
  const productLabel = getProductLabel(name, brand);
  const type = productType || specs.product_type || profile.category.toLowerCase();
  const features = getTopFacts(specs.main_features, getSpecHighlights(specs), 4);
  const useCases = specs.best_for.slice(0, 4);
  const checks = specs.check_before_buying.slice(0, 5);

  const first = `${productLabel} ${profile.category === "Headphones" ? "are" : "is"} ${profile.category === "Headphones" ? lowerFirst(type) : withArticle(lowerFirst(type))} for ${readableList(useCases.map(lowerFirst)) || lowerFirst(profile.category)}.`;
  const second = features.length > 0 ? `Notable details include ${readableList(features.map(lowerFirst))}.` : "";
  const third = checks.length > 0 ? `Buyers should ask owners about ${readableList(checks.map(lowerFirst))}.` : "";

  return [first, second, third].filter(Boolean).slice(0, 3).join(" ");
}

export function getProductLabel(name: string, brand?: string | null) {
  const cleanName = cleanText(name);
  const cleanBrand = normalizeBrand(brand);

  if (!cleanBrand || cleanName.toLowerCase().includes(cleanBrand.toLowerCase())) {
    return cleanName;
  }

  return `${cleanBrand} ${cleanName}`;
}

function inferCategoryFromHaystack(haystack: string) {
  const order: CategoryName[] = [
    "Camera",
    "Headphones",
    "Microphones",
    "Audio Interface",
    "Lighting",
    "Keyboard",
    "Controller",
    "Laptop",
    "Monitor",
    "Mouse",
    "Speaker",
  ];

  for (const category of order) {
    const profile = getCategoryProfile(category);
    if (profile.aliases.some((alias) => haystack.includes(alias))) {
      return profile.category;
    }
  }

  return null;
}

function extractFeatures(snippets: string[], rules: FeatureRule[], limit: number) {
  const haystack = normalizeHaystack(snippets);
  const signals = rules
    .filter((rule) => rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())))
    .map((rule) => rule.label);

  return mergeUnique(signals, []).slice(0, limit);
}

function extractBestFor(snippets: string[]) {
  const haystack = normalizeHaystack(snippets);
  const rules: FeatureRule[] = [
    { keywords: ["travel"], label: "Travel" },
    { keywords: ["commuting", "commute"], label: "Commuting" },
    { keywords: ["studio"], label: "Studio work" },
    { keywords: ["streaming"], label: "Streaming" },
    { keywords: ["podcast"], label: "Podcasting" },
    { keywords: ["gaming"], label: "Gaming" },
    { keywords: ["calls"], label: "Calls" },
    { keywords: ["video"], label: "Video" },
    { keywords: ["creator", "content creation"], label: "Content creation" },
    { keywords: ["music"], label: "Music listening" },
    { keywords: ["office", "work"], label: "Work" },
  ];

  return rules
    .filter((rule) => rule.keywords.some((keyword) => haystack.includes(keyword)))
    .map((rule) => rule.label);
}

function inferModel(name: string, snippets: string[]) {
  const cleanName = cleanText(name);
  const haystack = normalizeHaystack(snippets);
  return cleanName && haystack.includes(cleanName.toLowerCase()) ? cleanName : null;
}

function getSpecHighlights(specs: ProductSpecs) {
  return Object.entries(specs)
    .filter(([key, value]) =>
      !["brand", "category", "product_type", "model", "main_features", "best_for", "check_before_buying"].includes(key) &&
      typeof value === "string" &&
      value.trim().length > 0
    )
    .map(([, value]) => value as string)
    .slice(0, 4);
}

function extractFirstMatch(snippets: string[], patterns: RegExp[]) {
  const haystack = snippets.join(" ");

  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) return cleanText(match[1].replace(/\bhrs?\b/i, "hours"));
    if (match?.[0]) return cleanText(match[0].replace(/\bhrs?\b/i, "hours"));
  }

  return null;
}

function defaultPatternsForKey(key: string) {
  const map: Record<string, RegExp[]> = {
    connectivity: CONNECTIVITY_PATTERNS,
    connection: CONNECTIVITY_PATTERNS,
    battery_life: BATTERY_PATTERNS,
    power: [/\b(\d+\s*W)\b/i, /\b(AC power)\b/i, /\b(battery powered)\b/i],
    inputs: [/\b(\d+\s*(?:inputs?|in))\b/i],
    outputs: [/\b(\d+\s*(?:outputs?|out))\b/i],
    phantom_power: [/\b(48V phantom power)\b/i, /\b(phantom power)\b/i],
    sample_rate: [/\b(\d+\s*kHz)\b/i],
    brightness: [/\b(\d+\s*(?:lumens|lux))\b/i],
    color_temperature: [/\b(\d{4}\s*K\s*[-–]\s*\d{4}\s*K)\b/i],
    rgb: [/\b(RGB)\b/i],
    control: [/\b(app control)\b/i, /\b(remote control)\b/i],
    mounting: [/\b(desk mount)\b/i, /\b(mounting)\b/i],
    layout: [/\b(full-size)\b/i, /\b(compact)\b/i, /\b(tenkeyless)\b/i],
    switch_type: [/\b(mechanical)\b/i, /\b(low profile)\b/i],
    backlighting: [/\b(backlit)\b/i, /\b(backlighting)\b/i],
    compatibility: [/\b(macOS)\b/i, /\b(Windows)\b/i, /\b(iPadOS)\b/i],
    buttons_or_pads: [/\b(\d+\s*(?:buttons|keys|pads))\b/i],
    software_support: [/\b(OBS)\b/i, /\b(plugins?)\b/i, /\b(software profiles?)\b/i],
    processor: [/\b(Apple M\d[^,.]*)\b/i, /\b(Intel [^,.]*)\b/i, /\b(AMD [^,.]*)\b/i],
    gpu: [/\b(RTX\s*\d+)\b/i, /\b(GeForce [^,.]*)\b/i],
    ram: [/\b(\d+\s*GB\s+RAM)\b/i],
    storage: [/\b(\d+\s*(?:GB|TB)\s+storage)\b/i, /\b(\d+\s*(?:GB|TB)\s+SSD)\b/i],
    display: [/\b(\d+(?:\.\d+)?-inch [^,.]*(?:display|screen))\b/i],
    ports: [/\b(USB-C)\b/i, /\b(Thunderbolt)\b/i, /\b(HDMI)\b/i, /\b(DisplayPort)\b/i],
    weight: [/\b(\d+(?:\.\d+)?\s*(?:kg|lb|lbs|g|grams|oz))\b/i],
    screen_size: [/\b(\d+(?:\.\d+)?-inch)\b/i],
    resolution: [/\b(4K)\b/i, /\b(1440p)\b/i, /\b(1080p)\b/i],
    refresh_rate: [/\b(\d+\s*Hz)\b/i],
    panel_type: [/\b(OLED)\b/i, /\b(IPS)\b/i, /\b(VA)\b/i],
    hdr: [/\b(HDR[0-9A-Za-z +]*)\b/i],
    sensor: [/\b(1-inch CMOS sensor)\b/i, /\b(APS-C)\b/i, /\b(full-frame)\b/i, /\b(gaming sensor)\b/i],
    dpi: [/\b(\d{3,5}\s*DPI)\b/i],
    buttons: [/\b(\d+\s*buttons?)\b/i],
    water_resistance: [/\b(IP\d+[A-Z]*)\b/i, /\b(waterproof)\b/i],
    channels: [/\b(\d+\.\d+\s*channels?)\b/i, /\b(stereo)\b/i],
  };

  return map[key] || [];
}

function labelFromKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanText(value: string) {
  return value
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[.\-:,;\s]+|[.\-:,;\s]+$/g, "")
    .trim();
}

function normalizeHaystack(values: Array<string | null | undefined>) {
  return values.map((value) => cleanText(value || "").toLowerCase()).join(" ");
}

function mergeUnique(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second].filter(Boolean)));
}

function readableList(items: string[]) {
  const cleanItems = items.filter(Boolean);
  if (cleanItems.length <= 1) return cleanItems[0] || "";
  return `${cleanItems.slice(0, -1).join(", ")} and ${cleanItems[cleanItems.length - 1]}`;
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function withArticle(value: string) {
  return /^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`;
}

function getTopFacts(items: string[], fallbackItems: string[], limit: number) {
  return mergeUnique(items, fallbackItems).slice(0, limit);
}
