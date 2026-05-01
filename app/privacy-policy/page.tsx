"use client";

import { LegalPageLayout } from "@/components/LegalPageLayout";

const C = { gold: "#C9A84C", muted: "#7A8399", text: "#E8EAF0" };

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Politique de confidentialité"
      subtitle="Comment nous protégeons vos données personnelles"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Section title="1. Introduction">
          <p>
            CouponSur ("nous", "notre", ou "nos") respecte la vie privée de nos utilisateurs. Cette politique de confidentialité explique comment nous collectons, utilisons, et protégeons vos informations personnelles.
          </p>
        </Section>

        <Section title="2. Informations que nous collectons">
          <p>Nous collectons uniquement les données nécessaires au fonctionnement du service :</p>
          <ul>
            <li><strong>Informations de compte:</strong> Nom, adresse e-mail, numéro de téléphone</li>
            <li><strong>Informations de paiement:</strong> Détails de transactions (sans stocker les données bancaires)</li>
            <li><strong>Données d’utilisation:</strong> Pages visitées, interactions avec le site</li>
            <li><strong>Informations technique:</strong> Adresse IP, type de navigateur, système d’exploitation</li>
          </ul>
        </Section>

        <Section title="3. Comment nous utilisons vos données">
          <p>Nous utilisons vos informations pour :</p>
          <ul>
            <li>Gérer vos paiements</li>
            <li>Donner accès aux pronostics achetés</li>
            <li>Améliorer nos services</li>
            <li>Vous envoyer des communications importantes</li>
            <li>Respecter les obligations légales</li>
          </ul>
        </Section>

        <Section title="4. Sécurité des données">
          <p>
            Nous mettons en place des mesures de sécurité appropriées pour protéger vos données contre la perte, l’accès non autorisé ou la modification. Cependant, aucune transmission sur Internet n’est 100% sécurisée.
          </p>
        </Section>

        <Section title="5. Cookies">
          <p>
            Notre site utilise des cookies pour améliorer votre expérience utilisateur et pour l’authentification. Vous pouvez configurer votre navigateur pour refuser les cookies, mais cela peut affecter la fonctionnalité du site.
          </p>
        </Section>

        <Section title="6. Partage de données">
          <p>
            Nous ne vendons ni ne partageons vos données avec des tiers, sauf obligation légale. Nous ne partageons vos informations que :
          </p>
          <ul>
            <li>Avec nos prestataires de services (paiement, hébergement)</li>
            <li>Lorsque requis par la loi</li>
            <li>Avec votre consentement explicite</li>
          </ul>
        </Section>

        <Section title="7. Vos droits">
          <p>
            Vous pouvez demander la suppression de vos données à tout moment. Vous avez le droit de :
          </p>
          <ul>
            <li>Accéder à vos données personnelles</li>
            <li>Corriger les informations inexactes</li>
            <li>Demander la suppression de vos données</li>
            <li>Vous opposer à certains traitements</li>
            <li>Retirer votre consentement</li>
          </ul>
        </Section>

        <Section title="8. Contact">
          <p>
            Pour toute question concernant cette politique de confidentialité, veuillez nous contacter à : <strong style={{ color: C.gold }}>support@couponsur.com</strong>
          </p>
        </Section>
      </div>
    </LegalPageLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{
        fontSize: 18,
        fontWeight: 600,
        color: C.gold,
        marginBottom: 12,
        margin: 0,
      }}>
        {title}
      </h2>
      <div style={{ color: C.text }}>
        {children}
      </div>
    </div>
  );
}