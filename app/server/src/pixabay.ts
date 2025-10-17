import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { serverConfig } from "./config.js";
import {
  PixabayHit,
  ImageResult,
  pixabayHitSchema,
  SearchImagesInput,
} from "./schemas.js";

type PixabaySearchResponse = {
  total: number;
  totalHits: number;
  hits: unknown[];
};

export type SearchImagesParams = SearchImagesInput & {
  locale: string;
};

export type PixabaySearchResult = {
  results: ImageResult[];
  totalHits: number;
  rateLimit?: {
    limit?: number;
    remaining?: number;
    resetSeconds?: number;
  };
};

const RATE_LIMIT_HEADERS = {
  limit: "x-ratelimit-limit",
  remaining: "x-ratelimit-remaining",
  reset: "x-ratelimit-reset",
} as const;

export class PixabayClient {
  async searchImages(
    params: SearchImagesParams,
    { signal }: { signal?: AbortSignal } = {}
  ): Promise<PixabaySearchResult> {
    const searchParams = new URLSearchParams({
      key: serverConfig.pixabayApiKey,
      q: params.query,
      safesearch: String(params.safesearch ?? true),
      per_page: String(params.per_page ?? serverConfig.defaultPerPage),
      lang: params.locale ?? serverConfig.defaultLocale,
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

    const json = (await response.json()) as PixabaySearchResponse;

    const hits = Array.isArray(json.hits) ? json.hits : [];

    const parsedHits: PixabayHit[] = [];
    for (const rawHit of hits) {
      const parsed = pixabayHitSchema.safeParse(rawHit);
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
      tags: hit.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      photographer: {
        name: hit.user,
        profileUrl: `https://pixabay.com/users/${encodeURIComponent(
          hit.user
        )}-${hit.user_id}/`,
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

  private extractRateLimit(headers: Headers): PixabaySearchResult["rateLimit"] {
    return {
      limit: parseHeader(headers.get(RATE_LIMIT_HEADERS.limit)),
      remaining: parseHeader(headers.get(RATE_LIMIT_HEADERS.remaining)),
      resetSeconds: parseHeader(headers.get(RATE_LIMIT_HEADERS.reset)),
    };
  }

  private async safeReadError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.trim() || response.statusText;
    } catch (error) {
      return response.statusText;
    }
  }
}

function parseHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
