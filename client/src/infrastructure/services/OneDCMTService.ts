import * as vscode from 'vscode';
import * as path from 'path';
import { IFileService, IOneDCMTService, OwningTeamConfig, OneDCMTOwningTeamConfigs } from '../../application/interfaces/index';
import { TemplateHeader } from '../../domain';

// Array format from the actual JSON file
export interface OneDCMTConfigArray extends Array<OwningTeamConfig> {}

export class OneDCMTService implements IOneDCMTService {
    private static readonly DEFAULT_ONEDCMT_PATH = 'Q:\\src\\OneDCMT';
    private static readonly CONFIG_FILE_PATH = '\\src\\Configuration\\CIS\\OwningTeamConfigs\\OwningTeamConfig.json';
    constructor(private fileService: IFileService) {}

    /**
     * Attempts to locate the OneDCMT repository on the user's machine
     */
    //is a seperate function necessary?
    async findOneDCMTRepository(): Promise<string | null> {
        try {
            // First, try the default company location
            const defaultPath = OneDCMTService.DEFAULT_ONEDCMT_PATH;
            if (await this.fileService.fileExists(defaultPath)) {
                return defaultPath;
            }

            // TODO: Add additional search locations if needed
            // Could search common git clone locations, user directories, etc.
            
            return null;
        } catch (error) {
            console.error('Error searching for OneDCMT repository:', error);
            return null;
        }
    }

    /**
     * Loads and parses the OwningTeamConfigs.json file from OneDCMT. We take initial path as input because this could be different in user's local system
     */
    async loadOwningTeamConfigs(oneDCMTPath: string): Promise<OneDCMTOwningTeamConfigs | null> {
        try {
            const configFilePath = path.join(oneDCMTPath, OneDCMTService.CONFIG_FILE_PATH);
            
            if (!await this.fileService.fileExists(configFilePath)) {
                console.warn(`OwningTeamConfigs.json not found at: ${configFilePath}`);
                return null;
            }

            const content = await this.fileService.readFile(configFilePath);
            const configArray: OneDCMTConfigArray = JSON.parse(content);
            
            // easier lookup by OwningTeamId
            const configs: OneDCMTOwningTeamConfigs = {};
            configArray.forEach(config => {
                configs[config.OwningTeamId] = config;
            });
            
            return configs;
        } catch (error) {
            console.error('Error loading OwningTeamConfigs.json:', error);
            return null;
        }
    }

    /**
     * Searches for a specific owning team ID in the configs
     */
    findOwningTeamConfig(configs: OneDCMTOwningTeamConfigs, owningTeamId: string): OwningTeamConfig | null {
        return configs[owningTeamId] || null;
    }

    /**
     * Prompts user to create a new owning team config entry
     */
    async promptForNewOwningTeamConfig(owningTeamId: string): Promise<OwningTeamConfig | null> {
        try {
            const displayName = await vscode.window.showInputBox({
                title: 'Create New Owning Team Config',
                prompt: 'Enter display name for CIS platform',
                placeHolder: 'Team Display Name',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Display name is required';
                    }
                    return null;
                }
            });

            if (!displayName) return null;

            const contactEmail = await vscode.window.showInputBox({
                title: 'Create New Owning Team Config',
                prompt: 'Enter contact email',
                placeHolder: 'team@company.com',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Contact email is required';
                    }
                    //see if other way to check email format
                    if (!value.includes('@')) {
                        return 'Please enter a valid email address';
                    }
                    return null;
                }
            });

            if (!contactEmail) return null;

            const icmTenantName = await vscode.window.showInputBox({
                title: 'Create New Owning Team Config - Routing Info',
                prompt: 'Enter ICM Tenant Name for routing tickets',
                placeHolder: 'ICM Tenant Name',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'ICM Tenant Name is required';
                    }
                    return null;
                }
            });

            if (!icmTenantName) return null;

            const icmTargetTeamId = await vscode.window.showInputBox({
                title: 'Create New Owning Team Config - Routing Info',
                prompt: 'Enter ICM Target Team ID for routing tickets',
                placeHolder: 'ICM Target Team ID',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'ICM Target Team ID is required';
                    }
                    return null;
                }
            });

            if (!icmTargetTeamId) return null;

            const serviceTree = await vscode.window.showInputBox({
                title: 'Create New Owning Team Config',
                prompt: 'Enter Service Tree ID',
                placeHolder: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Service Tree ID is required';
                    }
                    // Validate GUID format: 8-4-4-4-12 hexadecimal digits
                    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (!guidRegex.test(value.trim())) {
                        return 'Service Tree ID must be a valid GUID format (e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890)';
                    }
                    return null;
                }
            });

            if (!serviceTree) return null;

            const newConfig: OwningTeamConfig = {
                OwningTeamId: owningTeamId,
                DisplayName: displayName,
                Contact: contactEmail,
                RoutingInfo: {
                    IcmTenantName: icmTenantName,
                    IcmTargetTeamId: icmTargetTeamId
                },
                ServiceTreeId: serviceTree
            };

            return newConfig;
        } catch (error) {
            console.error('Error creating new owning team config:', error);
            return null;
        }
    }

    /**
     * Saves a new owning team config to the OwningTeamConfigs.json file
     */
    async saveOwningTeamConfig(oneDCMTPath: string, configs: OneDCMTOwningTeamConfigs, newConfig: OwningTeamConfig): Promise<boolean> {
        try {
            // Add the new config to the existing configs
            configs[newConfig.OwningTeamId] = newConfig;

            // Convert back to array format for saving to JSON file
            const configArray = Object.values(configs);

            // Write back to file
            const configFilePath = path.join(oneDCMTPath, OneDCMTService.CONFIG_FILE_PATH);
            const content = JSON.stringify(configArray, null, 2);
            
            await this.fileService.writeFile(configFilePath, content);
            
            vscode.window.showInformationMessage(
                `Successfully added owning team config for '${newConfig.OwningTeamId}' to OneDCMT repository.`
            );
            
            return true;
        } catch (error) {
            console.error('Error saving owning team config:', error);
            vscode.window.showErrorMessage(
                `Failed to save owning team config: ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }

    /**
     * Converts OneDCMT config to domain OwningTeamConfig
     */
    convertToTemplateHeader(owningTeamConfig: OwningTeamConfig): TemplateHeader {
        return {
            owning_team_id: owningTeamConfig.OwningTeamId,
            service_tree: owningTeamConfig.ServiceTreeId
        };
    }

    /**
     * Prompts user to manually enter service tree ID as last resort
     */
    async promptForManualServiceTree(owningTeamId: string): Promise<TemplateHeader | null> {
        const serviceTree = await vscode.window.showInputBox({
            title: 'Manual Service Tree Entry',
            prompt: `OneDCMT repository not found. Please manually enter the Service Tree ID for '${owningTeamId}'`,
            placeHolder: '755c2a62-364b-440c-95bc-3eaf4d7e64e3',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Service Tree ID is required';
                }
                // Validate GUID format: 8-4-4-4-12 hexadecimal digits
                const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!guidRegex.test(value.trim())) {
                    return 'Service Tree ID must be a valid GUID format (e.g., 755c2a62-364b-440c-95bc-3eaf4d7e64e3)';
                }
                return null;
            }
        });

        if (!serviceTree) return null;

        return {
            owning_team_id: owningTeamId,
            service_tree: serviceTree
        };
    }
}
