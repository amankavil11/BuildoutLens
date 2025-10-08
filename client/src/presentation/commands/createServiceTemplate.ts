import * as vscode from 'vscode';
import { CreateServiceTemplateService } from '../../application/services/CreateServiceTemplateService';

export class CreateServiceTemplateCommand {
    constructor(
        private createServiceTemplateService: CreateServiceTemplateService
    ) {}

    register(context: vscode.ExtensionContext): void {
        const disposable = vscode.commands.registerCommand(
            'buildoutlens.createServiceTemplate',
            () => this.execute()
        );
        
        context.subscriptions.push(disposable);
    }

    private async execute(): Promise<void> {
        try {
            await this.createServiceTemplateService.execute();
        } catch (error) {
            console.error('Service template creation failed:', error);
            vscode.window.showErrorMessage(
                `Failed to create service template: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}
