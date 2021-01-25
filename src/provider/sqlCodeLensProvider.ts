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
        const lineCount = Math.min(document.lineCount, 500);
        for (var i = 0; i < lineCount; i++) {
            var line = document.lineAt(i)
            var text = line.text?.replace(/(--|#).+/,'');
            sql = sql +"\n"+ text;

            if (text?.trim() && !start) {
                start = new vscode.Position(i, 0)
            }

            let sep = text.indexOf(";")
            if (start && (lineCount - 1 == i)) {
                sep=text.length;
            }
            if (sep != -1) {
                end = new vscode.Position(i, sep)
                codeLens.push(new vscode.CodeLens(new vscode.Range(start, end), {
                    command: "mysql.codeLens.run",
                    title: "Run SQL",
                    arguments: [sql],
                }));
                start = null;
                sql = text.substr(sep)
                continue;
            }
        }

        return codeLens

    }

}