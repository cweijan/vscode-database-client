import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class TableDetecherChain implements ComplectionChain {

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {

        if (complectionContext.preWord && complectionContext.preWord.match(/\b(select|on|where)\b/ig)) {

            let tableMatch = /(from|join)\s*(\w+)/ig

            return [new vscode.CompletionItem("test", vscode.CompletionItemKind.Class)];
        }

        return null;
    }

    public stop(): boolean {
        return true;
    }



}