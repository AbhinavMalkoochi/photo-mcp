import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { openExternalLink, useOpenAiGlobal, useToolOutput } from "../openai.js";
import type { ImageResult } from "../types.js";

const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const tileButtonBase: CSSProperties = {
  position: "relative",
  width: "100%",
  border: "none",
  padding: 0,
  borderRadius: "16px",
  overflow: "hidden",
  backgroundColor: "var(--openai-color-surface, #f4f6fb)",
  cursor: "pointer",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

const overlayIconStyle: CSSProperties = {
  position: "absolute",
  top: "8px",
  right: "8px",
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(17, 24, 39, 0.18)",
  backdropFilter: "blur(8px)",
  color: "white",
  fontSize: "16px",
  lineHeight: 1,
  transform: "translateY(-4px)",
  opacity: 0,
  transition: "opacity 0.2s ease, transform 0.2s ease",
  pointerEvents: "none",
};

const skeletonStyle: CSSProperties = {
  borderRadius: "16px",
  width: "100%",
  height: "100%",
  background:
    "linear-gradient(135deg, rgba(228,232,241,0.85) 25%, rgba(247,249,252,0.9) 50%, rgba(228,232,241,0.85) 75%)",
  backgroundSize: "200% 200%",
  animation: "pixabay-skeleton 1.4s ease infinite",
};

export function ImageGalleryWidget() {
  const toolOutput = useToolOutput();
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useOpenAiGlobal("maxHeight");
  const safeArea = useOpenAiGlobal("safeArea");

  const images = toolOutput?.results ?? [];
  const isLoading = !toolOutput;
  const hasImages = images.length > 0;
  const isEmpty = toolOutput && !hasImages;

  const gridTemplate =
    displayMode === "fullscreen"
      ? "repeat(auto-fill, minmax(220px, 1fr))"
      : "repeat(auto-fill, minmax(140px, 1fr))";

  return (
    <div
      role="region"
      aria-label={
        toolOutput?.query
          ? `Pixabay gallery results for ${toolOutput.query}`
          : "Pixabay image gallery"
      }
      style={{
        maxHeight: `${maxHeight}px`,
        overflow: "auto",
        paddingTop: `${safeArea.insets.top + 12}px`,
        paddingRight: `${safeArea.insets.right + 12}px`,
        paddingBottom: `${safeArea.insets.bottom + 12}px`,
        paddingLeft: `${safeArea.insets.left + 12}px`,
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {isLoading ? (
        <GalleryGrid template={gridTemplate}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={`skeleton-${index}`} style={getSkeletonContainerStyle(displayMode)}>
              <div style={skeletonStyle} />
            </div>
          ))}
        </GalleryGrid>
      ) : null}

      {hasImages ? (
        <GalleryGrid template={gridTemplate}>
          {images.map((image) => (
            <ImageTile key={image.id} image={image} />
          ))}
        </GalleryGrid>
      ) : null}

      {isEmpty ? (
        <div
          style={{
            borderRadius: "18px",
            border: "1px dashed var(--openai-color-border-subtle, #d8dce5)",
            padding: "48px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--openai-color-text-tertiary, #6b7280)",
            fontSize: "0.9rem",
            letterSpacing: "0.01em",
          }}
        >
          No matching imagery surfaced for this description.
        </div>
      ) : null}

      {toolOutput ? (
        <footer
          style={{
            fontSize: "0.75rem",
            color: "var(--openai-color-text-tertiary, #757a80)",
            letterSpacing: "0.02em",
          }}
        >
          {toolOutput.attribution}
        </footer>
      ) : null}

      <style>
        {`
          @keyframes pixabay-skeleton {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}
      </style>
    </div>
  );
}

type GalleryGridProps = {
  template: string;
  children: ReactNode;
};

function GalleryGrid({ template, children }: GalleryGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: "12px",
        gridTemplateColumns: template,
      }}
    >
      {children}
    </div>
  );
}

type ImageTileProps = {
  image: ImageResult;
};

const ImageTile = memo(function ImageTile({ image }: ImageTileProps) {
  const aspectRatio =
    image.imageWidth > 0 && image.imageHeight > 0
      ? `${image.imageWidth} / ${image.imageHeight}`
      : "4 / 3";

  const handleClick = () => {
    openExternalLink(image.pageUrl);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        ...tileButtonBase,
        aspectRatio,
        minHeight: "140px",
        boxShadow: "0 6px 18px rgba(15, 24, 36, 0.08)",
      }}
      onMouseEnter={(event) => revealIcon(event.currentTarget, true)}
      onMouseLeave={(event) => revealIcon(event.currentTarget, false)}
      onFocus={(event) => revealIcon(event.currentTarget, true)}
      onBlur={(event) => revealIcon(event.currentTarget, false)}
    >
      <img
        src={image.previewUrl}
        alt={buildAltText(image)}
        loading="lazy"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transition: "transform 0.3s ease",
        }}
      />
      <span style={overlayIconStyle} aria-hidden="true">
        ↗
      </span>
      <span style={srOnlyStyle}>Open image on Pixabay (opens in new tab)</span>
    </button>
  );
});

function revealIcon(target: EventTarget, show: boolean) {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const icon = target.querySelector<HTMLElement>("span[aria-hidden='true']");
  const image = target.querySelector<HTMLImageElement>("img");
  if (icon) {
    icon.style.opacity = show ? "1" : "0";
    icon.style.transform = show ? "translateY(0)" : "translateY(-4px)";
  }
  if (image) {
    image.style.transform = show ? "scale(1.03)" : "scale(1)";
  }
}

function getSkeletonContainerStyle(displayMode: string): CSSProperties {
  return {
    borderRadius: "16px",
    overflow: "hidden",
    minHeight: displayMode === "fullscreen" ? "220px" : "140px",
  };
}

function buildAltText(image: ImageResult) {
  if (image.tags.length) {
    return `Pixabay photograph featuring ${image.tags.join(", ")}`;
  }
  return "Pixabay photograph";
}
