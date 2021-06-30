import { Position, Range } from "vscode";
import { SQLToken } from "./sqlBlcok";

export class TokenContext {
    tokens: SQLToken[] = [];
    preivous: SQLToken = null;
    word: string = '';
    wordStart: Position;

    public appendChar(i: number, j: number, char: string) {
        if (char.match(/\s/)) {
            this.endToken(i, j)
        } else if (char == '.') {
            const pre = this.preivous;
            this.splitToken(i, j, char)
            if (pre?.content?.match(/into|from|update|table|join/i)) {
                this.getToken(-1).type = 'schema_dot'
                this.getToken(-2).type = 'schema'
            }
        } else if (char.match(/[\(\),]/)) {
            this.splitToken(i, j, char)
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

    public splitToken(i: number, j: number, divide: string) {
        this.endToken(i, j)
        this.addChar(i, j, divide)
        this.endToken(i, j + 1)
    }
    public endToken(i: number, j: number) {
        if (!this.wordStart) return;
        const token: SQLToken = {
            content: this.word, type: this.getType(),
            range: new Range(this.wordStart, new Position(i, j))
        };
        this.preivous = token;
        this.tokens.push(token)
        this.word = '';
        this.wordStart = null;
    }

    private getToken(index: number): SQLToken {
        if (index > 0) return this.tokens[index];
        return this.tokens[this.tokens.length + index]
    }

    private getType(): string {
        if (this.preivous) {
            if (
                (this.preivous.content.match(/into|from|update|table|join/i)) ||
                (this.preivous.type == 'schema_dot')
            ) {
                return 'table'
            }
        }
        return 'text'
    }

}