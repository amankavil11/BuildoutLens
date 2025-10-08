import * as vscode from 'vscode';
import { IFileService } from '../../application/interfaces/index';

export class FileService implements IFileService {
    async createFileInWorkspace(fileName: string, content: string): Promise<void> {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (!wsFolders || wsFolders.length === 0) {
            throw new Error('No workspace folder is open');
        }

        const wsPath = wsFolders[0].uri.fsPath;
        const filePath = vscode.Uri.file(`${wsPath}/${fileName}`);
        
        try {
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, 'utf8'));
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
        } catch (err) {
            throw new Error(`Failed to create file in workspace: ${err}`);
        }
    }

    async createUntitledDocument(fileName: string, content: string): Promise<void> {
        const uri = vscode.Uri.parse(`untitled:${fileName}`);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), content);
        });
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch (error) {
            return false;
        }
    }

    async readFile(filePath: string): Promise<string> {
        try {
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(content).toString('utf8');
        } catch (error) {
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        } catch (error) {
            throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
