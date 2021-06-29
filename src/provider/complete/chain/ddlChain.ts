import * as vscode from "vscode";
import { CompletionItem } from "vscode";
import { ComplectionContext } from "../complectionContext";
import { BaseChain } from "./baseChain";

export class DDLChain extends BaseChain {

    private keywordComplectionItems: vscode.CompletionItem[] = this.strToComplection(["Table", "Procedure", "View", "Function", "Trigger"])
    private typeList: vscode.CompletionItem[] = this.strToComplection(["INTEGER", "CHAR", "VARCHAR", "DECIMAL", "SMALLINT", "TINYINT", "MEDIUMINT", "BIGINT", "CHARACTER",
        "NUMERIC", "BIT", "INT", "FLOAT", "DOUBLE", "TEXT", "SET", "BLOB", "TIMESTAMP", "DATE", "TIME", "YEAR", "DATETIME"],vscode.CompletionItemKind.Variable);

    getComplection(complectionContext: ComplectionContext): CompletionItem[] | Promise<CompletionItem[]> {

        const firstToken = complectionContext.tokens[0]?.content?.toLowerCase()
        if (!firstToken) return []
        const secondToken = complectionContext.tokens[1]?.content?.toLowerCase()

        if (['create', 'alter', 'drop'].indexOf(firstToken) == -1) {
            return []
        }

        this.needStop = true;
        if (!secondToken) {
            return this.keywordComplectionItems;
        }

        if (firstToken == 'create') {
            switch (secondToken) {
                case 'table':
                    return this.strToComplection(["AUTO_INCREMENT", "NULL", "NOT", "PRIMARY", "CURRENT_TIME", "REFERENCES",
                        "DEFAULT", "COMMENT", "UNIQUE", "KEY", "FOREIGN", "CASCADE", "RESTRICT", "UNSIGNED", "CURRENT_TIMESTAMP"]).concat(this.typeList)
            }
        } else {
            switch (secondToken) {
                case 'table':
                    return this.typeList;
                case 'procedure':
                    return this.typeList;
                case 'function':
                    return this.typeList;
                case 'view': break;
                case 'trigger': break;
            }
        }


        return [];
    }

}