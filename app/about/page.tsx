"use client";

import { LegalPageLayout } from "@/components/LegalPageLayout";

const C = { gold: "#C9A84C", green: "#22C55E", muted: "#7A8399", text: "#E8EAF0" };

export default function WhoWeArePage() {
  return (
    <LegalPageLayout
      title="À propos de CouponSur"
      subtitle="Découvrez notre équipe et notre mission"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Section title="Notre mission">
          <p>
            CouponSur est une plateforme dédiée à la prédiction sportive et l’analyse de matchs.
            Nous nous engageons à fournir des pronostics fiables, structurés et basés sur des données
            solides pour aider nos utilisateurs à prendre des décisions éclairées.
          </p>
        </Section>

        <Section title="Qui sommes-nous">
          <p>
            Nous sommes une équipe d’analystes sportifs spécialisés dans plusieurs championnats,
            incluant les compétitions européennes, africaines et internationales. Notre expertise couvre :
          </p>
          <ul>
            <li><strong>Ligue 1 (France)</strong> - Analyse approfondie du championnat français</li>
            <li><strong>Premier League (Angleterre)</strong> - Couverture complète du football anglais</li>
            <li><strong>La Liga (Espagne)</strong> - Expertises des équipes hispaniques</li>
            <li><strong>Serie A (Italie)</strong> - Analyse du football italien</li>
            <li><strong>Bundesliga (Allemagne)</strong> - Suivi du championnat allemand</li>
            <li><strong>Ligue des Champions</strong> - Compétitions internationales</li>
            <li><strong>Championnats africains</strong> - Spécialisation sur le football africain</li>
          </ul>
        </Section>

        <Section title="Notre approche">
          <p>
            Notre objectif est de fournir des pronostics fiables basés sur :
          </p>
          <ul>
            <li><strong>Analyse de données:</strong> Statistiques, formes récentes, historiques</li>
            <li><strong>Expertise humaine:</strong> Connaissances approfondies des équipes et joueurs</li>
            <li><strong>Recherche:</strong> Études constantes des matchups et tendances</li>
            <li><strong>Transparence:</strong> Explications claires de chaque pronostic</li>
            <li><strong>Sélectivité:</strong> Qualité plutôt que quantité de sélections</li>
          </ul>
        </Section>

        <Section title="Nos types de pronostics">
          <p>
            Nous proposons plusieurs catégories adaptées à vos préférences :
          </p>
          <ul>
            <li><strong>Grosses cotes:</strong> Sélections à fortes côtes pour les amateurs de risque</li>
            <li><strong>Montantes:</strong> Combinaisons progressives pour augmenter vos gains</li>
            <li><strong>Safe:</strong> Pronostics sûrs avec de bonnes probabilités de succès</li>
          </ul>
        </Section>

        <Section title="Notre engagement">
          <div style={{
            background: "rgba(201,168,76,0.1)",
            border: `1px solid ${C.gold}40`,
            borderRadius: 8,
            padding: 16,
          }}>
            <ul>
              <li>✓ Pronostics basés sur l’analyse, pas sur les paris aléatoires</li>
              <li>✓ Suivi transparent de nos résultats</li>
              <li>✓ Respect de vos données et de votre vie privée</li>
              <li>✓ Support client réactif et utile</li>
              <li>✓ Amélioration continue de nos services</li>
            </ul>
          </div>
        </Section>

        <Section title="Disclaimer important">
          <p style={{ color: C.green, fontWeight: 600 }}>
            Les pronostics sportifs comportent des risques. CouponSur n’est pas responsable
            des pertes liées aux paris. Pariez de manière responsable.
          </p>
        </Section>

        <Section title="Nous rejoindre">
          <p>
            Rejoignez des milliers d’utilisateurs qui font confiance à CouponSur pour leurs
            pronostics sportifs. Choisissez un plan adapté à vos besoins et accédez à tous
            nos pronostics exclusifs.
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