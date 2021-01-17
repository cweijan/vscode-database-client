import { ConnectionManager } from '@/service/connectionManager';
import { QueryUnit } from '@/service/queryUnit';
import { stringify } from 'comment-json';
import * as vscode from 'vscode';
import { EsBaseNode } from '../model/esBaseNode';
import { DocumentFinder } from './documentFinder';
import { ElasticCodeLensProvider } from './ElasticCodeLensProvider';
import { ElasticCompletionItemProvider } from './ElasticCompletionItemProvider';
import { ElasticMatch } from './ElasticMatch';

export async function activeEs(context: vscode.ExtensionContext) {
    const languages = { language: 'es' };
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(languages, new ElasticCompletionItemProvider(), '/', '?', '&', '"'),
        vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)),
        vscode.commands.registerCommand('mysql.elastic.execute',  (em: ElasticMatch) => {
            const node = ConnectionManager.getByActiveFile() as EsBaseNode;
            if(node==null){
                vscode.window.showErrorMessage("Not active es found!")
                return;
            }
            QueryUnit.runQuery(`${em.Method.Text} ${em.Path.Text}\n${em.Body.Text}`,node)
        }),
        vscode.commands.registerCommand('mysql.elastic.lint', (em: ElasticMatch) => {
            if (em && em.HasBody) {
                vscode.window.activeTextEditor.edit(editBuilder => {
                    editBuilder.replace(em.Body.Range, stringify(em.Body.obj, null, 2))
                });
            }
        }),
        vscode.commands.registerCommand('mysql.elastic.document', (em: ElasticMatch) => {
            DocumentFinder.open(em.Path.Text)
        })
    );
}