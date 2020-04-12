
import { Position, TextDocument } from "vscode";

export class Util {
    /**
     * trim array, got from SO.
     * @param origin origin array
     * @param attr duplicate check attribute
     */
    public static trim<T>(origin: T[], attr: string): T[] {
        const seen = new Set();
        return origin.filter((item) => {
            const temp = item[attr];
            return seen.has(temp) ? false : seen.add(temp);
        });
    }

    public static getDocumentLastPosition(document: TextDocument): Position {
        const lastLine = document.lineCount - 1;
        return new Position(lastLine, document.lineAt(lastLine).text.length);
    }

}