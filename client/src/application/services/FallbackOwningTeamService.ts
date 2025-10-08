import * as vscode from 'vscode';
import { IFileService, OneDCMTOwningTeamConfigs } from '../../application/interfaces/index';
import { TemplateHeader } from '../../domain';
import { OneDCMTService } from '../../infrastructure/services/OneDCMTService';

export class FallbackOwningTeamService {
    private oneDCMTService: OneDCMTService;

    constructor(private fileService: IFileService) {
        this.oneDCMTService = new OneDCMTService(fileService);
    }

    /**
     * Relies on local OneDCMT repo to find or create OwningTeamConfig
     */
    async getOwningTeamConfigFallback(owningTeamId: string): Promise<TemplateHeader | null> {
        try {
            // Step 1: Try to find OneDCMT repository
            const oneDCMTPath = await this.oneDCMTService.findOneDCMTRepository();
            
            if (!oneDCMTPath) {
                return await this.handleOneDCMTNotFound(owningTeamId);
            }

            // Step 2: Load existing configurations
            const configs = await this.oneDCMTService.loadOwningTeamConfigs(oneDCMTPath);
            
            if (!configs) {
                //parsing issue; manually prompt for service tree id
                vscode.window.showErrorMessage('Failed to load OwningTeamConfigs.json from OneDCMT repository.');
                return await this.oneDCMTService.promptForManualServiceTree(owningTeamId);
            }

            // Step 3: Look for existing configuration
            const existingConfig = this.oneDCMTService.findOwningTeamConfig(configs, owningTeamId);
            
            if (existingConfig) {
                vscode.window.showInformationMessage(
                    `Found owning team configuration for '${owningTeamId}' in local OneDCMT repository.`
                );
                return this.oneDCMTService.convertToTemplateHeader(existingConfig);
            }

            // Step 4: We failed to find their owning team id so we offer to create new configuration entry
            return await this.handleOwningTeamNotFound(owningTeamId, oneDCMTPath);

        } catch (error) {
            console.error('Error in OneDCMT owning team lookup:', error);
            vscode.window.showErrorMessage(
                `OneDCMT lookup failed: ${error instanceof Error ? error.message : String(error)}`
            );
            return null;
        }
    }

    /**
     * Handles the case when OneDCMT repository is not found
     */
    private async handleOneDCMTNotFound(owningTeamId: string): Promise<TemplateHeader | null> {
        const choice = await vscode.window.showWarningMessage(
            `OneDCMT repository not found at the default location (Q:\\src\\OneDCMT).
            
            Without access to team configurations, you'll need to manually enter the Service Tree ID for '${owningTeamId}'.`,
            { modal: true },
            'Enter Service Tree Manually',
            'Browse for OneDCMT'
        );

        switch (choice) {
            case 'Enter Service Tree Manually':
                return await this.oneDCMTService.promptForManualServiceTree(owningTeamId);
                
            case 'Browse for OneDCMT':
                return await this.browseForOneDCMTLocation(owningTeamId);
                
            default:
                return null;
        }
    }

    /**
     * Handles the case when owning team ID is not found in OneDCMT
     */
    private async handleOwningTeamNotFound(
        owningTeamId: string, 
        oneDCMTPath: string
    ): Promise<TemplateHeader | null> {
        const choice = await vscode.window.showInformationMessage(
            `Owning Team ID '${owningTeamId}' not found in OneDCMT repository.
            
            Would you like to create a new entry in OwningTeamConfigs.json?`,
            { modal: true },
            'Create New Entry',
            'Enter Service Tree Manually'
        );

        switch (choice) {
            case 'Create New Entry':
                return await this.createNewOwningTeamEntry(owningTeamId, oneDCMTPath);
            //fix; do not need?
            case 'Enter Service Tree Manually':
                return await this.oneDCMTService.promptForManualServiceTree(owningTeamId);
                
            default:
                return null;
        }
    }

