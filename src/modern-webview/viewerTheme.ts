import { computed, ref, type ComputedRef, type Ref } from "vue";

const STORAGE_KEY = "data-viewer-theme";
const themeMode = ref<"light" | "dark">(readStoredTheme());

function readStoredTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * Mirrors the target data viewer theme store: the surface renders with
 * `data-viewer--light` / `data-viewer--dark` and the choice is remembered.
 */
export function useViewerTheme(): {
  themeMode: Ref<"light" | "dark">;
  isLightTheme: ComputedRef<boolean>;
  viewerThemeClass: ComputedRef<string>;
  viewerThemeLabel: ComputedRef<string>;
  setTheme: (mode: "light" | "dark") => void;
  toggleTheme: () => void;
} {
  const isLightTheme = computed(() => themeMode.value === "light");
  const viewerThemeClass = computed(() =>
    isLightTheme.value ? "data-viewer--light" : "data-viewer--dark");
  const viewerThemeLabel = computed(() =>
    isLightTheme.value ? "Theme: Light" : "Theme: Dark");

  function setTheme(mode: "light" | "dark"): void {
    themeMode.value = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage is unavailable in some webview hosts; the in-memory mode still applies.
    }
  }

  function toggleTheme(): void {
    setTheme(isLightTheme.value ? "dark" : "light");
  }

  return { themeMode, isLightTheme, viewerThemeClass, viewerThemeLabel, setTheme, toggleTheme };
}

/** Convenience accessor for pages that only need the class name. */
export function readViewerThemeClass(): ComputedRef<string> {
  return useViewerTheme().viewerThemeClass;
}
