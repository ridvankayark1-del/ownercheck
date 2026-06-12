import Link from "next/link";

export default function DirectRequestsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <section className="card p-6">
        <p className="font-bold text-muted">Owner inbox</p>
        <h1 className="mt-2 text-3xl font-black">Direct requests moved</h1>
        <p className="mt-3 leading-7 text-muted">
          Direct owner questions now appear in the owner dashboard. Verified
          owners can open an available question there, and the first verified
          owner to submit an answer wins the reward.
        </p>
        <Link href="/owner/dashboard" className="btn btn-dark mt-5">
          Open owner dashboard
        </Link>
      </section>
    </main>
  );
}
