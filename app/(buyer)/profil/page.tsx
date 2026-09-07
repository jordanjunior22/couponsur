"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PiUserCircleFill, PiDeviceMobileFill, PiStarFill,
  PiWrenchFill, PiKeyFill, PiSignOutBold,
} from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { SubscribePayment } from "@/components/PremiumPicksPage";
import { validateCameroonPhone, formatCameroonPhone } from "@/utils/cameroonPhone";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// Replaces the old Navbar avatar dropdown (UserMenu): login/signup when
// signed out, account + subscription + password/logout when signed in.
// Also carries the site's legal/support links, which used to live in the
// page-bottom Footer — dropped from the buyer screens now that the bottom
// tab bar is the primary chrome, so they need a home a visitor can still
// reach from the app.
export default function ProfilPage() {
  const { user, loading: authLoading } = useAuth();

  return (
    <main style={{ minHeight: "100vh", background: "#0A0C0F", padding: "20px 16px", paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={titleStyle}><PiUserCircleFill size={18} /> Profil</div>

        {authLoading ? null : user ? <AccountPanel /> : <AuthPanel />}

        <LegalLinks />
      </div>
    </main>
  );
}

// ─── SIGNED-OUT: LOGIN / SIGNUP ─────────────────────────────────────────────
function AuthPanel() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setPhone("");
    setPassword("");
    setConfirm("");
    setFeedback(null);
    setShowPw(false);
    setShowConfirm(false);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D/g, "").slice(0, 9));
    setFeedback(null);
  };

  const handleSignup = async () => {
    const phoneCheck = validateCameroonPhone(phone);
    if (!phoneCheck.valid) return setFeedback({ text: phoneCheck.message, ok: false });
    if (!password) return setFeedback({ text: "Entrez un mot de passe", ok: false });
    if (password.length < 6) return setFeedback({ text: "Le mot de passe doit contenir au moins 6 caractères", ok: false });
    if (password !== confirm) return setFeedback({ text: "Les mots de passe ne correspondent pas", ok: false });

    try {
      setLoading(true);
      setFeedback(null);
      await signup(phone, password);
      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", "Lead", { content_name: "Inscription Premium Picks", currency: "XAF" });
      }
      setFeedback({ text: "Compte créé avec succès !", ok: true });
    } catch (error: any) {
      setFeedback({ text: error.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const phoneCheck = validateCameroonPhone(phone);
    if (!phoneCheck.valid) return setFeedback({ text: phoneCheck.message, ok: false });
    if (!password) return setFeedback({ text: "Entrez votre mot de passe", ok: false });

    try {
      setLoading(true);
      setFeedback(null);
      await login(phone, password);
      setFeedback({ text: "Connexion réussie !", ok: true });
    } catch (error: any) {
      setFeedback({ text: error.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={tabWrapStyle}>
        <button onClick={() => switchMode("login")} style={mode === "login" ? activeTabStyle : inactiveTabStyle}>Se connecter</button>
        <button onClick={() => switchMode("signup")} style={mode === "signup" ? activeTabStyle : inactiveTabStyle}>S&apos;inscrire</button>
      </div>

      <div style={headingStyle}>{mode === "login" ? "Bon retour 👋" : "Créer un compte"}</div>
      <div style={subheadingStyle}>
        {mode === "login" ? "Connectez-vous pour accéder à votre historique" : "Rejoignez-nous pour sauvegarder votre activité"}
      </div>

      <label style={labelStyle}>Numéro de téléphone</label>
      <div style={inputWrapStyle}>
        <span style={prefixStyle}>+237</span>
        <input type="tel" inputMode="numeric" placeholder="6XX XXX XXX" value={formatCameroonPhone(phone)} onChange={handlePhoneChange} maxLength={11} style={phoneInputStyle} />
      </div>

      <label style={{ ...labelStyle, marginTop: 12 }}>Mot de passe</label>
      <div style={inputWrapStyle}>
        <input
          type={showPw ? "text" : "password"}
          placeholder={mode === "login" ? "Votre mot de passe" : "Min. 6 caractères"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFeedback(null); }}
          style={{ ...fieldStyle, paddingRight: 40 }}
        />
        <button onClick={() => setShowPw(!showPw)} style={eyeBtnStyle}>{showPw ? "🙈" : "👁"}</button>
      </div>

      {mode === "signup" && (
        <>
          <label style={{ ...labelStyle, marginTop: 12 }}>Confirmer le mot de passe</label>
          <div style={inputWrapStyle}>
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="Répétez le mot de passe"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFeedback(null); }}
              style={{ ...fieldStyle, paddingRight: 40 }}
            />
            <button onClick={() => setShowConfirm(!showConfirm)} style={eyeBtnStyle}>{showConfirm ? "🙈" : "👁"}</button>
          </div>
        </>
      )}

      {feedback && (
        <div style={{ ...feedbackStyle, background: feedback.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: feedback.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)", color: feedback.ok ? "#4ade80" : "#f87171" }}>
          {feedback.ok ? "✅" : "⚠️"} {feedback.text}
        </div>
      )}

      <button
        disabled={loading}
        onClick={mode === "login" ? handleLogin : handleSignup}
        style={{ ...submitBtnStyle, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
      </button>

      <div style={switchTextStyle}>
        {mode === "login" ? "Pas de compte ? " : "Déjà un compte ? "}
        <span onClick={() => switchMode(mode === "login" ? "signup" : "login")} style={switchLinkStyle}>
          {mode === "login" ? "S'inscrire" : "Se connecter"}
        </span>
      </div>
    </div>
  );
}

// ─── SIGNED-IN: ACCOUNT ─────────────────────────────────────────────────────
function AccountPanel() {
  const { user, logout, hasActiveSubscription, changePassword, refreshUser } = useAuth();
  const isSubscribed = !!user && hasActiveSubscription();
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <div style={cardStyle}>
        <div style={phoneDisplayStyle}>
          <PiDeviceMobileFill size={15} />
          +237 {formatCameroonPhone(user.phone)}
        </div>

        {isSubscribed ? (
          <div style={premiumStatusStyle}>
            <PiStarFill size={12} /> Abonné Premium
            {user.subscription?.expiresAt && ` — jusqu'au ${new Date(user.subscription.expiresAt).toLocaleDateString("fr-FR")}`}
          </div>
        ) : user.subscription?.status === "EXPIRED" ? (
          <div style={{ ...premiumStatusStyle, color: "#EF4444", background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }}>
            Abonnement expiré
          </div>
        ) : null}

        <div style={dividerStyle} />

        {user.role === "ADMIN" && (
          <Link href="/dashboard" style={menuItemStyle}>
            <span style={menuIconStyle}><PiWrenchFill size={15} /></span> Dashboard
          </Link>
        )}

        <button style={menuItemStyle} onClick={() => setShowSubscribe(true)}>
          <span style={menuIconStyle}><PiStarFill size={15} /></span> Gérer mon abonnement
        </button>

        <button style={menuItemStyle} onClick={() => setChangePwOpen(true)}>
          <span style={menuIconStyle}><PiKeyFill size={15} /></span> Changer le mot de passe
        </button>

        <button style={{ ...menuItemStyle, color: "#EF4444" }} onClick={() => logout()}>
          <span style={menuIconStyle}><PiSignOutBold size={15} /></span> Déconnexion
        </button>
      </div>

      {showSubscribe && (
        <div onClick={(e) => e.target === e.currentTarget && setShowSubscribe(false)} style={sheetOverlayStyle}>
          <div style={sheetStyle}>
            <div style={sheetHandleStyle} />
            <button onClick={() => setShowSubscribe(false)} style={sheetCloseStyle}>✕</button>
            <SubscribePayment onSuccess={async () => { await refreshUser(); setShowSubscribe(false); }} onBack={() => setShowSubscribe(false)} />
          </div>
        </div>
      )}

      {changePwOpen && (
        <ChangePasswordSheet
          onClose={() => setChangePwOpen(false)}
          changePassword={changePassword}
        />
      )}
    </>
  );
}

function ChangePasswordSheet({ onClose, changePassword }: { onClose: () => void; changePassword: (c: string, n: string) => Promise<void> }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmNewPw, setConfirmNewPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSubmit = async () => {
    if (!currentPw) return setFeedback({ text: "Entrez votre mot de passe actuel", ok: false });
    if (newPw.length < 6) return setFeedback({ text: "Le nouveau mot de passe doit contenir au moins 6 caractères", ok: false });
    if (newPw !== confirmNewPw) return setFeedback({ text: "Les nouveaux mots de passe ne correspondent pas", ok: false });

    try {
      setLoading(true);
      setFeedback(null);
      await changePassword(currentPw, newPw);
      setFeedback({ text: "Mot de passe changé avec succès !", ok: true });
      setTimeout(onClose, 1200);
    } catch (error: any) {
      setFeedback({ text: error.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()} style={sheetOverlayStyle}>
      <div style={sheetStyle}>
        <div style={sheetHandleStyle} />
        <button onClick={onClose} style={sheetCloseStyle}>✕</button>

        <div style={{ ...headingStyle, display: "flex", alignItems: "center", gap: 8 }}>Changer le mot de passe <PiKeyFill size={16} /></div>
        <div style={subheadingStyle}>Utilisez le mot de passe temporaire fourni par le support, puis choisissez-en un nouveau.</div>

        <label style={labelStyle}>Mot de passe actuel</label>
        <div style={inputWrapStyle}>
          <input type={showCurrentPw ? "text" : "password"} placeholder="Mot de passe fourni par le support" value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); setFeedback(null); }} style={{ ...fieldStyle, paddingRight: 40 }} />
          <button onClick={() => setShowCurrentPw(!showCurrentPw)} style={eyeBtnStyle}>{showCurrentPw ? "🙈" : "👁"}</button>
        </div>

        <label style={{ ...labelStyle, marginTop: 12 }}>Nouveau mot de passe</label>
        <div style={inputWrapStyle}>
          <input type={showNewPw ? "text" : "password"} placeholder="Min. 6 caractères" value={newPw} onChange={(e) => { setNewPw(e.target.value); setFeedback(null); }} style={{ ...fieldStyle, paddingRight: 40 }} />
          <button onClick={() => setShowNewPw(!showNewPw)} style={eyeBtnStyle}>{showNewPw ? "🙈" : "👁"}</button>
        </div>

        <label style={{ ...labelStyle, marginTop: 12 }}>Confirmer le nouveau mot de passe</label>
        <div style={inputWrapStyle}>
          <input type={showConfirmNewPw ? "text" : "password"} placeholder="Répétez le nouveau mot de passe" value={confirmNewPw} onChange={(e) => { setConfirmNewPw(e.target.value); setFeedback(null); }} style={{ ...fieldStyle, paddingRight: 40 }} />
          <button onClick={() => setShowConfirmNewPw(!showConfirmNewPw)} style={eyeBtnStyle}>{showConfirmNewPw ? "🙈" : "👁"}</button>
        </div>

        {feedback && (
          <div style={{ ...feedbackStyle, background: feedback.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: feedback.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)", color: feedback.ok ? "#4ade80" : "#f87171" }}>
            {feedback.ok ? "✅" : "⚠️"} {feedback.text}
          </div>
        )}

        <button disabled={loading} onClick={handleSubmit} style={{ ...submitBtnStyle, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Chargement..." : "Changer le mot de passe"}
        </button>
      </div>
    </div>
  );
}

// ─── LEGAL / SUPPORT (moved out of the old page-bottom Footer) ─────────────
function LegalLinks() {
  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <div style={legalHeadStyle}>Légal & support</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Link href="/about" style={legalLinkStyle}>Qui sommes-nous</Link>
        <Link href="/contact" style={legalLinkStyle}>Nous contacter</Link>
        <Link href="/privacy-policy" style={legalLinkStyle}>Politique de confidentialité</Link>
        <Link href="/terms" style={legalLinkStyle}>Conditions d&apos;utilisation</Link>
        <Link href="/disclaimer" style={legalLinkStyle}>Avertissement</Link>
      </div>
      <div style={{ fontSize: 10, color: "#2A3140", marginTop: 16 }}>
        © {new Date().getFullYear()} Expert Picks. Tous droits réservés.
      </div>
    </div>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const titleStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "#C9A84C", marginBottom: 18 };

const cardStyle: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #1F2937",
  borderRadius: 16,
  padding: "22px 20px",
};

const phoneDisplayStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#E5E7EB", fontWeight: 600, marginBottom: 10 };

const premiumStatusStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
  color: "#C9A84C", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
  borderRadius: 8, padding: "8px 12px", marginBottom: 6,
};

const dividerStyle: React.CSSProperties = { height: 1, background: "#1F2937", margin: "14px 0 8px" };

const menuItemStyle: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "11px 10px",
  borderRadius: 8, background: "transparent", border: "none", color: "#E5E7EB", fontSize: 13.5,
  cursor: "pointer", textDecoration: "none", fontFamily: "inherit",
};

const menuIconStyle: React.CSSProperties = { display: "flex", width: 18, flexShrink: 0 };

const tabWrapStyle: React.CSSProperties = { display: "flex", gap: 0, marginBottom: 22, background: "#0A0C0F", borderRadius: 10, padding: 3 };

const activeTabStyle: React.CSSProperties = { flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#C9A84C", color: "#0A0C0F", fontFamily: "inherit" };

const inactiveTabStyle: React.CSSProperties = { flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", background: "transparent", color: "#6B7280", fontFamily: "inherit" };

const headingStyle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#F9FAFB", marginBottom: 4 };

const subheadingStyle: React.CSSProperties = { fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 1.5 };

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 };

const inputWrapStyle: React.CSSProperties = { position: "relative", display: "flex", alignItems: "center" };

const prefixStyle: React.CSSProperties = { position: "absolute", left: 12, fontSize: 13, fontWeight: 600, color: "#C9A84C", pointerEvents: "none", userSelect: "none" };

const phoneInputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 52px", borderRadius: 9, border: "1px solid #1F2937", background: "#0D1117", color: "#E5E7EB", fontSize: 14, outline: "none", letterSpacing: "0.05em" };

const fieldStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #1F2937", background: "#0D1117", color: "#E5E7EB", fontSize: 14, outline: "none" };

const eyeBtnStyle: React.CSSProperties = { position: "absolute", right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.5, padding: 4 };

const feedbackStyle: React.CSSProperties = { fontSize: 12, padding: "9px 12px", borderRadius: 8, border: "1px solid", marginTop: 12, lineHeight: 1.5 };

const submitBtnStyle: React.CSSProperties = { width: "100%", marginTop: 16, padding: "11px 0", borderRadius: 9, background: "#C9A84C", color: "#0A0C0F", fontWeight: 700, fontSize: 14, border: "none", letterSpacing: "0.02em", fontFamily: "inherit" };

const switchTextStyle: React.CSSProperties = { marginTop: 14, fontSize: 12, color: "#4B5563", textAlign: "center" };

const switchLinkStyle: React.CSSProperties = { color: "#C9A84C", cursor: "pointer", fontWeight: 600 };

const legalHeadStyle: React.CSSProperties = { fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#C9A84C", fontWeight: 700, marginBottom: 12 };

const legalLinkStyle: React.CSSProperties = { fontSize: 13, color: "#9CA3AF", textDecoration: "none", padding: "7px 0" };

const sheetOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1200, backdropFilter: "blur(4px)" };

const sheetStyle: React.CSSProperties = { background: "#111418", border: "1px solid #2A3140", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, padding: "24px 20px 40px", position: "relative", maxHeight: "90vh", overflowY: "auto", animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" };

const sheetHandleStyle: React.CSSProperties = { width: 40, height: 4, background: "#3A4455", borderRadius: 2, margin: "0 auto 20px" };

const sheetCloseStyle: React.CSSProperties = { position: "absolute", top: 16, right: 16, width: 30, height: 30, background: "#222830", border: "1px solid #2A3140", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A8399", fontSize: 14 };
