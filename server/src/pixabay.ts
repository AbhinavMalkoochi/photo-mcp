import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { serverConfig } from "./config.js";
import {
  SearchImagesInput,
  ImageResult,
  VideoResult,
  PixabayImageHit,
  PixabayVideoHit,
  pixabayImageHitSchema,
  pixabayVideoHitSchema,
} from "./schemas.js";

type PixabayImageSearchResponse = {
  total: number;
  totalHits: number;
  hits: unknown[];
};

type PixabayVideoSearchResponse = {
  total: number;
  totalHits: number;
  hits: unknown[];
};

type RateLimitInfo = {
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
};

export type SearchImagesParams = SearchImagesInput & {
  locale: string;
};

export type SearchVideosParams = SearchImagesInput & {
  locale: string;
};

export type PixabayImageSearchResult = {
  results: ImageResult[];
  totalHits: number;
  rateLimit?: RateLimitInfo;
};

export type PixabayVideoSearchResult = {
  results: VideoResult[];
  totalHits: number;
  rateLimit?: RateLimitInfo;
};

const RATE_LIMIT_HEADERS = {
  limit: "x-ratelimit-limit",
  remaining: "x-ratelimit-remaining",
  reset: "x-ratelimit-reset",
} as const;

const SUPPORTED_LANGS = new Set([
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fr",
  "id",
  "it",
  "hu",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "sk",
  "fi",
  "sv",
  "tr",
  "vi",
  "th",
  "bg",
  "ru",
  "el",
  "ja",
  "ko",
  "zh",
]);

const VIDEO_RENDITION_ORDER: Array<keyof PixabayVideoHit["videos"]> = [
  "medium",
  "large",
  "small",
  "tiny",
];

const THUMBNAIL_RENDITION_ORDER: Array<keyof PixabayVideoHit["videos"]> = [
  "medium",
  "small",
  "large",
  "tiny",
];

