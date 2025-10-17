// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode as ErrorCode2, McpError as McpError2 } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";

// src/config.ts
import { config as loadEnv } from "dotenv";
loadEnv();
var REQUIRED_ENV_VARS = ["PIXABAY_API_KEY"];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key] || process.env[key]?.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
var serverConfig = {
  pixabayApiKey: process.env.PIXABAY_API_KEY.trim(),
  pixabayBaseUrl: "https://pixabay.com/api/",
  defaultLocale: "en",
  defaultPerPage: 6,
  maxPerPage: 20
};

// src/schemas.ts
import { z } from "zod";
var orientationValues = ["all", "horizontal", "vertical"];
var searchImagesInputSchema = z.object({
  query: z.string().trim().min(1, { message: "Please provide a search query." }).max(100, { message: "Queries must be 100 characters or fewer." }),
  orientation: z.enum(orientationValues).optional(),
  safesearch: z.boolean().optional(),
  per_page: z.number().int().min(3, { message: "per_page must be between 3 and 20." }).max(serverConfig.maxPerPage, {
    message: `per_page must be between 3 and ${serverConfig.maxPerPage}.`
  }).optional()
}).strict();
var pixabayHitSchema = z.object({
  id: z.number(),
  pageURL: z.string().url(),
  previewURL: z.string().url(),
  webformatURL: z.string().url(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  tags: z.string(),
  user: z.string(),
  user_id: z.number(),
  userImageURL: z.string().url().optional().nullable(),
  likes: z.number(),
  downloads: z.number()
});

// src/pixabay.ts
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
var RATE_LIMIT_HEADERS = {
  limit: "x-ratelimit-limit",
  remaining: "x-ratelimit-remaining",
  reset: "x-ratelimit-reset"
};
var PixabayClient = class {
  async searchImages(params, { signal } = {}) {
    const searchParams = new URLSearchParams({
      key: serverConfig.pixabayApiKey,
      q: params.query,
      safesearch: String(params.safesearch ?? true),
      per_page: String(params.per_page ?? serverConfig.defaultPerPage),
      lang: params.locale ?? serverConfig.defaultLocale,
      image_type: "photo",
      orientation: params.orientation ?? "all"
    });
    const url = `${serverConfig.pixabayBaseUrl}?${searchParams.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal
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
    const json = await response.json();
    const hits = Array.isArray(json.hits) ? json.hits : [];
    const parsedHits = [];
    for (const rawHit of hits) {
      const parsed = pixabayHitSchema.safeParse(rawHit);
      if (parsed.success) {
        parsedHits.push(parsed.data);
      }
    }
    const results = parsedHits.map((hit) => ({
      id: hit.id,
      previewUrl: hit.previewURL,
      pageUrl: hit.pageURL,
      imageUrl: hit.webformatURL,
      imageWidth: hit.imageWidth,
      imageHeight: hit.imageHeight,
      tags: hit.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0),
      photographer: {
        name: hit.user,
        profileUrl: `https://pixabay.com/users/${encodeURIComponent(
          hit.user
        )}-${hit.user_id}/`
      },
      likes: hit.likes,
      downloads: hit.downloads
    }));
    return {
      results,
      totalHits: json.totalHits ?? results.length,
      rateLimit
    };
  }
  extractRateLimit(headers) {
    return {
      limit: parseHeader(headers.get(RATE_LIMIT_HEADERS.limit)),
      remaining: parseHeader(headers.get(RATE_LIMIT_HEADERS.remaining)),
      resetSeconds: parseHeader(headers.get(RATE_LIMIT_HEADERS.reset))
    };
  }
  async safeReadError(response) {
    try {
      const text = await response.text();
      return text.trim() || response.statusText;
    } catch (error) {
      return response.statusText;
    }
  }
};
function parseHeader(value) {
  if (!value)
    return void 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : void 0;
}

// src/index.ts
var PACKAGE_VERSION = "0.1.0";
var TOOL_NAME = "search_pixabay_images";
var TOOL_TITLE = "Search Pixabay Images";
var TOOL_DESCRIPTION = "Finds royalty-free images from Pixabay that match the user's search query.";
var RESOURCE_NAME = "pixabay-image-gallery";
var OUTPUT_TEMPLATE_URI = "ui://widget/pixabay-image-gallery.html";
var WIDGET_DESCRIPTION = "Displays a responsive grid of Pixabay images with captions, attribution, and links.";
var __dirname = dirname(fileURLToPath(new URL(import.meta.url)));
var WEB_DIST_DIR = resolvePath(__dirname, "../web/dist");
var SCRIPT_FILENAME = "component.js";
var STYLE_FILENAME = "component.css";
var pixabayClient = new PixabayClient();
async function loadWidgetHtml() {
  const [scriptSource, styleSource] = await Promise.all([
    readFileOrThrow(join(WEB_DIST_DIR, SCRIPT_FILENAME)),
    readFileOptional(join(WEB_DIST_DIR, STYLE_FILENAME))
  ]);
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pixabay Image Gallery</title>
    ${styleSource ? `<style>${styleSource}</style>` : ""}
  </head>
  <body>
    <div id="pixabay-gallery-root"></div>
    <script type="module">
${scriptSource}
    </script>
  </body>
</html>
  `.trim();
}
async function readFileOptional(path) {
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function readFileOrThrow(path) {
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Missing build artifact at ${path}. Please run "npm run build" in app/web before starting the server.`
      );
    }
    throw error;
  }
}
function resolveLocale(meta) {
  const defaultLocale = serverConfig.defaultLocale;
  if (meta && typeof meta === "object") {
    const locale = meta["openai/locale"] ?? meta["webplus/i18n"];
    if (typeof locale === "string" && locale.length > 0) {
      return locale;
    }
  }
  return defaultLocale;
}
function toStructuredContent(input, result) {
  return {
    query: input.query,
    resultCount: result.results.length,
    results: result.results,
    attribution: "Images provided by Pixabay under the Pixabay License."
  };
}
async function main() {
  const server = new McpServer({
    name: "pixabay-image-mcp",
    version: PACKAGE_VERSION
  });
  server.registerResource(
    RESOURCE_NAME,
    OUTPUT_TEMPLATE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: OUTPUT_TEMPLATE_URI,
          mimeType: "text/html+skybridge",
          text: await loadWidgetHtml(),
          _meta: {
            "openai/widgetDescription": WIDGET_DESCRIPTION,
            "openai/widgetPrefersBorder": true
          }
        }
      ]
    })
  );
  server.registerTool(
    TOOL_NAME,
    {
      title: TOOL_TITLE,
      description: TOOL_DESCRIPTION,
      inputSchema: searchImagesInputSchema.shape,
      _meta: {
        "openai/outputTemplate": OUTPUT_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Searching Pixabay\u2026",
        "openai/toolInvocation/invoked": "Images ready."
      }
    },
    async (rawInput, extra) => {
      const locale = resolveLocale(extra._meta);
      const parsed = searchImagesInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        const errorMessage = parsed.error.issues.map((issue) => issue.message).join("; ");
        throw new McpError2(ErrorCode2.InvalidParams, errorMessage);
      }
      const input = parsed.data;
      const searchResult = await pixabayClient.searchImages(
        {
          ...input,
          locale
        },
        { signal: extra.signal }
      );
      const structuredContent = toStructuredContent(input, searchResult);
      const summary = structuredContent.resultCount > 0 ? `Found ${structuredContent.resultCount} Pixabay image${structuredContent.resultCount === 1 ? "" : "s"} for "${structuredContent.query}".` : `No Pixabay images found for "${structuredContent.query}". Try a different description or add more detail.`;
      return {
        content: [
          {
            type: "text",
            text: summary
          }
        ],
        structuredContent,
        _meta: {
          "openai/locale": locale,
          rateLimit: searchResult.rateLimit
        }
      };
    }
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
