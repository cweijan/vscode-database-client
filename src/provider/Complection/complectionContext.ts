import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";

export interface ComplectionChain {
    getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

    stop(): boolean;
}

export class ComplectionContext {

    public preWord: string;
    public preChart: string;
    public currentWord: string;
    public currentSql: string;

    public static build(document: vscode.TextDocument, position: vscode.Position): ComplectionContext {

        const context = new ComplectionContext();
        const currentSql = QueryUnit.obtainCursorSql(document, position).trim();
        if (!currentSql) return context;

        const prePostion = position.character === 0 ? position : new vscode.Position(position.line, position.character - 1);
        const preChart = position.character === 0 ? null : document.getText(new vscode.Range(prePostion, position));

        const wordMatch = currentSql.match(/(\w|-)+/ig);
        if (wordMatch) {
            if ((preChart == null || preChart == " " || preChart == ".") && wordMatch.length >= 1) {
                context.preWord = wordMatch[wordMatch.length - 1]
            } else {
                context.preWord = wordMatch[wordMatch.length - 2]
            }
        }

        context.preChart = preChart;
        context.currentSql = currentSql.trim();
        return context;
    }

}
