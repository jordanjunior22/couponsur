import Link from "next/link";

export default function ContactPage() {
    return (
        <main className="max-w-2xl mx-auto px-4 py-10 text-sm">
            <h1 className="text-2xl font-bold mb-6">Nous contacter</h1>

            <p>
                Une question ou un problème ? Cliquez sur la bulle de discussion en
                bas à droite de l’écran pour nous écrire directement — un membre de
                notre équipe vous répond, en personne.
            </p>

            <p className="mt-4">
                Nous répondons généralement sous 24h.
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
