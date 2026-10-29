import * as vscode from "vscode";

import {
  deserializeSqlBook,
  serializeSqlBook,
  type SqlBookCellKind,
} from "./sqlNotebookModel";

export class SqlNotebookSerializer implements vscode.NotebookSerializer {
  public constructor(private readonly language = "sql") {}

  public deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken,
  ): vscode.NotebookData {
    const source = new TextDecoder().decode(content);
    const cells = deserializeSqlBook(source, this.language).map((cell) =>
      new vscode.NotebookCellData(
        cell.kind === "Markup"
          ? vscode.NotebookCellKind.Markup
          : vscode.NotebookCellKind.Code,
        cell.value,
        cell.language,
      ));
    return new vscode.NotebookData(cells);
  }

  public serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken,
  ): Uint8Array {
    const cells = data.cells.map((cell) => ({
      kind: (cell.kind === vscode.NotebookCellKind.Markup ? "Markup" : "Code") as SqlBookCellKind,
      value: cell.value,
      language: cell.languageId || this.language,
    }));
    return new TextEncoder().encode(serializeSqlBook(cells));
  }
}

export function registerSqlNotebookProviders(): vscode.Disposable[] {
  const serializer = new SqlNotebookSerializer();
  return [
    vscode.workspace.registerNotebookSerializer("sql-book", serializer),
    vscode.workspace.registerNotebookSerializer("sql-query-book", serializer),
  ];
}
