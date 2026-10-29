import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import {
  SQL_FUNCTION_SIGNATURES,
  formatSql,
  isExecutableSqlBlock,
  parseSqlBlocks,
  parseSqlTableReferences,
  sqlWordAt,
  type SqlBlock,
  type SqlTableReference,
} from "./sqlDocumentModel";
import {
  SqlDefinitionProvider,
  SqlTableHoverProvider,
  SqlWorkspaceSymbolProvider,
} from "./sqlMetadataProviders";
import { extractSqlVariables } from "./sqlVariableProvider";
import { sqlCodeLensCommands } from "./supplementalCodeLens";
import { isManagedDatabaseClientPath } from "./managedFilePaths";
import { openResultView } from "../tree/databaseTreeProvider";

function symbolForBlock(
  document: vscode.TextDocument,
  block: SqlBlock,
): vscode.SymbolInformation {
  return new vscode.SymbolInformation(
    block.text,
    vscode.SymbolKind.Function,
    "SQL",
    new vscode.Location(document.uri, document.positionAt(block.start)),
  );
}

function countArguments(source: string): number {
  let depth = 0;
  let quote: "'" | '"' | undefined;
  let commas = 0;
  for (const character of source) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    } else if (character === "," && depth === 0) {
      commas += 1;
    }
  }
  return commas;
}

function functionSignatureAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { name: string; argumentsText: string } | undefined {
  const source = document.getText();
  const beforeCursor = source.slice(0, document.offsetAt(position));
  const match = /([A-Za-z_][A-Za-z0-9_$]*)\s*\(([^()]*)$/.exec(beforeCursor);
  return match
    ? { name: match[1], argumentsText: match[2] }
    : undefined;
}

function templateType(document: vscode.TextDocument): string | undefined {
  const match = document.fileName.match(/create-(\w+)-template\.sql$/i);
  return match?.[1];
}

function createSqlTableCodeActionTarget(
  services: ExtensionServices,
  reference: SqlTableReference,
): { readonly label: string; readonly tableWithSchema: string; readonly viewData: () => Promise<string> } | undefined {
  const connection = services.activeConnection.get();
  if (!connection) {
    return undefined;
  }
  const schema = reference.schema || connection.schema || connection.database || null;
  const dialect = services.dialects.resolve(connection.type);
  const tableWithSchema = schema
    ? `${dialect.quoteIdentifier(schema)}.${dialect.quoteIdentifier(reference.name)}`
    : dialect.quoteIdentifier(reference.name);
  return {
    label: reference.name,
    tableWithSchema,
    viewData: async () => {
      const sql = dialect.buildPageSql(
        schema,
        tableWithSchema,
        services.config.get("defaultSelectLimit"),
      );
      const result = await services.connections.query<Record<string, unknown>>(
        connection,
        sql,
      );
      await openResultView(
        services,
        reference.name,
        sql,
        result,
        {
          connection,
          table: reference.name,
          schema,
          database: connection.database,
          id: "result",
          singlePage: true,
        },
      );
      return sql;
    },
  };
}

export class SqlCodeLensProvider implements vscode.CodeLensProvider {
  public constructor(private readonly services?: ExtensionServices) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.uri.scheme === "db_ddl") {
      const table = decodeURIComponent(document.uri.path.replace(/^\/+/, ""))
        .replace(/\.sql$/i, "");
      const schema = new URLSearchParams(document.uri.query).get("schema") || "";
      if (!table) return [];
      const qualified = schema ? `${schema}.${table}` : table;
      return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        command: "mysql.runSQL",
        title: "$(run) View Data",
        arguments: [`SELECT * FROM ${qualified}`],
      })];
    }
    if (this.services && !this.services.config.get("enableEditorCodeLens")) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    const blocks = parseSqlBlocks(document.getText()).filter(isExecutableSqlBlock);
    const activeEditor = vscode.window.activeTextEditor;
    const createType = templateType(document);
    const createRule = createType
      ? new RegExp(`CREATE\\s+${createType.replace("materializedView", "materialized\\s+view")}`, "i")
      : undefined;
    for (const block of blocks) {
      const range = new vscode.Range(
        document.positionAt(block.start),
        document.positionAt(block.end),
      );
      const source = { source: block.text, uri: document.uri };
      lenses.push(
        new vscode.CodeLens(range, {
          command: "mysql.codeLens.run",
          title: "$(run) Run",
          arguments: [source],
        }),
      );
      if (/^\s*(?:select|with)\b/i.test(block.text)) {
        lenses.push(
          new vscode.CodeLens(range, {
            command: "mysql.codeLens.run",
            title: "New Tab",
            arguments: [{ ...source, newTab: true }],
          }),
          new vscode.CodeLens(range, {
            command: "mysql.codeLens.run",
            title: "JSON",
            arguments: [{ ...source, json: true }],
          }),
        );
      }
      const startLine = document.positionAt(block.start).line;
      const endLine = document.positionAt(block.end).line;
      const auxiliaryCommands = sqlCodeLensCommands({
        isQuery: /^\s*(?:select|with)\b/i.test(block.text),
        isTemplate: createType !== undefined,
        isMultiLine: endLine - startLine >= 3,
        lineCount: endLine - startLine,
        appName: vscode.env.appName,
        copilotInstalled: vscode.extensions.getExtension("GitHub.copilot") !== undefined,
      });
      for (const auxiliary of auxiliaryCommands) {
        lenses.push(new vscode.CodeLens(range, {
          command: auxiliary.command,
          title: auxiliary.title,
          arguments: [document.uri, range],
        }));
      }
      if (this.services
        && this.services.config.get("enableSQLVariable")
        && this.services.config.get("splitSQLByNewLine")
        && this.services.config.get("enableFlexibleSQLParser")
        && extractSqlVariables(block.text).length > 0) {
        lenses.push(new vscode.CodeLens(range, {
          command: "mysql.variable.config.display",
          title: "$(terminal-bash) Variables",
          arguments: [source, activeEditor],
        }));
      }
      if (this.services && activeEditor && createType && createType !== "trigger" && createRule?.test(block.text)) {
        const blockIndex = blocks.indexOf(block);
        let end = block.end;
        for (const next of blocks.slice(blockIndex + 1)) {
          if (createRule.test(next.text)) break;
          end = next.end;
        }
        lenses.push(new vscode.CodeLens(range, {
          command: "mysql.template.ddl.reset",
          title: "$(sync) Reset",
          arguments: [
            this.services.activeConnection.get(),
            createType,
            document.uri,
            new vscode.Range(document.positionAt(block.start), document.positionAt(end)),
          ],
        }));
      }
    }

    const active = this.services?.activeConnection.get();
    if (!isManagedDatabaseClientPath(document.fileName)
      && ["sql", "cql"].includes(document.languageId)) {
      const activeRecord = active as typeof active & { readonly name?: string };
      const firstLine = new vscode.Range(0, 0, 0, 0);
      lenses.push(
        new vscode.CodeLens(firstLine, {
          command: "mysql.db.active",
          title: active
            ? `$(plug) Active: ${activeRecord.name || active.type}`
            : "$(plug) Active Connection",
          arguments: [document.fileName],
        }),
      );
      if (active?.database) {
        lenses.push(
          new vscode.CodeLens(firstLine, {
            command: "mysql.db.active",
            title: `$(database) ${active.database}`,
            arguments: [document.fileName, active],
          }),
        );
      }
    }
    return lenses;
  }
}

