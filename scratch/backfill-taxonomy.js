const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

// Load .env.local manually
const envPath = "c:/Users/Kowalski/ownercheck/.env.local";
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use SUPABASE_SERVICE_ROLE_KEY if available for write access, fallback to publishable key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables. URL:", supabaseUrl, "Key:", supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function slugify(label) {
  if (!label) return "";
  return label
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function inferMainCategory(category) {
  const norm = slugify(category);
  if (["headphones", "speakers", "audio"].includes(norm)) return "Audio";
  if (["cameras", "lenses", "video"].includes(norm)) return "Photo & Video";
  if (["tvs", "soundbars", "projectors", "home-entertainment"].includes(norm)) return "Home Entertainment";
  if (["monitors", "mice", "keyboards", "printers", "keyboard-switches", "vpns", "routers", "laptops", "computers"].includes(norm)) return "Computers";
  if (["vacuums", "robot-vacuums", "air-purifiers", "smart-home", "mattresses", "home"].includes(norm)) return "Home";
  if (["coffee-makers", "blenders", "air-fryers", "cookware", "kitchen-appliances", "kitchen"].includes(norm)) return "Kitchen";
  if (["running-shoes", "walking-shoes", "hiking-shoes", "sneakers", "training-shoes", "shoes"].includes(norm)) return "Shoes";
  return "Audio"; // default
}

function inferCategoryFromPt(pt) {
  const norm = slugify(pt);
  if (norm.includes("earbud") || norm.includes("headphone") || norm.includes("headset")) return "Headphones";
  if (norm.includes("speaker")) return "Speakers";
  if (norm.includes("camera")) return "Cameras";
  if (norm.includes("monitor")) return "Monitors";
  if (norm.includes("mouse")) return "Mice";
  if (norm.includes("keyboard")) return "Keyboards";
  if (norm.includes("printer")) return "Printers";
  if (norm.includes("router")) return "Routers";
  if (norm.includes("laptop")) return "Laptops";
  if (norm.includes("tv")) return "TVs";
  if (norm.includes("soundbar")) return "Soundbars";
  if (norm.includes("projector")) return "Projectors";
  return "Headphones"; // default
}

async function runBackfill() {
  console.log("Starting taxonomy backfill for all products...");

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, category, product_type, specs, main_category");

  if (error) {
    console.error("Error fetching products:", error.message);
    process.exit(1);
  }

  console.log(`Found ${products.length} products to check.`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const product of products) {
    scanned++;
    let cat = product.category || "";
    let pt = product.product_type || (product.specs && product.specs.product_type) || null;

    if (!cat && pt) {
      cat = inferCategoryFromPt(pt);
    } else if (!cat) {
      cat = "Headphones";
    }

    let mainCat = product.main_category || inferMainCategory(cat);

    const mainCategorySlug = slugify(mainCat);
    const categorySlug = slugify(cat);
    const productTypeSlug = pt ? slugify(pt) : null;

    const taxonomyPath = {
      main_category: mainCat,
      main_category_slug: mainCategorySlug,
      category: cat,
      category_slug: categorySlug,
      product_type: pt,
      product_type_slug: productTypeSlug,
    };

    console.log(`Product: "${product.name}" -> ${mainCat} / ${cat} / ${pt}`);

    const { error: updateError } = await supabase
      .from("products")
      .update({
        main_category: mainCat,
        main_category_slug: mainCategorySlug,
        category: cat,
        category_slug: categorySlug,
        product_type: pt,
        product_type_slug: productTypeSlug,
        taxonomy_path: taxonomyPath,
      })
      .eq("id", product.id);

    if (updateError) {
      console.error(`Failed to update product ${product.id} (${product.name}):`, updateError.message);
      skipped++;
    } else {
      updated++;
    }
  }

  console.log("\nReport summary:");
  console.log(`${scanned} products scanned`);
  console.log(`${updated} products updated`);
  console.log(`${skipped} skipped`);
}

runBackfill();
