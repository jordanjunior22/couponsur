"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  PiChartLineUpBold, PiRobotFill, PiMegaphoneFill, PiChatCircleDotsFill,
  PiClockCounterClockwiseFill, PiBellFill, PiDownloadSimpleBold,
  PiShareFatBold, PiCheckCircleFill, PiCaretRightBold, PiSquaresFourFill,
  PiPlusSquareFill, PiArrowRightBold,
} from "react-icons/pi";
import { usePWAInstall, isIOS } from "@/hooks/usePWAInstall";
import { trackEvent, generateEventId, getFbCookies } from "@/lib/pixelClient";

const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0",
  gold: "#C9A84C", goldLight: "#E8C97A",
};

// Per-device guard so a repeat visitor (or a page refresh after already
// confirming) never re-reports the same conversion under a fresh eventId —
// Meta's dedup is per eventId, so a new one each time would double-count.
const INSTALL_TRACKED_KEY = "couponsur_onboarding_install_tracked";

const FEATURES: { icon: React.FC<{ size?: number }>; title: string; desc: string }[] = [
  {
    icon: PiChartLineUpBold,
    title: "Pronostics vérifiés",
    desc: "Des pronostics structurés par une équipe d'analystes, sur plusieurs championnats (Europe, Afrique, compétitions internationales).",
  },
  {
    icon: PiRobotFill,
    title: "Pronostic IA",
    desc: "Générez votre propre combiné : choisissez les marchés et la cote visée, l'IA sélectionne les matchs.",
  },
  {
    icon: PiMegaphoneFill,
    title: "Actus & sondages",
    desc: "Un fil d'actualités avec des sondages équipe contre équipe — commentez, votez, partagez.",
  },
  {
    icon: PiChatCircleDotsFill,
    title: "Chat en direct",
    desc: "Échangez en direct avec la communauté et l'équipe Coupon Sûr, dans le groupe premium ou le chat global.",
  },
  {
    icon: PiClockCounterClockwiseFill,
    title: "Historique",
    desc: "Retrouvez à tout moment tous les pronostics que vous avez débloqués.",
  },
  {
    icon: PiBellFill,
    title: "Notifications",
    desc: "Une alerte dès qu'un nouveau pronostic ou une actu importante est publiée — sans avoir à revenir vérifier.",
  },
];

type Platform = "ios" | "android" | "desktop";

