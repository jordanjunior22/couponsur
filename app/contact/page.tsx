import Link from "next/link";
export default function ContactPage() {
    return (
        <main className="max-w-2xl mx-auto px-4 py-10 text-sm">
            <h1 className="text-2xl font-bold mb-6">Nous contacter</h1>

            <p>Pour toute question ou assistance :</p>

            <ul className="mt-4 space-y-2">
                <li>WhatsApp : +237 XXX XXX XXX</li>
                <li>Email : support@votresite.com</li>
            </ul>

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