import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { serverConfig } from "./config.js";
import {
  ImageSearchStructuredContent,
  SearchImagesInput,
  searchImagesInputSchema,
} from "./schemas.js";
import { PixabayClient } from "./pixabay.js";

const PACKAGE_VERSION = "0.1.0";
const TOOL_NAME = "search_pixabay_images";
const TOOL_TITLE = "Search Pixabay Images";
const TOOL_DESCRIPTION =
  "Finds royalty-free images from Pixabay that match the user's search query.";
const RESOURCE_NAME = "pixabay-image-gallery";
const OUTPUT_TEMPLATE_URI = "ui://widget/pixabay-image-gallery.html";
const WIDGET_DESCRIPTION =
  "Displays a responsive grid of Pixabay images with captions, attribution, and links.";

const __dirname = dirname(fileURLToPath(new URL(import.meta.url)));
const WEB_DIST_DIR = resolvePath(__dirname, "../web/dist");
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

function toStructuredContent(
  input: SearchImagesInput,
  result: Awaited<ReturnType<PixabayClient["searchImages"]>>
): ImageSearchStructuredContent {
  return {
    query: input.query,
    resultCount: result.results.length,
    results: result.results,
    attribution: "Images provided by Pixabay under the Pixabay License.",
  };
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
    TOOL_NAME,
    {
      title: TOOL_TITLE,
      description: TOOL_DESCRIPTION,
      inputSchema: searchImagesInputSchema.shape,
      _meta: {
        "openai/outputTemplate": OUTPUT_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Searching Pixabay…",
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
        throw new McpError("InvalidParams", errorMessage);
      }

      const input = parsed.data;

      const searchResult = await pixabayClient.searchImages(
        {
          ...input,
          locale,
        },
        { signal: extra.signal }
      );

      const structuredContent = toStructuredContent(input, searchResult);

      const summary =
        structuredContent.resultCount > 0
          ? `Found ${structuredContent.resultCount} Pixabay image${
              structuredContent.resultCount === 1 ? "" : "s"
            } for "${structuredContent.query}".`
          : `No Pixabay images found for "${structuredContent.query}". Try a different description or add more detail.`;

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
          rateLimit: searchResult.rateLimit,
        },
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