    /**
     * Creates a new owning team entry in OneDCMT local
     */
    private async createNewOwningTeamEntry(owningTeamId: string, oneDCMTPath: string): Promise<TemplateHeader | null> {
        const newConfig = await this.oneDCMTService.promptForNewOwningTeamConfig(owningTeamId);
        
        if (!newConfig) {
            return null;
        }

        // Load current configs to pass to the save method
        //TODO: save in memory?
        const configs: OneDCMTOwningTeamConfigs | null = await this.oneDCMTService.loadOwningTeamConfigs(oneDCMTPath);
        if (!configs) {
            vscode.window.showErrorMessage('Failed to load existing configurations.');
            return null;
        }

        const saved = await this.oneDCMTService.saveOwningTeamConfig(oneDCMTPath, configs, newConfig);
        
        if (saved) {
            //for service template scaffolding; change name to service template header; something more self-documenting
            return this.oneDCMTService.convertToTemplateHeader(newConfig);
        }

        // If save failed, offer manual entry as fallback
        const choice = await vscode.window.showErrorMessage(
            'Failed to save the new configuration to OneDCMT. Would you like to enter the Service Tree ID manually to continue?',
            'Enter Manually',
            'Cancel'
        );

        if (choice === 'Enter Manually') {
            return await this.oneDCMTService.promptForManualServiceTree(owningTeamId);
        }

        return null;
    }

    /**
     * Allows user to browse for OneDCMT location
     */
    private async browseForOneDCMTLocation(owningTeamId: string): Promise<TemplateHeader | null> {
        const uri = await vscode.window.showOpenDialog({
            title: 'Select OneDCMT Repository Root Folder',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select OneDCMT Folder'
        });

        if (!uri || uri.length === 0) {
            return null;
        }

        const selectedPath = uri[0].fsPath;
        
        // Verify this looks like a OneDCMT repository
        const configPath = `${selectedPath}\\src\\Configuration\\CIS\\OwningTeamConfigs\\OwningTeamConfig.json`;
        
        if (!await this.fileService.fileExists(configPath)) {
            vscode.window.showErrorMessage(
                'Selected folder does not appear to be a valid OneDCMT repository (OwningTeamConfig.json not found).'
            );
            return await this.oneDCMTService.promptForManualServiceTree(owningTeamId);
        }

        // Now try to load configs from the selected path
        const configs = await this.oneDCMTService.loadOwningTeamConfigs(selectedPath);
        
        if (!configs) {
            vscode.window.showErrorMessage('Failed to load configurations from selected OneDCMT repository.');
            return await this.oneDCMTService.promptForManualServiceTree(owningTeamId);
        }

        const existingConfig = this.oneDCMTService.findOwningTeamConfig(configs, owningTeamId);
        
        if (existingConfig) {
            vscode.window.showInformationMessage(
                `Found owning team configuration for '${owningTeamId}' in selected OneDCMT repository.`
            );
            return this.oneDCMTService.convertToTemplateHeader(existingConfig);
        }

        // Offer to create new entry in the selected repository
        return await this.handleOwningTeamNotFound(owningTeamId, selectedPath);
    }

    /**
     * Find owning team config by service tree ID
     */
    async getOwningTeamConfigByServiceTree(serviceTreeId: string): Promise<TemplateHeader | null> {
        try {
            // Step 1: Try to find OneDCMT repository
            const oneDCMTPath = await this.oneDCMTService.findOneDCMTRepository();
            
            if (!oneDCMTPath) {
                return await this.oneDCMTService.promptForManualServiceTree(serviceTreeId);
            }

            // Step 2: Load existing configurations
            const configs = await this.oneDCMTService.loadOwningTeamConfigs(oneDCMTPath);
            
            if (!configs) {
                vscode.window.showErrorMessage('Failed to load OwningTeamConfigs.json from OneDCMT repository.');
                return await this.oneDCMTService.promptForManualServiceTree(serviceTreeId);
            }

            // Step 3: Search for the service tree ID in existing configs
            const existingConfig = Object.values(configs).find(config => config.ServiceTreeId === serviceTreeId);
            
            if (existingConfig) {
                vscode.window.showInformationMessage(
                    `Found owning team configuration for Service Tree '${serviceTreeId}' (Team: ${existingConfig.OwningTeamId}).`
                );
                return this.oneDCMTService.convertToTemplateHeader(existingConfig);
            }

            // Step 4: Service tree not found, prompt for manual entry
            vscode.window.showWarningMessage(`Service Tree ID '${serviceTreeId}' not found in local OneDCMT repository.`);
            return await this.oneDCMTService.promptForManualServiceTree(serviceTreeId);
            
        } catch (error) {
            console.error('Error in getOwningTeamConfigByServiceTree:', error);
            vscode.window.showErrorMessage(`Error searching for Service Tree: ${error}`);
            return await this.oneDCMTService.promptForManualServiceTree(serviceTreeId);
        }
    }
}
