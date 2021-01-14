import * as vscode from 'vscode';
import { ElasticMatch } from './ElasticMatch'
import { ElasticDecoration } from './ElasticDecoration'
import { ElasticMatches } from './ElasticMatches'

export class ElasticCodeLensProvider implements vscode.CodeLensProvider {
    decoration: ElasticDecoration;
    context: vscode.ExtensionContext;

    public constructor(context: vscode.ExtensionContext) {
        this.context = context
        this.decoration = new ElasticDecoration(context)
    }

    public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {

        var esMatches = new ElasticMatches(vscode.window.activeTextEditor)

        var ret = [];

        esMatches.Matches.forEach(em => {
            if (em.Error.Text == null) {
                ret.push(new vscode.CodeLens(em.Method.Range, {
                    title: "▶ Run Query",
                    command: "elastic.execute",
                    arguments: [em]
                }))

                if (em.HasBody) {
                    var command = {
                        title: "⚡Auto indent",
                        command: "elastic.lint",
                        arguments: [em]
                    }

                    if (em.File && em.File.Text) {

                        command = {
                            title: "📂Open File",
                            command: "elastic.open",
                            arguments: [em]
                        }
                    }
                    ret.push(new vscode.CodeLens(em.Method.Range, command))
                }
            }
            else {
                if (em.File) {
                    command = {
                        title: "⚠️File NotExist",
                        command: "",
                        arguments: undefined
                    }
                    if (em.File.Text) {
                        command = {
                            title: "⚠️Invalid JsonFile",
                            command: "",
                            arguments: undefined
                        }
                    }
                    ret.push(new vscode.CodeLens(em.Method.Range, command))
                }
                else if (em.Error.Text != null) {
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