export class SqlSignatureHelpProvider implements vscode.SignatureHelpProvider {
  public provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.SignatureHelp | undefined {
    const context = functionSignatureAt(document, position);
    if (!context) {
      return undefined;
    }
    const signature = SQL_FUNCTION_SIGNATURES.find(
      (item) => item.name.toLocaleLowerCase() === context.name.toLocaleLowerCase(),
    );
    if (!signature) {
      return undefined;
    }
    const help = new vscode.SignatureHelp();
    const information = new vscode.SignatureInformation(
      signature.label,
      signature.documentation,
    );
    information.parameters = signature.parameters.map(
      (parameter) => new vscode.ParameterInformation(parameter),
    );
    help.signatures = [information];
    help.activeSignature = 0;
    help.activeParameter = Math.min(
      countArguments(context.argumentsText),
      Math.max(0, signature.parameters.length - 1),
    );
    return help;
  }
}

function selectedSqlHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
    return undefined;
  }
  for (const selection of editor.selections) {
    if (selection.isEmpty || !selection.contains(position)) {
      continue;
    }
    const sql = document.getText(selection).trim();
    if (!sql) {
      continue;
    }
    const commandUri = vscode.Uri.parse(
      `command:mysql.runSQL?${encodeURIComponent(JSON.stringify([sql]))}`,
    );
    const markdown = new vscode.MarkdownString(
      `[Run Selected SQL](${commandUri})`,
    );
    markdown.isTrusted = true;
    return new vscode.Hover(markdown, selection);
  }
  return undefined;
}

class SqlHoverProvider implements vscode.HoverProvider {
  private readonly metadata?: SqlTableHoverProvider;

