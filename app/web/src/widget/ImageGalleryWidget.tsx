import type { CSSProperties } from "react";
import { Fragment, useEffect, useMemo, useRef } from "react";
import {
  openExternalLink,
  requestFullscreen,
  useOpenAiGlobal,
  useToolOutput,
  useWidgetState,
} from "../openai.js";
import type { ImageResult } from "../types.js";

export function ImageGalleryWidget() {
  const toolOutput = useToolOutput();
  const locale = useOpenAiGlobal("locale");
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useOpenAiGlobal("maxHeight");
  const safeArea = useOpenAiGlobal("safeArea");
  const userAgent = useOpenAiGlobal("userAgent");
  const [widgetState, setWidgetState] = useWidgetState();

  const results = toolOutput?.results ?? [];
  const focusedImageId = widgetState?.focusedImageId ?? null;
  const focusedImage = results.find((item) => item.id === focusedImageId) ?? null;
  const hasResults = results.length > 0;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (focusedImage) {
      closeButtonRef.current?.focus();
      return;
    }
    closeButtonRef.current = null;
  }, [focusedImage]);

  useEffect(() => {
    if (!focusedImageId) {
      return;
    }
    if (!results.some((item) => item.id === focusedImageId)) {
      setWidgetState(() => ({ focusedImageId: null }));
    }
  }, [focusedImageId, results, setWidgetState]);

  return (
    <div
      role="region"
      aria-label={`Pixabay image results${toolOutput?.query ? ` for ${toolOutput.query}` : ""}`}
      style={{
        maxHeight: `${maxHeight}px`,
        overflow: "auto",
        paddingTop: `${safeArea.insets.top + 12}px`,
        paddingRight: `${safeArea.insets.right + 12}px`,
        paddingBottom: `${safeArea.insets.bottom + 12}px`,
        paddingLeft: `${safeArea.insets.left + 12}px`,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {toolOutput ? (
        <Fragment>
          <header>
            <h2
              style={{
                margin: 0,
                fontSize: "1rem",
                lineHeight: 1.3,
              }}
            >
              Search results for “{toolOutput.query}”
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--openai-color-text-secondary, #5f6368)",
                fontSize: "0.875rem",
              }}
            >
              Showing {toolOutput.resultCount} image
              {toolOutput.resultCount === 1 ? "" : "s"} &middot; Locale: {locale}
            </p>
          </header>

          {hasResults ? (
            <div
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns:
                  displayMode === "fullscreen"
                    ? "repeat(auto-fill, minmax(240px, 1fr))"
                    : "repeat(auto-fill, minmax(160px, 1fr))",
              }}
            >
              {results.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  query={toolOutput.query}
                  onFocus={() => setWidgetState(() => ({ focusedImageId: image.id }))}
                  onOpenSource={() => openExternalLink(image.pageUrl)}
                  numberFormatter={numberFormatter}
                />
              ))}
            </div>
          ) : (
            <EmptyState query={toolOutput.query} />
          )}

          <Attribution text={toolOutput.attribution} />
        </Fragment>
      ) : (
        <p style={{ margin: 0 }}>Waiting for image search results…</p>
      )}

      {displayMode === "inline" && (toolOutput?.resultCount ?? 0) > 0 ? (
        <button
          type="button"
          onClick={() => {
            void requestFullscreen();
          }}
          style={{
            alignSelf: "flex-start",
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid var(--openai-color-border, #d0d5dc)",
            background: "var(--openai-color-bg, #fff)",
            cursor: "pointer",
          }}
        >
          Expand gallery
        </button>
      ) : null}

      {focusedImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pixabay-focused-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: "var(--openai-color-bg, #ffffff)",
              borderRadius: "16px",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
              maxWidth: "min(960px, 90vw)",
              width: "100%",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "grid",
              gridTemplateColumns:
                userAgent.device.type === "desktop" || userAgent.device.type === "tablet"
                  ? "minmax(0, 3fr) minmax(0, 2fr)"
                  : "1fr",
              gap: "0px",
            }}
          >
            <figure
              style={{
                margin: 0,
                position: "relative",
                backgroundColor: "var(--openai-color-surface, #f6f7fb)",
              }}
            >
              <img
                src={focusedImage.imageUrl}
                alt={buildAltText(focusedImage, toolOutput?.query)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </figure>

            <div
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <h3
                  id="pixabay-focused-title"
                  style={{ margin: 0, fontSize: "1.1rem", lineHeight: 1.4 }}
                >
                  {focusedImage.tags.length
                    ? focusedImage.tags.join(", ")
                    : toolOutput?.query ?? "Pixabay image"}
                </h3>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setWidgetState(() => ({ focusedImageId: null }))}
                  style={pillButtonStyle}
                >
                  Close
                </button>
              </div>

              <MetadataRow
                label="Photographer"
                value={focusedImage.photographer.name}
                href={focusedImage.photographer.profileUrl}
              />
              <MetadataRow
                label="Likes"
                value={numberFormatter.format(focusedImage.likes)}
              />
              <MetadataRow
                label="Downloads"
                value={numberFormatter.format(focusedImage.downloads)}
              />

              {focusedImage.tags.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {focusedImage.tags.map((tag) => (
                    <span key={tag} style={chipStyle}>
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: "12px", marginTop: "auto" }}>
                <button
                  type="button"
                  onClick={() => openExternalLink(focusedImage.pageUrl)}
                  style={{
                    ...pillButtonStyle,
                    backgroundColor: "var(--openai-color-accent, #0f8afd)",
                    borderColor: "var(--openai-color-accent, #0f8afd)",
                    color: "var(--openai-color-onAccent, #ffffff)",
                  }}
                >
                  View on Pixabay
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ImageCardProps = {
  image: ImageResult;
  query: string;
  onFocus: () => void;
  onOpenSource: () => void;
  numberFormatter: Intl.NumberFormat;
};

function ImageCard({
  image,
  query,
  onFocus,
  onOpenSource,
  numberFormatter,
}: ImageCardProps) {
  const titleId = `pixabay-card-title-${image.id}`;
  const descriptionId = `pixabay-card-desc-${image.id}`;

  return (
    <article
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      style={{
        background: "var(--openai-color-surface, #f9fafc)",
        borderRadius: "16px",
        border: "1px solid var(--openai-color-border-subtle, #e5e7eb)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 8px rgba(15, 24, 36, 0.04)",
      }}
    >
      <figure
        style={{
          margin: 0,
          position: "relative",
          aspectRatio: "4 / 3",
          background: "var(--openai-color-bg-muted, #eef1f6)",
        }}
      >
        <img
          src={image.previewUrl}
          alt={buildAltText(image, query)}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </figure>

      <div
        style={{
          padding: "12px 14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <header>
          <h3
            id={titleId}
            style={{
              margin: 0,
              fontSize: "0.95rem",
              lineHeight: 1.3,
              color: "var(--openai-color-text, #1f2933)",
            }}
          >
            {image.tags.length ? image.tags.join(", ") : "Pixabay image"}
          </h3>
          <p
            id={descriptionId}
            style={{
              margin: "4px 0 0",
              fontSize: "0.8rem",
              color: "var(--openai-color-text-secondary, #5f6368)",
            }}
          >
            {image.photographer.name} &middot;{" "}
            {numberFormatter.format(image.likes)} likes ·{" "}
            {numberFormatter.format(image.downloads)} downloads
          </p>
        </header>

        {image.tags.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {image.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={chipStyle}>
                #{tag}
              </span>
            ))}
            {image.tags.length > 4 ? (
              <span style={chipStyle}>+{image.tags.length - 4}</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={onFocus}
            style={{
              ...pillButtonStyle,
              flex: 1,
              justifyContent: "center",
            }}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={onOpenSource}
            style={{
              ...pillButtonStyle,
              flex: 1,
              justifyContent: "center",
              backgroundColor: "var(--openai-color-accent, #0f8afd)",
              borderColor: "var(--openai-color-accent, #0f8afd)",
              color: "var(--openai-color-onAccent, #ffffff)",
            }}
          >
            Open
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div
      style={{
        padding: "48px 16px",
        borderRadius: "16px",
        background: "var(--openai-color-surface, #f6f7fb)",
        textAlign: "center",
        border: "1px dashed var(--openai-color-border-subtle, #d4dae3)",
      }}
    >
      <p style={{ margin: 0, fontSize: "0.95rem", color: "#3f4752" }}>
        We couldn&apos;t find images for “{query}”. Try broadening the
        description or removing filters.
      </p>
    </div>
  );
}

function Attribution({ text }: { text: string }) {
  return (
    <footer
      style={{
        fontSize: "0.75rem",
        color: "var(--openai-color-text-tertiary, #757a80)",
      }}
    >
      {text}
    </footer>
  );
}

function MetadataRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <span
      style={{
        fontSize: "0.95rem",
        color: "var(--openai-color-text, #1f2933)",
      }}
    >
      {value}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span
        style={{
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--openai-color-text-tertiary, #757a80)",
        }}
      >
        {label}
      </span>
      {href ? (
        <button
          type="button"
          onClick={() => openExternalLink(href)}
          style={{
            ...linkStyle,
            alignSelf: "flex-start",
          }}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}

const pillButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  borderRadius: "999px",
  border: "1px solid var(--openai-color-border, #ccd2db)",
  background: "var(--openai-color-bg, #ffffff)",
  color: "var(--openai-color-text, #1f2933)",
  fontSize: "0.85rem",
  lineHeight: 1.2,
  cursor: "pointer",
  transition: "background-color 0.2s ease, transform 0.2s ease",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: "999px",
  backgroundColor: "var(--openai-color-surface-muted, #eef1f6)",
  color: "var(--openai-color-text-secondary, #565c62)",
  fontSize: "0.75rem",
  lineHeight: 1,
};

const linkStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  fontSize: "0.95rem",
  color: "var(--openai-color-accent, #0f8afd)",
  cursor: "pointer",
  textDecoration: "underline",
};

function buildAltText(image: ImageResult, query?: string) {
  if (image.tags.length) {
    return `Pixabay photo featuring ${image.tags.join(", ")}`;
  }
  if (query) {
    return `Pixabay photo related to ${query}`;
  }
  return "Pixabay photo";
}