export default function OnboardingClient() {
  const { installed, canInstall, promptInstall } = usePWAInstall();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [iosConfirmed, setIosConfirmed] = useState(false);
  const [installOutcome, setInstallOutcome] = useState<"accepted" | "dismissed" | null>(null);

  const viewTrackedRef = useRef(false);
  const leadTrackedRef = useRef(false);
  const completeTrackedRef = useRef(false);

  // Resolved client-side only (navigator.userAgent) — avoids an SSR/client
  // markup mismatch on first paint.
  useEffect(() => {
    if (isIOS()) setPlatform("ios");
    else if (/Android/i.test(navigator.userAgent)) setPlatform("android");
    else setPlatform("desktop");
  }, []);

  // ViewContent — fired once, this is what makes the page itself usable
  // as an ad destination (retargeting audiences, view-through reporting).
  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackEvent("ViewContent", generateEventId("onboarding-view"), { content_name: "Onboarding" });
  }, []);

  // The actual campaign goal: someone installed the app from this page.
  // Reported both client-side (fbq) and server-side (Conversions API, more
  // reliable against ad blockers — see app/api/onboarding/track) under the
  // same eventId so Meta counts it once, not twice.
  const reportInstallComplete = () => {
    if (completeTrackedRef.current) return;
    try {
      if (localStorage.getItem(INSTALL_TRACKED_KEY)) return;
    } catch { /* private browsing — fall through and report anyway */ }
    completeTrackedRef.current = true;

    const eventId = generateEventId("onboarding-install");
    trackEvent("CompleteRegistration", eventId, { content_name: "Onboarding - App Installed" });
    const { fbc, fbp } = getFbCookies();
    fetch("/api/onboarding/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, fbc, fbp, sourceUrl: window.location.href }),
    }).catch(() => { /* fire-and-forget */ });

    try { localStorage.setItem(INSTALL_TRACKED_KEY, "1"); } catch { /* ignore */ }
  };

  // `appinstalled` only ever fires for a genuine install completing during
  // THIS session — unlike usePWAInstall's `installed` flag, it can't be
  // true just because the visitor already had the app installed before
  // landing here, which would otherwise inflate the conversion count.
  useEffect(() => {
    window.addEventListener("appinstalled", reportInstallComplete);
    return () => window.removeEventListener("appinstalled", reportInstallComplete);
  }, []);

  const trackLeadOnce = () => {
    if (leadTrackedRef.current) return;
    leadTrackedRef.current = true;
    trackEvent("Lead", generateEventId("onboarding-lead"), { content_name: "Onboarding - Get Started" });
  };

  const scrollToInstall = () => {
    trackLeadOnce();
    document.getElementById("install")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleInstallClick = async () => {
    trackLeadOnce();
    const outcome = await promptInstall();
    if (outcome === "accepted" || outcome === "dismissed") setInstallOutcome(outcome);
  };

  const handleIosConfirm = () => {
    setIosConfirmed(true);
    reportInstallComplete();
  };

  return (
    <main style={mainStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { background: ${C.dark}; }
      `}</style>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <section style={heroStyle}>
        <Image src="/icons/icon-192.png" alt="Coupon Sûr" width={72} height={72} priority style={logoStyle} />
        <div style={brandStyle}>COUPON SÛR</div>
        <h1 style={headlineStyle}>Vos pronostics sportifs, sûrs et vérifiés.</h1>
        <p style={subheadStyle}>
          Une équipe d&apos;analystes sportifs, des cotes réelles et un Pronostic IA — installez
          l&apos;application sur votre téléphone en moins d&apos;une minute, sans app store.
        </p>
        <button onClick={scrollToInstall} style={primaryBtnStyle}>
          <PiDownloadSimpleBold size={18} /> Installer l&apos;application
        </button>
        <div style={microStyle}>Gratuit · Aucun app store · 30 secondes</div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={sectionEyebrowStyle}>Ce que vous trouverez dans l&apos;app</div>
        <h2 style={sectionTitleStyle}>Tout Coupon Sûr, dans votre poche</h2>
        <div style={featureGridStyle}>
          {FEATURES.map((f) => (
            <div key={f.title} style={featureCardStyle}>
              <div style={featureIconWrapStyle}><f.icon size={20} /></div>
              <div style={featureTitleStyle}>{f.title}</div>
              <div style={featureDescStyle}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Install ─────────────────────────────────────────────────── */}
      <section id="install" style={{ ...sectionStyle, scrollMarginTop: 20 }}>
        <div style={sectionEyebrowStyle}>Installation</div>
        <h2 style={sectionTitleStyle}>Installez l&apos;application en quelques secondes</h2>
        <p style={installIntroStyle}>
          Coupon Sûr est une application web — pas besoin de Play Store ni d&apos;App Store. Une fois
          installée, elle s&apos;ouvre comme une vraie application, avec ses notifications.
        </p>

        {installed ? (
          <SuccessCard />
        ) : platform === null ? (
          <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Chargement…</div>
        ) : platform === "ios" ? (
          <IosSteps confirmed={iosConfirmed} onConfirm={handleIosConfirm} />
        ) : canInstall ? (
          <NativeInstall onInstall={handleInstallClick} dismissed={installOutcome === "dismissed"} />
        ) : (
          <ManualFallback />
        )}
      </section>

      {/* ─── Final CTA ───────────────────────────────────────────────── */}
      <section style={{ ...sectionStyle, textAlign: "center", paddingBottom: 60 }}>
        <h2 style={sectionTitleStyle}>Prêt à commencer ?</h2>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          Installez l&apos;application ci-dessus, ou continuez directement sur le site.
        </p>
        <Link href="/" style={secondaryLinkStyle}>
          Continuer sans installer <PiArrowRightBold size={13} />
        </Link>
      </section>
    </main>
  );
}

// ─── Install sub-views ──────────────────────────────────────────────────────

function SuccessCard() {
  return (
    <div style={installCardStyle}>
      <PiCheckCircleFill size={40} color={C.gold} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: C.text, margin: "10px 0 6px" }}>
        Application installée
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 18 }}>
        Coupon Sûr est prête. Ouvrez-la depuis l&apos;icône sur votre écran d&apos;accueil.
      </div>
      <Link href="/" style={primaryBtnStyle}>
        Ouvrir l&apos;application <PiCaretRightBold size={14} />
      </Link>
    </div>
  );
}

function NativeInstall({ onInstall, dismissed }: { onInstall: () => void; dismissed: boolean }) {
  return (
    <div style={installCardStyle}>
      <PiDownloadSimpleBold size={36} color={C.gold} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: C.text, margin: "10px 0 6px" }}>
        Un seul bouton
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
        Votre navigateur peut installer Coupon Sûr directement — appuyez ci-dessous et confirmez.
      </div>
      <button onClick={onInstall} style={primaryBtnStyle}>
        <PiDownloadSimpleBold size={18} /> Installer maintenant
      </button>
      {dismissed && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 12 }}>
          Installation annulée — vous pouvez réessayer à tout moment.
        </div>
      )}
    </div>
  );
}

function IosSteps({ confirmed, onConfirm }: { confirmed: boolean; onConfirm: () => void }) {
  const steps = [
    { icon: PiShareFatBold, text: <>Appuyez sur <strong style={{ color: C.text }}>Partager</strong> dans la barre de Safari (en bas ou en haut de l&apos;écran).</> },
    { icon: PiSquaresFourFill, text: <>Faites défiler et choisissez <strong style={{ color: C.text }}>Sur l&apos;écran d&apos;accueil</strong>.</> },
    { icon: PiPlusSquareFill, text: <>Appuyez sur <strong style={{ color: C.text }}>Ajouter</strong> en haut à droite — c&apos;est fait.</> },
  ];

  return (
    <div style={installCardStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", marginBottom: 20 }}>
        {steps.map((s, i) => (
          <div key={i} style={iosStepRowStyle}>
            <div style={iosStepNumStyle}>{i + 1}</div>
            <s.icon size={17} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, textAlign: "left" }}>{s.text}</div>
          </div>
        ))}
      </div>

      {confirmed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gold, fontSize: 13, fontWeight: 700 }}>
          <PiCheckCircleFill size={18} /> Merci ! Ouvrez l&apos;icône Coupon Sûr sur votre écran d&apos;accueil.
        </div>
      ) : (
        <button onClick={onConfirm} style={primaryBtnStyle}>
          <PiCheckCircleFill size={18} /> J&apos;ai terminé l&apos;installation
        </button>
      )}
    </div>
  );
}

function ManualFallback() {
  return (
    <div style={installCardStyle}>
      <PiSquaresFourFill size={36} color={C.gold} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: C.text, margin: "10px 0 6px" }}>
        Depuis le menu de votre navigateur
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
        Ouvrez le menu de votre navigateur (⋮ ou ···) et choisissez <strong style={{ color: C.text }}>Installer l&apos;application</strong> ou{" "}
        <strong style={{ color: C.text }}>Ajouter à l&apos;écran d&apos;accueil</strong>.
      </div>
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: C.dark,
  color: C.text,
  fontFamily: "'DM Sans', sans-serif",
};

const heroStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  padding: "56px 20px 44px",
  background: "radial-gradient(120% 100% at 50% 0%, rgba(201,168,76,0.12), transparent 60%)",
};

const logoStyle: React.CSSProperties = { borderRadius: 18, marginBottom: 16, boxShadow: "0 10px 30px rgba(201,168,76,0.25)" };

const brandStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: "4px", color: C.gold, marginBottom: 14,
};

const headlineStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px, 7vw, 40px)", letterSpacing: 0.5,
  color: C.text, lineHeight: 1.15, maxWidth: 480, marginBottom: 14,
};

const subheadStyle: React.CSSProperties = {
  fontSize: 14, color: C.muted, lineHeight: 1.6, maxWidth: 420, marginBottom: 26,
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`, color: C.dark,
  border: "none", borderRadius: 12, padding: "14px 26px", fontSize: 14.5, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", textDecoration: "none",
  boxShadow: "0 10px 26px rgba(201,168,76,0.3)",
};

const microStyle: React.CSSProperties = { fontSize: 11, color: C.muted, marginTop: 12, letterSpacing: "0.3px" };

const sectionStyle: React.CSSProperties = { padding: "40px 20px", maxWidth: 680, margin: "0 auto" };

const sectionEyebrowStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: "2.5px", color: C.gold, textTransform: "uppercase", fontWeight: 700,
  textAlign: "center", marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, color: C.text,
  textAlign: "center", marginBottom: 28,
};

const featureGridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14,
};

const featureCardStyle: React.CSSProperties = {
  background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 18px",
};

const featureIconWrapStyle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, background: "rgba(201,168,76,0.1)",
  display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, marginBottom: 12,
};

const featureTitleStyle: React.CSSProperties = { fontSize: 14.5, fontWeight: 700, color: C.text, marginBottom: 6 };

const featureDescStyle: React.CSSProperties = { fontSize: 12.5, color: C.muted, lineHeight: 1.55 };

const installIntroStyle: React.CSSProperties = {
  fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 1.6, marginBottom: 28, maxWidth: 460, marginLeft: "auto", marginRight: "auto",
};

const installCardStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 18, padding: "30px 24px",
  maxWidth: 420, margin: "0 auto",
};

const iosStepRowStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10 };

const iosStepNumStyle: React.CSSProperties = {
  width: 20, height: 20, borderRadius: "50%", background: "rgba(201,168,76,0.15)", color: C.gold,
  fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 12.5,
  textDecoration: "none", borderBottom: `1px solid ${C.border}`, paddingBottom: 2,
};
