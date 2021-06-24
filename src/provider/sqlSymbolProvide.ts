import * as vscode from 'vscode';
import { SqlCodeLensProvider } from './codelen/sqlCodeLensProvider';

export class SQLSymbolProvide implements vscode.DocumentSymbolProvider {

    constructor(private codeLensProvider: SqlCodeLensProvider) { }

    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {

        return (this.codeLensProvider.parseCodeLens(document) as Array<vscode.CodeLens>).map(codeLen => {
            return new vscode.SymbolInformation(codeLen.command.arguments[0], vscode.SymbolKind.Function, null,
                new vscode.Location(document.uri, codeLen.range.start)
            )
        })
    }

}