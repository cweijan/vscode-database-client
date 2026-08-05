import * as vscode from "vscode";
import { formatSql, parseSqlBlocks, type SqlBlock } from "./sqlDocumentModel";

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

function wordAt(document: vscode.TextDocument, position: vscode.Position): string {
  const offset = document.offsetAt(position);
  const text = document.getText();
  let start = offset;
  let end = offset;
  while (start > 0 && isWordCharacter(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && isWordCharacter(text[end])) {
    end += 1;
  }
  return text.slice(start, end);
}

function symbolForBlock(
  document: vscode.TextDocument,
  block: SqlBlock,
): vscode.DocumentSymbol {
  const range = new vscode.Range(
    document.positionAt(block.start),
    document.positionAt(block.end),
  );
  return new vscode.DocumentSymbol(
    block.text.split(/\s+/).slice(0, 3).join(" "),
    "SQL statement",
    vscode.SymbolKind.Function,
    range,
    range,
  );
}

export function registerSqlDocumentFeatures(): vscode.Disposable[] {
  const registrations: vscode.Disposable[] = [];
  const selector = ["sql", "postgres", "cql"];

  registrations.push(
    vscode.languages.registerCodeLensProvider(selector, {
      provideCodeLenses(document) {
        return parseSqlBlocks(document.getText()).map((block) => {
          const range = new vscode.Range(
            document.positionAt(block.start),
            document.positionAt(block.end),
          );
          return new vscode.CodeLens(range, {
            command: "mysql.codeLens.run",
            title: "▶ Run SQL",
            arguments: [block.text],
          });
        });
      },
    }),
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
        return parseSqlBlocks(document.getText()).map((block) =>
          symbolForBlock(document, block),
        );
      },
    }),
  );

  registrations.push(
    vscode.languages.registerFoldingRangeProvider("sql", {
      provideFoldingRanges(document) {
        return parseSqlBlocks(document.getText())
          .map((block) => {
            const start = document.positionAt(block.start).line;
            const end = document.positionAt(block.end).line;
            return end > start ? new vscode.FoldingRange(start, end) : undefined;
          })
          .filter((range): range is vscode.FoldingRange => range !== undefined);
      },
    }),
  );

  registrations.push(
    vscode.languages.registerHoverProvider("sql", {
      provideHover(document, position) {
        const word = wordAt(document, position);
        return word
          ? new vscode.Hover(new vscode.MarkdownString(`SQL identifier: \`${word}\``))
          : undefined;
      },
    }),
  );

  registrations.push(
    vscode.languages.registerSignatureHelpProvider("sql", {
      provideSignatureHelp() {
        const help = new vscode.SignatureHelp();
        const signature = new vscode.SignatureInformation(
          "SELECT expression FROM table WHERE condition",
          "Basic SQL query shape",
        );
        help.signatures = [signature];
        help.activeSignature = 0;
        help.activeParameter = 0;
        return help;
      },
    }, "(", ","),
  );

  registrations.push(
    vscode.languages.registerCodeActionsProvider("sql", {
      provideCodeActions(document, range) {
        const source = document.getText(range).trim();
        if (!source) {
          return [];
        }
        return [
          {
            title: "Run SQL selection",
            command: {
              command: "mysql.runSQL",
              title: "Run SQL selection",
              arguments: [source],
            },
          },
        ];
      },
    }),
  );

  registrations.push(
    vscode.languages.registerDefinitionProvider("sql", {
      provideDefinition(document, position) {
        const word = wordAt(document, position);
        if (!word) {
          return undefined;
        }
        const pattern = new RegExp(`\\b(?:table|view)\\s+${word}\\b`, "i");
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
    }),
  );

  registrations.push(
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols(_query) {
        return [];
      },
    }),
  );

  return registrations;
}
