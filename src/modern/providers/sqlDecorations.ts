import * as vscode from "vscode";

import type { ActiveConnectionStore } from "../core/activeConnection";
import { parseSqlBlocks, type SqlBlock } from "./sqlDocumentModel";
import type { QueryResult } from "../database/types";

interface DecorationState {
  readonly success: vscode.DecorationOptions[];
  readonly failure: vscode.DecorationOptions[];
  readonly result: vscode.DecorationOptions[];
  readonly block: vscode.Range[];
  readonly insert: vscode.Range[];
  readonly connectionLabel: vscode.DecorationOptions[];
}

interface TextRange {
  readonly start: number;
  readonly end: number;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function blockForSource(
  document: vscode.TextDocument,
  source: string,
): SqlBlock | undefined {
  const normalized = source.trim();
  return parseSqlBlocks(document.getText()).find((block) =>
    block.text.trim() === normalized || block.text.includes(normalized),
  );
}

function stateForRange(
  document: vscode.TextDocument,
  block: SqlBlock,
): { readonly start: vscode.Position; readonly end: vscode.Position; readonly range: vscode.Range } {
  const start = document.positionAt(block.start);
  const end = document.positionAt(block.end);
  return { start, end, range: new vscode.Range(start, end) };
}

function findKeyword(source: string, keyword: string, start: number): number {
  let quote: "'" | '"' | undefined;
  for (let index = start; index <= source.length - keyword.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (
      source.slice(index, index + keyword.length).toLocaleUpperCase() === keyword &&
      !/[A-Za-z0-9_$]/.test(source[index - 1] || "") &&
      !/[A-Za-z0-9_$]/.test(source[index + keyword.length] || "")
    ) {
      return index;
    }
  }
  return -1;
}

function matchingParenthesis(source: string, opening: number): number {
  let depth = 0;
  let quote: "'" | '"' | undefined;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitInsertValues(source: string, opening: number, closing: number): TextRange[] {
  const ranges: TextRange[] = [];
  let start = opening + 1;
  let depth = 0;
  let quote: "'" | '"' | undefined;
  const append = (end: number): void => {
    const value = source.slice(start, end);
    const leading = value.search(/\S/);
    if (leading >= 0) {
      const trailing = value.trimEnd().length;
      ranges.push({ start: start + leading, end: start + trailing });
    }
  };
  for (let index = opening + 1; index < closing; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    } else if (character === "," && depth === 0) {
      append(index);
      start = index + 1;
    }
  }
  append(closing);
  return ranges;
}

function insertCounterpartRange(
  document: vscode.TextDocument,
  block: SqlBlock,
  offset: number,
): vscode.Range | undefined {
  if (!/^INSERT\b/i.test(block.text.trim())) return undefined;
  const valuesKeyword = findKeyword(block.text, "VALUES", 0);
  if (valuesKeyword < 0) return undefined;
  const columnOpening = block.text.indexOf("(");
  if (columnOpening < 0 || columnOpening > valuesKeyword) return undefined;
  const columnClosing = matchingParenthesis(block.text, columnOpening);
  const valueOpening = block.text.indexOf("(", valuesKeyword + "VALUES".length);
  if (columnClosing < 0 || valueOpening < 0) return undefined;
  const valueClosing = matchingParenthesis(block.text, valueOpening);
  if (valueClosing < 0) return undefined;
  const columns = splitInsertValues(block.text, columnOpening, columnClosing);
  const values = splitInsertValues(block.text, valueOpening, valueClosing);
  const columnIndex = columns.findIndex((range) => {
    const absoluteStart = block.start + range.start;
    const absoluteEnd = block.start + range.end;
    return offset >= absoluteStart && offset <= absoluteEnd;
  });
  if (columnIndex >= 0 && values[columnIndex]) {
    const range = values[columnIndex];
    return new vscode.Range(
      document.positionAt(block.start + range.start),
      document.positionAt(block.start + range.end),
    );
  }
  const valueIndex = values.findIndex((range) => {
    const absoluteStart = block.start + range.start;
    const absoluteEnd = block.start + range.end;
    return offset >= absoluteStart && offset <= absoluteEnd;
  });
  if (valueIndex >= 0 && columns[valueIndex]) {
    const range = columns[valueIndex];
    return new vscode.Range(
      document.positionAt(block.start + range.start),
      document.positionAt(block.start + range.end),
    );
  }
  return undefined;
}

export class ModernSqlDecorations implements vscode.Disposable {
  private readonly sqlHighlight = vscode.window.createTextEditorDecorationType({
    light: { backgroundColor: "#5B8DDE20" },
    dark: { backgroundColor: "#0AAAF420" },
  });
  private readonly sqlErrorHighlight = vscode.window.createTextEditorDecorationType({
    light: { backgroundColor: "#de5b6220" },
    dark: { backgroundColor: "#f40a2d20" },
  });
  private readonly success = vscode.window.createTextEditorDecorationType({
    after: { contentText: "✓", color: new vscode.ThemeColor("terminal.ansiGreen") },
  });
  private readonly failure = vscode.window.createTextEditorDecorationType({
    after: { contentText: "✕", color: new vscode.ThemeColor("terminal.ansiRed") },
  });
  private readonly results = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
  });
  private readonly insertValueHighlight = vscode.window.createTextEditorDecorationType({
    light: { backgroundColor: "rgba(200, 200, 200, 0.3)" },
    dark: { backgroundColor: "rgba(100, 100, 100, 0.3)" },
    isWholeLine: false,
  });
  private readonly connectionLabel = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
  });
  private readonly states = new Map<string, DecorationState>();
  private readonly subscriptions: vscode.Disposable[];

  public constructor(private readonly activeConnection?: ActiveConnectionStore) {
    this.subscriptions = [
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.updateBlockHighlight(event.textEditor);
        this.updateInsertHighlight(event.textEditor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length === 0) return;
        if (event.document.languageId === "sql") {
          this.clear(event.document);
        }
        if (this.isSupportedDocument(event.document) && event.contentChanges.some(
          (change) => change.range.start.line === 0,
        )) {
          this.updateConnectionState(event.document);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.updateConnectionState(editor.document);
          this.updateBlockHighlight(editor);
          this.updateInsertHighlight(editor);
        }
      }),
    ];
    const active = vscode.window.activeTextEditor;
    if (active) {
      this.updateConnectionState(active.document);
      this.updateBlockHighlight(active);
      this.updateInsertHighlight(active);
    }
  }

  public recordSuccess(
    document: vscode.TextDocument | undefined,
    source: string,
    result: QueryResult<unknown>,
  ): void {
    if (!document || document.languageId !== "sql") return;
    const block = blockForSource(document, source);
    if (!block) return;
    const positions = stateForRange(document, block);
    const resultText = result.affectedRows === undefined
      ? "Executed"
      : `Executed · AffectedRows: ${result.affectedRows}`;
    this.states.set(document.uri.toString(), {
      success: [{ range: new vscode.Range(positions.start, positions.start) }],
      failure: [],
      result: [{
        range: positions.range,
        renderOptions: {
          after: {
            contentText: resultText,
            color: new vscode.ThemeColor("terminal.ansiBlue"),
            margin: "0 0 0 14px",
          },
        },
      }],
      block: this.states.get(document.uri.toString())?.block || [],
      insert: this.states.get(document.uri.toString())?.insert || [],
      connectionLabel: this.states.get(document.uri.toString())?.connectionLabel || [],
    });
    this.applyToDocument(document);
  }

  public recordFailure(
    document: vscode.TextDocument | undefined,
    source: string,
    error: unknown,
  ): void {
    if (!document || document.languageId !== "sql") return;
    const block = blockForSource(document, source);
    if (!block) return;
    const positions = stateForRange(document, block);
    this.states.set(document.uri.toString(), {
      success: [],
      failure: [{
        range: new vscode.Range(positions.start, positions.start),
        renderOptions: {
          after: {
            contentText: errorText(error),
            color: new vscode.ThemeColor("terminal.ansiRed"),
            margin: "0 0 0 12px",
          },
        },
      }],
      result: [],
      block: this.states.get(document.uri.toString())?.block || [],
      insert: this.states.get(document.uri.toString())?.insert || [],
      connectionLabel: this.states.get(document.uri.toString())?.connectionLabel || [],
    });
    this.applyToDocument(document);
  }

  public clear(document: vscode.TextDocument): void {
    this.states.delete(document.uri.toString());
    this.applyToDocument(document);
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.sqlHighlight.dispose();
    this.sqlErrorHighlight.dispose();
    this.success.dispose();
    this.failure.dispose();
    this.results.dispose();
    this.insertValueHighlight.dispose();
    this.connectionLabel.dispose();
    this.states.clear();
  }

  private updateBlockHighlight(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== "sql") return;
    const enabled = vscode.workspace
      .getConfiguration("database-client")
      .get<boolean>("highlightSQLBlock", true);
    if (!enabled) {
      editor.setDecorations(this.sqlHighlight, []);
      return;
    }
    const offset = editor.document.offsetAt(editor.selection.active);
    const block = parseSqlBlocks(editor.document.getText()).find(
      (candidate) => offset >= candidate.start && offset <= candidate.end,
    );
    const key = editor.document.uri.toString();
    const previous = this.states.get(key);
    this.states.set(key, {
      success: previous?.success || [],
      failure: previous?.failure || [],
      result: previous?.result || [],
      block: block ? [stateForRange(editor.document, block).range] : [],
      insert: previous?.insert || [],
      connectionLabel: previous?.connectionLabel || [],
    });
    this.apply(editor);
  }

  private apply(editor: vscode.TextEditor): void {
    const state = this.states.get(editor.document.uri.toString());
    editor.setDecorations(this.sqlHighlight, state?.block || []);
    editor.setDecorations(this.sqlErrorHighlight, state?.failure.map(({ range }) => range) || []);
    editor.setDecorations(this.success, state?.success || []);
    editor.setDecorations(this.failure, state?.failure || []);
    editor.setDecorations(this.results, state?.result || []);
    editor.setDecorations(this.insertValueHighlight, state?.insert || []);
    editor.setDecorations(this.connectionLabel, state?.connectionLabel || []);
  }

  private applyToDocument(document: vscode.TextDocument): void {
    const editor = vscode.window.visibleTextEditors.find(
      (candidate) => candidate.document.uri.toString() === document.uri.toString(),
    );
    if (editor) this.apply(editor);
  }

  private updateInsertHighlight(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== "sql") return;
    const offset = editor.document.offsetAt(editor.selection.active);
    const block = parseSqlBlocks(editor.document.getText()).find(
      (candidate) => offset >= candidate.start && offset <= candidate.end,
    );
    const counterpart = block
      ? insertCounterpartRange(editor.document, block, offset)
      : undefined;
    const key = editor.document.uri.toString();
    const previous = this.states.get(key);
    this.states.set(key, {
      success: previous?.success || [],
      failure: previous?.failure || [],
      result: previous?.result || [],
      block: previous?.block || [],
      insert: counterpart ? [counterpart] : [],
      connectionLabel: previous?.connectionLabel || [],
    });
    this.apply(editor);
  }

  private updateConnectionState(document: vscode.TextDocument): void {
    if (!this.isSupportedDocument(document)) return;
    const editor = vscode.window.visibleTextEditors.find(
      (candidate) => candidate.document.uri.toString() === document.uri.toString(),
    );
    if (!editor) return;
    const marker = /(?:--|\/\/)\s+Active:\s+(.+)/.exec(document.lineAt(0).text);
    const connection = this.activeConnection?.get();
    const key = document.uri.toString();
    const previous = this.states.get(key);
    const label = marker && connection
      ? [{
          range: new vscode.Range(0, 0, 0, 0),
          renderOptions: {
            after: {
              fontWeight: "600",
              margin: "0 0 0 10px",
              contentText: connection.name || connection.type,
              color: new vscode.ThemeColor("terminal.ansiBrightGreen"),
            },
          },
        }]
      : [];
    this.states.set(key, {
      success: previous?.success || [],
      failure: previous?.failure || [],
      result: previous?.result || [],
      block: previous?.block || [],
      insert: previous?.insert || [],
      connectionLabel: label,
    });
    this.apply(editor);
  }

  private isSupportedDocument(document: vscode.TextDocument): boolean {
    return document.languageId === "sql" || document.uri.fsPath.toLocaleLowerCase().endsWith(".dbclient-js");
  }
}
