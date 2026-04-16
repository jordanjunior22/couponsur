import Link from "next/link";

export default function WhoWeArePage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-sm">
      <h1 className="text-2xl font-bold mb-6">Qui sommes-nous</h1>

      <p>
        Nous sommes une équipe d’analystes sportifs spécialisés dans plusieurs
        championnats (Europe, Afrique, compétitions internationales).
      </p>

      <p className="mt-4">
        Notre objectif est de fournir des pronostics fiables et structurés,
        basés sur des données et de l’expérience.
      </p>

      {/* ─── Back Home Button ───────────────────────── */}
      <div className="mt-8">
        <Link
          href="/"
          className="inline-block px-5 py-2 rounded-md border border-[#2A3140] hover:bg-[#222830] transition text-xs font-semibold tracking-wide"
        >
          ← Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}