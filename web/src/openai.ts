import type { SetStateAction } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ImageSearchStructuredContent,
  SearchImagesInput,
  WidgetState,
} from "./types.js";

export type DisplayMode = "pip" | "inline" | "fullscreen";
export type Theme = "light" | "dark";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeArea = {
  insets: SafeAreaInsets;
};

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type UserAgent = {
  device: { type: DeviceType };
  capabilities: {
    hover: boolean;
    touch: boolean;
  };
};

type WidgetGlobals = {
  theme: Theme;
  userAgent: UserAgent;
  locale: string;
  maxHeight: number;
  displayMode: DisplayMode;
  safeArea: SafeArea;
  toolInput: SearchImagesInput | null;
  toolOutput: ImageSearchStructuredContent | null;
  toolResponseMetadata: Record<string, unknown> | null;
  widgetState: WidgetState | null;
};

type CallToolResponse = {
  content: unknown;
  structuredContent: unknown;
};

export type OpenAiApi = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResponse>;
  sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
  openExternal: (payload: { href: string }) => void;
  requestDisplayMode: (args: { mode: DisplayMode }) => Promise<{ mode: DisplayMode }>;
  setWidgetState: (state: WidgetState | null) => Promise<void>;
} & WidgetGlobals;

export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";

type SetGlobalsEvent = CustomEvent<{
  globals: Partial<WidgetGlobals>;
}>;

declare global {
  interface Window {
    openai: OpenAiApi | undefined;
  }
}

const defaultGlobals: WidgetGlobals = {
  theme: "light",
  userAgent: { device: { type: "unknown" }, capabilities: { hover: false, touch: true } },
  locale: "en",
  maxHeight: 600,
  displayMode: "inline",
  safeArea: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  toolInput: null,
  toolOutput: null,
  toolResponseMetadata: null,
  widgetState: null,
};

function getOpenAi(): OpenAiApi {
  if (!window.openai) {
    throw new Error("window.openai is unavailable. Ensure you're running inside ChatGPT.");
  }
  return window.openai;
}

function readGlobal<K extends keyof WidgetGlobals>(key: K): WidgetGlobals[K] {
  const openai = window.openai;
  if (!openai) {
    return defaultGlobals[key];
  }
  return (openai[key] as WidgetGlobals[K]) ?? defaultGlobals[key];
}

export function useOpenAiGlobal<K extends keyof WidgetGlobals>(
  key: K
): WidgetGlobals[K] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = (event: Event) => {
        const detail = (event as SetGlobalsEvent).detail;
        if (!detail?.globals) return;
        if (detail.globals[key] !== undefined) {
          onStoreChange();
        }
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handler, { passive: true });
      return () => {
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handler as EventListener);
      };
    },
    [key]
  );

  const getSnapshot = useCallback(() => readGlobal(key), [key]);

  return useSyncExternalStore(subscribe, getSnapshot, () => defaultGlobals[key]);
}

export function useToolOutput(): ImageSearchStructuredContent | null {
  return useOpenAiGlobal("toolOutput");
}

export function useWidgetState(): readonly [
  WidgetState | null,
  (state: SetStateAction<WidgetState | null>) => void,
] {
  const stateFromHost = useOpenAiGlobal("widgetState");
  const openai = useMemo(() => {
    try {
      return getOpenAi();
    } catch (error) {
      console.warn(error);
      return undefined;
    }
  }, []);

  const [widgetState, setWidgetStateLocal] = useState<WidgetState | null>(
    stateFromHost
  );

  useEffect(() => {
    setWidgetStateLocal(stateFromHost);
  }, [stateFromHost]);

  const setState = useCallback(
    (next: SetStateAction<WidgetState | null>) => {
      setWidgetStateLocal((prev) => {
        const nextState = typeof next === "function" ? next(prev) : next;
        if (openai) {
          void openai.setWidgetState(nextState);
        }
        return nextState;
      });
    },
    [openai]
  );

  return [widgetState, setState] as const;
}

export function resetWidgetState() {
  const openai = getOpenAi();
  void openai.setWidgetState(null);
}

export function openExternalLink(href: string) {
  const openai = getOpenAi();
  openai.openExternal({ href });
}

export function requestFullscreen() {
  const openai = getOpenAi();
  return openai.requestDisplayMode({ mode: "fullscreen" });
}

export function getLocale() {
  return readGlobal("locale");
}
