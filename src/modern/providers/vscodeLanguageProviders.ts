import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { registerElasticsearchProviders } from "./elasticsearchDocumentFeatures";
import { registerMongoJavaScriptProviders } from "./mongoJavaScriptProviders";
import { SqlMetadataCompletionProvider } from "./sqlMetadataCompletion";
import { registerSqlDocumentFeatures } from "./sqlDocumentFeatures";
import { SqlDdlContentProvider } from "./sqlMetadataProviders";
import { registerSupplementalLanguageProviders } from "./supplementalLanguageProviders";
import { registerSqlNotebookProviders } from "./sqlNotebookProvider";

export function registerModernLanguageProviders(
  services: ExtensionServices,
): vscode.Disposable[] {
  const provider = new SqlMetadataCompletionProvider(services);
  const cacheRegistration = services.cache.register(() => provider.clearCache());
  const registration = vscode.languages.registerCompletionItemProvider(
    ["sql", "postgres", "cql"],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
      ): Promise<vscode.CompletionItem[]> {
        return provider.provideCompletionItems(document, position);
      },
    },
    " ",
    ".",
    ">",
    "<",
    "=",
    "(",
    "'",
    "@",
  );
  return [
    registration,
    cacheRegistration,
    ...registerSqlDocumentFeatures(services),
    vscode.workspace.registerTextDocumentContentProvider(
      "db_ddl",
      new SqlDdlContentProvider(services),
    ),
    ...registerSupplementalLanguageProviders(services),
    ...registerElasticsearchProviders(),
    ...registerMongoJavaScriptProviders(services),
    ...registerSqlNotebookProviders(),
  ];
}
