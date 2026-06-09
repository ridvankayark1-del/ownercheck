import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div>
          <p className="font-bold text-muted">OwnerCheck</p>

          <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl">
            Ask real owners before you buy.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Get answers from people who actually own the product — not generic
            reviews or fake hype.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/explore" className="btn btn-dark">
              Explore products
            </Link>

            <Link href="/add-product" className="btn">
              Add a product
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-3xl font-black">1</p>
              <h3 className="mt-2 font-black">Search a product</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Find the product you are thinking about buying.
              </p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-3xl font-black">2</p>
              <h3 className="mt-2 font-black">Ask owners</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Ask specific questions that normal reviews do not answer.
              </p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-3xl font-black">3</p>
              <h3 className="mt-2 font-black">Buy smarter</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Learn from real ownership before spending your money.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-black text-muted">Example question</p>
            <h2 className="mt-3 text-2xl font-black">
              “Is the microphone actually good for calls in a noisy room?”
            </h2>

            <div className="mt-5 rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-muted">
                Answered by a real owner
              </p>
              <p className="mt-3 leading-7">
                I own this product. Indoors it is good enough for Zoom calls,
                but in a noisy café it starts picking up background sound. I
                would not buy it mainly for microphone quality.
              </p>
              <p className="mt-4 text-sm font-bold text-muted">
                Helpful · Verified owner coming soon
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-center">
              <p className="text-2xl font-black">Real</p>
              <p className="text-xs font-bold text-muted">Owner answers</p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-center">
              <p className="text-2xl font-black">10</p>
              <p className="text-xs font-bold text-muted">Credits per answer</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-12 md:grid-cols-3">
          <div>
            <h2 className="text-xl font-black">For buyers</h2>
            <p className="mt-3 leading-7 text-muted">
              Ask what you really want to know: comfort, durability, setup,
              long-term problems, size, noise, battery, and value.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-black">For owners</h2>
            <p className="mt-3 leading-7 text-muted">
              List products you own, answer questions, earn credits, and build
              trust by helping people avoid bad purchases.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-black">For products</h2>
            <p className="mt-3 leading-7 text-muted">
              Every product page becomes a living Q&A page powered by people who
              actually own the item.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8 max-w-2xl">
          <p className="font-bold text-muted">Why OwnerCheck is different</p>
          <h2 className="mt-2 text-4xl font-black">
            No fake hype. No generic reviews.
          </h2>
          <p className="mt-4 leading-8 text-muted">
            Reviews are often too generic. Star ratings do not answer your exact
            question. OwnerCheck lets you ask people who actually own the
            product.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="card p-6">
            <h3 className="text-xl font-black">Ask your question</h3>
            <p className="mt-3 leading-7 text-muted">
              Comfort, durability, setup, battery life, fit, noise, or
              long-term issues.
            </p>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-black">Hear from owners</h3>
            <p className="mt-3 leading-7 text-muted">
              Product pages prioritize real-owner answers over broad review
              summaries.
            </p>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-black">Buy with context</h3>
            <p className="mt-3 leading-7 text-muted">
              No fake hype. No generic reviews. Just answers from real owners.
            </p>
          </div>
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
              Start exploring
            </Link>

            <Link href="/questions" className="btn">
              Answer questions
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
