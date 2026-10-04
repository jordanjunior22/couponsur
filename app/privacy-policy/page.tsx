import Link from "next/link";
export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-sm">
      <h1 className="text-2xl font-bold mb-6">Politique de confidentialité</h1>

      <p>
        Nous collectons uniquement les données nécessaires au fonctionnement du service,
        notamment votre numéro de téléphone.
      </p>

      <ul className="mt-4 list-disc pl-5 space-y-2">
        <li>Gérer vos paiements</li>
        <li>Donner accès aux pronostics achetés</li>
        <li>Améliorer nos services</li>
      </ul>

      <p className="mt-4">
        Nous ne vendons ni ne partageons vos données avec des tiers, sauf obligation légale.
      </p>

      <h2 className="text-lg font-bold mt-8 mb-2">Profil dans les groupes de discussion</h2>
      <p>
        Dans les groupes (Premium et Global), les autres membres peuvent ouvrir votre profil
        pour voir votre photo, un nom partiellement masqué (votre numéro n’est jamais affiché en
        entier), vos statistiques et la liste des coupons terminés que vous avez achetés avec leur
        résultat (gagné, perdu ou remboursé). Aucun montant, aucun paiement et aucun coupon
        encore en cours ne sont affichés.
      </p>
      <p className="mt-2">
        Vous pouvez masquer ces informations à tout moment depuis la page Profil, option
        « Mes stats dans les groupes ». Votre profil apparaît alors comme privé.
      </p>

      <p className="mt-4">
        Vous pouvez demander la suppression de vos données à tout moment.
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