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
        // TODO
        const prePostion = position.character === 0 ? position : new vscode.Position(position.line, position.character - 1);
        const preChart = document.getText(new vscode.Range(prePostion, position));
        const wordRange = document.getWordRangeAtPosition(prePostion);
        let inputWord = document.getText(wordRange);

        const currentSql = QueryUnit.obtainCursorSql(document, position);
        const wordMatch = currentSql.match(/(\w|-)+/ig);
        let preWord: string;
        if (wordRange == null || preChart.trim() == "") {
            preWord = wordMatch[wordMatch.length - 1];
        } else if (wordMatch.length > 1) {
            preWord = wordMatch[wordMatch.length - 2];
        }

        if (wordRange == null && preWord != null) {
            inputWord = preWord;
        }
        const context = new ComplectionContext();
        context.preChart = preChart;
        context.preWord = preWord;
        context.currentWord = inputWord;
        context.currentSql = currentSql.trim();
        return context;
    }

}