  public constructor(services?: ExtensionServices) {
    this.metadata = services ? new SqlTableHoverProvider(services) : undefined;
  }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const metadata = await this.metadata?.provideHover(document, position);
    if (metadata) {
      return metadata;
    }
    const selected = selectedSqlHover(document, position);
    if (selected) {
      return selected;
    }
    const word = sqlWordAt(document.getText(), document.offsetAt(position));
    if (!word) {
      return undefined;
    }
    const signature = SQL_FUNCTION_SIGNATURES.find(
      (item) => item.name.toLocaleLowerCase() === word.word.toLocaleLowerCase(),
    );
    return signature
      ? new vscode.Hover(
        new vscode.MarkdownString(
          `**${signature.label}**\n\n${signature.documentation}`,
        ),
        new vscode.Range(
          document.positionAt(word.start),
          document.positionAt(word.end),
        ),
      )
      : new vscode.Hover(
        new vscode.MarkdownString(`SQL identifier: \`${word.word}\``),
      );
  }
}

export function registerSqlDocumentFeatures(
  services?: ExtensionServices,
): vscode.Disposable[] {
  const registrations: vscode.Disposable[] = [];
  const selector = ["sql", "postgres", "cql"];

  registrations.push(
    vscode.languages.registerCodeLensProvider(
      selector,
      new SqlCodeLensProvider(services),
    ),
  );

  registrations.push(
    vscode.languages.registerDocumentRangeFormattingEditProvider("sql", {
      provideDocumentRangeFormattingEdits(document, range) {
        return [
          vscode.TextEdit.replace(
            range,
            formatSql(document.getText(range)),
          ),
        ];
      },
    }),
  );

  registrations.push(
    vscode.languages.registerDocumentSymbolProvider("sql", {
      provideDocumentSymbols(document) {
        return parseSqlBlocks(document.getText())
          .filter(isExecutableSqlBlock)
          .map((block) =>
          symbolForBlock(document, block),
          );
      },
    }),
  );

  registrations.push(
    vscode.languages.registerFoldingRangeProvider("sql", {
      provideFoldingRanges(document) {
        return parseSqlBlocks(document.getText())
          .filter(isExecutableSqlBlock)
          .map((block) => {
            const start = document.positionAt(block.start).line;
            const end = document.positionAt(block.end).line;
            return end > start
              ? new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region)
              : undefined;
          })
          .filter((range): range is vscode.FoldingRange => range !== undefined);
      },
    }),
  );

  registrations.push(
    vscode.languages.registerHoverProvider(
      "sql",
      new SqlHoverProvider(services),
    ),
  );

  registrations.push(
    vscode.languages.registerSignatureHelpProvider(
      "sql",
      new SqlSignatureHelpProvider(),
      "(",
      ",",
    ),
  );

  registrations.push(
    vscode.languages.registerCodeActionsProvider("sql", {
      provideCodeActions(document, range) {
        const documentSource = document.getText();
        const word = sqlWordAt(documentSource, document.offsetAt(range.start));
        const reference = word
          ? parseSqlTableReferences(documentSource).find(
            (item) => word.start >= item.start && word.end <= item.end,
          )
          : undefined;
        const tableTarget = services && reference
          ? createSqlTableCodeActionTarget(services, reference)
          : undefined;
        if (tableTarget) {
          return [{
            title: "View Data",
            command: {
              command: "mysql.table.find",
              title: "View Data",
              arguments: [tableTarget],
            },
          }];
        }
        const selectedSource = document.getText(range).trim();
        if (!selectedSource) {
          return [];
        }
        return [
          {
            title: "Run SQL selection",
            command: {
              command: "mysql.runSQL",
              title: "Run SQL selection",
              arguments: [selectedSource],
            },
          },
        ];
      },
    }),
  );

  registrations.push(
    vscode.languages.registerDefinitionProvider(
      "sql",
      services
        ? new SqlDefinitionProvider(services)
        : {
          provideDefinition(document: vscode.TextDocument, position: vscode.Position) {
            const word = sqlWordAt(document.getText(), document.offsetAt(position));
            if (!word) {
              return undefined;
            }
            const pattern = new RegExp(`\\b(?:table|view)\\s+${word.word}\\b`, "i");
            const match = pattern.exec(document.getText());
            if (!match) {
              return undefined;
            }
            const start = document.positionAt(match.index);
            return new vscode.Location(
              document.uri,
              new vscode.Range(start, document.positionAt(match.index + match[0].length)),
            );
          },
        },
    ),
  );

  registrations.push(
    vscode.languages.registerWorkspaceSymbolProvider(
      services
        ? new SqlWorkspaceSymbolProvider(services)
        : { provideWorkspaceSymbols: () => [] },
    ),
  );

  return registrations;
}
