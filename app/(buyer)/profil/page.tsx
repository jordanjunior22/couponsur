"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  PiUserCircleFill, PiDeviceMobileFill, PiStarFill,
  PiWrenchFill, PiKeyFill, PiSignOutBold,
  PiDownloadSimpleBold, PiCheckCircleFill, PiShareFatBold,
  PiTagFill, PiCameraFill, PiEyeBold, PiEyeSlashBold, PiBellBold,
} from "react-icons/pi";
import { compressImageToDataUri } from "@/utils/imageCompression";
import { useAuth } from "@/context/AuthContext";
import { SubscribePayment } from "@/components/PremiumPicksPage";
import { validateCameroonPhone, formatCameroonPhone } from "@/utils/cameroonPhone";
import { usePWAInstall, isIOS } from "@/hooks/usePWAInstall";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";
import PushNotificationToggle from "@/components/PushNotificationToggle";

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

        <PushNotificationToggle />
        <InstallAppCard />
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
  const [nicknameOpen, setNicknameOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <div style={cardStyle}>
        <AvatarPicker />

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

        {user.role === "ADMIN" && (
          <button style={menuItemStyle} onClick={() => setNicknameOpen(true)}>
            <span style={menuIconStyle}><PiTagFill size={15} /></span>
            Pseudo dans le chat{user.nickname ? ` — ${user.nickname}` : ""}
          </button>
        )}

        {user.role !== "ADMIN" && <GroupPrivacyRow />}
        <GroupNotificationsRow canPremium={isSubscribed || user.role === "ADMIN"} />

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

      {nicknameOpen && (
        <NicknameSheet onClose={() => setNicknameOpen(false)} />
      )}
    </>
  );
}

