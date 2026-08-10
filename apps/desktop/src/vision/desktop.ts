import type { CaptureFrame, CaptureWindow, OverlayPayload } from "./types.ts";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export type DecisionLogStatus = {
  path: string;
  storage: "portable" | "app-log";
  exists: boolean;
  sizeBytes: number;
};

export const isDesktopRuntime = (): boolean =>
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

export const listCaptureWindows = async (): Promise<CaptureWindow[]> => {
  if (!isDesktopRuntime()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CaptureWindow[]>("list_capture_windows");
};

export const captureWindow = async (key: string): Promise<CaptureFrame> => {
  if (!isDesktopRuntime()) {
    throw new Error(
      "La capture de fenêtre est disponible dans l’application desktop.",
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CaptureFrame>("capture_window", { key });
};

export const initializeDecisionLogFile =
  async (): Promise<DecisionLogStatus | null> => {
    if (!isDesktopRuntime()) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<DecisionLogStatus>("initialize_decision_log");
  };

export const appendDecisionLogLine = async (
  line: string,
): Promise<DecisionLogStatus | null> => {
  if (!isDesktopRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DecisionLogStatus>("append_decision_log", { line });
};

export const decisionLogStatus =
  async (): Promise<DecisionLogStatus | null> => {
    if (!isDesktopRuntime()) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<DecisionLogStatus>("decision_log_status");
  };

export const readDecisionLogFile = async (): Promise<string | null> => {
  if (!isDesktopRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("read_decision_log");
};

export const clearDecisionLogFile =
  async (): Promise<DecisionLogStatus | null> => {
    if (!isDesktopRuntime()) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<DecisionLogStatus>("clear_decision_log");
  };

export const openDecisionLogFolder = async (): Promise<void> => {
  if (!isDesktopRuntime()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_decision_log_folder");
};

export const syncOverlayWindow = async (
  frame: CaptureFrame,
  visible: boolean,
  geometry: {
    offsetX: number;
    offsetY: number;
    widthDelta: number;
    heightDelta: number;
  } = {
    offsetX: 0,
    offsetY: 0,
    widthDelta: 0,
    heightDelta: 0,
  },
): Promise<void> => {
  if (!isDesktopRuntime()) return;
  const { PhysicalPosition, PhysicalSize } =
    await import("@tauri-apps/api/dpi");
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const overlay = await WebviewWindow.getByLabel("vision-overlay");
  if (!overlay) return;

  if (!visible) {
    await overlay.hide();
    return;
  }

  await overlay.setPosition(
    new PhysicalPosition(
      frame.window.x + geometry.offsetX,
      frame.window.y + geometry.offsetY,
    ),
  );
  await overlay.setSize(
    new PhysicalSize(
      Math.max(1, frame.window.width + geometry.widthDelta),
      Math.max(1, frame.window.height + geometry.heightDelta),
    ),
  );
  await overlay.setIgnoreCursorEvents(true);
  await overlay.setAlwaysOnTop(true);
  await overlay.show();
};

export const publishOverlay = async (
  payload: OverlayPayload,
): Promise<void> => {
  if (!isDesktopRuntime()) return;
  const { emitTo } = await import("@tauri-apps/api/event");
  await emitTo("vision-overlay", "grand-live-vision-overlay", payload);
};

export const hideOverlay = async (): Promise<void> => {
  if (!isDesktopRuntime()) return;
  await publishOverlay({
    language: "fr",
    visible: false,
    loading: false,
    page: "unknown",
    headline: "",
    summary: "",
    path: [],
    overrideActive: false,
    confidence: 0,
    boxes: [],
    tokenValues: [],
  });
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const overlay = await WebviewWindow.getByLabel("vision-overlay");
  await overlay?.hide();
};

export const registerCaptureHotkey = async (
  shortcut: string,
  handler: () => void,
): Promise<() => Promise<void>> => {
  if (!isDesktopRuntime()) return async () => undefined;
  const { isRegistered, register, unregister } =
    await import("@tauri-apps/plugin-global-shortcut");
  if (await isRegistered(shortcut)) {
    await unregister(shortcut);
  }
  await register(shortcut, (event) => {
    if (event.state === "Pressed") handler();
  });
  return async () => {
    if (await isRegistered(shortcut)) {
      await unregister(shortcut);
    }
  };
};
