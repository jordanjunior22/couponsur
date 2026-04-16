import Link from "next/link";
export default function WarningPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-sm">
      <h1 className="text-2xl font-bold mb-6">Avertissement</h1>

      <p>
        Les paris sportifs comportent des risques financiers importants.
      </p>

      <p className="mt-4">
        Ne pariez jamais de l'argent que vous ne pouvez pas vous permettre de perdre.
      </p>

      <p className="mt-4">
        Nos conseils sont basés sur des analyses, mais aucun résultat n’est garanti.
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