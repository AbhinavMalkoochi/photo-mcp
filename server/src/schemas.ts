import { z } from "zod";
import { serverConfig } from "./config.js";

const orientationValues = ["all", "horizontal", "vertical"] as const;

export const searchImagesInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1, { message: "Please provide a search query." })
      .max(100, { message: "Queries must be 100 characters or fewer." }),
    orientation: z.enum(orientationValues).optional(),
    safesearch: z.boolean().optional(),
    per_page: z
      .number()
      .int()
      .min(3, { message: "per_page must be between 3 and 20." })
      .max(serverConfig.maxPerPage, {
        message: `per_page must be between 3 and ${serverConfig.maxPerPage}.`,
      })
      .optional(),
  })
  .strict();

export type SearchImagesInput = z.infer<typeof searchImagesInputSchema>;

export const pixabayImageHitSchema = z.object({
  id: z.number(),
  pageURL: z.string().url(),
  previewURL: z.string().url(),
  webformatURL: z.string().url(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  tags: z.string(),
  user: z.string(),
  user_id: z.number(),
  userImageURL: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional()
    .nullable(),
  likes: z.number(),
  downloads: z.number(),
});

export type PixabayImageHit = z.infer<typeof pixabayImageHitSchema>;

const urlOrEmpty = z.string().url().or(z.literal(""));

const pixabayVideoRenditionSchema = z.object({
  url: urlOrEmpty,
  width: z.number(),
  height: z.number(),
  size: z.number().optional(),
  thumbnail: urlOrEmpty.optional(),
});

export const pixabayVideoHitSchema = z.object({
  id: z.number(),
  pageURL: z.string().url(),
  tags: z.string(),
  duration: z.number().int().nonnegative(),
  type: z.string(),
  videos: z
    .object({
      large: pixabayVideoRenditionSchema.optional(),
      medium: pixabayVideoRenditionSchema.optional(),
      small: pixabayVideoRenditionSchema.optional(),
      tiny: pixabayVideoRenditionSchema.optional(),
    })
    .strict(),
  user: z.string(),
  user_id: z.number(),
  userImageURL: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional()
    .nullable(),
  views: z.number().optional(),
  downloads: z.number().optional(),
  likes: z.number().optional(),
});

export type PixabayVideoHit = z.infer<typeof pixabayVideoHitSchema>;

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
