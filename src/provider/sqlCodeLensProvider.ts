import { ConfigKey } from '@/common/constants';
import { Global } from '@/common/global';
import { DelimiterHolder } from '@/service/common/delimiterHolder';
import { ConnectionManager } from '@/service/connectionManager';
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

        if (Global.getConfig<number>(ConfigKey.DISABLE_SQL_CODELEN)) {
            return []
        }

        const delimter = this.getDelimter();

        const codeLens = []

        let start: vscode.Position;
        let end: vscode.Position;
        let sql: string = "";
        let inBlockComment = false;
        const lineCount = Math.min(document.lineCount, 3000);
        for (var i = 0; i < lineCount; i++) {
            let col = 0;
            var line = document.lineAt(i)
            var text = line.text?.replace(/(--|#).+/, '');
            if (inBlockComment) {
                const blockEndMatch = text.match(/.*?(\*\/)/)
                if (!blockEndMatch) {
                    continue;
                }
                inBlockComment = false;
                text = text.replace(/.*?(\*\/)/, '')
                col = blockEndMatch[0].length
            } else {
                const blockComment = text.match(/(\/\*).*?(\*\/)?/)
                inBlockComment = blockComment && blockComment[2] == null;
                if (inBlockComment) {
                    continue;
                }
            }

            if (text == '') continue;
            sql = sql + "\n" + text;

            if (text?.trim() && !start) {
                start = new vscode.Position(i, col)
            }

            let sep = text.indexOf(delimter)
            if (start && (lineCount - 1 == i)) {
                sep = text.length;
            }
            if (sep != -1) {
                end = new vscode.Position(i, sep)
                codeLens.push(new vscode.CodeLens(new vscode.Range(start, end), {
                    command: "mysql.codeLens.run",
                    title: "Run SQL",
                    arguments: [sql],
                }));
                start = null;
                sql = text.substr(sep + delimter.length)
                continue;
            }
        }

        return codeLens

    }
    private getDelimter() {

        const node = ConnectionManager.tryGetConnection()
        if (node) {
            return DelimiterHolder.get(node.getConnectId()).replace(/\\/g, '')
        }
        return ";";
    }

}