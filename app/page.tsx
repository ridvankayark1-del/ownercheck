import Link from "next/link";
import { ProductSearch } from "@/components/ProductSearch";
import { supabase } from "@/lib/supabaseClient";

async function getCount(table: string, filter?: (query: any) => any) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count } = await query;
  return count || 0;
}

export default async function HomePage() {
  const [verifiedOwners, publicAnswers, productsWithOwnerInsight, privateChats] =
    await Promise.all([
      getCount("owned_products", (query) =>
        query.in("verification_status", [
          "photo_verified",
          "receipt_verified",
          "trusted_owner",
        ])
      ),
      getCount("answers"),
      getCount("owned_products"),
      getCount("chats", (query) => query.eq("status", "active")),
    ]);
  const proofStats = [
    ["Verified owners", verifiedOwners],
    ["Public answers", publicAnswers],
    ["Products with owner insight", productsWithOwnerInsight],
    ["Private chats completed", privateChats],
  ].filter(([, value]) => Number(value) > 0);
  const categories = [
    ["Audio", "Headphones, earbuds, speakers, microphones"],
    ["Cameras", "Cameras, lenses, creator gear"],
    ["Bags", "Everyday carry, travel, designer bags"],
    ["Watches", "Smartwatches and everyday watches"],
    ["Home", "Home tech and appliances"],
    ["Tech", "Laptops, monitors, keyboards, mice"],
    ["Shoes", "Fit, comfort, and long-term wear"],
    ["Other", "Anything buyers want owner context on"],
  ];

  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.08fr_0.92fr] md:items-center">
        <div>
          <p className="font-bold text-muted">OwnerCheck</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl">
            Ask real owners before you buy.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Get public answers or private advice from verified product owners.
          </p>

          <div className="mt-8 max-w-2xl rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <label className="label text-base">
              What are you thinking of buying?
            </label>
            <ProductSearch
              className="mt-3"
              placeholder="Search for AirPods, Canon R5, Louis Vuitton Neverfull..."
              buttonLabel="Search products"
            />
            <p className="mt-3 text-sm font-bold text-muted">
              Can't find it? Submit a missing product and we'll check it.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/explore" className="btn">
              Explore products
            </Link>
            <Link href="/questions" className="btn">
              Browse questions
            </Link>
          </div>

          {proofStats.length > 0 && (
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {proofStats.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white/75 p-4 ring-1 ring-black/5"
                >
                  <p className="text-3xl font-black text-[var(--primary)]">
                    {value}
                  </p>
                  <p className="mt-1 text-sm font-bold text-muted">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="rounded-3xl bg-[var(--surface-soft)] p-5">
            <p className="text-sm font-black text-muted">Example question</p>
            <h2 className="mt-3 text-2xl font-black">
              Is the microphone actually good for calls in a noisy room?
            </h2>
            <div className="mt-5 rounded-3xl bg-white p-5 shadow-sm">
              <p className="trust-badge trust-badge-verified">
                Answered by a photo-verified owner
              </p>
              <p className="mt-3 leading-7">
                I own this product. Indoors it is good enough for Zoom calls,
                but in a noisy cafe it starts picking up background sound. I
                would not buy it mainly for microphone quality.
              </p>
              <p className="mt-4 text-sm font-bold text-muted">
                Owned for 18 months / Helpful to 12 buyers
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-white/55">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-bold text-muted">Discover by category</p>
              <h2 className="mt-2 text-4xl font-black">
                Start with what you are comparing.
              </h2>
            </div>
            <Link href="/explore" className="btn">
              Browse all
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map(([category, description]) => (
              <Link
                key={category}
                href={`/explore?q=${encodeURIComponent(category)}`}
                className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:-translate-y-1 hover:shadow-md"
              >
                <h3 className="text-xl font-black">{category}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8 max-w-2xl">
          <p className="font-bold text-muted">How OwnerCheck protects trust</p>
          <h2 className="mt-2 text-4xl font-black">
            Owner insight, with guardrails.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-5">
          {[
            ["Verified ownership", "Owners build trust by proving they own the product."],
            ["Public answers stay visible", "Useful answers become part of the product page."],
            ["Private chats are one-to-one", "Personal advice stays between buyer and selected owner."],
            ["Product info is reviewed", "Catalog status is separate from info still being verified."],
            ["Independent owner insight", "Owner answers are separate from external product sources."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-3xl bg-white p-5 ring-1 ring-black/5">
              <h3 className="font-black">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="card p-8 text-center">
          <h2 className="text-4xl font-black">
            Stop guessing from star ratings.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-8 text-muted">
            Search a product, ask a real owner, or claim something you already
            own and help the next buyer.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/explore" className="btn btn-dark">
              Search products
            </Link>
            <Link href="/questions" className="btn">
              Browse questions
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
