import * as vscode from 'vscode';
import { Position } from "vscode";
import { SQLBlock } from './sqlBlcok';
import { TokenContext } from "./tokenContext";

export class SQLContext {

    private tokenContext: TokenContext = new TokenContext();
    private blocks: SQLBlock[] = [];
    inSingleQuoteString: boolean = false;
    inDoubleQuoteString: boolean = false;
    inComment: boolean = false;
    sql: string = "";
    start: Position;

    /**
     * append char to current SQL context.
     * @param i char line
     * @param j char column
     * @param ch char
     */
    public append(i: number, j: number, ch: string): SQLContext {
        this.tokenContext.appendChar(i, j, ch)
        if (!this.start) {
            if (ch.match(/^\s$/)) return this;
            this.start = new vscode.Position(i, j)
        }
        this.sql = this.sql + ch
        return this;
    }

    public endContext(i:number,j:number):SQLBlock{
        if (!this.start) return;
        this.tokenContext.endToken(i, j)
        const range = new vscode.Range(this.start, new vscode.Position(i, j + 1));
        const block: SQLBlock = { sql: this.sql, range, tokens: this.tokenContext.tokens, scopes: this.tokenContext.scopes };
        this.reset();
        this.blocks.push(block)
        return block;
    }

    public getBlocks():SQLBlock[]{
        return this.blocks;
    }

    /**
     * reset current context.
     */
    private reset() {
        this.sql=""
        this.start=null;
        this.inSingleQuoteString=false;
        this.inDoubleQuoteString=false;
        this.inComment=false;
    }

}