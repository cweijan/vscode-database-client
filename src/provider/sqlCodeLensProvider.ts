import * as vscode from 'vscode';

export class SqlCodeLensProvider implements vscode.CodeLensProvider {
    onDidChangeCodeLenses?: vscode.Event<void>;
    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        return this.parseCodeLens(document)
    }
    resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
        throw new Error('Method not implemented.');
    }

    public parseCodeLens(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {

        const codeLens = []

        let start: vscode.Position;
        let end: vscode.Position;
        let sql: string = "";
        for (var i = 0; i < document.lineCount; i++) {
            var line = document.lineAt(i)
            var text = line.text;
            sql = sql + text;

            if (!start) {
                // 0 need change to string start
                start = new vscode.Position(i, 0)
            }

            if (text.length == 0)
                continue

            const sep = text.indexOf(";")
            if (sep != -1) {
                end = new vscode.Position(i, sep)
                codeLens.push(new vscode.CodeLens(new vscode.Range(start, end), {
                    command: "mysql.codeLens.run",
                    title: "Run Query",
                    arguments: [sql],
                }));
                sql = ""
                let hasRemain=false;
                if (hasRemain) {
                    // start = new vscode.Position(i, sep + 1)
                } else {
                    start = null;
                }
                continue;
            }
        }


        return codeLens

    }

}