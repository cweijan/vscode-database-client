import * as vscode from "vscode";
import { ColumnChain } from "./chain/columnChain";
import { DatabaseChain } from "./chain/databaseChain";
import { KeywordChain } from "./chain/keywordChain";
import { TableChain } from "./chain/tableChain";
import { TableCreateChain } from "./chain/TableCreateChain";
import { TypeKeywordChain } from "./chain/typeKeywordChain";
import { ComplectionChain, ComplectionContext } from "./complectionContext";
import { TableDetecherChain } from "./chain/tableDetecherChain";
import { FunctionChain } from "./chain/functionChain";

export class CompletionProvider implements vscode.CompletionItemProvider {
    constructor() {
        this.initDefaultComplectionItem();
    }

    private fullChain: ComplectionChain[];

    private initDefaultComplectionItem() {
        // The chain is orderly
        // TODO 增加在Where和ON语句下的表检测
        this.fullChain = [
            new TableCreateChain(),
            new TypeKeywordChain(),
            new DatabaseChain(),
            new TableChain(),
            new ColumnChain(),
            new FunctionChain(),
            new TableDetecherChain(),
            new KeywordChain(),
        ];
    }

    /**
     * Main function
     * @param document
     * @param position
     */
    public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {

        const context = ComplectionContext.build(document, position);
        let completionItemList = [];
        for (const chain of this.fullChain) {
            const tempComplection = await chain.getComplection(context);
            if (tempComplection != null) {
                completionItemList = completionItemList.concat(tempComplection);
                if (chain.stop()) {
                    break;
                }
            }
        }

        return completionItemList;
    }

    public resolveCompletionItem?(item: vscode.CompletionItem): vscode.ProviderResult<vscode.CompletionItem> {

        return item;
    }

}
