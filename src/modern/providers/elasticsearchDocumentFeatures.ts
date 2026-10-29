import * as vscode from "vscode";

import {
  ELASTIC_PATH_COMPLETIONS,
  ELASTIC_QUERY_COMPLETIONS,
  formatElasticBody,
  parseElasticRequests,
} from "./elasticsearchDocumentModel";
import type { ElasticRequest } from "./elasticsearchDocumentModel";

function hasBodyRange(
  request: ElasticRequest,
): request is ElasticRequest & {
  readonly bodyStart: number;
  readonly bodyEnd: number;
} {
  return request.bodyStart !== undefined && request.bodyEnd !== undefined;
}

function isElasticDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "es" || document.uri.path.toLocaleLowerCase().endsWith(".es");
}

function requestAt(
  document: vscode.TextDocument,
  position: vscode.Position,
) {
  const offset = document.offsetAt(position);
  return parseElasticRequests(document.getText()).find(
    (request) => offset >= request.start && offset <= request.end,
  );
}

export class ElasticsearchCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly diagnosticsCollection = vscode.languages.createDiagnosticCollection(
    "dbclient-es-jsonValidate",
  );

  public dispose(): void {
    this.diagnosticsCollection.dispose();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isElasticDocument(document)) {
      this.diagnosticsCollection.delete(document.uri);
      return [];
    }
    const diagnostics: vscode.Diagnostic[] = [];
    const lenses = parseElasticRequests(document.getText()).flatMap((request) => {
      const range = new vscode.Range(
        document.positionAt(request.methodStart),
        document.positionAt(request.methodEnd),
      );
      const lenses = [
        new vscode.CodeLens(range, {
          title: "▶ Run Query",
          command: "mysql.elastic.execute",
          arguments: [request, false],
        }),
        new vscode.CodeLens(range, {
          title: "▶ Run Query And Parse",
          command: "mysql.elastic.execute",
          arguments: [request, true],
        }),
      ];
      if (["_count", "_search", "_stats"].some((path) => request.path.includes(path))) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "📃 API Documentation",
            command: "mysql.elastic.document",
            arguments: [request],
          }),
        );
      }
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Copy as cURL",
          command: "mysql.elastic.copyAsCurl",
          arguments: [request],
        }),
      );
      if (request.error) {
        const bodyRange = hasBodyRange(request)
          ? new vscode.Range(
              document.positionAt(request.bodyStart),
              document.positionAt(request.bodyEnd),
            )
          : range;
        diagnostics.push(
          new vscode.Diagnostic(
            bodyRange,
            `Invalid JSON body: ${request.error}`,
            vscode.DiagnosticSeverity.Error,
          ),
        );
        lenses.push(
          new vscode.CodeLens(range, {
            title: "🔥 Invalid Body",
            command: "mysql.elastic.lint",
            arguments: [request],
          }),
        );
      } else if (request.body !== undefined) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "⚡ Auto indent",
            command: "mysql.elastic.lint",
            arguments: [request],
          }),
        );
      }
      return lenses;
    });
    this.diagnosticsCollection.set(document.uri, diagnostics.length > 0 ? diagnostics : undefined);
    return lenses;
  }
}

export class ElasticsearchFormattingProvider
  implements vscode.DocumentFormattingEditProvider
{
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
  ): vscode.TextEdit[] {
    if (!isElasticDocument(document)) {
      return [];
    }
    return parseElasticRequests(document.getText())
      .filter(
        (request): request is ElasticRequest & { bodyStart: number; bodyEnd: number } =>
          request.body !== undefined && hasBodyRange(request),
      )
      .map((request) => {
        const range = new vscode.Range(
          document.positionAt(request.bodyStart),
          document.positionAt(request.bodyEnd),
        );
        return vscode.TextEdit.replace(range, formatElasticBody(request.body));
      });
  }
}

export class ElasticsearchCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    if (!isElasticDocument(document)) {
      return [];
    }
    const request = requestAt(document, position);
    if (!request || position.line !== document.positionAt(request.pathStart).line) {
      return [];
    }
    const line = document.lineAt(position.line).text;
    const cursorOffset = document.offsetAt(position);
    const pathEnd = Math.min(cursorOffset, request.pathEnd);
    const pathPrefix = document.getText().slice(request.pathStart, pathEnd);

    if (pathPrefix.endsWith("?") || pathPrefix.endsWith("&")) {
      return ELASTIC_QUERY_COMPLETIONS.map((label) => {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
        item.detail = "Elasticsearch query parameter";
        return item;
      });
    }

    const normalizedPathPrefix = pathPrefix.replace(/^\//, "");
    const slash = normalizedPathPrefix.lastIndexOf("/");
    const segmentPrefix = normalizedPathPrefix.slice(slash + 1).toLocaleLowerCase();
    const base = normalizedPathPrefix.slice(0, slash + 1);
    return ELASTIC_PATH_COMPLETIONS
      .filter((candidate) => candidate.toLocaleLowerCase().startsWith(base.toLocaleLowerCase()))
      .map((candidate) => candidate.slice(base.length))
      .filter((candidate) => candidate.toLocaleLowerCase().startsWith(segmentPrefix))
      .filter((candidate, index, values) => values.indexOf(candidate) === index)
      .map((label) => {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Reference);
        item.detail = `Elasticsearch path (${line.trim().split(/\s+/)[0] || request.method})`;
        return item;
      });
  }
}

export function registerElasticsearchProviders(): vscode.Disposable[] {
  const selector = "es";
  const codeLensProvider = new ElasticsearchCodeLensProvider();
  return [
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
    codeLensProvider,
    vscode.languages.registerDocumentFormattingEditProvider(selector, new ElasticsearchFormattingProvider()),
    vscode.languages.registerCompletionItemProvider(
      selector,
      new ElasticsearchCompletionProvider(),
      "/",
      "?",
      "&",
      '"',
    ),
  ];
}
