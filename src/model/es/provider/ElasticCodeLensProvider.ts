import * as vscode from 'vscode';
import { DocumentFinder } from './documentFinder';
import { ElasticMatches } from './ElasticMatches'

export class ElasticCodeLensProvider implements vscode.CodeLensProvider {
    public constructor(context: vscode.ExtensionContext) {
    }

    public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }
        var esMatches = new ElasticMatches(editor);
        const ret: vscode.CodeLens[] = [];

        esMatches.Matches.forEach(em => {
            if (em.Error.Text == null) {
                ret.push(new vscode.CodeLens(em.Method.Range, {
                    title: "▶ Run Query",
                    command: "mysql.elastic.execute",
                    arguments: [em, false]
                }))
                ret.push(new vscode.CodeLens(em.Method.Range, {
                    title: "▶ Run Query And Parse",
                    command: "mysql.elastic.execute",
                    arguments: [em, true]
                }))
                if (DocumentFinder.find(em.Path.Text)) {
                    ret.push(new vscode.CodeLens(em.Method.Range, {
                        title: "📃 Api Document",
                        command: "mysql.elastic.document",
                        arguments: [em]
                    }))
                }
                if (em.HasBody) {
                    var command = {
                        title: "⚡Auto indent",
                        command: "mysql.elastic.lint",
                        arguments: [em]
                    }
                    ret.push(new vscode.CodeLens(em.Method.Range, command))
                }
            }
            else {
                if (em.Error.Text != null) {
                    ret.push(new vscode.CodeLens(em.Method.Range, {
                        title: "⚠️Invalid Json",
                        command: ""
                    }))
                }
            }
        });
        return ret;
    }
}