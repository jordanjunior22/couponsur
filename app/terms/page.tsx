import Link from "next/link";
export default function TermsPage() {
    return (
        <main className="max-w-2xl mx-auto px-4 py-10 text-sm">
            <h1 className="text-2xl font-bold mb-6">Conditions d'utilisation</h1>

            <ul className="list-disc pl-5 space-y-2">
                <li>Les pronostics ne garantissent aucun résultat</li>
                <li>Utilisation responsable du service</li>
                <li>Interdiction de contourner les paiements</li>
            </ul>

            <p className="mt-4">
                Tout abus peut entraîner la suspension du compte sans remboursement.
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