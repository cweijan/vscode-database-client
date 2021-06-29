import { CompletionItem, CompletionItemKind } from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export abstract class BaseChain implements ComplectionChain {
    protected needStop: boolean = false;
    abstract getComplection(context: ComplectionContext): CompletionItem[] | Promise<CompletionItem[]>;
    stop(): boolean {
        return this.needStop;
    }
    protected strToComplection(complections: string[], kind: CompletionItemKind = CompletionItemKind.Keyword): CompletionItem[] {
        return complections.map(item => {
            const complectionItem = new CompletionItem(item + " ");
            complectionItem.kind = kind;
            return complectionItem;
        })
    }
}