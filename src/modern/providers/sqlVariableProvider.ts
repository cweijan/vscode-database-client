import * as vscode from "vscode";

import type { StateStore } from "../core/contracts";
import type { ExtensionServices } from "../core/extensionServices";

interface SqlVariableEntry {
  readonly name: string;
  readonly value: string;
}

interface VariableCandidate {
  readonly name: string;
  readonly raw: string;
}

type VariableMap = Record<string, Record<string, string>>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nameCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/.test(value);
}

function variableName(source: string, start: number): string {
  if (!/[A-Za-z_]/.test(source[start] || "")) return "";
  let end = start + 1;
  while (end < source.length && nameCharacter(source[end])) end += 1;
  return source.slice(start, end);
}

export function extractSqlVariables(
  source: string,
  indicators: readonly string[] = [":", "$"],
): VariableCandidate[] {
  const candidates: VariableCandidate[] = [];
  const seen = new Set<string>();
  const indicatorSet = new Set(indicators.filter((item) => item.length === 1));
  let quote: "'" | '"' | "`" | undefined;
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      if (character === quote && next === quote) {
        index += 2;
        continue;
      }
      if (character === quote) quote = undefined;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      index += 1;
      continue;
    }
    if (character === "-" && next === "-") {
      const lineEnd = source.indexOf("\n", index + 2);
      index = lineEnd < 0 ? source.length : lineEnd + 1;
      continue;
    }
    if (character === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd < 0 ? source.length : commentEnd + 2;
      continue;
    }

    if (character === "$" && indicatorSet.has("$")) {
      if (next === "$") {
        index += 2;
        continue;
      }
      if (next === "{") {
        const end = source.indexOf("}", index + 2);
        const name = end < 0 ? "" : variableName(source, index + 2);
        if (name && end === index + name.length + 2 && !seen.has(name)) {
          candidates.push({ name, raw: source.slice(index, end + 1) });
          seen.add(name);
        }
        index = end < 0 ? index + 1 : end + 1;
        continue;
      }
    }
    if (indicatorSet.has(character)) {
      const name = variableName(source, index + 1);
      const previous = source[index - 1];
      if (name && previous !== character && !seen.has(name)) {
        candidates.push({ name, raw: source.slice(index, index + name.length + 1) });
        seen.add(name);
        index += name.length + 1;
        continue;
      }
    }
    index += 1;
  }
  return candidates;
}

function scopeFor(document?: vscode.TextDocument): string {
  return document?.uri.fsPath || "global";
}

function safeVariableMap(value: unknown): VariableMap {
  const result: VariableMap = {};
  for (const [scope, values] of Object.entries(record(value))) {
    const map = record(values);
    const strings: Record<string, string> = {};
    for (const [name, item] of Object.entries(map)) {
      if (typeof item === "string") strings[name] = item;
    }
    result[scope] = strings;
  }
  return result;
}

