"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const validateCameroonPhone = (raw: string): { valid: boolean; message: string } => {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  let local = cleaned;
  if (cleaned.startsWith("+237")) local = cleaned.slice(4);
  else if (cleaned.startsWith("237")) local = cleaned.slice(3);

  if (!local) return { valid: false, message: "Entrez votre numéro de téléphone" };
  if (!/^\d+$/.test(local)) return { valid: false, message: "Le numéro ne doit contenir que des chiffres" };
  if (local.length !== 9) return { valid: false, message: "Le numéro camerounais doit avoir 9 chiffres" };
  if (!local.startsWith("6")) return { valid: false, message: "Les numéros mobiles camerounais commencent par 6" };

  const prefix = local.slice(0, 2);
  const validPrefixes = ["65", "67", "68", "69", "66", "62", "63", "64", "61", "60"];
  if (!validPrefixes.includes(prefix)) {
    return { valid: false, message: `Préfixe "${prefix}" non reconnu au Cameroun` };
  }
  return { valid: true, message: "" };
};

const formatCameroonPhone = (raw: string): string => {
  const cleaned = raw.replace(/\D/g, "");
  let local = cleaned;
  if (cleaned.startsWith("237") && cleaned.length > 9) local = cleaned.slice(3);
  if (local.length <= 3) return local;
  if (local.length <= 6) return `${local.slice(0, 3)} ${local.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`;
};

