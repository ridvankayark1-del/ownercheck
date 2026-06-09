"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  getOwnerLevel,
  getOwnerLevelBadgeClass,
  getOwnerLevelLabel,
} from "@/lib/ownerLevels";

type Profile = {
  trust_score: number | null;
};

type ProductInfo = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
};

type RawOwnedProduct = {
  id: string;
  ownership_months: number | null;
  verification_status: string;
  verification_photo_url: string | null;
  verification_code: string | null;
  rating: number | null;
  review_text: string | null;
  pros: string | null;
  cons: string | null;
  would_buy_again: boolean | null;
  product_id: string;
  products: ProductInfo | ProductInfo[] | null;
};

type OwnedProduct = {
  id: string;
  ownership_months: number | null;
  verification_status: string;
  verification_photo_url: string | null;
  verification_code: string | null;
  rating: number | null;
  review_text: string | null;
  pros: string | null;
  cons: string | null;
  would_buy_again: boolean | null;
  product_id: string;
  products: ProductInfo | null;
};

function normalizeProduct(product: ProductInfo | ProductInfo[] | null) {
  if (Array.isArray(product)) {
    return product[0] || null;
  }

  return product;
}

export default function MyProductsPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedProducts, setOwnedProducts] = useState<OwnedProduct[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadMyProducts() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setErrorMessage(userError.message);
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      if (!user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("trust_score")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setErrorMessage(profileError.message);
      }

      const { data, error } = await supabase
        .from("owned_products")
        .select(
          "id, product_id, ownership_months, verification_status, verification_photo_url, verification_code, rating, review_text, pros, cons, would_buy_again, products(slug, name, brand, category, image_url)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setOwnedProducts([]);
      } else {
        const normalized = ((data || []) as RawOwnedProduct[]).map((item) => ({
          ...item,
          products: normalizeProduct(item.products),
        }));

        setProfile(profileData || null);
        setOwnedProducts(normalized);
      }

      setLoading(false);
    }

    loadMyProducts();
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Loading your products...</h1>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="card p-6">
          <h1 className="text-3xl font-black">Log in to see your products</h1>
          <p className="mt-3 text-muted">
            Your claimed products will appear here.
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
        <p className="font-bold text-muted">My products</p>
        <h1 className="mt-2 text-4xl font-black">Products I own</h1>
        <p className="mt-3 max-w-2xl text-muted">
          These are the products you claimed as a real owner.
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        )}
      </section>

      {ownedProducts.length === 0 ? (
        <div className="card p-6">
          <h2 className="text-2xl font-black">No products claimed yet</h2>
          <p className="mt-3 text-muted">
            If you just claimed a product and still see this, check that the
            claim belongs to the same logged-in account.
          </p>
          <Link href="/add-product" className="btn btn-dark mt-5">
            Add product
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {ownedProducts.map((item) => {
            const ownerLevel = getOwnerLevel(
              item.verification_status,
              profile?.trust_score
            );

            return (
              <Link
                key={item.id}
                href={`/product/${item.products?.slug || ""}`}
                className="card block p-5 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-4 overflow-hidden rounded-2xl bg-slate-100">
                  {item.products?.image_url ? (
                    <img
                      src={item.products.image_url}
                      alt={item.products.name}
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center text-muted">
                      No image
                    </div>
                  )}
                </div>

                <p className="text-sm font-bold text-muted">
                  {item.products?.brand || "Unknown brand"} ·{" "}
                  {item.products?.category || "Uncategorized"}
                </p>

                <h2 className="mt-2 text-xl font-black">
                  {item.products?.name || "Unknown product"}
                </h2>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${getOwnerLevelBadgeClass(
                      ownerLevel
                    )}`}
                  >
                    {getOwnerLevelLabel(ownerLevel)}
                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    {item.ownership_months || 0} months owned
                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    {item.rating || "—"}/5
                  </span>
                </div>

                {item.verification_photo_url && (
                  <p className="mt-3 text-sm font-bold text-muted">
                    Verification photo submitted
                  </p>
                )}

                {item.review_text && (
                  <p className="mt-3 line-clamp-3 text-sm leading-6">
                    {item.review_text}
                  </p>
                )}

                <p className="mt-4 text-sm font-bold">View product →</p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
