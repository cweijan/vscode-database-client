import * as vscode from "vscode";
import { ColumnChain } from "./chain/columnChain";
import { KeywordChain } from "./chain/keywordChain";
import { TableChain } from "./chain/tableChain";
import { TableCreateChain } from "./chain/tableCreatingChain";
import { TypeKeywordChain } from "./chain/typeKeywordChain";
import { ComplectionChain, ComplectionContext } from "./complectionContext";
import { TableDetecherChain } from "./chain/tableDetecherChain";
import { FunctionChain } from "./chain/functionChain";
import { Console } from "../../common/Console";

export class CompletionProvider implements vscode.CompletionItemProvider {
    constructor() {
        this.initDefaultComplectionItem();
    }

    private fullChain: ComplectionChain[];

    private initDefaultComplectionItem() {
        // The chain is orderly
        this.fullChain = [
            new TableCreateChain(),
            new TypeKeywordChain(),
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
            try {
                const tempComplection = await chain.getComplection(context);
                if (tempComplection != null) {
                    completionItemList = completionItemList.concat(tempComplection);
                    if (chain.stop()) {
                        break;
                    }
                }
            } catch (err) {
                Console.log(err)
            }
        }

        return completionItemList;
    }

    public resolveCompletionItem?(item: vscode.CompletionItem): vscode.ProviderResult<vscode.CompletionItem> {

        return item;
    }

}
