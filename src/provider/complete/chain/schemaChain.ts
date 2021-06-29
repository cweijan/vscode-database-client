import { ModelType } from "@/common/constants";
import * as vscode from "vscode";
import { ComplectionContext } from "../complectionContext";
import { NodeFinder } from "../nodeFinder";
import { BaseChain } from "./baseChain";

export class SchemaChain extends BaseChain {

    public async getComplection(context: ComplectionContext) {
        const firstToken = context.tokens[0]?.content?.toLowerCase()
        if (!firstToken || ['select', 'insert', 'update', 'delete', 'call', 'execute'].indexOf(firstToken) == -1) {
            return null;
        }
        const previous = context.previousToken?.content?.toLowerCase()
        if (previous && previous.match(/into|from|update|table|join/ig)) {
            this.requestStop()
            return this.nodeToComplection(await NodeFinder.findNodes(null, ModelType.SCHEMA), vscode.CompletionItemKind.Folder).concat(
                this.nodeToComplection(await NodeFinder.findNodes(null, ModelType.TABLE, ModelType.VIEW), vscode.CompletionItemKind.Function)
            );
        }

        return null;
    }

}

