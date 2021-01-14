'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import url = require('url');
import path = require('path');
import * as fs from 'fs';
import * as os from 'os';


import { Selection, TextDocument } from 'vscode';

import { ElasticCompletionItemProvider } from './ElasticCompletionItemProvider'
import { ElasticCodeLensProvider } from './ElasticCodeLensProvider'
import { ElasticDecoration } from './ElasticDecoration'
import { ElasticMatch } from './ElasticMatch'
import { ElasticMatches } from './ElasticMatches'

import * as stripJsonComments from 'strip-json-comments';

// import { JSONCompletionItemProvider } from "./JSONCompletionItemProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activeEs(context: vscode.ExtensionContext) {

    const languages = ['es'];
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)));

    // let provider = new JSONCompletionItemProvider();
    // provider.init().then((result) => {
    //     if (!result.success) {
    //         console.log(`CompletionItemProvider init failed: ${(result.error.message)}`);
    //         vscode.window.showErrorMessage('Something went wrong. Please see the console!');
    //     }

    //     else {
    //         console.log(`CompletionItemProvider successfully loaded ${provider.count} items from '${provider.filepath}'.`);
    //         vscode.window.showInformationMessage('Ready!');
    //         context.subscriptions.push(vscode.languages.registerCompletionItemProvider(languages, provider));
    //     }
    // });

    // vscode.languages.registerCompletionItemProvider('es', {
    //     provideCompletionItems(document, position, token) {
    //         // return [new vscode.CompletionItem('Hello World')];
    //         var g = document.lineAt(position.line).text[position.character - 1];
    //         return null;
    //     }
    // });


    let esMatches: ElasticMatches
    let decoration: ElasticDecoration

    function checkEditor(document: vscode.TextDocument): Boolean {
        if (document === vscode.window.activeTextEditor.document && document.languageId == 'es') {
            if (esMatches == null || decoration == null) {
                esMatches = new ElasticMatches(vscode.window.activeTextEditor)
                decoration = new ElasticDecoration(context)
            }
            return true
        }
        return false
    }

    if (checkEditor(vscode.window.activeTextEditor.document)) {
        esMatches = new ElasticMatches(vscode.window.activeTextEditor)
        decoration.UpdateDecoration(esMatches)
    }


    vscode.workspace.onDidChangeTextDocument((e) => {
        if (checkEditor(e.document)) {
            esMatches = new ElasticMatches(vscode.window.activeTextEditor)
            decoration.UpdateDecoration(esMatches)
        }
    });

    vscode.workspace.onDidChangeConfiguration((e) => {
        //vscode.window.showInformationMessage('Ready!');
    });

    vscode.window.onDidChangeTextEditorSelection((e) => {
        if (checkEditor(e.textEditor.document)) {
            esMatches.UpdateSelection(e.textEditor)
            decoration.UpdateDecoration(esMatches)
        }
    });
    let esCompletionHover = new ElasticCompletionItemProvider(context);

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(languages, esCompletionHover, '/', '?', '&', '"'));
    context.subscriptions.push(vscode.languages.registerHoverProvider(languages, esCompletionHover));

    context.subscriptions.push(vscode.commands.registerCommand('elastic.execute', (em: ElasticMatch) => {
        if (!em) {
            em = esMatches.Selection
        }
        executeQuery(context,  em)

    }));

    context.subscriptions.push(vscode.commands.registerCommand('elastic.open', (em: ElasticMatch) => {
        var column = 0
        let uri = vscode.Uri.file(em.File.Text)
        return vscode.workspace.openTextDocument(uri)
            .then(textDocument => vscode.window.showTextDocument(textDocument, column ? column > vscode.ViewColumn.Three ? vscode.ViewColumn.One : column : undefined, true))

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

export async function executeQuery(context: vscode.ExtensionContext,  em: ElasticMatch) {
    // 操作em对象即可
    stripJsonComments(em.Body.Text)
}

// this method is called when your extension is deactivated
export function deactivate() {
}