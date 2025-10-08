import * as vscode from 'vscode';
import {execFile} from 'child_process';
import * as path from 'path';
// import { CreateServiceTemplateCommand } from './presentation/commands/createServiceTemplate';
// import { AiCodeAnnotationsCommand } from './presentation/commands/aiCodeAnnotations';
// import { CreateServiceTemplateService } from './application/services/CreateServiceTemplateService';
// import { FileService } from './infrastructure/services/FileService';
// import { UserInteractionService } from './infrastructure/services/UserInteractionService';
// import { VsCodeChatService } from './infrastructure/services/VsCodeChatService';
// import { InlineCompletionService } from './infrastructure/services/InlineCompletionService';
// import { NameCompletionProvider } from './infrastructure/services/NameCompletionService';
// import { OneDCMTService } from './infrastructure/services/OneDCMTService';
// import { BuildoutLinterService } from './infrastructure/services/BuildoutLinterService';

export async function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(vscode.commands.registerCommand('buildoutmap.run', async () => {
    const filePath = vscode.window.activeTextEditor!.document.uri.fsPath; // assume a file is open
    const exePath = vscode.Uri.joinPath(context.extensionUri, 'bin.exe', 'BuildoutMap.exe').fsPath;
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Select PlannerConfig',
      filters: {
        'YAML files': ['yml', 'yaml']
      },
    });

    if (!picked || picked.length === 0) {
      return; // user cancelled
    }
    const plannerConfigDir = path.dirname(picked[0].fsPath);

    const output = vscode.window.createOutputChannel('BuildiutMap');

    execFile(
      exePath,
      ['-c', plannerConfigDir, '--template-search-paths', filePath],
      { windowsHide: true, cwd: path.dirname(filePath) },
      (err, stdout, stderr) => {
        const msg =
          (stdout && stdout.toString().trim()) ||
          (stderr && stderr.toString().trim()) ||
          (err && err.message) ||
          'BuildOutMap finished.';
        output.clear();
        output.appendLine(msg);
        output.show(true);
      }
    );
  }));


    //initialize services (application + infra)
    // const fileService = new FileService();
    // const oneDCMTService = new OneDCMTService(fileService);
    // const userInteractionService = new UserInteractionService(fileService, oneDCMTService);
    // const createServiceTemplateService = new CreateServiceTemplateService(fileService, userInteractionService);

    // // Initialize chat service and inline completion service
    // const chatService = new VsCodeChatService();
    // const inlineCompletionService = new InlineCompletionService(chatService);
    // const aiCodeAnnotationsCommand = new AiCodeAnnotationsCommand(inlineCompletionService);
    // aiCodeAnnotationsCommand.start(context);

    // // Initialize name completion provider using existing OneDCMT service
    // const nameCompletionProvider = new NameCompletionProvider(fileService, oneDCMTService);
    // nameCompletionProvider.registerProvider(context);

    // // Initialize buildout linter service
    // const linterService = new BuildoutLinterService(fileService, oneDCMTService);

    // // Register commands
    // const createServiceTemplateCommand = new CreateServiceTemplateCommand(createServiceTemplateService);

    // createServiceTemplateCommand.register(context);

    // // Set up file save listener for linting
    // const onSaveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
    //     // Only lint YAML files
    //     if (document.languageId === 'yaml' && document.fileName.endsWith('.yml')) {
    //         console.log('YAML file saved, running linter:', document.fileName);
    //         await linterService.lintFile(document);
    //     }
    // });
    
    // // Register manual lint command
    // const lintCommand = vscode.commands.registerCommand('buildoutlens.lint', async () => {
    //     const activeEditor = vscode.window.activeTextEditor;
    //     if (activeEditor && activeEditor.document.languageId === 'yaml') {
    //         await linterService.lintFile(activeEditor.document);
    //     } else {
    //         vscode.window.showWarningMessage('Please open a YAML file to lint');
    //     }
    // });

    // //consider adding an application layer for this
    // context.subscriptions.push(
    //     onSaveListener,
    //     linterService,
    //     lintCommand
    // );
    
    console.log('BuildoutLens extension is now active with native linter');
}

export function deactivate() {
    // Clean up resources if needed
    console.log('BuildoutLens extension is deactivated');
}