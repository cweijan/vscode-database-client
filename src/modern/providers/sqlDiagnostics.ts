import * as vscode from "vscode";

import { isExecutableSqlBlock, parseSqlBlocks } from "./sqlDocumentModel";

interface SqlToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface SqlDiagnosticInfo {
  readonly start: number;
  readonly end: number;
  readonly message: string;
  readonly severity: vscode.DiagnosticSeverity;
}

function tokenizeSql(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
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
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === quote && source[index + 1] === quote) {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push({ text: source.slice(start, index), start, end: index });
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index] || "")) {
        index += 1;
      }
      tokens.push({ text: source.slice(start, index), start, end: index });
      continue;
    }
    tokens.push({ text: character, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

export function collectSqlDiagnostics(source: string): SqlDiagnosticInfo[] {
  const diagnostics: SqlDiagnosticInfo[] = [];
  for (const block of parseSqlBlocks(source).filter(isExecutableSqlBlock)) {
    const tokens = tokenizeSql(block.text);
    let afterFrom = false;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const upper = token.text.toLocaleUpperCase();
      if (upper === "FROM") {
        if (tokens[index - 1]?.text === ",") {
          const comma = tokens[index - 1];
          diagnostics.push({
            start: block.start + comma.start,
            end: block.start + comma.end,
            message: "A comma before FROM is not valid in a SELECT statement.",
            severity: vscode.DiagnosticSeverity.Error,
          });
        }
        afterFrom = true;
        continue;
      }
      if (
        afterFrom &&
        upper === "NULL" &&
        ["=", ">"].includes(tokens[index - 1]?.text || "")
      ) {
        const operator = tokens[index - 1];
        diagnostics.push({
          start: block.start + operator.start,
          end: block.start + token.end,
          message: "Compare NULL with IS NULL or IS NOT NULL instead.",
          severity: vscode.DiagnosticSeverity.Warning,
        });
      }
    }
  }
  return diagnostics;
}

export class ModernSqlDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("sql");
  private readonly subscriptions: vscode.Disposable[];

  public constructor() {
    this.subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.refresh(event.document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.collection.delete(document.uri);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.refresh(editor.document);
      }),
    ];
    const active = vscode.window.activeTextEditor;
    if (active) this.refresh(active.document);
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.collection.dispose();
  }

  private refresh(document: vscode.TextDocument): void {
    if (document.languageId !== "sql") {
      this.collection.delete(document.uri);
      return;
    }
    const diagnostics = collectSqlDiagnostics(document.getText()).map((item) =>
      new vscode.Diagnostic(
        new vscode.Range(document.positionAt(item.start), document.positionAt(item.end)),
        item.message,
        item.severity,
      ),
    );
    this.collection.set(document.uri, diagnostics);
  }
}
