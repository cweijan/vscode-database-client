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
        return this.parseCodeLensEnhance(document) as vscode.ProviderResult<vscode.CodeLens[]>;
    }

    public parseCodeLensEnhance(document: vscode.TextDocument, current?: vscode.Position): vscode.ProviderResult<vscode.CodeLens[]> | string {

        if (Global.getConfig<number>(ConfigKey.DISABLE_SQL_CODELEN)) {
            return []
        }

        const delimter = this.getDelimter();

        /**
         * TODO
         * 1. if string include delimter
         * 2. if one line include two sql.
         */

        const codeLens: vscode.CodeLens[] = []

        let start: vscode.Position;
        let end: vscode.Position;
        let sql: string = "";
        let inBlockComment = false;
        const lineCount = Math.min(document.lineCount, 3000);
        for (var i = 0; i < lineCount; i++) {
            let col = 0;
            var originText = document.lineAt(i).text
            var text = originText?.replace(/(--|#).+/, '')
                ?.replace(/\/\*.*?\*\//g, '')
            if (inBlockComment) {
                const blockEndMatch = text.match(/.*?\*\//)
                if (!blockEndMatch) {
                    continue;
                }
                inBlockComment = false;
                text = text.replace(/.*?\*\//, '')
                col = blockEndMatch[0].length
            } else {
                inBlockComment = text.match(/\/\*/) != null
                if (inBlockComment) {
                    text = text.replace(/\/\*.*?/, '')
                }
            }

            text=text.trim()
            if (text == '') continue;

            if (text && !start) {
                start = new vscode.Position(i, col)
            }

            let sep = text.indexOf(delimter)
            if (start && (lineCount - 1 == i)) {
                sep = text.length;
            }

            sql = sql + "\n" + (sep != -1 ? text.substr(0, sep) : text);

            if (sep != -1) {
                end = new vscode.Position(i, sep)
                const range = new vscode.Range(start, end);
                if (current && (range.contains(current) || range.start.line > current.line)) {
                    return sql;
                }
                codeLens.push(new vscode.CodeLens(range, {
                    command: "mysql.codeLens.run",
                    title: "▶ Run SQL",
                    arguments: [sql],
                }));
                start = null;
                sql = text.substr(sep + delimter.length)
                continue;
            }
        }

        if (current) {
            if (codeLens.length > 0) {
                return codeLens[codeLens.length - 1].command.arguments[0]
            }
            return document.getText()
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