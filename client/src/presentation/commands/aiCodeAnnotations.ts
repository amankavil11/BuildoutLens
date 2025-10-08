import * as vscode from 'vscode';
import { InlineCompletionService} from '../../infrastructure/services/InlineCompletionService';

export class AiCodeAnnotationsCommand {
    constructor(
            private inlineCompletionService: InlineCompletionService
        ) {}

    async start(context: vscode.ExtensionContext): Promise<void> {
        try {
            console.log('Starting AI Code Annotations service');
            this.inlineCompletionService.registerProvider(context);

            context.subscriptions.push(this.inlineCompletionService);
        } catch (error) {
            console.error('AI Code Annotations failed to start:', error);
            vscode.window.showErrorMessage(
                `Failed to start AI ghost text: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}