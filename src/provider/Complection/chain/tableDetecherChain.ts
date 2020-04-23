import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { Pattern } from "../../../common/Constants";

export class TableDetecherChain implements ComplectionChain {

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {

        const tableMatch = new RegExp(Pattern.TABLE_PATTERN + " *((\\w)*)?", 'ig');
        if (
            (complectionContext.preWord && complectionContext.preWord.match(/\b(select|HAVING|\(|on|where|and|,|=|<|>)\b/ig))
            ||
            (complectionContext.currentWord && complectionContext.currentWord.match(/(<|>|,|=)$/))
        ) {
            const completionItem = [];
            let result = tableMatch.exec(complectionContext.currentSqlFull);
            while (result != null) {
                const alias = result[5];
                if (alias) {
                    completionItem.push(new vscode.CompletionItem(alias, vscode.CompletionItemKind.Interface));
                } else {
                    const tableName = result[2].replace(/\w*?\./, "");
                    completionItem.push(new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Interface));
                }
                result = tableMatch.exec(complectionContext.currentSqlFull);
            }

            return completionItem;
        }

        return null;
    }

    public stop(): boolean {
        return true;
    }



}