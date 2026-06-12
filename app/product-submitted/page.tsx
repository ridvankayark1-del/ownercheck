import Link from "next/link";

export default function ProductSubmittedPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <section className="card p-8">
        <p className="font-bold text-muted">Submitted for review</p>
        <h1 className="mt-2 text-4xl font-black">
          Product submitted for review.
        </h1>
        <p className="mt-4 leading-8 text-muted">
          No public product page was created yet. OwnerCheck will review the
          submission, check possible duplicates, and approve it when the product
          is safe to add.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/explore" className="btn btn-dark">
            Back to search
          </Link>
          <Link href="/my-products" className="btn">
            My products
          </Link>
        </div>
      </section>
    </main>
  );
}
