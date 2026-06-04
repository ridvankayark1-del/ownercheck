"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_EMAIL = "reportkowalski1@gmail.com";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  product_verification_status: string | null;
  source_url: string | null;
  verified_source: string | null;
  created_at: string;
};

export default function AdminProductsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");

  async function loadProducts() {
    setLoading(true);
    setMessage("");

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

    if (user.email !== ADMIN_EMAIL) {
      setIsAdmin(false);
      setMessage("You do not have admin access.");
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, image_url, product_verification_status, source_url, verified_source, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setProducts([]);
    } else {
      setProducts((data as Product[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function updateProductStatus(
    productId: string,
    status: "catalog_verified" | "user_submitted" | "needs_review" | "rejected"
  ) {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email !== ADMIN_EMAIL) {
      setMessage("You do not have admin access.");
      return;
    }

    const verifiedSource =
      status === "catalog_verified" ? "manual_admin_review" : null;

    const { error } = await supabase
      .from("products")
      .update({
        product_verification_status: status,
        verified_source: verifiedSource,
      })
      .eq("id", productId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Product updated.");
    await loadProducts();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading admin products...</h1>
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
            Log in before reviewing product submissions.
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
            You do not have permission to review products.
          </p>
          {message && (
            <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
              {message}
            </p>
          )}
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
        <h1 className="mt-2 text-4xl font-black">Product review</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Review products, verify real products, mark user-submitted entries, or
          reject bad entries.
        </p>

        {message && (
          <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold">
            {message}
          </p>
        )}
      </section>

      {products.length === 0 ? (
        <div className="card p-6">
          <h2 className="text-2xl font-black">No products found</h2>
          <p className="mt-3 text-muted">
            Products will appear here after they are added to the catalog.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {products.map((product) => (
            <div key={product.id} className="card p-5">
              <div className="grid gap-5 md:grid-cols-[120px_1fr]">
                <div className="h-28 w-full overflow-hidden rounded-2xl bg-slate-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      No image
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
                    <span>{product.brand || "Unknown brand"}</span>
                    <span>·</span>
                    <span>{product.category || "Uncategorized"}</span>
                    <span>·</span>
                    <span>
                      {product.product_verification_status || "No status"}
                    </span>
                  </div>

                  <h2 className="mt-2 text-2xl font-black">{product.name}</h2>

                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
                    <Link
                      href={`/product/${product.slug}`}
                      className="underline"
                    >
                      View product page
                    </Link>

                    {product.source_url && (
                      <a
                        href={product.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        View source URL
                      </a>
                    )}
                  </div>

                  {product.verified_source && (
                    <p className="mt-3 text-sm font-bold text-muted">
                      Verified source: {product.verified_source}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={() =>
                        updateProductStatus(product.id, "catalog_verified")
                      }
                    >
                      Mark catalog verified
                    </button>

                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        updateProductStatus(product.id, "user_submitted")
                      }
                    >
                      Mark user submitted
                    </button>

                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        updateProductStatus(product.id, "needs_review")
                      }
                    >
                      Needs review
                    </button>

                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        updateProductStatus(product.id, "rejected")
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}