import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const C = {
  dark: "#0A0C0F",
  dark3: "#1A1F26",
  dark4: "#222830",
  border: "#2A3140",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
};

interface LegalPageLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, subtitle, children }: LegalPageLayoutProps) {
  return (
    <div style={{ minHeight: "100vh", background: C.dark, display: "flex", flexDirection: "column" }}>
      <Navbar />

      <div style={{ flex: 1, padding: 24 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <div style={{
              fontSize: 10,
              letterSpacing: "2px",
              color: C.gold,
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 8,
            }}>
              Informations légales
            </div>
            <h1 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 40,
              color: C.text,
              letterSpacing: 1,
              margin: 0,
              marginBottom: 16,
            }}>
              {title}
            </h1>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              {subtitle}
            </p>
          </div>

          {/* Content */}
          <div style={{
            background: C.dark3,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 32,
            color: C.text,
            lineHeight: 1.8,
            fontSize: 14,
          }}>
            {children}
          </div>

          {/* Last Updated */}
          <div style={{
            marginTop: 32,
            textAlign: "center",
            color: C.muted,
            fontSize: 12,
          }}>
            Dernière mise à jour: {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
