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

        const codeLens: vscode.CodeLens[] = []
        const context = { inSingleQuoteString: false, inDoubleQuoteString: false, inComment: false, sql: '', start: null }

        const lineCount = Math.min(document.lineCount, 5000);
        for (var i = 0; i < lineCount; i++) {
            var text = document.lineAt(i).text
            for (let j = 0; j < text.length; j++) {
                const ch = text.charAt(j);
                // comment check
                if (ch == '*' && text.charAt(j + 1) == '/') {
                    j++;
                    context.inComment = false;
                    continue;
                }
                if (context.inComment) continue;
                // string check
                if (ch == `'`) {
                    context.inSingleQuoteString = !context.inSingleQuoteString;
                    continue;
                } else if (ch == `"`) {
                    context.inDoubleQuoteString = !context.inDoubleQuoteString;
                    continue;
                }
                if (context.inSingleQuoteString || context.inDoubleQuoteString) continue;
                // line comment
                if (ch == '-' && text.charAt(j + 1) == '-') break;
                // block comment start
                if (ch == '/' && text.charAt(j + 1) == '*') {
                    j++;
                    context.inComment = true;
                    continue;
                }
                // check sql end 
                if (ch == delimter) {
                    if (!context.start) continue;
                    const range = new vscode.Range(context.start, new vscode.Position(i, j + 1));
                    if (current && (range.contains(current) || range.start.line > current.line)) {
                        return context.sql;
                    }
                    codeLens.push(new vscode.CodeLens(range, { command: "mysql.codeLens.run", title: "▶ Run SQL", arguments: [context.sql], }));
                    context.sql = ''
                    context.start = null
                    continue;
                }

                if (!context.start) {
                    context.start = new vscode.Position(i, j)
                }
                context.sql = context.sql + ch;
                // if end withtout delimter
                if (i == lineCount - 1 && j == text.length - 1) {
                    const range = new vscode.Range(context.start, new vscode.Position(i, j + 1));
                    if (current) return context.sql;
                    codeLens.push(new vscode.CodeLens(range, { command: "mysql.codeLens.run", title: "▶ Run SQL", arguments: [context.sql], }));
                }
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