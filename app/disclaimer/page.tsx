"use client";

import { LegalPageLayout } from "@/components/LegalPageLayout";

const C = { gold: "#C9A84C", red: "#EF4444", orange: "#F97316", muted: "#7A8399", text: "#E8EAF0" };

export default function WarningPage() {
  return (
    <LegalPageLayout
      title="Avertissement & Disclaimer"
      subtitle="Informations importantes concernant les paris sportifs"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Critical Warning */}
        <div style={{
          background: "rgba(239,68,68,0.15)",
          border: `2px solid ${C.red}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.red, marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
            ⚠️ Avertissement important
          </div>
          <p style={{ color: C.red, fontWeight: 600, margin: 0, fontSize: 15 }}>
            Les paris sportifs comportent des risques financiers importants. Ne pariez jamais
            de l’argent que vous ne pouvez pas vous permettre de perdre.
          </p>
        </div>

        <Section title="1. Absence de garantie">
          <p>
            CouponSur fournit des pronostics basés sur des analyses et des études sportives.
            Cependant, <strong>aucun pronostic n’est garanti</strong>. Les résultats sportifs
            sont imprévisibles et peuvent être influencés par de nombreux facteurs incontrôlables.
          </p>
          <p style={{ color: C.orange, fontWeight: 600 }}>
            Les résultats passés ne garantissent pas les résultats futurs.
          </p>
        </Section>

        <Section title="2. Limitation de responsabilité">
          <p>
            CouponSur ne peut pas être tenu responsable de :
          </p>
          <ul>
            <li>Les pertes financières liées aux paris</li>
            <li>Les erreurs de prédiction ou analyses inexactes</li>
            <li>Les changements de règlement ou conditions des matchs</li>
            <li>Les décisions arbitrales ou événements imprévus</li>
            <li>Les dommages psychologiques ou émotionnels</li>
          </ul>
        </Section>

        <Section title="3. Paris responsables">
          <p>
            Nous vous recommandons fortement :
          </p>
          <div style={{
            background: "rgba(34,197,94,0.08)",
            border: `1px solid rgba(34,197,94,0.3)`,
            borderRadius: 8,
            padding: 16,
          }}>
            <ul>
              <li>✓ Fixez un budget de paris et respectez-le</li>
              <li>✓ Ne pariez que sur l’argent que vous pouvez vous permettre de perdre</li>
              <li>✓ Ne poursuivez pas vos pertes par des paris plus importants</li>
              <li>✓ Prenez des pauses régulières</li>
              <li>✓ Ne pariez pas sous l’influence de l’alcool ou de drogues</li>
              <li>✓ Cherchez de l’aide si vous pensez avoir un problème de jeu</li>
            </ul>
          </div>
        </Section>

        <Section title="4. Nature analytique">
          <p>
            CouponSur est un service d’analyse sportive. Nos pronostics sont :
          </p>
          <ul>
            <li><strong>Basés sur des données:</strong> Statistiques, formes récentes, historiques</li>
            <li><strong>Subjectifs:</strong> Interprétés par notre équipe d’analystes</li>
            <li><strong>Non garantis:</strong> Aucune certitude de résultat</li>
            <li><strong>Éducatifs:</strong> Conçus pour informer, pas pour garantir des gains</li>
          </ul>
        </Section>

        <Section title="5. Données et fluctuations">
          <p>
            Nos analyses sont basées sur les meilleures données disponibles au moment de la publication.
            Cependant :
          </p>
          <ul>
            <li>Les blessures de joueurs peuvent changer les dynamiques</li>
            <li>Les changements d’entraîneur affectent les performances</li>
            <li>Les conditions météorologiques impactent le jeu</li>
            <li>Les facteurs politiques ou sociaux peuvent intervenir</li>
            <li>Les côtes et probabilités fluctuent constamment</li>
          </ul>
        </Section>

        <Section title="6. Légalité">
          <p>
            L’utilisateur est responsable de vérifier la légalité des paris dans sa juridiction.
            CouponSur n’encourage pas ou ne facilite pas les paris illégaux. L’utilisateur doit
            respecter toutes les lois applicables dans son pays ou région.
          </p>
        </Section>

        <Section title="7. Problème de jeu">
          <p>
            Si vous pensez avoir un problème de jeu compulsif, nous vous encourageons à chercher de l’aide.
            Les ressources suivantes peuvent vous aider :
          </p>
          <ul>
            <li><strong>Gambler’s Anonymous:</strong> Support pour les personnes dépendantes au jeu</li>
            <li><strong>Conseil sur les jeux responsables:</strong> Consulter un professionnel</li>
            <li><strong>Hotlines nationales:</strong> Contactez les autorités de santé mentale de votre pays</li>
          </ul>
        </Section>

        <Section title="8. Modifications du disclaimer">
          <p>
            CouponSur se réserve le droit de modifier ce disclaimer à tout moment.
            Consultez régulièrement cette page pour les mises à jour.
          </p>
        </Section>

        <Section title="9. Acceptation">
          <div style={{
            background: "rgba(201,168,76,0.1)",
            border: `1px solid ${C.gold}40`,
            borderRadius: 8,
            padding: 16,
          }}>
            <p style={{ margin: 0, color: C.text, fontWeight: 600 }}>
              En utilisant CouponSur, vous acceptez que vous avez lu, compris et accepté
              tous les termes de cet avertissement. Vous acceptez également que vous pariez
              à vos propres risques et que CouponSur ne peut pas être tenu responsable.
            </p>
          </div>
        </Section>

        <Section title="10. Contact pour les préoccupations">
          <p>
            Si vous avez des préoccupations concernant ce disclaimer ou nos pratiques,
            veuillez nous contacter à : <strong style={{ color: C.gold }}>support@couponsur.com</strong>
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