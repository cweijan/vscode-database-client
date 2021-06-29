import { Node } from "@/model/interface/node";
import { CompletionItem, CompletionItemKind } from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export abstract class BaseChain implements ComplectionChain {
    protected needStop: boolean = false;
    abstract getComplection(context: ComplectionContext): CompletionItem[] | Promise<CompletionItem[]>;
    stop(): boolean {
        return this.needStop;
    }
    protected requestStop(){
        this.needStop=true;
    }
    protected strToComplection(complections: string[], kind: CompletionItemKind = CompletionItemKind.Keyword): CompletionItem[] {
        return complections.map(item => {
            const completionItem = new CompletionItem(item + " ");
            completionItem.kind = kind;
            return completionItem;
        })
    }
    protected nodeToComplection(nodes: Node[], kind: CompletionItemKind): CompletionItem[] {
        return nodes.map(item => {
            const completionItem = new CompletionItem(item.label + " ");
            completionItem.kind = kind;
            completionItem.insertText = item.wrap(item.label);
            return completionItem;
        })
    }   
}