import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  openExternalLink,
  useOpenAiGlobal,
  useToolOutput,
  useWidgetState,
} from "../openai.js";
import type { ImageResult, VideoResult, WidgetState } from "../types.js";

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

const videoWrapperStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  borderRadius: "18px",
  overflow: "hidden",
  backgroundColor: "#000",
  boxShadow: "0 18px 42px rgba(15, 24, 36, 0.18)",
};

const videoElementStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  backgroundColor: "#000",
};

const videoSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const videoMetaContainerStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
};

const videoMetaTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "var(--openai-color-text-secondary, #374151)",
  fontSize: "0.9rem",
  lineHeight: 1.5,
};

const ctaButtonStyle: CSSProperties = {
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--openai-color-text-secondary, #334155)",
  border: "1px solid var(--openai-color-border-subtle, #d8dce5)",
  borderRadius: "10px",
  padding: "8px 14px",
  fontSize: "0.8rem",
  fontWeight: 500,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  letterSpacing: "0.01em",
  boxShadow: "none",
  transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const chipStyle: CSSProperties = {
  background: "var(--openai-color-surface-strong, #f1f4f9)",
  color: "var(--openai-color-text-tertiary, #6b7280)",
  borderRadius: "999px",
  padding: "4px 10px",
  fontSize: "0.75rem",
  letterSpacing: "0.02em",
};

const thumbnailRowStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  overflowX: "auto",
  paddingBottom: "4px",
};

const thumbnailButtonBase: CSSProperties = {
  position: "relative",
  width: "120px",
  height: "68px",
  flex: "0 0 auto",
  border: "1px solid rgba(148, 163, 184, 0.32)",
  borderRadius: "12px",
  overflow: "hidden",
  backgroundColor: "var(--openai-color-surface, #f4f6fb)",
  cursor: "pointer",
  transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
};

const thumbnailImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const thumbnailPlaceholderStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--openai-color-text-tertiary, #6b7280)",
  fontSize: "0.75rem",
  background:
    "linear-gradient(135deg, rgba(228,232,241,0.85) 25%, rgba(247,249,252,0.9) 50%, rgba(228,232,241,0.85) 75%)",
  letterSpacing: "0.02em",
};

const thumbnailDurationStyle: CSSProperties = {
  position: "absolute",
  bottom: "6px",
  right: "6px",
  background: "rgba(15, 23, 42, 0.74)",
  color: "#fff",
  borderRadius: "6px",
  padding: "2px 6px",
  fontSize: "0.7rem",
  letterSpacing: "0.05em",
};

const videoSkeletonContainerStyle: CSSProperties = {
  borderRadius: "18px",
  overflow: "hidden",
  width: "100%",
};

