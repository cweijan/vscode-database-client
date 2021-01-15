import { ConnectionManager } from '@/service/connectionManager';
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
        vscode.commands.registerCommand('mysql.elastic.execute', (em: ElasticMatch) => {
            const node = ConnectionManager.getByActiveFile() as EsBaseNode;
            node.loadData({
                type: em.Method.Text,content:em.Body.obj,path:em.Path.Text
            })
            // 操作em对象 em.Body.Text
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