export class PixabayClient {
  async searchImages(
    params: SearchImagesParams,
    { signal }: { signal?: AbortSignal } = {}
  ): Promise<PixabayImageSearchResult> {
    const lang = resolveLanguage(params.locale);

    const searchParams = new URLSearchParams({
      key: serverConfig.pixabayApiKey,
      q: params.query,
      safesearch: String(params.safesearch ?? true),
      per_page: String(params.per_page ?? serverConfig.defaultPerPage),
      lang,
      image_type: "photo",
      orientation: params.orientation ?? "all",
    });

    const url = `${serverConfig.pixabayBaseUrl}?${searchParams.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    const rateLimit = this.extractRateLimit(response.headers);

    if (!response.ok) {
      await this.throwForErrorResponse(response);
    }

    const json = (await response.json()) as PixabayImageSearchResponse;
    const hits = Array.isArray(json.hits) ? json.hits : [];

    const parsedHits: PixabayImageHit[] = [];
    for (const rawHit of hits) {
      const parsed = pixabayImageHitSchema.safeParse(rawHit);
      if (parsed.success) {
        parsedHits.push(parsed.data);
      }
    }

    const results = parsedHits.map<ImageResult>((hit) => ({
      id: hit.id,
      previewUrl: hit.previewURL,
      pageUrl: hit.pageURL,
      imageUrl: hit.webformatURL,
      imageWidth: hit.imageWidth,
      imageHeight: hit.imageHeight,
      tags: normalizeTags(hit.tags),
      photographer: {
        name: hit.user,
        profileUrl: buildContributorProfile(hit.user, hit.user_id),
      },
      likes: hit.likes,
      downloads: hit.downloads,
    }));

    return {
      results,
      totalHits: json.totalHits ?? results.length,
      rateLimit,
    };
  }

  async searchVideos(
    params: SearchVideosParams,
    { signal }: { signal?: AbortSignal } = {}
  ): Promise<PixabayVideoSearchResult> {
    const lang = resolveLanguage(params.locale);

    const searchParams = new URLSearchParams({
      key: serverConfig.pixabayApiKey,
      q: params.query,
      safesearch: String(params.safesearch ?? true),
      per_page: String(params.per_page ?? serverConfig.defaultPerPage),
      lang,
    });

    const url = `${serverConfig.pixabayVideoBaseUrl}?${searchParams.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    const rateLimit = this.extractRateLimit(response.headers);

    if (!response.ok) {
      await this.throwForErrorResponse(response);
    }

    const json = (await response.json()) as PixabayVideoSearchResponse;
    const hits = Array.isArray(json.hits) ? json.hits : [];

    const parsedHits: PixabayVideoHit[] = [];
    for (const rawHit of hits) {
      const parsed = pixabayVideoHitSchema.safeParse(rawHit);
      if (parsed.success) {
        parsedHits.push(parsed.data);
      }
    }

    const results: VideoResult[] = [];
    for (const hit of parsedHits) {
      const rendition = this.pickVideoRendition(hit);
      if (!rendition) {
        continue;
      }

      const videoUrl = sanitizeUrl(rendition.url);
      if (!videoUrl) {
        continue;
      }

      const previewImageUrl = this.findThumbnail(hit, rendition.thumbnail);

      results.push({
        id: hit.id,
        pageUrl: hit.pageURL,
        videoUrl,
        previewImageUrl,
        width: Number.isFinite(rendition.width) ? rendition.width : null,
        height: Number.isFinite(rendition.height) ? rendition.height : null,
        durationSeconds: hit.duration,
        tags: normalizeTags(hit.tags),
        creator: {
          name: hit.user,
          profileUrl: buildContributorProfile(hit.user, hit.user_id),
        },
        likes: typeof hit.likes === "number" ? hit.likes : null,
        downloads: typeof hit.downloads === "number" ? hit.downloads : null,
      });
    }

    return {
      results,
      totalHits: json.totalHits ?? results.length,
      rateLimit,
    };
  }

  private extractRateLimit(headers: Headers): RateLimitInfo {
    return {
      limit: parseHeader(headers.get(RATE_LIMIT_HEADERS.limit)),
      remaining: parseHeader(headers.get(RATE_LIMIT_HEADERS.remaining)),
      resetSeconds: parseHeader(headers.get(RATE_LIMIT_HEADERS.reset)),
    };
  }

  private async throwForErrorResponse(response: Response): Promise<never> {
    const message = await this.safeReadError(response);
    if (response.status === 401 || response.status === 403) {
      throw new McpError(
        ErrorCode.InternalError,
        "Pixabay authentication failed. Verify PIXABAY_API_KEY."
      );
    }
    if (response.status === 429) {
      throw new McpError(
        ErrorCode.InternalError,
        "Pixabay rate limit exceeded. Please wait a moment before trying again."
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Pixabay request failed (${response.status}): ${message}`
    );
  }

  private async safeReadError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.trim() || response.statusText;
    } catch {
      return response.statusText;
    }
  }

  private pickVideoRendition(
    hit: PixabayVideoHit
  ): PixabayVideoHit["videos"][keyof PixabayVideoHit["videos"]] | null {
    for (const key of VIDEO_RENDITION_ORDER) {
      const rendition = hit.videos[key];
      if (!rendition) continue;
      if (sanitizeUrl(rendition.url)) {
        return rendition;
      }
    }
    return null;
  }

  private findThumbnail(
    hit: PixabayVideoHit,
    preferred?: string | null
  ): string | null {
    const preferredUrl = sanitizeUrl(preferred);
    if (preferredUrl) {
      return preferredUrl;
    }

    for (const key of THUMBNAIL_RENDITION_ORDER) {
      const rendition = hit.videos[key];
      if (!rendition) continue;
      const thumbnail = sanitizeUrl(rendition.thumbnail);
      if (thumbnail) {
        return thumbnail;
      }
    }

    return null;
  }
}

function parseHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveLanguage(locale: string | undefined): string {
  if (!locale) {
    return serverConfig.defaultLocale;
  }

  const candidate = locale.split(/[-_]/)[0]?.toLowerCase();
  if (candidate && SUPPORTED_LANGS.has(candidate)) {
    return candidate;
  }

  return serverConfig.defaultLocale;
}

function normalizeTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function sanitizeUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function buildContributorProfile(username: string, userId: number): string {
  return `https://pixabay.com/users/${encodeURIComponent(username)}-${userId}/`;
}