export function ImageGalleryWidget() {
  const toolOutput = useToolOutput();
  const [widgetState, setWidgetState] = useWidgetState();
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useOpenAiGlobal("maxHeight");
  const safeArea = useOpenAiGlobal("safeArea");

  const images = toolOutput?.images ?? [];
  const videos = toolOutput?.videos ?? [];
  const isLoading = !toolOutput;
  const hasImages = images.length > 0;
  const hasVideos = videos.length > 0;
  const isEmpty = toolOutput && !hasImages && !hasVideos;

  const [activeVideoId, setActiveVideoId] = useState<number | null>(null);

  useEffect(() => {
    const nextId =
      widgetState?.activeVideoId ??
      (videos.length > 0 ? videos[0]?.id ?? null : null);
    setActiveVideoId((current) => {
      if (current === nextId) {
        return current;
      }
      return nextId;
    });
  }, [widgetState?.activeVideoId, videos]);

  const selectedVideo = useMemo(() => {
    if (!videos.length) return null;
    const activeId = activeVideoId;
    if (activeId != null) {
      const match = videos.find((video) => video.id === activeId);
      if (match) {
        return match;
      }
    }
    return videos[0];
  }, [videos, activeVideoId]);

  const handleVideoSelect = useCallback(
    (id: number) => {
      setActiveVideoId(id);
      setWidgetState((prev) => {
        const base = ensureWidgetState(prev);
        if (base.activeVideoId === id) {
          return base;
        }
        return { ...base, activeVideoId: id };
      });
    },
    [setWidgetState]
  );

  const gridTemplate =
    displayMode === "fullscreen"
      ? "repeat(auto-fill, minmax(220px, 1fr))"
      : "repeat(auto-fill, minmax(140px, 1fr))";

  return (
    <div
      role="region"
      aria-label={
        toolOutput?.query
          ? `Pixabay media results for ${toolOutput.query}`
          : "Pixabay media gallery"
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
        gap: "18px",
      }}
    >
      {isLoading ? (
        <>
          <VideoSkeleton displayMode={displayMode} />
          <GalleryGrid template={gridTemplate}>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={`skeleton-${index}`} style={getSkeletonContainerStyle(displayMode)}>
                <div style={skeletonStyle} />
              </div>
            ))}
          </GalleryGrid>
        </>
      ) : null}

      {hasVideos && selectedVideo ? (
        <VideoSection
          videos={videos}
          selectedVideo={selectedVideo}
          onSelectVideo={handleVideoSelect}
        />
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
            textAlign: "center",
          }}
        >
          No matching Pixabay media surfaced for this description.
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
        alt={buildImageAltText(image)}
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

type VideoSectionProps = {
  videos: VideoResult[];
  selectedVideo: VideoResult;
  onSelectVideo: (id: number) => void;
};

