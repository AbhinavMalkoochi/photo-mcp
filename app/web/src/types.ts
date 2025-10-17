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

export type ImageSearchStructuredContent = {
  query: string;
  resultCount: number;
  results: ImageResult[];
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
};
