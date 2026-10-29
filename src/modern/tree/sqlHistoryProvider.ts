import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { targetResourceTreeIcon } from "./targetTreeIcon";
import {
  compactSqlHistoryLabel,
  readSqlHistory,
  SQL_HISTORY_STATE_KEY,
  type SqlHistoryEntry,
} from "./sqlHistory";

class SqlHistoryInfoItem extends vscode.TreeItem {
  public constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "info";
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

export class SqlHistoryItem extends vscode.TreeItem {
  public constructor(
    public readonly entry: SqlHistoryEntry,
    private readonly services: ExtensionServices,
  ) {
    super(compactSqlHistoryLabel(entry.sql), vscode.TreeItemCollapsibleState.None);
    this.contextValue = "sqlHistory";
    this.description = new Date(entry.date).toLocaleString();
    this.tooltip = new vscode.MarkdownString(`\`\`\`sql\n${entry.sql}\n\`\`\``);
    this.iconPath = targetResourceTreeIcon(services.resources, "ssh/sql.svg");
    this.command = {
      command: "mysql.history.view",
      title: "View History",
      arguments: [this],
    };
  }
}

export class SqlHistoryTreeProvider implements vscode.TreeDataProvider<SqlHistoryItem | SqlHistoryInfoItem> {
  private readonly changes = new vscode.EventEmitter<SqlHistoryItem | SqlHistoryInfoItem | undefined>();

  public readonly onDidChangeTreeData = this.changes.event;

  public constructor(private readonly services: ExtensionServices) {}

  public getTreeItem(element: SqlHistoryItem | SqlHistoryInfoItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): Array<SqlHistoryItem | SqlHistoryInfoItem> {
    const history = readSqlHistory(
      this.services.state.get<unknown>(SQL_HISTORY_STATE_KEY, []),
    );
    if (history.length === 0) {
      return [new SqlHistoryInfoItem("No history found.")];
    }
    return history
      .slice()
      .reverse()
      .map((entry) => new SqlHistoryItem(entry, this.services));
  }

  public refresh(): void {
    this.changes.fire(undefined);
  }

  public dispose(): void {
    this.changes.dispose();
  }
}

export function registerModernHistoryView(
  services: ExtensionServices,
): vscode.Disposable[] {
  if (typeof vscode.window.createTreeView !== "function") {
    return [];
  }
  const provider = new SqlHistoryTreeProvider(services);
  const view = vscode.window.createTreeView("github.dbclient.history", {
    treeDataProvider: provider,
  });
  const refreshCommand = vscode.commands.registerCommand(
    "mysql.history.refresh",
    () => provider.refresh(),
  );
  const visibility = view.onDidChangeVisibility(({ visible }) => {
    void vscode.commands.executeCommand(
      "setContext",
      "showDatabaseClientHistory",
      visible,
    );
  });
  return [provider, view, refreshCommand, visibility];
}
