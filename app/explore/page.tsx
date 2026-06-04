import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  description: string | null;
};

export default async function ExplorePage() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, slug, name, brand, category, image_url, description")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="card">
          <p className="font-bold text-red-600">Supabase error</p>
          <h1 className="mt-2 text-3xl font-black">Could not load products</h1>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-100 p-4 text-sm">
            {error.message}
          </pre>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <p className="font-bold text-muted">Explore</p>
        <h1 className="text-4xl font-black">
          Find products and ask real owners
        </h1>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            placeholder="Search headphones, microphones, cameras..."
          />
          <button className="btn btn-dark">Search</button>
        </div>
      </div>

      {!products || products.length === 0 ? (
        <div className="card">
          <h2 className="text-xl font-black">No products found</h2>
          <p className="mt-2 text-slate-600">
            Your Supabase products table is empty.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {products.map((product: Product) => (
            <Link
              key={product.id}
              href={`/product/${product.slug}`}
              className="card block transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-4 overflow-hidden rounded-2xl bg-slate-100">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-44 items-center justify-center text-slate-400">
                    No image
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{product.brand || "Unknown brand"}</span>
                <span>•</span>
                <span>{product.category || "Uncategorized"}</span>
              </div>

              <h2 className="mt-2 text-xl font-black">{product.name}</h2>

              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                {product.description ||
                  "Ask real owners questions about this product before buying."}
              </p>

              <div className="mt-5 text-sm font-bold">
                View product →
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
