import * as vscode from 'vscode';
import { ElasticMatch } from './ElasticMatch'
import { Range } from 'vscode';
import { ElasticMatches } from './ElasticMatches'


export class ElasticDecoration {
    pHighlight: vscode.TextEditorDecorationType;
    bHighlight: vscode.TextEditorDecorationType;
    bHighlightSelected: vscode.TextEditorDecorationType;
    mHighlight: vscode.TextEditorDecorationType;
    errHighlight: vscode.TextEditorDecorationType;

    context: vscode.ExtensionContext;

    public constructor(context: vscode.ExtensionContext) {
        this.context = context
        const host: string = this.context.workspaceState.get("elastic.host", null);


        this.pHighlight = vscode.window.createTextEditorDecorationType({          
            light: {
                color: 'rgb(0,191,171)',
                // after: { contentText: ' • ' + host, color: 'lightgray' }
            },
            dark: {
                color: 'rgb(0,191,171)',
                // after: { contentText: ' • ' + host, color: 'gray' }
            }
        });

        this.bHighlight = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            light: {
                gutterIconSize: 'contain',
                backgroundColor: 'rgba(200, 200, 200, 0.2)',
                gutterIconPath: this.context.asAbsolutePath("./media/gutter-dis-light.svg"),
            },
            dark: {
                gutterIconSize: 'contain',
                backgroundColor: 'rgba(50, 50, 50, 0.3)',
                gutterIconPath: this.context.asAbsolutePath("./media/gutter-dis-dark.svg"),//vscode.Uri.parse('data:image/svg+xml;base64,PHN2ZyB4b+'),
            }
        });

        this.bHighlightSelected = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            gutterIconPath: this.context.asAbsolutePath("./media/gutter.svg"),//vscode.Uri.parse('data:image/svg+xml;base64,PHN2ZyB4b+'),
            gutterIconSize: 'contain',
            light: {
                backgroundColor: 'rgba(200, 200, 200, 0.2)'
            },
            dark: {
                backgroundColor: 'rgba(50, 50, 50, 0.3)'
            }
        });

        this.mHighlight = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            light: {
                color: '#EF5098'
            },
            dark: {
                color: '#EF5098'
            },
            overviewRulerColor: '#0271bc',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        this.errHighlight = vscode.window.createTextEditorDecorationType({
            borderWidth: '1px',
            borderStyle: 'solid',
            light:
                {
                    borderColor: 'rgba(255,0,0,0.5)',
                    backgroundColor: 'rgba(255,0,0,0.25)'
                },
            dark:
                {
                    borderColor: 'rgba(255,0,0,0.5)',
                    backgroundColor: 'rgba(255,0,0,0.25)'
                },
            overviewRulerColor: 'rgba(255,0,0,0.5)',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });
    }

    public UpdateDecoration(esMatches: ElasticMatches) {

        var host = this.context.workspaceState.get("elastic.host", "http://localhost:9200")
        var editor = esMatches.Editor
        var matches = esMatches.Matches

        editor.setDecorations(this.mHighlight, matches.map(m => m.Method.Range).filter(x => !!x));
        editor.setDecorations(this.pHighlight, matches.map(p => p.Path.Range).filter(x => !!x));
        editor.setDecorations(this.bHighlight, matches.filter(x => !x.Selected).map(b => b.Range).filter(x => !!x));
        editor.setDecorations(this.errHighlight, matches.map(e => e.Error.Range).filter(x => !!x));
        editor.setDecorations(this.bHighlightSelected, matches.filter(x => x.Selected).map(b => b.Range));


    }
}