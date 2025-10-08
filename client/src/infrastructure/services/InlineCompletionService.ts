import * as vscode from 'vscode';
import { VsCodeChatService } from './VsCodeChatService';
import { SectionType } from '../../domain/index';
import { ProviderCompletionService } from './ProviderCompletionService';
import { getCurrentYamlSection } from './YamlSectionUtils';

/**
 * Provides inline completions (ghost text) for YAML service templates
 * Converts AI suggestions into VS Code ghost text that users can Tab to accept
 */
export class InlineCompletionService {
    private providerCompletionService?: ProviderCompletionService;
    
    constructor(private chatService: VsCodeChatService) {}

    /**
     * Set the provider completion service
     */
    setProviderCompletionService(service: ProviderCompletionService) {
        this.providerCompletionService = service;
    }

    /**
     * Register the inline completion provider with VS Code
     */
    registerProvider(context: vscode.ExtensionContext): void {
        const provider: vscode.InlineCompletionItemProvider = {
            provideInlineCompletionItems: async (document, position, completionContext, token) => {
                return this.provideCompletions(document, position, completionContext, token);
            }
        };
        
        context.subscriptions.push(
            vscode.languages.registerInlineCompletionItemProvider(
                { scheme: '*', language: 'yaml' },
                provider
            )
        );
    }

    public dispose(): void {
    }

    /**
     * Main entry point: Convert AI suggestions to VS Code ghost text
     */
    private async provideCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        completionContext: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        //console.log('DEBUG: Providing completions for position:', position);
        
        // Skip if cancelled or not meaningful input
        if (token.isCancellationRequested) {
            //console.log('DEBUG: Completion cancelled by token');
            return new vscode.InlineCompletionList([]);
        }

        if (!this.shouldProvideCompletion(document, position, completionContext)) {
            //console.log('DEBUG: Context not suitable for completion');
            return new vscode.InlineCompletionList([]);
        }

