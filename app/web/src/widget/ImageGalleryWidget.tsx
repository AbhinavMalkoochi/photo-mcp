import { Fragment } from "react";
import {
  useOpenAiGlobal,
  useToolOutput,
  useWidgetState,
  requestFullscreen,
} from "../openai.js";
import type { WidgetState } from "../types.js";

export function ImageGalleryWidget() {
  const toolOutput = useToolOutput();
  const locale = useOpenAiGlobal("locale");
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useOpenAiGlobal("maxHeight");
  const [widgetState] = useWidgetState();

  const hasResults = Boolean(toolOutput?.results.length);

  return (
    <div
      role="region"
      aria-label={`Pixabay image results${toolOutput?.query ? ` for ${toolOutput.query}` : ""}`}
      style={{
        maxHeight: `${maxHeight}px`,
        overflow: "auto",
        padding: "12px",
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
            <p style={{ margin: 0 }}>
              This is a placeholder gallery. UI implementation forthcoming.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              No images available. Try another search term.
            </p>
          )}

          <footer
            style={{
              fontSize: "0.75rem",
              color: "var(--openai-color-text-tertiary, #757a80)",
            }}
          >
            {toolOutput.attribution}
          </footer>
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
    </div>
  );
}
