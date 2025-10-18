import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request } from "express";
import { promises as fs } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { serverConfig } from "./config.js";
import {
  MediaSearchStructuredContent,
  SearchImagesInput,
  searchImagesInputSchema,
} from "./schemas.js";
import { PixabayClient } from "./pixabay.js";

const PACKAGE_VERSION = "0.1.0";
const IMAGE_TOOL_NAME = "search_pixabay_images";
const IMAGE_TOOL_TITLE = "Search Pixabay Images";
const IMAGE_TOOL_DESCRIPTION =
  "Finds royalty-free images from Pixabay that match the user's search query.";
const VIDEO_TOOL_NAME = "search_pixabay_videos";
const VIDEO_TOOL_TITLE = "Search Pixabay Videos";
const VIDEO_TOOL_DESCRIPTION =
  "Finds royalty-free videos from Pixabay that match the user's search query.";
const RESOURCE_NAME = "pixabay-image-gallery";
const OUTPUT_TEMPLATE_URI = "ui://widget/pixabay-image-gallery.html";
const WIDGET_DESCRIPTION =
  "Displays a responsive media gallery of Pixabay images and videos with captions, attribution, and links.";

const __dirname = dirname(fileURLToPath(new URL(import.meta.url)));
const WEB_DIST_DIR = resolvePath(__dirname, "../../web/dist");
const SCRIPT_FILENAME = "component.js";
const STYLE_FILENAME = "component.css";

const pixabayClient = new PixabayClient();

