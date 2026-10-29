import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { isManagedDatabaseClientPath } from "./managedFilePaths";
import {
  buildMongoFieldProbe,
  mongoFieldNames,
  mongoFieldPrefix,
  parseMongoCollectionReference,
} from "./mongoFieldCompletion";
import { MongoTypeProvider } from "./mongoTypeProvider";

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
  "removeUser",
  "setProfilingLevel",
  "profilingLevel",
  "indexInformation",
  "runCursorCommand",
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
  "isCapped",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "indexes",
  "initializeUnorderedBulkOp",
  "initializeOrderedBulkOp",
  "count",
  "listSearchIndexes",
  "createSearchIndex",
  "createSearchIndexes",
  "dropSearchIndex",
  "updateSearchIndex",
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
    const startsStatement = Boolean(value.trim()) && !value.trimStart().startsWith("//");
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

function firstToken(source: string): string | undefined {
  const withoutLeadingComments = source.replace(
    /^(?:\s|\/\/[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)+/,
    "",
  );
  return /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(withoutLeadingComments)?.[0];
}

function looksLikeMongoBlock(source: string): boolean {
  return /\b(?:db|collection|admin)\s*\(|\.\s*(?:find|findOne|aggregate|insert(?:One|Many)?|update(?:One|Many)?|delete(?:One|Many)?|command|watch|drop|stats|createCollection)\s*\(/.test(source);
}

export class MongoJavaScriptCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly diagnosticsCollection = vscode.languages.createDiagnosticCollection("mongoCodeLens");
  private readonly errors = new Map<string, readonly vscode.Diagnostic[]>();

  public constructor(private readonly services?: ExtensionServices) {}

  public dispose(): void {
    this.diagnosticsCollection.dispose();
    this.errors.clear();
  }

  public hasErrorAt(document: vscode.TextDocument, position: vscode.Position): boolean {
    return this.errors.get(document.uri.toString())?.some((diagnostic) =>
      diagnostic.range.contains(position),
    ) ?? false;
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isMongoDocument(document)) {
      this.diagnosticsCollection.delete(document.uri);
      this.errors.delete(document.uri.toString());
      return [];
    }
    const diagnostics: vscode.Diagnostic[] = [];
    const lenses = statementRanges(document).flatMap((range) => {
      const source = document.getText(range);
      if (!looksLikeMongoBlock(source)) return [];
      if (firstToken(source) !== "db") {
        diagnostics.push(
          new vscode.Diagnostic(
            range,
            'You must specify the database using the "db" function.',
            vscode.DiagnosticSeverity.Error,
          ),
        );
        return [];
      }
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
    const firstLine = new vscode.Range(0, 0, 0, 0);
    if (!isManagedDatabaseClientPath(document.uri.fsPath)) {
      lenses.push(
        new vscode.CodeLens(firstLine, {
          command: "mysql.db.active",
          title: "🔒 Active Connection",
          arguments: [document.uri.fsPath],
        }),
      );
    }
    this.errors.set(document.uri.toString(), diagnostics);
    this.diagnosticsCollection.set(document.uri, diagnostics.length > 0 ? diagnostics : undefined);
    return lenses;
  }
}

export class MongoJavaScriptHoverProvider implements vscode.HoverProvider {
  public constructor(
    private readonly codeLens?: MongoJavaScriptCodeLensProvider,
    private readonly typeProvider = new MongoTypeProvider(),
  ) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!isMongoDocument(document)) {
      return undefined;
    }
    if (this.codeLens?.hasErrorAt(document, position)) {
      return undefined;
    }
    const value = wordAt(document, position);
    if (!value) {
      return undefined;
    }
    const type = this.typeProvider.findByName(value.word);
    const description = type?.jsDoc || FUNCTION_DOCS[value.word];
    return description
      ? new vscode.Hover(
          new vscode.MarkdownString(`**${value.word}**\n\n${description}`),
          value.range,
        )
      : undefined;
  }
}

export class MongoJavaScriptDefinitionProvider implements vscode.DefinitionProvider {
  public constructor(private readonly typeProvider = new MongoTypeProvider()) {}

  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location | undefined {
    if (!isMongoDocument(document)) {
      return undefined;
    }
    const value = wordAt(document, position);
    if (!value) {
      return undefined;
    }
    const type = this.typeProvider.findByName(value.word);
    if (!type) {
      return undefined;
    }
    return new vscode.Location(
      vscode.Uri.file(this.typeProvider.documentPath),
      new vscode.Position(type.line, type.column),
    );
  }
}

export class MongoJavaScriptCompletionProvider implements vscode.CompletionItemProvider {
  private readonly fieldCache = new Map<string, Promise<readonly string[]>>();

  public constructor(
    private readonly typeProvider = new MongoTypeProvider(),
    private readonly services?: ExtensionServices,
  ) {}

  public clearCache(): void {
    this.fieldCache.clear();
    this.typeProvider.clearCache();
  }

  private async completeFields(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const connection = this.services?.activeConnection.get();
    if (!connection || connection.type !== "MongoDB") return undefined;
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const fieldPrefix = mongoFieldPrefix(linePrefix);
    if (fieldPrefix === undefined) return undefined;
    const reference = parseMongoCollectionReference(
      document.getText().slice(0, document.offsetAt(position)),
    );
    if (!reference) return undefined;
    const cacheKey = `${connection.id}\u0000${reference.database}\u0000${reference.collection}`;
    let fields = this.fieldCache.get(cacheKey);
    if (!fields) {
      fields = this.services!.connections
        .query<Record<string, unknown>>(connection, buildMongoFieldProbe(reference), {
          showError: false,
        })
        .then((result) => mongoFieldNames(result));
      this.fieldCache.set(cacheKey, fields);
    }
    let names: readonly string[];
    try {
      names = await fields;
    } catch {
      this.fieldCache.delete(cacheKey);
      return [];
    }
    const replacement = new vscode.Range(
      position.line,
      position.character - fieldPrefix.length,
      position.line,
      position.character,
    );
    return names
      .filter((name) => !fieldPrefix || name.toLocaleLowerCase().startsWith(fieldPrefix.toLocaleLowerCase()))
      .map((name) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field);
        item.detail = "MongoDB field";
        item.sortText = "26";
        item.range = replacement;
        return item;
      });
  }

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    if (!isMongoDocument(document)) {
      return Promise.resolve([]);
    }
    return this.completeFields(document, position).then((fields) => {
      if (fields !== undefined) return fields;
      const prefix = document.lineAt(position.line).text.slice(0, position.character);
      const dotCount = (prefix.match(/\./g) ?? []).length;
      const functions = dotCount >= 2 ? COLLECTION_FUNCTIONS : dotCount === 1 ? DATABASE_FUNCTIONS : [];
      const currentWord = prefix.match(/[A-Za-z_$][A-Za-z0-9_$]*$/)?.[0]?.toLocaleLowerCase() ?? "";
      return functions
        .filter((name) => !currentWord || name.toLocaleLowerCase().startsWith(currentWord))
        .map((name) => {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
          item.insertText = new vscode.SnippetString(`${name}($1)`);
          item.detail = this.typeProvider.findByName(name)?.trimJSDoc
            || FUNCTION_DOCS[name]
            || "MongoDB method";
          item.sortText = "0000";
          return item;
        });
    });
  }
}

export function registerMongoJavaScriptProviders(
  services?: ExtensionServices,
): vscode.Disposable[] {
  const selector = "javascript";
  const codeLensProvider = new MongoJavaScriptCodeLensProvider(services);
  const typeProvider = new MongoTypeProvider();
  const completionProvider = new MongoJavaScriptCompletionProvider(typeProvider, services);
  const cacheRegistration = services?.cache.register(() => completionProvider.clearCache());
  return [
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
    codeLensProvider,
    vscode.languages.registerHoverProvider(
      selector,
      new MongoJavaScriptHoverProvider(codeLensProvider, typeProvider),
    ),
    vscode.languages.registerDefinitionProvider(
      selector,
      new MongoJavaScriptDefinitionProvider(typeProvider),
    ),
    vscode.languages.registerCompletionItemProvider(
      selector,
      completionProvider,
      '"',
      "'",
      ".",
    ),
    ...(cacheRegistration ? [cacheRegistration] : []),
  ];
}
