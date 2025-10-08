import * as vscode from 'vscode';
import { TemplateHeader } from '../../domain';

export interface IFileService {
    createFileInWorkspace(fileName: string, content: string): Promise<void>;
    createUntitledDocument(fileName: string, content: string): Promise<void>;
    fileExists(filePath: string): Promise<boolean>;
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
}

export interface OwningTeamConfig {
    OwningTeamId: string;
    DisplayName: string;
    Contact: string;
    RoutingInfo: {
        IcmTenantName: string;
        IcmTargetTeamId: string;
    };
    ServiceTreeId: string;
}

export interface OneDCMTOwningTeamConfigs {
    [key: string]: OwningTeamConfig;
}

export interface IOneDCMTService {
    findOneDCMTRepository(): Promise<string | null>;
    loadOwningTeamConfigs(oneDCMTPath: string): Promise<OneDCMTOwningTeamConfigs | null>;
    findOwningTeamConfig(configs: OneDCMTOwningTeamConfigs, owningTeamId: string): OwningTeamConfig | null;
    promptForNewOwningTeamConfig(owningTeamId: string): Promise<OwningTeamConfig | null>;
    saveOwningTeamConfig(oneDCMTPath: string, configs: OneDCMTOwningTeamConfigs, newConfig: OwningTeamConfig): Promise<boolean>;
    convertToTemplateHeader(owningTeamConfig: OwningTeamConfig): TemplateHeader;
    promptForManualServiceTree(owningTeamId: string): Promise<TemplateHeader | null>;
}

export interface IUserInteractionService {
    promptForServiceName(): Promise<string | null>;
    promptForOwningConfigMethod(): Promise<'owning_team' | 'service_tree_id' | null>;
    promptForOwningTeamId(): Promise<TemplateHeader | null>;
    promptForServiceTreeId(): Promise<TemplateHeader | null>;
    showInformationMessage(message: string): void;
    showErrorMessage(message: string): void;
}

export interface IEditorService {
    getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor): Promise<string>;
    getSelectedTextWithLineNumbers(textEditor: vscode.TextEditor): Promise<string>;
    insertTextAtPosition(textEditor: vscode.TextEditor, position: vscode.Position, text: string): Promise<void>;
}

export interface IChatService {
    sendMessage(messages: string[], isLinter: boolean): Promise<string>;
    getInlineCompletions(messages: string[], sectionContext?: string): Promise<any[]>;
    isAvailable(): Promise<boolean>;
    getModelId(): string;
}