function sqlLiteral(value: string): string {
  if (/^\w+(?:\(|\[)/i.test(value) || /^'[^']+'$/.test(value)) return value;
  return value
    .split(",")
    .map((item) => `'${item.replaceAll("'", "''")}'`)
    .join(",");
}

export class SqlVariableService {
  private readonly listeners = new Set<(scope: string) => void>();

  public constructor(private readonly state: StateStore) {}

  public onChanged(listener: (scope: string) => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  public get(name: string, document?: vscode.TextDocument): string | undefined {
    const scope = scopeFor(document);
    const values = safeVariableMap(this.state.get("sql.variables", {}));
    return values[scope]?.[name] ?? values.global?.[name];
  }

  public getEntries(
    names: readonly string[],
    document?: vscode.TextDocument,
  ): SqlVariableEntry[] {
    return [...new Set(names)].map((name) => ({
      name,
      value: this.get(name, document) || "",
    }));
  }

  public async set(
    name: string,
    value: string,
    document?: vscode.TextDocument,
  ): Promise<void> {
    const scope = scopeFor(document);
    const values = safeVariableMap(this.state.get("sql.variables", {}));
    values[scope] = { ...(values[scope] || {}), [name]: value };
    await this.state.update("sql.variables", values);
    for (const listener of this.listeners) listener(scope);
  }

  public async resolve(
    source: string,
    document?: vscode.TextDocument,
  ): Promise<string> {
    const enabled = vscode.workspace
      .getConfiguration("database-client")
      .get<boolean>("enableSQLVariable", true);
    if (!enabled) return source;
    const indicators = configuredVariableIndicators();
    const candidates = extractSqlVariables(source, indicators);
    let resolved = source;
    for (const candidate of candidates) {
      let value = vscode.workspace
        .getConfiguration("database-client")
        .get<boolean>("rememberSQLVariables", true)
        ? this.get(candidate.name, document)?.replace(/^'|'$/g, "")
        : undefined;
      if (!value) {
        value = await vscode.window.showInputBox({
          title: candidate.name,
          placeHolder: `Please enter a value for the variable ${candidate.name}.`,
          ignoreFocusOut: true,
          prompt: "Strings are quoted automatically unless you provide a SQL expression.",
        });
      }
      if (value == null) throw new Error(`Value for SQL variable ${candidate.name} was cancelled`);
      const literal = sqlLiteral(value);
      if (vscode.workspace
        .getConfiguration("database-client")
        .get<boolean>("rememberSQLVariables", true)) {
        await this.set(candidate.name, literal, document);
      }
      resolved = resolved.split(candidate.raw).join(literal);
    }
    return resolved;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
}

function configuredVariableIndicators(): readonly string[] {
  const configured = vscode.workspace
    .getConfiguration("database-client")
    .get<unknown>("variableIndicator");
  const indicators = Array.isArray(configured)
    ? configured.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  return indicators.length > 0 ? indicators : [":", "$"];
}

function editorValue(value: unknown): vscode.TextEditor | undefined {
  const candidate = record(value);
  const document = candidate.document;
  return document && typeof (document as { getText?: unknown }).getText === "function"
    ? value as vscode.TextEditor
    : undefined;
}

export class SqlVariableConfigProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public readonly viewType = "dbclinet.variable.config.view";
  private readonly subscription: vscode.Disposable;
  private webview?: vscode.Webview;
  private currentDocument?: vscode.TextDocument;
  private entries: SqlVariableEntry[] = [];

  public constructor(
    private readonly services: ExtensionServices,
    private readonly variables: SqlVariableService,
  ) {
    this.subscription = variables.onChanged((scope) => {
      if (scope === scopeFor(this.currentDocument)) this.refreshView();
    });
  }

  public register(): vscode.Disposable {
    return vscode.window.registerWebviewViewProvider(this.viewType, this);
  }

  public display(source?: unknown, editor?: unknown): void {
    const activeEditor = editorValue(editor) || vscode.window.activeTextEditor;
    this.currentDocument = activeEditor?.document;
    const text = typeof source === "string"
      ? source
      : activeEditor?.document.getText() || "";
    const indicators = configuredVariableIndicators();
    this.entries = this.variables.getEntries(
      extractSqlVariables(text, indicators).map((item) => item.name),
      this.currentDocument,
    );
    void vscode.commands.executeCommand("setContext", "showSQLVariableConfig", this.entries.length > 0);
    this.refreshView();
    if (this.entries.length > 0) {
      void vscode.commands.executeCommand("dbclinet.variable.config.view.focus");
    }
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.webview = view.webview;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: unknown) => {
      const payload = record(message);
      if (payload.type === "variableChanged" && typeof payload.name === "string") {
        void this.variables.set(String(payload.name), String(payload.value || ""), this.currentDocument)
          .then(() => this.refreshView());
      }
      if (payload.type === "close") {
        void vscode.commands.executeCommand("setContext", "showSQLVariableConfig", false);
        void vscode.commands.executeCommand("workbench.action.closePanel");
      }
    });
    this.refreshView();
  }

  public dispose(): void {
    this.subscription.dispose();
    this.webview = undefined;
  }

  private refreshView(): void {
    if (!this.webview) return;
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const values = JSON.stringify(this.entries).replace(/</g, "\\u003c");
    const scope = escapeHtml(this.currentDocument?.uri.fsPath || "Global");
    const rows = this.entries.map((entry) => `
      <label class="variable">
        <span>${escapeHtml(entry.name)}</span>
        <input data-name="${escapeHtml(entry.name)}" value="${escapeHtml(entry.value)}" />
      </label>`).join("");
    this.webview.html = `<!doctype html><html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.webview.cspSource}; script-src 'nonce-${nonce}';">
      <style>body{font-family:var(--vscode-font-family);padding:8px}.variable{display:grid;gap:4px;margin:10px 0}.variable span{color:var(--vscode-descriptionForeground)}input{color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:4px}.empty{color:var(--vscode-descriptionForeground)}</style>
      </head><body><h3>${scope}</h3>${rows || '<p class="empty">No SQL variables in the active statement.</p>'}
      <button id="close">Close</button><script nonce="${nonce}">
      const api=acquireVsCodeApi();const values=${values};
      for(const input of document.querySelectorAll('input[data-name]')) input.addEventListener('change',()=>api.postMessage({type:'variableChanged',name:input.dataset.name,value:input.value}));
      document.getElementById('close')?.addEventListener('click',()=>api.postMessage({type:'close'}));
      </script></body></html>`;
  }
}

export function registerModernSqlVariables(
  services: ExtensionServices,
): vscode.Disposable[] {
  const provider = new SqlVariableConfigProvider(services, services.sqlVariables);
  return [
    provider,
    provider.register(),
    vscode.commands.registerCommand(
      "mysql.variable.config.display",
      (source: unknown, editor: unknown) => provider.display(source, editor),
    ),
  ];
}

export { sqlLiteral, scopeFor };
