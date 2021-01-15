import * as stripJsonComments from 'strip-json-comments';
import * as vscode from 'vscode';
import { ElasticCodeLensProvider } from './ElasticCodeLensProvider';
import { ElasticCompletionItemProvider } from './ElasticCompletionItemProvider';
import { ElasticMatch } from './ElasticMatch';

export async function activeEs(context: vscode.ExtensionContext) {

    const languages = ['es'];

    context.subscriptions.push(vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)));

    let esCompletionHover = new ElasticCompletionItemProvider(context);
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(languages, esCompletionHover, '/', '?', '&', '"'));
    context.subscriptions.push(vscode.languages.registerHoverProvider(languages, esCompletionHover));

    context.subscriptions.push(vscode.commands.registerCommand('elastic.execute', (em: ElasticMatch) => {
        if (!em) {
            // em = esMatches.Selection
            vscode.window.showErrorMessage("....")
        }
        executeQuery(em)

    }));

    context.subscriptions.push(vscode.commands.registerCommand('elastic.lint', (em: ElasticMatch) => {

        try {
            let l = em.Method.Range.start.line + 1
            const editor = vscode.window.activeTextEditor
            const config = vscode.workspace.getConfiguration('editor');
            const tabSize = +config.get('tabSize');

            editor.edit(editBuilder => {
                if (em.HasBody) {
                    let txt = editor.document.getText(em.Body.Range)
                    editBuilder.replace(em.Body.Range, JSON.stringify(JSON.parse(em.Body.Text), null, tabSize))
                }
            });
        } catch (error) {
            console.log(error.message)
        }
    }));


}

export async function executeQuery(em: ElasticMatch) {
    // 操作em对象即可
    stripJsonComments(em.Body.Text)
}

// this method is called when your extension is deactivated
export function deactivate() {
}