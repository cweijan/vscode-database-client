import { DatabaseType } from '@/common/constants';
import { DelimiterHolder } from '@/service/common/delimiterHolder';
import { ConnectionManager } from '@/service/connectionManager';
import * as vscode from 'vscode';
import { SQLBlock } from './sqlBlcok';
import { SQLContext } from './sqlContext';

export class SQLParser {

    public static parseBlockSingle(document: vscode.TextDocument, current?: vscode.Position): SQLBlock {
        return this.parseBlocks(document, current)[0]
    }

    public static parseBlocks(document: vscode.TextDocument, current?: vscode.Position): SQLBlock[] {


        const dbType=this.getDbType()
        const delimter = this.getDelimter();

        const context = new SQLContext();

        const lineCount = Math.min(document.lineCount, 5000);
        for (var i = 0; i < lineCount; i++) {
            var text = document.lineAt(i).text

            // check change DELIMITER 
            if (text.match(/^DELIMITER/i)) {
                let block = context.endContext(i, 0)
                block = context.append(i, 0, text).endContext(i, text.length)
                if (this.hitCursor(block, current)) return [block]
                continue;
            }

            for (let j = 0; j < text.length; j++) {
                const ch = text.charAt(j);
                // comment check
                if (ch == '*' && text.charAt(j + 1) == '/') {
                    j++;
                    context.inComment = false;
                    continue;
                }
                if (context.inComment) continue;
                if (!context.isString(ch)) {
                    // line comment
                    if (ch == '-' && text.charAt(j + 1) == '-') break;
                    // block comment start
                    if (ch == '/' && text.charAt(j + 1) == '*') {
                        j++;
                        context.inComment = true;
                        continue;
                    }
                    // check sql end 
                    const notInDDL=!context.inDDL || dbType!=DatabaseType.MYSQL;
                    if (ch == delimter && notInDDL) {
                        const block = context.endContext(i, j)
                        if (this.hitCursor(block, current)) return [block];
                        continue;
                    }
                }

                context.append(i, j, ch)
            }

            if (context.sql) {
                context.append(i, text.length, '\n')
            }

        }

        // check end withtout delimter
        const block = context.endContext(lineCount, document.lineAt(lineCount-1).text.length)
        if (block && current) {
            return [block]
        }

        return context.getBlocks();

    }

    private static getDbType(){
        return ConnectionManager.tryGetConnection()?.dbType;
    }

    private static hitCursor(block: SQLBlock, current?: vscode.Position) {
        if (block == null || current == null) return false;
        const range = block.range;
        return range.contains(current) || range.start.line > current.line;
    }

    private static getDelimter() {

        const node = ConnectionManager.tryGetConnection()
        if (node) {
            return DelimiterHolder.get(node.getConnectId()).replace(/\\/g, '')
        }
        return ";";
    }

}