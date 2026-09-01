"use client";

// Reusable "…is typing" bubble — three dots bouncing in sequence inside a
// chat-bubble-shaped pill, styled like a received/sent message so it can
// drop straight into any message list. Colors are props (not a shared
// palette import) so it works unmodified in both ChatWidget.tsx and the
// admin dashboard, which each keep their own local `C` color object.
interface TypingIndicatorProps {
  /** Optional caption under the bubble, e.g. "L'agent est en train d'écrire…" */
  label?: string;
  /** Which side of the thread this renders on — mirrors a message bubble's alignment. */
  align?: "left" | "right";
  bubbleColor?: string;
  borderColor?: string;
  dotColor?: string;
  labelColor?: string;
}

export default function TypingIndicator({
  label,
  align = "left",
  bubbleColor = "#222830",
  borderColor = "#2A3140",
  dotColor = "#7A8399",
  labelColor,
}: TypingIndicatorProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      alignSelf: align === "right" ? "flex-end" : "flex-start",
      alignItems: align === "right" ? "flex-end" : "flex-start",
    }}>
      <style>{`
        @keyframes typingIndicatorBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        background: bubbleColor, border: `1px solid ${borderColor}`,
        borderRadius: 12,
        borderBottomLeftRadius: align === "left" ? 3 : 12,
        borderBottomRightRadius: align === "right" ? 3 : 12,
        padding: "10px 14px", width: "fit-content",
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6, height: 6, borderRadius: "50%", background: dotColor,
              animation: "typingIndicatorBounce 1.1s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
      {label && (
        <span style={{ fontSize: 10, color: labelColor || dotColor, padding: "0 2px" }}>{label}</span>
      )}
    </div>
  );
}
