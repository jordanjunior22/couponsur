"use client";

import { LegalPageLayout } from "@/components/LegalPageLayout";

const C = { gold: "#C9A84C", red: "#EF4444", muted: "#7A8399", text: "#E8EAF0" };

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Conditions d’utilisation"
      subtitle="Termes et conditions d’accès à CouponSur"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Section title="1. Acceptation des conditions">
          <p>
            En accédant à et en utilisant CouponSur, vous acceptez d’être lié par ces conditions d’utilisation.
            Si vous n’acceptez pas ces conditions, veuillez ne pas utiliser le service.
          </p>
        </Section>

        <Section title="2. Utilisation du service">
          <p>Vous acceptez :</p>
          <ul>
            <li>D’utiliser le service de manière responsable et légale</li>
            <li>De ne pas utiliser le service à des fins illégales ou nuisibles</li>
            <li>De respecter les droits d’auteur et la propriété intellectuelle</li>
            <li>De ne pas tenter de contourner les systèmes de paiement</li>
            <li>De fournir des informations exactes lors de la création de votre compte</li>
          </ul>
        </Section>

        <Section title="3. Garanties et disclaimers">
          <div style={{
            background: "rgba(239,68,68,0.1)",
            border: `1px solid ${C.red}40`,
            borderRadius: 8,
            padding: 16,
            color: C.red,
          }}>
            <p style={{ fontWeight: 600, margin: 0 }}>
              ⚠️ Important : Les pronostics ne garantissent aucun résultat. CouponSur n’est pas responsable
              des pertes liées aux paris. Les résultats passés ne garantissent pas les résultats futurs.
            </p>
          </div>
        </Section>

        <Section title="4. Limitation de responsabilité">
          <p>
            CouponSur ne peut pas être tenu responsable de :
          </p>
          <ul>
            <li>Les pertes financières liées aux paris</li>
            <li>Les interruptions de service ou bugs techniques</li>
            <li>L’accès non autorisé à votre compte</li>
            <li>Les dommages indirects ou consécutifs</li>
          </ul>
        </Section>

        <Section title="5. Paiements et refunds">
          <p>
            Les abonnements sont non remboursables. Vous pouvez annuler votre abonnement à tout moment,
            mais vous n’aurez pas accès à de futurs pronostics.
          </p>
        </Section>

        <Section title="6. Suspension de compte">
          <p>
            Tout abus du service peut entraîner la suspension ou la suppression immédiate du compte sans préavis.
            Les abus incluent :
          </p>
          <ul>
            <li>Utilisation frauduleuse ou tentative de contourner les paiements</li>
            <li>Partage non autorisé de contenu ou d’identifiants</li>
            <li>Harcèlement ou abus envers notre équipe</li>
            <li>Utilisation de scripts ou bots</li>
            <li>Violation de la vie privée d’autres utilisateurs</li>
          </ul>
        </Section>

        <Section title="7. Propriété intellectuelle">
          <p>
            Tous les contenus, pronostics et analyses sur CouponSur sont protégés par des droits d’auteur.
            Vous n’avez pas le droit de reproduire, modifier ou distribuer ce contenu sans autorisation.
          </p>
        </Section>

        <Section title="8. Modifications des conditions">
          <p>
            CouponSur se réserve le droit de modifier ces conditions à tout moment.
            Les modifications prendront effet immédiatement. Votre utilisation continue du service
            constitue l’acceptation des conditions modifiées.
          </p>
        </Section>

        <Section title="9. Loi applicable">
          <p>
            Ces conditions sont régies par les lois applicables. Tout litige sera soumis à la juridiction compétente.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Pour toute question concernant ces conditions, veuillez nous contacter à :
            <strong style={{ color: C.gold }}> support@couponsur.com</strong>
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