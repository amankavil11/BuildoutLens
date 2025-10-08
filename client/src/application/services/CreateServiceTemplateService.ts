import { IFileService, IUserInteractionService } from '../interfaces/index';
import { ServiceTemplate } from '../../domain';
//import { ServiceTemplateRequest } from '../dto/index';

export class CreateServiceTemplateService {
    constructor(
        private fileService: IFileService,
        private userInteractionService: IUserInteractionService
    ) {}

    async execute(): Promise<void> {
        try {
            // Get service name from user
            const serviceName = await this.userInteractionService.promptForServiceName();
            if (!serviceName) {
                this.userInteractionService.showErrorMessage('Service name is required.');
                return;
            }

            // Get owning team configuration
            const owningTeamConfig = await this.userInteractionService.promptForOwningTeamId();
            if (!owningTeamConfig) {
                return;
            }

            // Create service template object
            const template: ServiceTemplate = {
                name: serviceName,
                service_tree: owningTeamConfig.service_tree,
                owner: owningTeamConfig.owning_team_id,
                buildout_phases: [],
                resources: []
            };

            // Generate template content
            const content = this.generateTemplateContent(template);
            const fileName = `${serviceName}.yml`;

            // Try to create file in workspace, fallback to untitled document
            try {
                await this.fileService.createFileInWorkspace(fileName, content);
                this.userInteractionService.showInformationMessage(
                    `Service template '${fileName}' created in workspace folder.`
                );
            } catch (workspaceError) {
                // Fallback: create untitled document
                await this.fileService.createUntitledDocument(fileName, content);
                this.userInteractionService.showInformationMessage(
                    `Service template for '${serviceName}' created as unsaved file. Please save it manually.`
                );
            }

        } catch (error) {
            this.userInteractionService.showErrorMessage(
                `Failed to create service template: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private generateTemplateContent(template: ServiceTemplate): string {
        return `---\nname: ${template.name}\nservice_tree: ${template.service_tree}\nowner: ${template.owner}\n\nbuildout_phases: \nresources: \nimports: \n`;
    }
}