async function loadWidgetHtml(): Promise<string> {
  const [scriptSource, styleSource] = await Promise.all([
    readFileOrThrow(join(WEB_DIST_DIR, SCRIPT_FILENAME)),
    readFileOptional(join(WEB_DIST_DIR, STYLE_FILENAME)),
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

async function readFileOptional(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readFileOrThrow(path: string): Promise<string> {
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Missing build artifact at ${path}. Please run "npm run build" in app/web before starting the server.`
      );
    }
    throw error;
  }
}

function resolveLocale(meta: unknown): string {
  const defaultLocale = serverConfig.defaultLocale;
  if (meta && typeof meta === "object") {
    const locale =
      (meta as Record<string, unknown>)["openai/locale"] ??
      (meta as Record<string, unknown>)["webplus/i18n"];
    if (typeof locale === "string" && locale.length > 0) {
      return locale;
    }
  }
  return defaultLocale;
}

type StructuredContentArgs = {
  input: SearchImagesInput;
  imageResult?: Awaited<ReturnType<PixabayClient["searchImages"]>>;
  videoResult?: Awaited<ReturnType<PixabayClient["searchVideos"]>>;
};

function toStructuredContent({
  input,
  imageResult,
  videoResult,
}: StructuredContentArgs): MediaSearchStructuredContent {
  return {
    query: input.query,
    imageCount: imageResult?.results.length ?? 0,
    videoCount: videoResult?.results.length ?? 0,
    images: imageResult?.results ?? [],
    videos: videoResult?.results ?? [],
    attribution: "Media provided by Pixabay under the Pixabay License.",
  };
}

function normalizeQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return query;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed.trim() || query;
      }
      if (parsed && typeof parsed === "object") {
        const nestedQuery = (parsed as Record<string, unknown>).query;
        if (typeof nestedQuery === "string" && nestedQuery.trim().length > 0) {
          return nestedQuery.trim();
        }
      }
    } catch {
      // Ignore JSON parse failures and fall back to the original string
    }
  }

  return trimmed;
}

function ensureAcceptHeader(req: Request) {
  const acceptHeader = req.headers.accept ?? "";
  console.log("Original Accept header:", acceptHeader || "<none>");
  const tokens = acceptHeader
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  const required = ["application/json", "text/event-stream"];
  for (const value of required) {
    if (!tokens.includes(value)) {
      tokens.push(value);
    }
  }

  req.headers.accept = tokens.join(", ");
  console.log("Normalized Accept header:", req.headers.accept);
}

async function main() {
  const server = new McpServer({
    name: "pixabay-image-mcp",
    version: PACKAGE_VERSION,
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
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    })
  );

  server.registerTool(
    IMAGE_TOOL_NAME,
    {
      title: IMAGE_TOOL_TITLE,
      description: IMAGE_TOOL_DESCRIPTION,
      inputSchema: searchImagesInputSchema.shape,
      _meta: {
        "openai/outputTemplate": OUTPUT_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Searching Pixabay images…",
        "openai/toolInvocation/invoked": "Images ready.",
      },
    },
    async (rawInput, extra) => {
      const locale = resolveLocale(extra._meta);
      const parsed = searchImagesInputSchema.safeParse(rawInput);

      if (!parsed.success) {
        const errorMessage = parsed.error.issues
          .map((issue) => issue.message)
          .join("; ");
        throw new McpError(ErrorCode.InvalidParams, errorMessage);
      }

      const input = parsed.data;
      const normalizedInput: SearchImagesInput = {
        ...input,
        query: normalizeQuery(input.query),
      };

      const imageResult = await pixabayClient.searchImages(
        {
          ...normalizedInput,
          locale,
        },
        { signal: extra.signal }
      );

      const structuredContent = toStructuredContent({
        input: normalizedInput,
        imageResult,
      });

      const summary = buildSummary(structuredContent);

      const rateLimit: Record<string, unknown> = {};
      if (imageResult.rateLimit) {
        rateLimit.images = imageResult.rateLimit;
      }

      const totalHits: Record<string, unknown> = {
        images: imageResult.totalHits,
      };

      return {
        content: [
          {
            type: "text",
            text: summary,
          },
        ],
        structuredContent,
        _meta: {
          "openai/locale": locale,
          rateLimit,
          totalHits,
        },
      };
    }
  );

  server.registerTool(
    VIDEO_TOOL_NAME,
    {
      title: VIDEO_TOOL_TITLE,
      description: VIDEO_TOOL_DESCRIPTION,
      inputSchema: searchImagesInputSchema.shape,
      _meta: {
        "openai/outputTemplate": OUTPUT_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Searching Pixabay videos…",
        "openai/toolInvocation/invoked": "Videos ready.",
      },
    },
    async (rawInput, extra) => {
      const locale = resolveLocale(extra._meta);
      const parsed = searchImagesInputSchema.safeParse(rawInput);

      if (!parsed.success) {
        const errorMessage = parsed.error.issues
          .map((issue) => issue.message)
          .join("; ");
        throw new McpError(ErrorCode.InvalidParams, errorMessage);
      }

      const input = parsed.data;
      const normalizedInput: SearchImagesInput = {
        ...input,
        query: normalizeQuery(input.query),
      };

      const videoResult = await pixabayClient.searchVideos(
        {
          ...normalizedInput,
          locale,
        },
        { signal: extra.signal }
      );

      const structuredContent = toStructuredContent({
        input: normalizedInput,
        videoResult,
      });

      const summary = buildSummary(structuredContent);

      const rateLimit: Record<string, unknown> = {};
      if (videoResult.rateLimit) {
        rateLimit.videos = videoResult.rateLimit;
      }

      const totalHits: Record<string, unknown> = {
        videos: videoResult.totalHits,
      };

      return {
        content: [
          {
            type: "text",
            text: summary,
          },
        ],
        structuredContent,
        _meta: {
          "openai/locale": locale,
          rateLimit,
          totalHits,
        },
      };
    }
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.all("/mcp", async (req, res) => {
    try {
      ensureAcceptHeader(req);
      console.log("Request Accept header:", req.headers.accept);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Failed to handle MCP request:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ jsonrpc: "2.0", error: { code: -32603, message: "Server error" } });
      } else {
        res.end();
      }
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  const port = Number.parseInt(process.env.PORT ?? "3333", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  await new Promise<void>((resolve) => {
    app.listen(port, host, () => {
      const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      console.log(
        `Pixabay MCP server listening on http://${displayHost}:${port} (POST /mcp)`
      );
      console.log(
        `Use a tunnel (e.g. ngrok http ${port}) and provide https://<domain>.ngrok.app/mcp to ChatGPT.`
      );
      resolve();
    });
  });
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});

function buildSummary(content: MediaSearchStructuredContent): string {
  const { imageCount, videoCount, query } = content;

  const descriptors: string[] = [];
  if (imageCount > 0) {
    descriptors.push(`${imageCount} image${imageCount === 1 ? "" : "s"}`);
  }
  if (videoCount > 0) {
    descriptors.push(`${videoCount} video${videoCount === 1 ? "" : "s"}`);
  }

  if (descriptors.length > 0) {
    const joined =
      descriptors.length === 1
        ? descriptors[0]
        : `${descriptors.slice(0, -1).join(", ")} and ${descriptors.slice(-1)}`;
    return `Found ${joined} on Pixabay for "${query}".`;
  }

  return `No Pixabay media found for "${query}". Try a different description or add more detail.`;
}
