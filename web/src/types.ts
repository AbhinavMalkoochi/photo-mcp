export type ImageResult = {
  id: number;
  previewUrl: string;
  pageUrl: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  tags: string[];
  photographer: {
    name: string;
    profileUrl: string;
  };
  likes: number;
  downloads: number;
};

export type VideoResult = {
  id: number;
  pageUrl: string;
  videoUrl: string;
  previewImageUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number;
  tags: string[];
  creator: {
    name: string;
    profileUrl: string;
  };
  likes: number | null;
  downloads: number | null;
};

export type MediaSearchStructuredContent = {
  query: string;
  imageCount: number;
  videoCount: number;
  images: ImageResult[];
  videos: VideoResult[];
  attribution: string;
};

export type SearchImagesInput = {
  query: string;
  orientation?: "all" | "horizontal" | "vertical";
  safesearch?: boolean;
  per_page?: number;
};

export type WidgetState = {
  focusedImageId: number | null;
  activeVideoId: number | null;
};
