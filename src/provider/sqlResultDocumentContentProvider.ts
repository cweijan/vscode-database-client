import { ExtensionContext, TextDocumentContentProvider, Uri } from "vscode";

export class SqlResultDocumentContentProvider implements TextDocumentContentProvider {

    private _context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    public provideTextDocumentContent(uri: Uri): Thenable<string> {

        const self = this;
        return new Promise((resolve, reject) => {
            const head = [].concat(
                "<!DOCTYPE html>",
                "<html>",
                "<head>",
                '<meta http-equiv="Content-type" content="text/html;charset=UTF-8">',
                "<style>table{border-collapse:collapse; }table,td,th{border:1px dotted #ccc; padding:5px;}th {background:#444} </style>",
                "</head>",
                "<body>",
            ).join("\n");

            const body = self._render(JSON.parse(uri.query));

            const tail = [
                "</body>",
                "</html>",
            ].join("\n");

            resolve(head + body + tail);
        });
    }

    private _render(rows) {
        if (rows.length === 0) {
            return "No data";
        }

        let head = "";
        for (const field in rows[0]) {
            if (rows[0].hasOwnProperty(field)) {
                head += "<th>" + field + "</th>";
            }
        }
        let body = "<table><tr>" + head + "</tr>";
        rows.forEach((row) => {
            body += "<tr>";
            for (const field in row) {
                if (row.hasOwnProperty(field)) {
                    body += "<td>" + row[field] + "</td>";
                }
            }

            body += "</tr>";
        });

        return body + "</table>";
    }

}
