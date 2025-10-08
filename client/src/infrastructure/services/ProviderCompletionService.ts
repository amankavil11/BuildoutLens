import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export interface ProviderCompletionRequest {
    providerName: string;
    currentTemplateContent: string;
    cursorLine: number;
    cursorColumn: number;
}

export interface ProviderCompletionResponse {
    success: boolean;
    errorMessage?: string;
    providerName: string;
    isSnakeCase: boolean;
    needsProviderDefinition: boolean;
    suggestedProviderDefinition?: string;
    contexts: ProviderCompletionContext[];
}

export interface ProviderCompletionContext {
    templatePath: string;
    templateType: 'phased' | 'phaseless';
    resourceExamples: ResourceChunk[];
    providerMetadata?: ProviderInfo;
}

export interface ResourceChunk {
    resourceName: string;
    rawText: string;
    providerType: 'Library' | 'Custom' | 'Alias' | 'Builtin';
    providerReference: string;
    dependencies: string[];
    dependencyChunks: string[];
    aliasDefinitions: AliasDefinition[];
}

export interface AliasDefinition {
    aliasName: string;
    rawText: string;
}

export interface ProviderInfo {
    name: string;
    inputFields: any[];
    outputFields: any[];
}

export class ProviderCompletionService {
    constructor(private client: LanguageClient) {}
    
    async getProviderCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        providerName: string,
    ): Promise<ProviderCompletionResponse | null> {
        try {
            const request: ProviderCompletionRequest = {
                providerName,
                currentTemplateContent: document.getText(),
                cursorLine: position.line,
                cursorColumn: position.character
            };
            
            const response = await this.client.sendRequest<ProviderCompletionResponse>(
                'buildoutlens/providerCompletion',
                request
            );
            
            return response;
        } catch (error) {
            console.error('Failed to get provider completion:', error);
            return null;
        }
    }
    
    generateAIPrompt(response: ProviderCompletionResponse): string {
        const examples = response.contexts
            .flatMap(ctx => ctx.resourceExamples)
            .map(chunk => {
                let example = `# Example from ${chunk.providerType} provider usage:\n${chunk.rawText}`;
                
                if (chunk.dependencies.length > 0) {
                    example += '\n\n# Dependencies:\n';
                    example += chunk.dependencyChunks.join('\n\n');
                }
                
                if (chunk.aliasDefinitions.length > 0) {
                    example += '\n\n# Provider definitions:\n';
                    example += chunk.aliasDefinitions.map(a => a.rawText).join('\n\n');
                }
                
                return example;
            })
            .join('\n\n---\n\n');
        
        console.log("Tagging context examples: " + examples);
        return `You are helping complete a provider definition. Here are examples of how this provider is used:\n\n${examples}`;
    }
    //NOT WORKING
    async handleAliasedProviderCompletion(editor: vscode.TextEditor, response: ProviderCompletionResponse): Promise<void> {
        if (!response.needsProviderDefinition) {
            return;
        }

        // Set up a one-time listener for the next document change
        const disposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
            if (e.document !== editor.document) return;

            // Find the resource name at the current cursor position
            const resourceName = this.getCurrentResourceName(editor.document, editor.selection.active.line);

            // If the resource name matches the response, trigger the provider definition suggestion
            if (resourceName === response.contexts[0]?.resourceExamples[0]?.resourceName) {
                disposable.dispose();
                await this.navigateToProvidersSection(editor, response);
            }
        });

        // Clean up listener after 30 seconds
        setTimeout(() => disposable.dispose(), 30000);
    }

    /**
     * Get the resource name for the current line by scanning upwards for a YAML key
     */
    private getCurrentResourceName(document: vscode.TextDocument, line: number): string | undefined {
        for (let i = line; i >= 0; i--) {
            const text = document.lineAt(i).text;
            const match = text.match(/^\s{2}([A-Za-z0-9_]+):\s*$/);
            if (match) {
                return match[1];
            }
        }
        return undefined;
    }
    
    //NOT WORKING
    private async navigateToProvidersSection(editor: vscode.TextEditor, response: ProviderCompletionResponse): Promise<void> {
        const document = editor.document;
        const text = document.getText();
        
        // Find or create providers section
        let providersLine = -1;
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === 'providers:') {
                providersLine = i;
                break;
            }
        }
        
        if (providersLine === -1) {
            // Find where to insert providers section (before imports if exists, otherwise at end)
            let insertLine = document.lineCount - 1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim() === 'imports:') {
                    insertLine = i - 1;
                    break;
                }
            }
            
            const edit = new vscode.WorkspaceEdit();
            edit.insert(
                document.uri,
                new vscode.Position(insertLine, lines[insertLine].length),
                '\n\nproviders:\n'
            );
            await vscode.workspace.applyEdit(edit);
            providersLine = insertLine + 2;
        }
        
        // Navigate to providers section with scroll
        const position = new vscode.Position(providersLine + 1, 2); // Indent by 2 spaces
        editor.selection = new vscode.Selection(position, position);
        
        // This will scroll the editor to make the position visible
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        
        // Wait a bit for the scroll to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        //TODO: show as ghost text instead of info window
        if (response.suggestedProviderDefinition) {
            vscode.window.showInformationMessage(
                'Add provider definition for ' + response.providerName,
                'Insert',
                'Cancel'
            ).then(async (action) => {
                if (action === 'Insert') {
                    const edit = new vscode.WorkspaceEdit();
                    edit.insert(
                        document.uri,
                        position,
                        response.suggestedProviderDefinition + '\n'
                    );
                    await vscode.workspace.applyEdit(edit);
                }
            });
        }
    }
}