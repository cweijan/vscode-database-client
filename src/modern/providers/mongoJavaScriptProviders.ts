import * as vscode from "vscode";

const DATABASE_FUNCTIONS = [
  "createCollection",
  "command",
  "aggregate",
  "admin",
  "collection",
  "stats",
  "listCollections",
  "renameCollection",
  "dropCollection",
  "dropDatabase",
  "collections",
  "createIndex",
  "watch",
] as const;

const COLLECTION_FUNCTIONS = [
  "insertOne",
  "insertMany",
  "bulkWrite",
  "updateOne",
  "replaceOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "rename",
  "drop",
  "findOne",
  "find",
  "options",
  "createIndex",
  "createIndexes",
  "dropIndex",
  "dropIndexes",
  "listIndexes",
  "indexExists",
  "indexInformation",
  "estimatedDocumentCount",
  "countDocuments",
  "distinct",
  "aggregate",
  "watch",
] as const;

const FUNCTION_DOCS: Readonly<Record<string, string>> = {
  db: "Selects the active MongoDB database.",
  collection: "Returns a MongoDB collection handle.",
  find: "Finds documents matching a filter.",
  findOne: "Finds the first document matching a filter.",
  aggregate: "Runs an aggregation pipeline.",
  insertOne: "Inserts one document into the collection.",
  updateOne: "Updates the first document matching a filter.",
  deleteOne: "Deletes the first document matching a filter.",
  createCollection: "Creates a collection in the current database.",
};

function isMongoDocument(document: vscode.TextDocument): boolean {
  return document.uri.fsPath.toLocaleLowerCase().endsWith(".dbclient-js");
}

function wordAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { word: string; range: vscode.Range } | undefined {
  const range = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
  if (!range) {
    return undefined;
  }
  return { word: document.getText(range), range };
}

function statementRanges(document: vscode.TextDocument): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  const lines = document.getText().split(/\r?\n/);
  let startLine: number | undefined;
  for (let line = 0; line <= lines.length; line += 1) {
    const value = lines[line] ?? "";
    const startsStatement = /\bdb\s*\(/.test(value);
    if (startsStatement && startLine === undefined) {
      startLine = line;
    }
    const endsStatement = startLine !== undefined && (/;\s*$/.test(value) || !value.trim());
    if (endsStatement && startLine !== undefined) {
      const endLine = Math.max(startLine, line - (value.trim() ? 0 : 1));
      ranges.push(new vscode.Range(startLine, 0, endLine, lines[endLine]?.length ?? 0));
      startLine = undefined;
    }
  }
  if (startLine !== undefined) {
    const endLine = Math.max(startLine, lines.length - 1);
    ranges.push(new vscode.Range(startLine, 0, endLine, lines[endLine]?.length ?? 0));
  }
  return ranges;
}

export class MongoJavaScriptCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isMongoDocument(document)) {
      return [];
    }
    return statementRanges(document).flatMap((range) => {
      const source = document.getText(range);
      const argument = { source, uri: document.uri };
      return [
        new vscode.CodeLens(range, {
          command: "mysql.codeLens.run",
          title: "$(run) Run",
          arguments: [argument],
        }),
        new vscode.CodeLens(range, {
          command: "mysql.codeLens.run",
          title: "New Tab",
          arguments: [{ ...argument, newTab: true }],
        }),
        new vscode.CodeLens(range, {
          command: "mysql.codeLens.run",
          title: "JSON",
          arguments: [{ ...argument, json: true }],
        }),
      ];
    });
  }
}

export class MongoJavaScriptHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!isMongoDocument(document)) {
      return undefined;
    }
    const value = wordAt(document, position);
    if (!value) {
      return undefined;
    }
    const description = FUNCTION_DOCS[value.word];
    return description
      ? new vscode.Hover(
          new vscode.MarkdownString(`**${value.word}**\n\n${description}`),
          value.range,
        )
      : undefined;
  }
}

export class MongoJavaScriptDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location | undefined {
    if (!isMongoDocument(document)) {
      return undefined;
    }
    const value = wordAt(document, position);
    if (!value || !(value.word in FUNCTION_DOCS)) {
      return undefined;
    }
    const source = document.getText();
    const declaration = new RegExp(`(?:function|const|let|var)\\s+${value.word}\\b`).exec(source);
    if (!declaration) {
      return undefined;
    }
    const start = document.positionAt(declaration.index);
    return new vscode.Location(
      document.uri,
      new vscode.Range(start, document.positionAt(declaration.index + declaration[0].length)),
    );
  }
}

export class MongoJavaScriptCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    if (!isMongoDocument(document)) {
      return [];
    }
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const dotCount = (prefix.match(/\./g) ?? []).length;
    const functions = dotCount >= 2 ? COLLECTION_FUNCTIONS : dotCount === 1 ? DATABASE_FUNCTIONS : [];
    const currentWord = prefix.match(/[A-Za-z_$][A-Za-z0-9_$]*$/)?.[0]?.toLocaleLowerCase() ?? "";
    return functions
      .filter((name) => !currentWord || name.toLocaleLowerCase().startsWith(currentWord))
      .map((name) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
        item.insertText = new vscode.SnippetString(`${name}($1)`);
        item.detail = FUNCTION_DOCS[name] ?? "MongoDB method";
        return item;
      });
  }
}

export function registerMongoJavaScriptProviders(): vscode.Disposable[] {
  const selector = "javascript";
  return [
    vscode.languages.registerCodeLensProvider(selector, new MongoJavaScriptCodeLensProvider()),
    vscode.languages.registerHoverProvider(selector, new MongoJavaScriptHoverProvider()),
    vscode.languages.registerDefinitionProvider(selector, new MongoJavaScriptDefinitionProvider()),
    vscode.languages.registerCompletionItemProvider(
      selector,
      new MongoJavaScriptCompletionProvider(),
      '"',
      "'",
      ".",
    ),
  ];
}
