"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import InfoConfirmDialog from "@/components/InfoConfirmDialog";

const C = {
  dark: "#0A0C0F",
  dark2: "#111418",
  dark3: "#1A1F26",
  dark4: "#222830",
  border: "#2A3140",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
  goldDark: "#8A6A2A",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#3B82F6",
};

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [dialog, setDialog] = useState({ isOpen: false, type: "info" as "info" | "success" | "error", title: "", message: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.subject.trim() || !formData.message.trim()) {
      setDialog({
        isOpen: true,
        type: "error",
        title: "Champs vides",
        message: "Veuillez remplir tous les champs du formulaire.",
      });
      return;
    }

    setSending(true);
    try {
      // Simuler l'envoi d'email
      await new Promise(resolve => setTimeout(resolve, 1500));

      setDialog({
        isOpen: true,
        type: "success",
        title: "Message envoyé",
        message: "Merci pour votre message. Nous vous répondrons sous 24h.",
      });

      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setDialog({
        isOpen: true,
        type: "error",
        title: "Erreur",
        message: "Une erreur s'est produite lors de l'envoi du message.",
      });
    } finally {
      setSending(false);
    }
  };

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
              Support
            </div>
            <h1 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 40,
              color: C.text,
              letterSpacing: 1,
              margin: 0,
              marginBottom: 16,
            }}>
              Nous contacter
            </h1>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              Vous avez une question ? Nous sommes là pour vous aider. Envoyez-nous un message et nous vous répondrons sous 24h.
            </p>
          </div>

          {/* Content Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginBottom: 40 }}>
            {/* Contact Methods */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* WhatsApp */}
              <div style={{
                background: C.dark3,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 24,
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.gold, marginBottom: 8 }}>
                  WhatsApp
                </div>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 12, margin: 0 }}>
                  Contactez-nous directement sur WhatsApp
                </p>
                <a
                  href="https://wa.me/237XXXXXXXXX"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    color: C.gold,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  +237 XXX XXX XXX →
                </a>
              </div>

              {/* Email */}
              <div style={{
                background: C.dark3,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 24,
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.gold, marginBottom: 8 }}>
                  Email
                </div>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 12, margin: 0 }}>
                  Envoyez-nous un email
                </p>
                <a
                  href="mailto:support@couponsur.com"
                  style={{
                    display: "inline-block",
                    color: C.gold,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  support@couponsur.com →
                </a>
              </div>

              {/* Response Time */}
              <div style={{
                background: "rgba(201,168,76,0.08)",
                border: `1px solid ${C.gold}40`,
                borderRadius: 12,
                padding: 24,
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.gold, marginBottom: 8 }}>
                  ⏱️ Temps de réponse
                </div>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                  Nous répondons généralement sous 24 heures pendant les jours ouvrables.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div style={{
              background: C.dark3,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 24,
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 20, margin: 0 }}>
                Envoyez-nous un message
              </h2>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Name */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 12,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}>
                    Nom complet
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Votre nom"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: C.dark4,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = C.gold}
                    onBlur={(e) => e.target.style.borderColor = C.border}
                  />
                </div>

                {/* Email */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 12,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="votre@email.com"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: C.dark4,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = C.gold}
                    onBlur={(e) => e.target.style.borderColor = C.border}
                  />
                </div>

                {/* Subject */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 12,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}>
                    Sujet
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="Sujet de votre message"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: C.dark4,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = C.gold}
                    onBlur={(e) => e.target.style.borderColor = C.border}
                  />
                </div>

                {/* Message */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 12,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}>
                    Message
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Votre message..."
                    rows={5}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: C.dark4,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                      resize: "vertical",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = C.gold}
                    onBlur={(e) => e.target.style.borderColor = C.border}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    width: "100%",
                    padding: 14,
                    background: sending ? C.goldDark : C.gold,
                    color: C.dark,
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: sending ? "not-allowed" : "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    transition: "all 0.2s",
                  }}
                >
                  {sending ? "Envoi en cours..." : "Envoyer le message"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Dialog */}
      <InfoConfirmDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        buttons={[{ label: "D'accord", onClick: () => setDialog({ ...dialog, isOpen: false }), style: "primary" }]}
        onClose={() => setDialog({ ...dialog, isOpen: false })}
      />
    </div>
  );
}
