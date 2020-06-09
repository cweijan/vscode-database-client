import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class FunctionChain implements ComplectionChain {
    private functionList: string[] = ["CHAR_LENGTH", "CONCAT", "NOW", "DATE_ADD", "DATE_SUB", "MAX", "COUNT", "MIN", "SUM", "AVG", "LENGTH", "IF", "IFNULL",
        "MD5", "SHA", "CURRENT_DATE", "DATE_FORMAT", "CAST", "TRIM"];
    private functionComplectionItems: vscode.CompletionItem[] = [];
    constructor() {
        this.functionList.forEach((keyword) => {
            const functionComplectionItem = new vscode.CompletionItem(keyword + " ");
            functionComplectionItem.kind = vscode.CompletionItemKind.Function;
            functionComplectionItem.insertText = new vscode.SnippetString(keyword + "($1)");
            this.functionComplectionItems.push(functionComplectionItem);
        });
    }
    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        if ((complectionContext.preWord && complectionContext.preWord.match(/\b(select|HAVING|where|and|,|=|<|>)\b/ig)) ||
            (complectionContext.currentWord && complectionContext.currentWord.match(/(<|>|,|=)$/))) {

            return this.functionComplectionItems;
        }

        return null;
    }

    public stop(): boolean {
        return false;
    }

}