// ─── SIGNED-IN: PROFILE PICTURE (optional) ─────────────────────────────────
// Downscaled to a small JPEG in the browser before upload; the server
// re-validates it (app/api/auth/avatar).
function AvatarPicker() {
  const { user, updateAvatar } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choisissez une image");
    try {
      setBusy(true);
      setError(null);
      const dataUri = await compressImageToDataUri(file, { maxDimension: 256, maxBytes: 100_000 });
      await updateAvatar(dataUri);
    } catch (err: any) {
      setError(err.message || "Échec de l'envoi");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    try {
      setBusy(true);
      setError(null);
      await updateAvatar(null);
    } catch (err: any) {
      setError(err.message || "Échec de la suppression");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Changer la photo de profil"
        style={{ position: "relative", width: 84, height: 84, borderRadius: "50%", border: "2px solid #C9A84C", background: "#0D1117", padding: 0, cursor: busy ? "wait" : "pointer", overflow: "visible", opacity: busy ? 0.6 : 1 }}
      >
        {user?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="Photo de profil" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", display: "block" }} />
        ) : (
          <PiUserCircleFill size={76} color="#3A4455" style={{ display: "block", margin: "auto" }} />
        )}
        <span style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: "50%", background: "#C9A84C", color: "#0A0C0F", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PiCameraFill size={14} />
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      {user?.avatar && (
        <button onClick={handleRemove} disabled={busy} style={{ marginTop: 8, background: "none", border: "none", color: "#6B7280", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
          Supprimer la photo
        </button>
      )}
      {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>⚠️ {error}</div>}
    </div>
  );
}

// ─── SIGNED-IN: NEW-MESSAGE NOTIFICATIONS PER GROUP ───────────────────────
// Members of a group get a push when it has new messages (at most one every
// couple of minutes per group, and never while they're looking at it). These
// switches mute a group. The device-level permission is the separate
// "notifications" card further down this page.
function GroupNotificationsRow({ canPremium }: { canPremium: boolean }) {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState<"premium" | "global" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rooms: { id: "premium" | "global"; label: string }[] = [
    ...(canPremium ? [{ id: "premium" as const, label: "Groupe Premium" }] : []),
    { id: "global", label: "Chat Global" },
  ];

  const setMuted = async (room: "premium" | "global", muted: boolean) => {
    setBusy(room);
    setError(null);
    try {
      const res = await fetch("/api/auth/group-notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, muted }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      await refreshUser();
    } catch (e: any) {
      setError(e.message || "Impossible de modifier ce réglage");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ padding: "11px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={menuIconStyle}><PiBellBold size={15} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: "#E5E7EB" }}>Notifications des groupes</div>
          <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2, lineHeight: 1.45 }}>
            Soyez prévenu des nouveaux messages quand vous n&apos;êtes pas dans le groupe.
          </div>
        </div>
      </div>
      {rooms.map((r) => {
        const on = !user?.groupPushMuted?.[r.id];
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0 6px 28px" }}>
            <span style={{ fontSize: 12.5, color: "#9CA3AF" }}>{r.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`Notifications ${r.label}`}
              onClick={() => setMuted(r.id, on)}
              disabled={busy === r.id}
              style={{
                width: 44, height: 24, borderRadius: 12, position: "relative", flexShrink: 0, padding: 0,
                cursor: busy === r.id ? "not-allowed" : "pointer", opacity: busy === r.id ? 0.6 : 1,
                background: on ? "#C9A84C" : "#222830", border: `1px solid ${on ? "#C9A84C" : "#2A3140"}`,
                transition: "background 0.15s",
              }}
            >
              <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: on ? "#0A0C0F" : "#7A8399", transition: "left 0.15s" }} />
            </button>
          </div>
        );
      })}
      {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// ─── SIGNED-IN: SHOW / HIDE MY STATS IN THE GROUPS ─────────────────────────
// Other group members can open a profile card showing this account's finished
// coupons and results (never prices, payments or the phone number). On by
// default; this switch hides it - the profile then reads as private.
function GroupPrivacyRow() {
  const { user, updateGroupPrivacy } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = user?.groupProfileVisible !== false;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateGroupPrivacy(!visible);
    } catch (e: any) {
      setError(e.message || "Impossible de modifier ce réglage");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "11px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={menuIconStyle}>{visible ? <PiEyeBold size={15} /> : <PiEyeSlashBold size={15} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: "#E5E7EB" }}>Mes stats dans les groupes</div>
          <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2, lineHeight: 1.45 }}>
            {visible
              ? "Les membres voient vos coupons terminés et leurs résultats (jamais votre numéro ni vos paiements)."
              : "Votre profil est privé : les membres ne voient pas vos statistiques."}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          aria-label="Afficher mes stats dans les groupes"
          onClick={toggle}
          disabled={busy}
          style={{
            width: 44, height: 24, borderRadius: 12, position: "relative", flexShrink: 0, padding: 0,
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
            background: visible ? "#C9A84C" : "#222830", border: `1px solid ${visible ? "#C9A84C" : "#2A3140"}`,
            transition: "background 0.15s",
          }}
        >
          <span style={{ position: "absolute", top: 2, left: visible ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: visible ? "#0A0C0F" : "#7A8399", transition: "left 0.15s" }} />
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// ─── SIGNED-IN, ADMIN ONLY: GROUP CHAT NICKNAME ────────────────────────────
// Lets an admin pick the name their group chat messages show instead of the
// generic "Admin" — see GroupChatRoom's senderLabel, which falls back to
// "Admin" whenever this is left blank.
function NicknameSheet({ onClose }: { onClose: () => void }) {
  const { user, updateNickname } = useAuth();
  const [value, setValue] = useState(user?.nickname || "");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      await updateNickname(value.trim());
      setFeedback({ text: "Pseudo mis à jour !", ok: true });
      setTimeout(onClose, 900);
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

        <div style={{ ...headingStyle, display: "flex", alignItems: "center", gap: 8 }}>Pseudo dans le chat <PiTagFill size={16} /></div>
        <div style={subheadingStyle}>
          Affiché à la place de &quot;Admin&quot; sur vos messages dans les groupes de chat. Laissez vide pour revenir à &quot;Admin&quot;.
        </div>

        <label style={labelStyle}>Pseudo</label>
        <div style={inputWrapStyle}>
          <input
            type="text"
            placeholder="Ex : Admin Junior"
            value={value}
            maxLength={40}
            onChange={(e) => { setValue(e.target.value); setFeedback(null); }}
            style={fieldStyle}
          />
        </div>

        {feedback && (
          <div style={{ ...feedbackStyle, background: feedback.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: feedback.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)", color: feedback.ok ? "#4ade80" : "#f87171" }}>
            {feedback.ok ? "✅" : "⚠️"} {feedback.text}
          </div>
        )}

        <button disabled={loading} onClick={handleSubmit} style={{ ...submitBtnStyle, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Chargement..." : "Enregistrer"}
        </button>
      </div>
    </div>
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

// ─── INSTALL THE APP ────────────────────────────────────────────────────────
// Deliberate, findable version of the floating PWAInstallButton banner
// (which only appears once, uninvited, and can be dismissed for good) —
// shares its capture of the browser's `beforeinstallprompt` event via
// usePWAInstall so both are triggering the same native prompt, not two
// independent copies of that logic.
function InstallAppCard() {
  const { installed, canInstall, promptInstall } = usePWAInstall();
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") setStatus({ text: "Application installée avec succès !", ok: true });
    else if (outcome === "dismissed") setStatus({ text: "Installation annulée.", ok: false });
  };

  if (installed) {
    return (
      <div style={{ ...cardStyle, marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <PiCheckCircleFill size={20} color="#22C55E" />
        <span style={{ fontSize: 13, color: "#E5E7EB" }}>Application installée</span>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={legalHeadStyle}>Application</div>
        <button onClick={handleInstall} style={installBtnStyle}>
          <PiDownloadSimpleBold size={16} /> Installer l&apos;application
        </button>
        {status && (
          <div style={{ fontSize: 12, marginTop: 10, color: status.ok ? "#4ade80" : "#7A8399" }}>
            {status.ok ? "✅ " : ""}{status.text}
          </div>
        )}
      </div>
    );
  }

  // Safari/iOS never fires beforeinstallprompt — the only way onto the
  // home screen there is the manual Share-sheet route, so that's what
  // shows instead of a button that would never do anything.
  if (isIOS()) {
    return (
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={legalHeadStyle}>Application</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <PiShareFatBold size={16} color="#C9A84C" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.6 }}>
            Appuyez sur <strong style={{ color: "#E5E7EB" }}>Partager</strong> dans Safari, puis{" "}
            <strong style={{ color: "#E5E7EB" }}>Sur l&apos;écran d&apos;accueil</strong> pour installer l&apos;application.
          </div>
        </div>
      </div>
    );
  }

  return null;
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

const installBtnStyle: React.CSSProperties = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "11px 0", borderRadius: 9, background: "#C9A84C", color: "#0A0C0F",
  fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", fontFamily: "inherit",
};

const switchLinkStyle: React.CSSProperties = { color: "#C9A84C", cursor: "pointer", fontWeight: 600 };

const legalHeadStyle: React.CSSProperties = { fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#C9A84C", fontWeight: 700, marginBottom: 12 };

const legalLinkStyle: React.CSSProperties = { fontSize: 13, color: "#9CA3AF", textDecoration: "none", padding: "7px 0" };

const sheetOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1200, backdropFilter: "blur(4px)" };

const sheetStyle: React.CSSProperties = { background: "#111418", border: "1px solid #2A3140", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, padding: "24px 20px 40px", position: "relative", maxHeight: "90vh", overflowY: "auto", animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" };

const sheetHandleStyle: React.CSSProperties = { width: 40, height: 4, background: "#3A4455", borderRadius: 2, margin: "0 auto 20px" };

const sheetCloseStyle: React.CSSProperties = { position: "absolute", top: 16, right: 16, width: 30, height: 30, background: "#222830", border: "1px solid #2A3140", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A8399", fontSize: 14 };
