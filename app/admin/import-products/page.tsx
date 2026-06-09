"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_EMAIL = "reportkowalski1@gmail.com";

type ParsedProduct = {
  name: string;
  brand: string;
  category: string;
  image_url: string;
  source_url: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateProductData(name: string, brand: string, category: string) {
  const cleanCategory = category || "Product";

  return {
    description: `${name} is a ${cleanCategory.toLowerCase()} product. Ask real owners about long-term use, value, durability, setup, and everyday experience before buying.`,
    ai_summary: `${name} is listed in the ${cleanCategory} category. This page helps buyers collect real-owner answers before making a purchase decision.`,
    starter_questions: [
      "What should buyers know before buying this?",
      "How is it after long-term use?",
      "What is the biggest problem you noticed?",
      "Is it worth the price?",
      "Would you buy it again?",
    ],
    evaluation_criteria: [
      "Build quality",
      "Ease of use",
      "Value for money",
      "Durability",
      "Long-term satisfaction",
      "Would buy again",
    ],
    search_keywords: [
      name,
      brand,
      category,
      "real owner review",
      "buyer questions",
    ].filter(Boolean),
  };
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseProductsCsv(csvText: string): ParsedProduct[] {
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((item) => item.toLowerCase());

  const nameIndex = header.indexOf("name");
  const brandIndex = header.indexOf("brand");
  const categoryIndex = header.indexOf("category");
  const imageUrlIndex = header.indexOf("image_url");
  const sourceUrlIndex = header.indexOf("source_url");

  if (nameIndex === -1) {
    throw new Error("CSV must include a name column.");
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return {
      name: values[nameIndex] || "",
      brand: brandIndex >= 0 ? values[brandIndex] || "" : "",
      category: categoryIndex >= 0 ? values[categoryIndex] || "" : "",
      image_url: imageUrlIndex >= 0 ? values[imageUrlIndex] || "" : "",
      source_url: sourceUrlIndex >= 0 ? values[sourceUrlIndex] || "" : "",
    };
  });
}

export default function AdminImportProductsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [csvText, setCsvText] = useState(
    `name,brand,category,image_url,source_url
Sony WH-1000XM5,Sony,Headphones,https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb,https://www.sony.com/electronics/headband-headphones/wh-1000xm5
Shure SM7B,Shure,Microphones,https://images.unsplash.com/photo-1590602847861-f357a9332bbc,https://www.shure.com/products/microphones/sm7b`
  );

  const [previewProducts, setPreviewProducts] = useState<ParsedProduct[]>([]);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoggedIn(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);
      setIsAdmin(user.email === ADMIN_EMAIL);
      setLoading(false);
    }

    checkAdmin();
  }, []);

  function previewCsv() {
    setMessage("");

    try {
      const parsed = parseProductsCsv(csvText).filter((product) =>
        product.name.trim()
      );

      setPreviewProducts(parsed);
      setMessage(`Preview ready: ${parsed.length} products found.`);
    } catch (error) {
      setPreviewProducts([]);
      setMessage(error instanceof Error ? error.message : "Could not parse CSV.");
    }
  }

  async function importProducts() {
    setMessage("");
    setImporting(true);

    let parsed: ParsedProduct[] = [];

    try {
      parsed = parseProductsCsv(csvText).filter((product) =>
        product.name.trim()
      );
    } catch (error) {
      setImporting(false);
      setMessage(error instanceof Error ? error.message : "Could not parse CSV.");
      return;
    }

    if (parsed.length === 0) {
      setImporting(false);
      setMessage("No valid products found.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setImporting(false);
      setMessage("Admin session is missing. Log in again.");
      return;
    }

    const response = await fetch("/api/admin/import-products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ products: parsed }),
    });
    const result = (await response.json()) as {
      error?: string;
      rows?: Array<{ status: string }>;
    };

    setImporting(false);

    if (!response.ok) {
      setMessage(result.error || "Could not import products.");
      return;
    }

    setPreviewProducts(parsed);
    const importedCount = (result.rows || []).filter(
      (row) => row.status === "imported"
    ).length;
    const failedCount = (result.rows || []).filter(
      (row) => row.status === "failed"
    ).length;
    setMessage(`Imported ${importedCount} products. Failed: ${failedCount}.`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading import page...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Admin login required</h1>
          <p className="mt-3 text-muted">
            Log in before importing products.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Access denied</h1>
          <p className="mt-3 text-muted">
            You do not have permission to import products.
          </p>
          <Link href="/" className="btn btn-dark mt-5">
            Go home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="mb-8">
        <p className="font-bold text-muted">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Bulk import products</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Paste a CSV list of products. OwnerCheck will create ready product
          pages with generated summaries, starter questions, and evaluation
          criteria.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/products" className="btn">
            Review products
          </Link>
          <Link href="/admin/import-urls" className="btn">
            Import URLs
          </Link>
          <Link href="/explore" className="btn">
            Explore catalog
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-2xl font-black">CSV data</h2>
        <p className="mt-2 text-sm text-muted">
          Required column: name. Optional columns: brand, category, image_url,
          source_url.
        </p>

        <textarea
          className="input mt-4 min-h-80 font-mono text-sm"
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
        />

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={previewCsv}>
            Preview CSV
          </button>

          <button
            type="button"
            className="btn btn-dark"
            onClick={importProducts}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import products"}
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}
      </section>

      {previewProducts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-black">Preview</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {previewProducts.map((product, index) => (
              <div key={`${product.name}-${index}`} className="card p-5">
                <p className="text-sm font-bold text-muted">
                  {product.brand || "Unknown brand"} ·{" "}
                  {product.category || "Other"}
                </p>
                <h3 className="mt-2 text-xl font-black">{product.name}</h3>

                {product.image_url && (
                  <p className="mt-2 line-clamp-1 text-sm text-muted">
                    Image: {product.image_url}
                  </p>
                )}

                {product.source_url && (
                  <p className="mt-2 line-clamp-1 text-sm text-muted">
                    Source: {product.source_url}
                  </p>
                )}

                <p className="mt-3 text-sm font-bold">
                  Slug:{" "}
                  {slugify(
                    `${product.brand ? `${product.brand} ` : ""}${product.name}`
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
