import * as vscode from 'vscode';
import { IUserInteractionService, IFileService, IOneDCMTService, OneDCMTOwningTeamConfigs } from '../../application/interfaces/index';
import { TemplateHeader } from '../../domain';
import { FallbackOwningTeamService } from '../../application/services/FallbackOwningTeamService';

export class UserInteractionService implements IUserInteractionService {
    private fallbackService: FallbackOwningTeamService;
    private oneDCMTService: IOneDCMTService;
    private owningTeamConfigs: OneDCMTOwningTeamConfigs | null = null;

    constructor(fileService: IFileService, oneDCMTService: IOneDCMTService) {
        this.fallbackService = new FallbackOwningTeamService(fileService);
        this.oneDCMTService = oneDCMTService;
        this.loadCompletionData();
    }

    private async loadCompletionData(): Promise<void> {
        try {
            const oneDCMTPath = await this.oneDCMTService.findOneDCMTRepository();
            if (oneDCMTPath) {
                this.owningTeamConfigs = await this.oneDCMTService.loadOwningTeamConfigs(oneDCMTPath);
            }
        } catch (error) {
            console.error('Failed to load completion data:', error);
        }
    }

    async promptForServiceName(): Promise<string | null> {
        const name = await vscode.window.showInputBox({ 
            prompt: 'Enter service name',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Service name is required';
                }
                return null;
            }
        });
        return name?.trim() || null;
    }

    async promptForOwningConfigMethod(): Promise<'owning_team' | 'service_tree_id' | null> {
        const choice = await vscode.window.showQuickPick([
            { label: 'Owning Team ID', value: 'owning_team' as const, description: 'Enter your team\'s owning team ID' },
            { label: 'Service Tree ID', value: 'service_tree_id' as const, description: 'Enter your service tree ID' }
        ], {
            title: 'Choose lookup Method',
            placeHolder: 'How would you like to lookup your service ownership?'
        });
        
        return choice?.value || null;
    }

    async promptForOwningTeamId(): Promise<TemplateHeader | null> {
        if (!this.owningTeamConfigs) {
            // Fallback to input box if no completion data
            return await this.promptForOwningTeamIdFallback();
        }

        const owningTeamIds = Object.keys(this.owningTeamConfigs);
        const quickPickItems = owningTeamIds.map(id => ({
            label: id,
            detail: `Service Tree: ${this.owningTeamConfigs![id].ServiceTreeId}`,
            value: id
        }));

        // Use createQuickPick for more control
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Select Owning Team ID';
        quickPick.placeholder = 'Start typing to filter owning team IDs...';
        quickPick.items = quickPickItems;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        return new Promise<TemplateHeader | null>((resolve) => {
            quickPick.onDidAccept(async () => {
                const selected = quickPick.selectedItems[0];
                if (selected) {
                    const config = this.owningTeamConfigs![selected.label];
                    if (config) {
                        quickPick.hide();
                        resolve({
                            service_tree: config.ServiceTreeId,
                            owning_team_id: config.OwningTeamId
                        });
                        return;
                    }
                } else if (quickPick.value.trim()) {
                    // No match, user typed something and hit enter
                    quickPick.hide();
                    // Call fallback service for manual entry prompt
                    const result = await this.fallbackService.getOwningTeamConfigFallback(quickPick.value.trim());
                    console.log('result: ' + result?.owning_team_id);
                    resolve(result);
                    return;
                }
                quickPick.hide();
                resolve(null);
            });
            quickPick.onDidHide(() => {
                resolve(null);
            });
            quickPick.show();
        });
    }

    private async promptForOwningTeamIdFallback(): Promise<TemplateHeader | null> {
        const owningTeamId = await vscode.window.showInputBox({ 
            prompt: 'Enter Owning Team ID',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Owning Team ID is required';
                }
                return null;
            }
        });
        
        if (!owningTeamId) {
            return null;
        }

        // Always use local OneDCMT fallback (no Kusto needed)
        console.log('Searching for OneDCMT locally...');
        vscode.window.showInformationMessage('Searching for OneDCMT locally...');
        return await this.fallbackService.getOwningTeamConfigFallback(owningTeamId);
    }

    async promptForServiceTreeId(): Promise<TemplateHeader | null> {
        if (!this.owningTeamConfigs) {
            // Fallback to input box if no completion data
            return await this.promptForServiceTreeIdFallback();
        }

        const configs = Object.values(this.owningTeamConfigs);
        const quickPickItems = configs.map(config => ({
            label: config.ServiceTreeId,
            detail: `Owning Team: ${config.OwningTeamId}`,
            value: config.ServiceTreeId
        }));

        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Select Service Tree ID';
        quickPick.placeholder = 'Start typing to filter service tree IDs...';
        quickPick.items = quickPickItems;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        return new Promise<TemplateHeader | null>((resolve) => {
            quickPick.onDidAccept(async () => {
                const selected = quickPick.selectedItems[0];
                if (selected) {
                    const config = configs.find(c => c.ServiceTreeId === selected.label);
                    if (config) {
                        quickPick.hide();
                        resolve({
                            service_tree: config.ServiceTreeId,
                            owning_team_id: config.OwningTeamId
                        });
                        return;
                    }
                } else if (quickPick.value.trim()) {
                    // No match, user typed something and hit enter
                    quickPick.hide();
                    // Call fallback service for manual entry prompt
                    const result = await this.fallbackService.getOwningTeamConfigByServiceTree(quickPick.value.trim());
                    resolve(result);
                    return;
                }
                quickPick.hide();
                resolve(null);
            });
            quickPick.onDidHide(() => {
                resolve(null);
            });
            quickPick.show();
        });
    }

    private async promptForServiceTreeIdFallback(): Promise<TemplateHeader | null> {
        const serviceTreeId = await vscode.window.showInputBox({ 
            prompt: 'Enter Service Tree ID',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Service Tree ID is required';
                }
                return null;
            }
        });
        
        if (!serviceTreeId) {
            return null;
        }

        // Use fallback service to find owning team by service tree ID
        console.log('Searching for OneDCMT locally by Service Tree ID...');
        vscode.window.showInformationMessage('Searching for OneDCMT locally by Service Tree ID...');
        return await this.fallbackService.getOwningTeamConfigByServiceTree(serviceTreeId);
    }

    showInformationMessage(message: string): void {
        vscode.window.showInformationMessage(message);
    }

    showErrorMessage(message: string): void {
        vscode.window.showErrorMessage(message);
    }
}
