import * as vscode from "vscode";
import { QueryUnit } from "../../service/queryUnit";

export interface ComplectionChain {
    getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

    stop(): boolean;
}

export class ComplectionContext {

    public preChart: string;
    public preWord: string;
    public currentWord: string;
    public currentSql: string;
    public currentSqlFull: string;

    public static build(document: vscode.TextDocument, position: vscode.Position): ComplectionContext {

        const context = new ComplectionContext();
        const currentSql = QueryUnit.obtainCursorSql(document, position).trim();
        context.currentSqlFull = QueryUnit.obtainCursorSql(document, position, document.getText()).trim();
        if (!context.currentSqlFull) { return context; }

        const prePostion = position.character === 0 ? position : new vscode.Position(position.line, position.character - 1);
        const preChart = position.character === 0 ? null : document.getText(new vscode.Range(prePostion, position));

        const wordMatch = currentSql.match(/(\w|-|\_|\*|\.)+/g);
        if (wordMatch) {
            if ((preChart == null || preChart.match(/[\. \(\)\[\]\'\"]/)) && wordMatch.length >= 1) {
                context.preWord = wordMatch[wordMatch.length - 1];
            } else {
                context.preWord = wordMatch[wordMatch.length - 2];
            }
        }
        context.preWord=context.preWord?.replace(/\.$/,'')
        const codeMatch = currentSql.match(/(\w|=|<|>|\()+$/);
        if (codeMatch) {
            context.currentWord = codeMatch[0];
        }

        context.preChart = preChart;
        context.currentSql = currentSql.trim();
        return context;
    }

}
