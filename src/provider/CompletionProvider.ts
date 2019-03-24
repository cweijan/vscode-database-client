import * as vscode from 'vscode';
import { CompletionManager } from '../common/CompletionManager';

export class CompletionProvider implements vscode.CompletionItemProvider {


    constructor(private complectionManager = new CompletionManager()) { }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {

        return this.complectionManager.getComplectionItems(document, position)
    }
    resolveCompletionItem?(item: vscode.CompletionItem): vscode.ProviderResult<vscode.CompletionItem> {

        return item;
    }


}