import { timeStamp } from "node:console";
import { Position, Range } from "vscode";
import { SQLToken } from "./sqlBlcok";

export class TokenContext {
    tokens: SQLToken[] = []; word: string = ''; wordStart: Position;

    public appendChar(i: number, j: number, char: string) {
        if (char.match(/\s/)) {
            this.endToken(i, j)
        } else if (char.match(/[\.,]/)) {
            this.endToken(i, j)
            this.addChar(i, j, char)
            this.endToken(i, j + 1)
        } else {
            this.addChar(i, j, char)
        }
    }

    private addChar(i: number, j: number, char: string) {
        if (!this.wordStart) {
            this.wordStart = new Position(i, j)
        }
        this.word = this.word + char;
    }

    public endToken(i: number, j: number) {
        if (!this.wordStart) return;
        this.tokens.push({
            content: this.word,
            range: new Range(this.wordStart, new Position(i, j))
        })
        this.word = '';
        this.wordStart = null;
    }

}