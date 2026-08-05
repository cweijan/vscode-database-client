import type { PersistedWebviewState } from "./state";

export interface WebviewBootstrap {
  readonly route?: string;
  readonly language: string;
  readonly appName?: string;
  readonly state: PersistedWebviewState;
  readonly config: Readonly<Record<string, unknown>>;
}

function parseBootstrapValue(value: string | undefined): WebviewBootstrapConfig {
  if (!value || value === "{{configs}}") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as WebviewBootstrapConfig)
      : {};
  } catch {
    return {};
  }
}

export function readWebviewBootstrap(
  documentLike: Pick<Document, "getElementById"> = document,
): WebviewBootstrap {
  const configElement = documentLike.getElementById("dbclient-configs");
  const rawConfig = configElement?.getAttribute("data-config") ?? undefined;
  const parsed = parseBootstrapValue(rawConfig);
  const state = parsed.state;

  return {
    route: parsed.route,
    language: parsed.language ?? "en",
    appName: parsed.appName,
    state:
      state && typeof state === "object"
        ? (state as PersistedWebviewState)
        : {},
    config:
      parsed.config && typeof parsed.config === "object" ? parsed.config : {},
  };
}
