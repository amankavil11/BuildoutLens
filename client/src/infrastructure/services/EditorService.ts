// /infrastructure/services/EditorService.ts
import * as vscode from 'vscode';

export interface IEditorService {
    getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor): Promise<string>;
    getSelectedTextWithLineNumbers(textEditor: vscode.TextEditor): Promise<string>;
    insertTextAtPosition(textEditor: vscode.TextEditor, position: vscode.Position, text: string): Promise<void>;
}

export class EditorService implements IEditorService {
    async getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor): Promise<string> {
        let currLine = textEditor.visibleRanges[0].start.line;
        const endLine = textEditor.visibleRanges[0].end.line;

        let code = '';
        for (; currLine <= endLine; currLine++) {
            const lineText = textEditor.document.lineAt(currLine).text;
            code += `${currLine + 1}: ${lineText}\n`;
        }
        return code;
    }

    async getSelectedTextWithLineNumbers(textEditor: vscode.TextEditor): Promise<string> {
        const selection = textEditor.selection;
        if (selection.isEmpty) {
            return this.getVisibleCodeWithLineNumbers(textEditor);
        }

        let code = '';
        for (let line = selection.start.line; line <= selection.end.line; line++) {
            const lineText = textEditor.document.lineAt(line).text;
            code += `${line + 1}: ${lineText}\n`;
        }
        return code;
    }

    async insertTextAtPosition(textEditor: vscode.TextEditor, position: vscode.Position, text: string): Promise<void> {
        await textEditor.edit(editBuilder => {
            editBuilder.insert(position, text);
        });
    }
}