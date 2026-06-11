"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkCurrentUserIsAdmin } from "@/lib/adminClient";
import { supabase } from "@/lib/supabaseClient";

type ImportRow = {
  url: string;
  status: string;
  message: string;
  slug?: string;
};

export default function AdminImportUrlsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [urlsText, setUrlsText] = useState("");
  const [category, setCategory] = useState("Other");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);

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
      const adminCheck = await checkCurrentUserIsAdmin();
      setIsAdmin(adminCheck.isAdmin);
      setLoading(false);
    }

    checkAdmin();
  }, []);

  async function importUrls() {
    setMessage("");
    setRows([]);
    setImporting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setImporting(false);
      setMessage("Admin session is missing. Log in again.");
      return;
    }

    const urls = urlsText
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    const response = await fetch("/api/admin/import-urls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ urls, category }),
    });
    const result = (await response.json()) as {
      error?: string;
      rows?: ImportRow[];
    };

    setImporting(false);

    if (!response.ok) {
      setMessage(result.error || "Could not import URLs.");
      return;
    }

    setRows(result.rows || []);
    setMessage(`Import complete: ${(result.rows || []).length} rows processed.`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading URL import...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn || !isAdmin) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">
            {loggedIn ? "Access denied" : "Admin login required"}
          </h1>
          <p className="mt-3 text-muted">
            Log in as the OwnerCheck admin before importing product URLs.
          </p>
          <Link href="/auth" className="btn btn-dark mt-5">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <section className="mb-8">
        <p className="font-bold text-muted">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Import product URLs</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Paste source URLs, one per line. OwnerCheck creates catalog-verified
          product rows and saves a source image when page metadata exposes one.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/products" className="btn">
            Product manager
          </Link>
          <Link href="/admin/import-products" className="btn">
            CSV import
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <div className="grid gap-5 md:grid-cols-[1fr_240px]">
          <div>
            <label className="label">Product URLs</label>
            <textarea
              className="input mt-2 min-h-80 font-mono text-sm"
              value={urlsText}
              onChange={(event) => setUrlsText(event.target.value)}
              placeholder="https://www.example.com/product/name"
            />
          </div>

          <div>
            <label className="label">Default category</label>
            <select
              className="input mt-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>Headphones</option>
              <option>Microphones</option>
              <option>Camera</option>
              <option>Laptop</option>
              <option>Audio Interface</option>
              <option>Lighting</option>
              <option>Keyboard</option>
              <option>Controller</option>
              <option>Other</option>
            </select>

            <button
              type="button"
              className="btn btn-dark mt-5 w-full"
              onClick={importUrls}
              disabled={importing}
            >
              {importing ? "Importing..." : "Import URLs"}
            </button>
          </div>
        </div>

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}
      </section>

      {rows.length > 0 && (
        <section className="mt-8 space-y-3">
          {rows.map((row) => (
            <div key={row.url} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="break-all text-sm font-bold">{row.url}</p>
                  <p className="mt-1 text-sm text-muted">{row.message}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  {row.status}
                </span>
              </div>
              {row.slug && (
                <Link
                  href={`/product/${row.slug}`}
                  className="mt-3 inline-flex text-sm font-bold underline"
                >
                  View product
                </Link>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
