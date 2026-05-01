"use client";

import { useState } from "react";

interface ImageCarouselModalProps {
  images: Array<{ data: string; contentType: string }>;
  title: string;
  onClose: () => void;
}

const C = {
  dark: "#0A0C0F",
  dark3: "#1A1F26",
  dark4: "#222830",
  border: "#2A3140",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
};

export default function ImageCarouselModal({
  images,
  title,
  onClose,
}: ImageCarouselModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentImage = images[currentIndex];
  const dataUrl = `data:${currentImage.contentType};base64,${currentImage.data}`;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.95)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 20,
      }}
      onClick={onClose}
    >
      {/* Modal Content */}
      <div
        style={{
          background: C.dark3,
          borderRadius: 12,
          overflow: "hidden",
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${C.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: C.text,
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontSize: 24,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Image */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: C.dark,
            overflow: "auto",
          }}
        >
          <img
            src={dataUrl}
            alt={`${title} - Image ${currentIndex + 1}`}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        </div>

        {/* Footer with Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderTop: `1px solid ${C.border}`,
            gap: 12,
          }}
        >
          {/* Prev Button */}
          <button
            onClick={handlePrev}
            disabled={images.length <= 1}
            style={{
              background: images.length <= 1 ? C.border : C.gold,
              color: images.length <= 1 ? C.muted : C.dark,
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: images.length <= 1 ? "not-allowed" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            ← Précédent
          </button>

          {/* Counter */}
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              minWidth: 60,
              textAlign: "center",
            }}
          >
            {currentIndex + 1} / {images.length}
          </div>

          {/* Next Button */}
          <button
            onClick={handleNext}
            disabled={images.length <= 1}
            style={{
              background: images.length <= 1 ? C.border : C.gold,
              color: images.length <= 1 ? C.muted : C.dark,
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: images.length <= 1 ? "not-allowed" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Suivant →
          </button>
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: 12,
              borderTop: `1px solid ${C.border}`,
              overflowX: "auto",
              background: C.dark4,
            }}
          >
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                style={{
                  minWidth: 60,
                  height: 60,
                  borderRadius: 6,
                  border: i === currentIndex ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                  padding: 0,
                  cursor: "pointer",
                  background: "transparent",
                  overflow: "hidden",
                }}
              >
                <img
                  src={`data:${img.contentType};base64,${img.data}`}
                  alt={`Thumbnail ${i + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
