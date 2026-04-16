// components/Footer.tsx
import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{
      background: "#0A0C0F",
      borderTop: "1px solid #1E2530",
      padding: "48px 20px 32px",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>

        {/* ── Brand ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 22,
            letterSpacing: 4,
            color: "#C9A84C",
            marginBottom: 8,
          }}>
            Expert Picks
          </div>
          <p style={{
            fontSize: 12,
            color: "#3A4455",
            lineHeight: 1.7,
            maxWidth: 360,
            margin: 0,
          }}>
            Pronostics sportifs premium au Cameroun. Nos experts analysent pour vous
            les meilleures opportunités du marché.
          </p>
        </div>

        {/* ── Link columns ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "28px 16px",
          marginBottom: 36,
          paddingBottom: 36,
          borderBottom: "1px solid #1E2530",
        }}>

          {/* Legal */}
          <div>
            <div style={colHeadStyle}>Légal</div>
            <div style={linkColStyle}>
              <FooterLink href="/privacy-policy">Politique de confidentialité</FooterLink>
              <FooterLink href="/terms">Conditions d'utilisation</FooterLink>
              <FooterLink href="/disclaimer">Avertissement</FooterLink>
            </div>
          </div>

          {/* Company */}
          <div>
            <div style={colHeadStyle}>À propos</div>
            <div style={linkColStyle}>
              <FooterLink href="/about">Qui sommes-nous</FooterLink>
              {/* <FooterLink href="/contact">Nous contacter</FooterLink> */}
              {/* <FooterLink href="/faq">FAQ</FooterLink> */}
            </div>
          </div>

          {/* Picks */}
          {/* <div>
            <div style={colHeadStyle}>Picks</div>
            <div style={linkColStyle}>
              <FooterLink href="/">Picks du jour</FooterLink>
              <FooterLink href="/?tab=historique">Historique</FooterLink>
              <FooterLink href="/comment-ca-marche">Comment ça marche</FooterLink>
            </div>
          </div> */}

        </div>

        {/* ── Responsible gambling disclaimer ── */}
        <div style={{
          background: "rgba(201,168,76,0.04)",
          border: "1px solid rgba(201,168,76,0.12)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 24,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <p style={{ fontSize: 11, color: "#3A4455", lineHeight: 1.7, margin: 0 }}>
            Les paris sportifs comportent des risques de perte financière. Nos pronostics
            sont fournis à titre informatif uniquement et ne constituent pas des conseils
            financiers. Jouez de manière responsable. Interdit aux moins de 18 ans.
          </p>
        </div>

        {/* ── Bottom bar ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <span style={{ fontSize: 11, color: "#2A3140" }}>
            © {year} Expert Picks. Tous droits réservés.
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <FooterLink href="/privacy-policy" small>Confidentialité</FooterLink>
            <FooterLink href="/terms" small>CGU</FooterLink>
            {/* <FooterLink href="/contact" small>Contact</FooterLink> */}
          </div>
        </div>

      </div>
    </footer>
  );
}

// ── Small reusable link ───────────────────────────────────────────────────────
function FooterLink({
  href,
  children,
  small,
}: {
  href: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Link href={href} style={{
      display: "block",
      fontSize: small ? 11 : 12,
      color: small ? "#2A3140" : "#3A4455",
      textDecoration: "none",
      lineHeight: 1,
      transition: "color 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#C9A84C")}
      onMouseLeave={(e) => (e.currentTarget.style.color = small ? "#2A3140" : "#3A4455")}
    >
      {children}
    </Link>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const colHeadStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "2.5px",
  textTransform: "uppercase",
  color: "#C9A84C",
  fontWeight: 700,
  marginBottom: 14,
};

const linkColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};