export function UserMenu({ onOpenHistory }: { onOpenHistory: () => void }) {
  const { user, login, signup, logout, loading: authLoading } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 9);
    setPhone(raw);
    setFeedback(null);
  };

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setPhone("");
    setPassword("");
    setConfirm("");
    setFeedback(null);
    setShowPw(false);
    setShowConfirm(false);
  };

  const handleSignup = async () => {
    const phoneCheck = validateCameroonPhone(phone);
    if (!phoneCheck.valid) { setFeedback({ text: phoneCheck.message, ok: false }); return; }
    if (!password) { setFeedback({ text: "Entrez un mot de passe", ok: false }); return; }
    if (password.length < 6) { setFeedback({ text: "Le mot de passe doit contenir au moins 6 caractères", ok: false }); return; }
    if (password !== confirm) { setFeedback({ text: "Les mots de passe ne correspondent pas", ok: false }); return; }

    try {
      setLoading(true);
      setFeedback(null);
      await signup(phone, password);
      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", "Lead", { content_name: "Inscription Premium Picks", currency: "XAF" });
      }
      setAuthOpen(false);
      resetForm();
    } catch (error: any) {
      setFeedback({ text: error.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const phoneCheck = validateCameroonPhone(phone);
    if (!phoneCheck.valid) { setFeedback({ text: phoneCheck.message, ok: false }); return; }
    if (!password) { setFeedback({ text: "Entrez votre mot de passe", ok: false }); return; }

    try {
      setLoading(true);
      setFeedback(null);
      await login(phone, password);
      setAuthOpen(false);
      resetForm();
    } catch (error: any) {
      setFeedback({ text: error.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setMenuOpen(false);
  };

  const resetForm = () => {
    setPhone("");
    setPassword("");
    setConfirm("");
    setFeedback(null);
  };

  // ── Skeleton placeholder — reserves space during auth hydration ──
  // Never returns null; always renders something so navbar width is stable.
  if (authLoading) {
    return (
      <div style={skeletonStyle} aria-hidden="true" />
    );
  }

  return (
    <>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {!user ? (
          <button onClick={() => setAuthOpen(true)} style={loginBtnStyle}>
            Se connecter
          </button>
        ) : (
          <>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={avatarStyle}
              aria-label="Menu utilisateur"
              aria-expanded={menuOpen}
            >
              {user.phone?.slice(-2) ?? "👤"}
            </button>

            {menuOpen && (
              <>
                <div style={backdropStyle} onClick={() => setMenuOpen(false)} />
                <div style={dropdownStyle} role="menu">
                  <div style={phoneDisplayStyle}>
                    <span style={{ fontSize: 14 }}>📱</span>
                    +237 {formatCameroonPhone(user.phone)}
                  </div>
                  <div style={dividerStyle} />

                  {user?.role === "ADMIN" && (
                    <button
                      style={menuItemStyle}
                      role="menuitem"
                      onClick={() => { window.location.href = "/dashboard"; setMenuOpen(false); }}
                    >
                      <span style={menuIconStyle}>🛠️</span>
                      Dashboard
                    </button>
                  )}

                  <button
                    style={menuItemStyle}
                    role="menuitem"
                    onClick={() => { onOpenHistory(); setMenuOpen(false); }}
                  >
                    <span style={menuIconStyle}>📋</span>
                    Historique
                  </button>

                  <button
                    style={{ ...menuItemStyle, color: "#EF4444" }}
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <span style={menuIconStyle}>🚪</span>
                    Déconnexion
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ─── AUTH MODAL ──────────────────────────────────────── */}
      {authOpen && (
        <div style={overlayStyle} onClick={() => { if (!loading) setAuthOpen(false); }}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">

            <button
              onClick={() => { if (!loading) { setAuthOpen(false); resetForm(); } }}
              style={closeBtnStyle}
              aria-label="Fermer"
              disabled={loading}
            >
              ✕
            </button>

            {/* Tab switcher */}
            <div style={tabWrapStyle} role="tablist">
              <button
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
                style={mode === "login" ? activeTabStyle : inactiveTabStyle}
              >
                Se connecter
              </button>
              <button
                role="tab"
                aria-selected={mode === "signup"}
                onClick={() => switchMode("signup")}
                style={mode === "signup" ? activeTabStyle : inactiveTabStyle}
              >
                S'inscrire
              </button>
            </div>

            <div style={headingStyle}>
              {mode === "login" ? "Bon retour 👋" : "Créer un compte"}
            </div>
            <div style={subheadingStyle}>
              {mode === "login"
                ? "Connectez-vous pour accéder à votre historique"
                : "Rejoignez-nous pour sauvegarder votre activité"}
            </div>

            {/* Phone */}
            <label style={labelStyle} htmlFor="auth-phone">Numéro de téléphone</label>
            <div style={inputWrapStyle}>
              <span style={prefixStyle}>+237</span>
              <input
                id="auth-phone"
                type="tel"
                inputMode="numeric"
                placeholder="6XX XXX XXX"
                value={formatCameroonPhone(phone)}
                onChange={handlePhoneChange}
                maxLength={11}
                style={phoneInputStyle}
                disabled={loading}
              />
            </div>

            {/* Password */}
            <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="auth-password">Mot de passe</label>
            <div style={inputWrapStyle}>
              <input
                id="auth-password"
                type={showPw ? "text" : "password"}
                placeholder={mode === "login" ? "Votre mot de passe" : "Min. 6 caractères"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFeedback(null); }}
                style={{ ...fieldStyle, paddingRight: 40 }}
                disabled={loading}
              />
              <button onClick={() => setShowPw(!showPw)} style={eyeBtnStyle} type="button" tabIndex={-1} aria-label={showPw ? "Masquer" : "Afficher"}>
                {showPw ? "🙈" : "👁"}
              </button>
            </div>

            {/* Confirm (signup only) */}
            {mode === "signup" && (
              <>
                <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="auth-confirm">Confirmer le mot de passe</label>
                <div style={inputWrapStyle}>
                  <input
                    id="auth-confirm"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Répétez le mot de passe"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setFeedback(null); }}
                    style={{ ...fieldStyle, paddingRight: 40 }}
                    disabled={loading}
                  />
                  <button onClick={() => setShowConfirm(!showConfirm)} style={eyeBtnStyle} type="button" tabIndex={-1} aria-label={showConfirm ? "Masquer" : "Afficher"}>
                    {showConfirm ? "🙈" : "👁"}
                  </button>
                </div>
              </>
            )}

            {/* Feedback */}
            {feedback && (
              <div style={{
                ...feedbackStyle,
                background: feedback.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                borderColor: feedback.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
                color: feedback.ok ? "#4ade80" : "#f87171",
              }} role="alert">
                {feedback.ok ? "✅" : "⚠️"} {feedback.text}
              </div>
            )}

            {/* Submit — shows spinner inline, doesn't shrink the button */}
            <button
              disabled={loading}
              onClick={mode === "login" ? handleLogin : handleSignup}
              style={{ ...submitBtnStyle, opacity: loading ? 0.75 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Spinner />
                  {mode === "login" ? "Connexion…" : "Création…"}
                </span>
              ) : (
                mode === "login" ? "Se connecter" : "Créer mon compte"
              )}
            </button>

            <div style={switchTextStyle}>
              {mode === "login" ? "Pas de compte ? " : "Déjà un compte ? "}
              <span
                onClick={() => !loading && switchMode(mode === "login" ? "signup" : "login")}
                style={{ ...switchLinkStyle, opacity: loading ? 0.5 : 1, pointerEvents: loading ? "none" : "auto" }}
              >
                {mode === "login" ? "S'inscrire" : "Se connecter"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Inline CSS spinner — no library needed ───────────────────────────────────
function Spinner() {
  return (
    <>
      <style>{`
        @keyframes _spin { to { transform: rotate(360deg); } }
        ._spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(10,12,15,0.3);
          border-top-color: #0A0C0F;
          border-radius: 50%;
          animation: _spin 0.6s linear infinite;
          flex-shrink: 0;
        }
      `}</style>
      <span className="_spinner" aria-hidden="true" />
    </>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const skeletonStyle: React.CSSProperties = {
  width: 80,
  height: 32,
  borderRadius: 8,
  background: "rgba(201,168,76,0.08)",
  border: "1px solid rgba(201,168,76,0.15)",
  flexShrink: 0,
};

const loginBtnStyle: React.CSSProperties = {
  background: "#C9A84C",
  color: "#0A0C0F",
  fontWeight: 700,
  fontSize: 12,
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
};

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "rgba(201,168,76,0.15)",
  border: "1.5px solid #C9A84C",
  color: "#C9A84C",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.5px",
  fontFamily: "inherit",
  transition: "background 0.15s",
  userSelect: "none",
  flexShrink: 0,
};

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 45,
  width: 230,
  background: "#111827",
  border: "1px solid #1F2937",
  borderRadius: 12,
  padding: "10px 8px",
  zIndex: 50,
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const phoneDisplayStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#E5E7EB",
  fontWeight: 600,
  padding: "6px 10px 10px",
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "#1F2937",
  margin: "0 0 8px",
};

const menuItemStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  textAlign: "left",
  padding: "9px 10px",
  borderRadius: 8,
  background: "transparent",
  border: "none",
  color: "#E5E7EB",
  fontSize: 13,
  cursor: "pointer",
};

const menuIconStyle: React.CSSProperties = {
  fontSize: 14,
  width: 18,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.8)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 999,
  padding: "0 16px",
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  background: "#111827",
  border: "1px solid #1F2937",
  borderRadius: 16,
  padding: "28px 24px 24px",
  position: "relative",
};

const closeBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  background: "transparent",
  border: "none",
  color: "#4B5563",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  padding: 4,
};

const tabWrapStyle: React.CSSProperties = {
  display: "flex",
  marginBottom: 22,
  background: "#0A0C0F",
  borderRadius: 10,
  padding: 3,
};

const activeTabStyle: React.CSSProperties = {
  flex: 1,
  padding: "7px 0",
  borderRadius: 8,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  background: "#C9A84C",
  color: "#0A0C0F",
  transition: "all 0.18s",
};

const inactiveTabStyle: React.CSSProperties = {
  flex: 1,
  padding: "7px 0",
  borderRadius: 8,
  border: "none",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "transparent",
  color: "#6B7280",
  transition: "all 0.18s",
};

const headingStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#F9FAFB",
  marginBottom: 4,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6B7280",
  marginBottom: 20,
  lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#9CA3AF",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const inputWrapStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const prefixStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  fontSize: 13,
  fontWeight: 600,
  color: "#C9A84C",
  pointerEvents: "none",
  userSelect: "none",
};

const phoneInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px 10px 52px",
  borderRadius: 9,
  border: "1px solid #1F2937",
  background: "#0D1117",
  color: "#E5E7EB",
  fontSize: 14,
  outline: "none",
  letterSpacing: "0.05em",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 9,
  border: "1px solid #1F2937",
  background: "#0D1117",
  color: "#E5E7EB",
  fontSize: 14,
  outline: "none",
};

const eyeBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 10,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  opacity: 0.5,
  padding: 4,
};

const feedbackStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid",
  marginTop: 12,
  lineHeight: 1.5,
};

const submitBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: "11px 0",
  borderRadius: 9,
  background: "#C9A84C",
  color: "#0A0C0F",
  fontWeight: 700,
  fontSize: 14,
  border: "none",
  letterSpacing: "0.02em",
  minHeight: 42,
};

const switchTextStyle: React.CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  color: "#4B5563",
  textAlign: "center",
};

const switchLinkStyle: React.CSSProperties = {
  color: "#C9A84C",
  cursor: "pointer",
  fontWeight: 600,
};