        try {
            //console.log('DEBUG: Getting AI suggestions...');
            
            // Get AI suggestions
            const suggestions = await this.getAISuggestions(document, position);
            //console.log('DEBUG: Received AI suggestions:', suggestions);
            
            // Convert to VS Code ghost text items
            const items = this.createInlineCompletionItems(suggestions, position);
            //console.log('DEBUG: Created inline completion items:', items.items.length);
            
            return items;
            
        } catch (error) {
            //console.error('DEBUG: Error in provideCompletions:', error);
            return new vscode.InlineCompletionList([]);
        }
    }

    /**
     * Determine if we should provide completions based on context
     */
    private shouldProvideCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext
    ): boolean {
        // Get current line text up to cursor
        // const lineText = document.lineAt(position.line).text.substring(0, position.character);
        // const trimmedLine = lineText.trim();
        
        // //console.log('DEBUG: Checking completion context for line:', JSON.stringify(lineText));
        // console.log('DEBUG: Trimmed line:', JSON.stringify(trimmedLine));

        //check if it's a provider completion trigger
        const providerTrigger = this.isProviderCompletionTrigger(document, position);
        if (providerTrigger.isTriggered) {
            console.log('DEBUG: Provider completion trigger detected');
            return true;
        }

        //check for any valid section context
        const shouldTrigger = this.isValidTriggerContext(document, position);
        console.log('DEBUG: Should trigger completion:', shouldTrigger);
        return shouldTrigger;
    }

    /**
     * Check if current context should trigger completions based on YAML patterns
     */
    //TODO: FIX LOGIC
    private isValidTriggerContext(document: vscode.TextDocument, position: vscode.Position): boolean {
        const section = getCurrentYamlSection(document, position);
        //console.log('DEBUG: Current YAML section:', section);
        
        return (
            section === SectionType.Resources ||
            section === SectionType.Providers ||
            section === SectionType.BuildoutPhases ||
            section === SectionType.Imports
        );
    }

    /**
     * Detect provider completion trigger
     */
    private isProviderCompletionTrigger(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { isTriggered: boolean; providerName?: string; resourceName?: string } {
        // Check if we just pressed Enter after "provider: <name>"
        console.log("In isProviderCompletionTrigger");
        if (position.line === 0) {
            return { isTriggered: false };
        }
        
        const previousLine = document.lineAt(position.line - 1).text;
        const providerMatch = previousLine.match(/^\s*provider:\s*(.+?)\s*$/);
        
        if (!providerMatch) {
            console.log("Provider line in resource not found for: " + previousLine);
            return { isTriggered: false };
        }
        
        // Get the resource name by looking backwards
        let resourceName = '';
        for (let i = position.line - 2; i >= 0; i--) {
            const line = document.lineAt(i).text;
            const resourceMatch = line.match(/^(\s{2})(\w+):\s*$/);
            if (resourceMatch) {
                resourceName = resourceMatch[2];
                break;
            }
        }
        
        console.log("Provider and resource found!: " + providerMatch[1] + " " + resourceName);
        return {
            isTriggered: true,
            providerName: providerMatch[1],
            resourceName
        };
    }

    /**
     * Get AI suggestions for the current position
     */
    //make flow better with shouldProvideCompletion
    private async getAISuggestions(document: vscode.TextDocument, position: vscode.Position): Promise<any[]> {
        // Check for provider completion trigger
        const providerTrigger = this.isProviderCompletionTrigger(document, position);
        if (this.providerCompletionService) {
            console.log("provider completion service is not null");
        } else {
            console.log("provider completion service is null");
        }
        if (this.providerCompletionService) {
            console.log('DEBUG: Provider completion triggered for:', providerTrigger.providerName);
            
            // Get provider completion context from server
            const response = await this.providerCompletionService.getProviderCompletion(
                document,
                position,
                providerTrigger.providerName!
            );
            
            if (response && response.success && response.contexts.length > 0) {
                // Generate AI prompt with real examples
                const dynamicPrompt = this.providerCompletionService.generateAIPrompt(response);
                
                // Build messages with dynamic context
                const messages = [
                    dynamicPrompt,
                    `Current template:\n${document.getText()}`,
                    `Complete the properties for the ${providerTrigger.providerName} provider in resource ${providerTrigger.resourceName}.`,
                    `Use the contract dictionary to determine the provider’s input type, required and optional fields, and return type.`,
                    `Preserve exact formatting and indentation from the examples.`,
                    `Only complete the resource starting from properties:`,
                    `When suggesting field values, do not copy from examples; mimic the pattern using the current template’s service name.`
                ];
                
                // Get AI suggestions
                const suggestions = await this.chatService.getInlineCompletions(messages);
                // Handle two-part completion if needed
                // if (response.needsProviderDefinition) {
                //     const editor = vscode.window.activeTextEditor;
                //     if (editor) {
                //         console.log("handleAliasedProvider triggered");
                //         this.providerCompletionService.handleAliasedProviderCompletion(editor, response);
                //     }
                // }
                return suggestions;
            }
        }
        
        // Fall back to original logic
        return this.getOriginalAISuggestions(document, position);
    }

    /**
     * Original AI suggestions method (fallback)
     */
    private async getOriginalAISuggestions(document: vscode.TextDocument, position: vscode.Position): Promise<any[]> {
        // Build minimal context
        console.log("In getOriginalAISuggestions");
        const lineText = document.lineAt(position.line).text.substring(0, position.character);
        const templateContent = document.getText();
        const section = getCurrentYamlSection(document, position);
        
        const messages = [
            `Current template:\n${templateContent}`,
            `Cursor at line ${position.line + 1}, column ${position.character}`,
            `Current section to complete: ${section}`,
            `Current line text: "${lineText}"`
        ];

        //console.log('DEBUG: Getting AI suggestions with messages:', messages);

        // Check availability and get suggestions
        if (!await this.chatService.isAvailable()) {
            //console.log('DEBUG: Chat service not available');
            return [];
        }

        try {
            const suggestions = await this.chatService.getInlineCompletions(messages);
            //console.log('DEBUG: Raw AI suggestions received:', suggestions);
            return suggestions;
        } catch (error) {
            //console.error('DEBUG: Error getting AI suggestions:', error);
            return [];
        }
    }

    /**
     * Convert AI suggestions to VS Code inline completion items
     */
    private createInlineCompletionItems(
        suggestions: any[],
        position: vscode.Position
    ): vscode.InlineCompletionList {
        const items: vscode.InlineCompletionItem[] = [];

        for (let i = 0; i < suggestions.length; i++) {
            const suggestion = suggestions[i];
            
            if (suggestion?.insertText && typeof suggestion.insertText === 'string') {
                // Ghost text item
                const item = new vscode.InlineCompletionItem(
                    suggestion.insertText,
                    new vscode.Range(position, position)
                );
                
                // console.log(`DEBUG: Created inline completion item ${i}:`, {
                //     insertText: item.insertText,
                //     range: item.range
                // });
                
                items.push(item);
            }
        }
        
        return new vscode.InlineCompletionList(items);
    }
}