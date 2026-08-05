import * as vscode from "vscode";

import { registerElasticsearchProviders } from "./elasticsearchDocumentFeatures";
import { registerMongoJavaScriptProviders } from "./mongoJavaScriptProviders";
import { SqlCompletionProvider } from "./sqlCompletionProvider";
import { registerSqlDocumentFeatures } from "./sqlDocumentFeatures";
import { registerSupplementalLanguageProviders } from "./supplementalLanguageProviders";

export function registerModernLanguageProviders(): vscode.Disposable[] {
  const provider = new SqlCompletionProvider();
  const registration = vscode.languages.registerCompletionItemProvider(
    ["sql", "postgres", "cql"],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
      ): vscode.CompletionItem[] {
        const items = provider.provide({
          text: document.getText(),
          offset: document.offsetAt(position),
        });
        return items.map((item) => {
          const completion = new vscode.CompletionItem(
            item.label,
            item.kind === "keyword"
              ? vscode.CompletionItemKind.Keyword
              : item.kind === "table"
                ? vscode.CompletionItemKind.Struct
                : vscode.CompletionItemKind.Field,
          );
          completion.detail = item.detail;
          return completion;
        });
      },
    },
    ".",
  );
  return [
    registration,
    ...registerSqlDocumentFeatures(),
    ...registerSupplementalLanguageProviders(),
    ...registerElasticsearchProviders(),
    ...registerMongoJavaScriptProviders(),
  ];
}
