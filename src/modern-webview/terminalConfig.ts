import type { ITheme, Terminal } from "@xterm/xterm";

export type TerminalCursorStyle = "line" | "block" | "underline";
export type TerminalTheme = "Auto" | "Arthur" | "Dracula" | "OneDark" | "Ubuntu" | "Xterm";

export interface TerminalSettings {
  readonly scrollback: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly cursorStyle: TerminalCursorStyle;
  readonly cursorBlinking: boolean;
  readonly terminalTheme: TerminalTheme;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  scrollback: 1000,
  fontSize: 12,
  lineHeight: 1,
  cursorStyle: "line",
  cursorBlinking: true,
  terminalTheme: "Auto",
};

interface TerminalConfiguration {
  readonly fontSize?: unknown;
  readonly fontFamily?: unknown;
  readonly lineHeight?: unknown;
  readonly cursorStyle?: unknown;
  readonly cursorBlinking?: unknown;
  readonly scrollback?: unknown;
  readonly terminalTheme?: unknown;
}

function record(value: unknown): TerminalConfiguration {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as TerminalConfiguration
    : {};
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function cursorStyle(value: unknown): "bar" | "block" | "underline" | undefined {
  if (value === "line" || value === "bar") return "bar";
  if (value === "block" || value === "underline") return value;
  return undefined;
}

function terminalThemeName(value: unknown): TerminalTheme | undefined {
  return ["Auto", "Arthur", "Dracula", "OneDark", "Ubuntu", "Xterm"].includes(value as string)
    ? value as TerminalTheme
    : undefined;
}

export function readTerminalSettings(
  content: unknown,
  fallback: TerminalSettings = DEFAULT_TERMINAL_SETTINGS,
): TerminalSettings {
  const config = record(content);
  const scrollback = finiteNumber(config.scrollback);
  const fontSize = finiteNumber(config.fontSize);
  const lineHeight = finiteNumber(config.lineHeight);
  return {
    scrollback: scrollback !== undefined && scrollback >= 0 ? Math.trunc(scrollback) : fallback.scrollback,
    fontSize: fontSize !== undefined && fontSize >= 8 && fontSize <= 32 ? fontSize : fallback.fontSize,
    lineHeight: lineHeight !== undefined && lineHeight >= 1 && lineHeight <= 2 ? lineHeight : fallback.lineHeight,
    cursorStyle: config.cursorStyle === "line" || config.cursorStyle === "block" || config.cursorStyle === "underline"
      ? config.cursorStyle
      : fallback.cursorStyle,
    cursorBlinking: typeof config.cursorBlinking === "boolean"
      ? config.cursorBlinking
      : fallback.cursorBlinking,
    terminalTheme: terminalThemeName(config.terminalTheme) || fallback.terminalTheme,
  };
}

const fixedThemes: Readonly<Partial<Record<Exclude<TerminalTheme, "Auto">, ITheme>>> = {
  Arthur: { foreground: "#C5C8C6", background: "#161719", cursor: "#D0D0D0" },
  Dracula: { foreground: "#F8F8F2", background: "#282A36", cursor: "#bbbbbb", selectionBackground: "#44475A" },
  OneDark: { foreground: "#abb2bf", background: "#282c34", cursor: "#bbbbbb", selectionBackground: "#abb2bf30" },
  Ubuntu: { foreground: "#eeeeec", background: "#300a24", cursor: "#bbbbbb" },
  Xterm: { foreground: "#f8f8f8", background: "#000000", cursor: "#f8f8f8" },
};

function cssVariable(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document.documentElement.style.getPropertyValue(name).trim();
  return value || undefined;
}

function autoTheme(): ITheme {
  return {
    cursor: cssVariable("--vscode-terminalCursor-foreground") || cssVariable("--vscode-editor-foreground"),
    foreground: cssVariable("--vscode-terminal-foreground"),
    background: cssVariable("--vscode-editor-background"),
    black: cssVariable("--vscode-terminal-ansiBlack"),
    brightBlack: cssVariable("--vscode-terminal-ansiBrightBlack"),
    blue: cssVariable("--vscode-terminal-ansiBlue"),
    brightBlue: cssVariable("--vscode-terminal-ansiBrightBlue"),
    green: cssVariable("--vscode-terminal-ansiGreen"),
    brightGreen: cssVariable("--vscode-terminal-ansiBrightGreen"),
    red: cssVariable("--vscode-terminal-ansiRed"),
    brightRed: cssVariable("--vscode-terminal-ansiBrightRed"),
    cyan: cssVariable("--vscode-terminal-ansiCyan"),
    brightCyan: cssVariable("--vscode-terminal-ansiBrightCyan"),
    magenta: cssVariable("--vscode-terminal-ansiMagenta"),
    brightMagenta: cssVariable("--vscode-terminal-ansiBrightMagenta"),
    yellow: cssVariable("--vscode-terminal-ansiYellow"),
    brightYellow: cssVariable("--vscode-terminal-ansiBrightYellow"),
    white: cssVariable("--vscode-terminal-ansiWhite"),
    brightWhite: cssVariable("--vscode-terminal-ansiBrightWhite"),
    selectionBackground: cssVariable("--vscode-editor-selectionBackground"),
  };
}

function applyTerminalTheme(terminal: Terminal, value: unknown): void {
  const theme = terminalThemeName(value);
  if (!theme) return;
  terminal.options.theme = theme === "Auto" ? autoTheme() : fixedThemes[theme];
}

export function applyTerminalConfiguration(
  terminal: Terminal | undefined,
  content: unknown,
): void {
  if (!terminal) return;
  const config = record(content);
  const fontSize = finiteNumber(config.fontSize);
  if (fontSize !== undefined && fontSize > 0) terminal.options.fontSize = fontSize;
  if (typeof config.fontFamily === "string" && config.fontFamily.trim()) {
    terminal.options.fontFamily = config.fontFamily;
  }
  const lineHeight = finiteNumber(config.lineHeight);
  if (lineHeight !== undefined && lineHeight > 0) terminal.options.lineHeight = lineHeight;
  const style = cursorStyle(config.cursorStyle);
  if (style) terminal.options.cursorStyle = style;
  if (typeof config.cursorBlinking === "boolean") terminal.options.cursorBlink = config.cursorBlinking;
  const scrollback = finiteNumber(config.scrollback);
  if (scrollback !== undefined && scrollback >= 0) terminal.options.scrollback = Math.trunc(scrollback);
  applyTerminalTheme(terminal, config.terminalTheme);
}