function VideoSection({ videos, selectedVideo, onSelectVideo }: VideoSectionProps) {
  const aspectRatio = getVideoAspectRatio(selectedVideo);
  const durationLabel = formatDuration(selectedVideo.durationSeconds);
  const tagSamples = selectedVideo.tags.slice(0, 4);
  const stats = buildVideoStats(selectedVideo);
  const videoLabel = buildVideoLabel(selectedVideo);

  return (
    <section
      aria-label={videoLabel}
      style={videoSectionStyle}
    >
      <div style={{ ...videoWrapperStyle, aspectRatio }}>
        <video
          key={selectedVideo.id}
          controls
          poster={selectedVideo.previewImageUrl ?? undefined}
          style={videoElementStyle}
        >
          <source src={selectedVideo.videoUrl} type="video/mp4" />
          Your browser does not support embedded videos. You can open this video on Pixabay instead.
        </video>
      </div>
      <div style={videoMetaContainerStyle}>
        <div style={videoMetaTextStyle}>
          <span>
            Video by{" "}
            <a
              href={selectedVideo.creator.profileUrl}
              onClick={(event) => {
                event.preventDefault();
                openExternalLink(selectedVideo.creator.profileUrl);
              }}
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {selectedVideo.creator.name}
            </a>
            .
          </span>
          {stats.length ? (
            <span style={{ fontSize: "0.8rem", color: "var(--openai-color-text-tertiary, #6b7280)" }}>
              {stats.join(" • ")}
            </span>
          ) : null}
          {durationLabel || tagSamples.length ? (
            <div style={chipRowStyle}>
              {durationLabel ? (
                <span style={chipStyle}>Duration {durationLabel}</span>
              ) : null}
              {tagSamples.map((tag) => (
                <span key={tag} style={chipStyle}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => openExternalLink(selectedVideo.pageUrl)}
          style={ctaButtonStyle}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = "rgba(15, 23, 42, 0.12)";
            event.currentTarget.style.borderColor =
              "var(--openai-color-border-strong, #c3c9d4)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "rgba(15, 23, 42, 0.06)";
            event.currentTarget.style.borderColor =
              "var(--openai-color-border-subtle, #d8dce5)";
          }}
          onFocus={(event) => {
            event.currentTarget.style.background = "rgba(15, 23, 42, 0.12)";
            event.currentTarget.style.borderColor =
              "var(--openai-color-border-strong, #c3c9d4)";
          }}
          onBlur={(event) => {
            event.currentTarget.style.background = "rgba(15, 23, 42, 0.06)";
            event.currentTarget.style.borderColor =
              "var(--openai-color-border-subtle, #d8dce5)";
          }}
        >
          View on Pixabay
          <span aria-hidden="true" style={{ fontSize: "0.9em" }}>
            ↗
          </span>
        </button>
      </div>
      {videos.length > 1 ? (
        <div style={thumbnailRowStyle} aria-label="Other video options">
          {videos.map((video) => (
            <VideoThumbnailButton
              key={video.id}
              video={video}
              isActive={video.id === selectedVideo.id}
              onSelect={onSelectVideo}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type VideoThumbnailButtonProps = {
  video: VideoResult;
  isActive: boolean;
  onSelect: (id: number) => void;
};

const VideoThumbnailButton = memo(function VideoThumbnailButton({
  video,
  isActive,
  onSelect,
}: VideoThumbnailButtonProps) {
  const handleClick = useCallback(() => onSelect(video.id), [onSelect, video.id]);
  const durationLabel = formatDuration(video.durationSeconds);
  const label = buildVideoLabel(video);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isActive}
      aria-label={`Play ${label}`}
      style={{
        ...thumbnailButtonBase,
        border: isActive
          ? "2px solid var(--openai-color-accent, #1456ff)"
          : "1px solid rgba(148, 163, 184, 0.32)",
        boxShadow: isActive
          ? "0 10px 22px rgba(20, 86, 255, 0.24)"
          : "0 6px 16px rgba(15, 24, 36, 0.08)",
        transform: isActive ? "scale(1.04)" : "none",
      }}
    >
      {video.previewImageUrl ? (
        <img
          src={video.previewImageUrl}
          alt={label}
          loading="lazy"
          style={thumbnailImageStyle}
        />
      ) : (
        <div style={thumbnailPlaceholderStyle}>Pixabay video</div>
      )}
      {durationLabel ? <span style={thumbnailDurationStyle}>{durationLabel}</span> : null}
    </button>
  );
});

type VideoSkeletonProps = {
  displayMode: string;
};

function VideoSkeleton({ displayMode }: VideoSkeletonProps) {
  const aspectRatio = displayMode === "fullscreen" ? "16 / 9" : "4 / 3";
  return (
    <div style={{ ...videoSkeletonContainerStyle, aspectRatio }}>
      <div style={skeletonStyle} />
    </div>
  );
}

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

function buildImageAltText(image: ImageResult) {
  if (image.tags.length) {
    return `Pixabay photograph featuring ${image.tags.join(", ")}`;
  }
  return "Pixabay photograph";
}

function buildVideoLabel(video: VideoResult): string {
  if (video.tags.length) {
    return `Pixabay video featuring ${video.tags.join(", ")}`;
  }
  return `Pixabay video by ${video.creator.name}`;
}

function formatDuration(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "";
  }
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getVideoAspectRatio(video: VideoResult): string {
  if (
    video.width != null &&
    video.height != null &&
    video.width > 0 &&
    video.height > 0
  ) {
    return `${video.width} / ${video.height}`;
  }
  return "16 / 9";
}

function buildVideoStats(video: VideoResult): string[] {
  const stats: string[] = [];
  if (typeof video.likes === "number") {
    stats.push(`${video.likes} like${video.likes === 1 ? "" : "s"}`);
  }
  if (typeof video.downloads === "number") {
    stats.push(`${video.downloads} download${video.downloads === 1 ? "" : "s"}`);
  }
  return stats;
}

function ensureWidgetState(state: WidgetState | null): WidgetState {
  return {
    focusedImageId: state?.focusedImageId ?? null,
    activeVideoId: state?.activeVideoId ?? null,
  };
}
