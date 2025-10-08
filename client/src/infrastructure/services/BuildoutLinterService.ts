import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { VsCodeChatService } from './VsCodeChatService';
import { NameCompletionProvider } from './NameCompletionService';
// import { BackendRunner } from './BackendRunner'; // TODO: integrate with AI prompting
import { IFileService, IOneDCMTService } from '../../application/interfaces/index';

const execAsync = promisify(exec);

//TODO: add to index to keep clean
export interface LinterError {
  line: number;
  column: number;
  message: string;
  severity: vscode.DiagnosticSeverity;
  suggestedFix?: string;
  isGlobalIssue?: boolean; // For issues that don't have specific line numbers
}

export class BuildoutLinterService {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private chatService: VsCodeChatService;
  private nameCompletionProvider: NameCompletionProvider;
  // Backend runner for provider completion context (TODO: integrate with AI prompting)
  // private backendRunner: BackendRunner;
  private cliPath: string;
  private librariesPath: string;
  private plannerConfigPath: string;

  constructor(
    fileService: IFileService,
    oneDCMTService: IOneDCMTService
  ) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('buildout-linter');
    this.chatService = new VsCodeChatService();
    //for phase/scenarios; already parsed at startup and retrieved through getters
    this.nameCompletionProvider = new NameCompletionProvider(fileService, oneDCMTService);
    // TODO: this.backendRunner = new BackendRunner();
    //TODO: move to a common utils folder in the future; plannerconfig path is used in this file and name completion service
    this.cliPath = "Q:\\src\\GeoExpansionAutomation\\out\\Debug-x64\\packages\\Microsoft.Azure.Cis.ServiceMap.CLI\\BuildoutMap.exe";
    this.librariesPath = "Q:\\src\\OneDCMT\\src\\Configuration\\ServiceMap\\Libraries";
    this.plannerConfigPath = "Q:\\src\\OneDCMT\\src\\Configuration\\ServiceMap\\PlannerConfig";
  }

  /**
   * Run linter on a YAML file and display diagnostics
   */
  async lintFile(document: vscode.TextDocument): Promise<void> {
    // Only lint YAML files
    if (document.languageId !== 'yaml' || !document.fileName.endsWith('.yml')) {
      return;
    }

    const filePath = document.fileName;
    const fileName = path.basename(filePath, '.yml');//wo extension
    
    //try to detect scenario from file content or use default
    //TODO: linter can only validate against once scenario at once so in the future run linter multiple times with every scenario specified
    const detectedScenario = this.detectScenarioFromFile(document);
    const scenario = detectedScenario || 'NewRegion'; // Provide default fallback
    
    if (!detectedScenario) {
      console.log(`No scenario detected for ${fileName}, using default: ${scenario}`);
    }

    try {
      console.log(`Linting file: ${fileName}, scenario: ${scenario}`);
      const errors = await this.runLinterWithAI(document, fileName, scenario);
      this.displayDiagnostics(document.uri, errors);
      
      // Show global issues in popup if any; errors without any line number like if service tree is missing
      const globalIssues = errors.filter(e => e.isGlobalIssue);
      if (globalIssues.length > 0) {
        this.showGlobalIssuesPopup(globalIssues);
      }
      
      // Show success message if no errors
      if (errors.length === 0) {
        vscode.window.showInformationMessage(`Linter: No errors found in ${fileName}.yml`);
      } else {
        const lineErrors = errors.filter(e => !e.isGlobalIssue);
        const message = globalIssues.length > 0 
          ? `Linter found ${lineErrors.length} line-specific issue(s) and ${globalIssues.length} global issue(s) in ${fileName}.yml`
          : `Linter found ${errors.length} issue(s) in ${fileName}.yml`;
        vscode.window.showWarningMessage(message);
      }
    } catch (error) {
      console.error('Linter failed:', error);
      vscode.window.showErrorMessage(`Linter failed: ${error}`);
    }
  }

  /**
   * Detect scenario from file content using NameCompletionProvider's logic
   */
  private detectScenarioFromFile(document: vscode.TextDocument): string | null {
    try {
      const content = document.getText();
      const lines = content.split('\n');
      
      let inBuildoutPhases = false;
      let buildoutPhasesIndentation = 0;
      const detectedScenarios = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check if we're entering buildout_phases section
        if (trimmedLine === 'buildout_phases:') {
          inBuildoutPhases = true;
          // Store the indentation level of buildout_phases
          buildoutPhasesIndentation = line.length - line.trimStart().length;
          console.log(`Found buildout_phases section at line ${i + 1} with indentation ${buildoutPhasesIndentation}`);
          continue;
        }

        // If we're in buildout_phases section
        if (inBuildoutPhases) {
          // Get current line indentation
          const currentIndentation = line.length - line.trimStart().length;
          
          // Check if we've reached another section at the same indentation level as buildout_phases
          if (trimmedLine.endsWith(':') && 
              trimmedLine.length > 0 && 
              currentIndentation === buildoutPhasesIndentation &&
              trimmedLine !== 'buildout_phases:') {
            console.log(`Reached end of buildout_phases section at line ${i + 1}`);
            break;
          }

          // Look for scenario.phase headers (indented more than buildout_phases, ending with colon, containing dot)
          if (currentIndentation > buildoutPhasesIndentation && trimmedLine.endsWith(':')) {
            const scenarioPhaseMatch = trimmedLine.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+):$/);
            if (scenarioPhaseMatch) {
              const scenarioName = scenarioPhaseMatch[1];
              detectedScenarios.add(scenarioName);
              console.log(`Found scenario.phase header: ${scenarioName}.${scenarioPhaseMatch[2]} at indentation ${currentIndentation}`);
            }
          }

          // Skip lines with - (resource declarations)
          if (trimmedLine.startsWith('-')) {
            continue;
          }
        }
      }

      // Return the first detected scenario that matches available scenarios
      //TODO: add logic to run linter for every scenario detected
      for (const detectedScenario of detectedScenarios) {
        // Use the new helper method to find scenario by name (handles case-insensitive lookup)
        const validScenario = this.nameCompletionProvider.findScenarioByOriginalName(detectedScenario);
        
        if (validScenario) {
          console.log(`Detected valid scenario: ${validScenario} (from detected: ${detectedScenario})`);
          return validScenario;
        }
      }
      return null;
      
    } catch (error) {
      console.error('Error detecting scenario from file:', error);
      return null;
    }
  }


  /**
   * Execute the CLI linter command with AI-powered output parsing
   */
  private async runLinterWithAI(document: vscode.TextDocument, fileName: string, scenario: string): Promise<LinterError[]> {
    const workingDir = path.dirname(document.fileName); // Ensure uppercase for consistency
    
    // Build the CLI command matching the working format (no quotes around paths)
    const command = `${this.cliPath} -c ${this.plannerConfigPath} -p ${workingDir} -l ${this.librariesPath} -n ${fileName} -s ${scenario} -vt --linter`;
    
    console.log(`Running command: ${command}`);
    console.log(`Working directory: ${workingDir}`);
    console.log(`File name: ${fileName}, Scenario: ${scenario}`);
    console.log(`CLI Path exists: ${fs.existsSync(this.cliPath)}`);
    console.log(`Planner Config Path exists: ${fs.existsSync(this.plannerConfigPath)}`);
    console.log(`Libraries Path exists: ${fs.existsSync(this.librariesPath)}`);

    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: workingDir,
        timeout: 30000, // 30 second timeout
        env: { ...process.env } // Inherit environment variables
      });
      const output = stdout + stderr;
      console.log('CLI output (success):', output);

      return await this.parseOutputWithAI(document, output);
    } catch (error: any) {
      // For CLI tools, "errors" often contain the actual linting results
      // Don't treat this as a failure - extract the output and parse it
      const output = (error.stdout || '') + (error.stderr || '');
      
      console.log('CLI output (from error):', output);
      console.log('CLI exit code:', error.code);
      console.log('CLI command:', command);
      
      if (output.trim()) {
        // Try to parse the output - this likely contains the linting results
        try {
          return await this.parseOutputWithAI(document, output);
        } catch (parseError) {
          console.error('Failed to parse CLI output:', parseError);
          // Return empty array instead of throwing - let the user know parsing failed
          return [];
        }
      } else {
        // Only throw if we have no output at all (true CLI failure)
        console.error('CLI failed with no output:', {
          command,
          error: error.message,
          code: error.code
        });
        throw new Error(`CLI execution failed with no output: ${error.message}`);
      }
    }
  }

  /**
   * Use AI to parse CLI output and extract errors with context
   */
  private async parseOutputWithAI(document: vscode.TextDocument, cliOutput: string): Promise<LinterError[]> {
    const documentContent = document.getText();
    
    const prompt = `You are analyzing the output of a YAML buildout linter. Please parse the CLI output and return a JSON array of error objects.

CLI Output:
${cliOutput}

YAML Document Content:
${documentContent}

Please return a JSON array where each error object has:
- line: number (1-based line number, or 0 for global issues)
- message: string (clear error description)
- suggestedFix: string (specific suggestion for fixing the issue)
- isGlobalIssue: boolean (true for file-wide or structural issues that don't map to specific lines)

Rules:
1. For syntax errors, map them to the specific line mentioned in the output
2. For linter/style errors, try to identify the problematic line from the context and the reason for the issue (provided by the linter output)
3. For global issues (missing required sections, file structure problems), set line to 0 and isGlobalIssue to true
4. Provide actionable suggested fixes
5. If no errors are found, return an empty array
6. Return only valid JSON, no additional text

Example response:
[
  {
    "line": 5,
    "message": "Buildout_phases in wrong order",
    "suggestedFix": "Re-check and edit the phase order based on the following order:
        [(1) publicpreparation/preparation/prebuildout, (2) provisioning, (3) deployment, (4) deferred_provisioning/postbuildout, (5) validation]",
    "isGlobalIssue": false
  },
  {
    "line": 0,
    "message": "Missing required 'parameters' section",
    "suggestedFix": "Add a 'parameters:' section at the top level of the YAML file",
    "isGlobalIssue": true
  }
]`;

    try {
      const response = await this.chatService.sendMessage([prompt], true);
      console.log('AI response:', response);
      
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in AI response');
        return [];
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed) ? parsed.map((error: any) => ({
        line: Math.max(0, (error.line || 1) - 1), // Convert to 0-based for VS Code
        column: 0,
        message: error.message || 'Unknown error',
        severity: vscode.DiagnosticSeverity.Error,
        suggestedFix: error.suggestedFix,
        isGlobalIssue: error.isGlobalIssue || false
      })) : [];
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return [];
    }
  }

  /**
   * Show global issues in a popup dialog
   */
  private showGlobalIssuesPopup(globalIssues: LinterError[]): void {
    const message = globalIssues.length >= 1 
      ? `Global Issue: ${globalIssues[0].message}\n\nSuggested Fix: ${globalIssues[0].suggestedFix}`
      : `${globalIssues.length} Global Issues Found:\n\n${globalIssues.map((issue, i) => 
          `${i + 1}. ${issue.message}\n   Fix: ${issue.suggestedFix}`).join('\n\n')}`;
    
    vscode.window.showWarningMessage(message, { modal: true });
  }

  /**
   * Display diagnostics in VS Code
   */
  private displayDiagnostics(uri: vscode.Uri, errors: LinterError[]): void {
    const diagnostics: vscode.Diagnostic[] = errors.map(error => {
      let range: vscode.Range;
      
      if (error.isGlobalIssue || error.line === 0) {
        // For global issues, highlight the entire first line
        range = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 3)
        );
      } else {
        // Get the document to analyze the line content
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        
        if (document && error.line < document.lineCount) {
          const lineText = document.lineAt(error.line).text;
          const trimmedLine = lineText.trim();
          
          if (trimmedLine.length > 0) {
            // Find the start of the first word (after leading whitespace)
            const leadingSpaceLength = lineText.length - lineText.trimStart().length;
            
            // Find the end of the first word (or use the entire trimmed line if it's a single word)
            const firstWordMatch = trimmedLine.match(/^\S+/);
            const firstWordLength = firstWordMatch ? firstWordMatch[0].length : trimmedLine.length;
            
            const startCol = leadingSpaceLength;
            const endCol = leadingSpaceLength + firstWordLength;
            
            range = new vscode.Range(
              new vscode.Position(error.line, startCol),
              new vscode.Position(error.line, endCol)
            );
          } else {
            // Empty line, just highlight the position
            range = new vscode.Range(
              new vscode.Position(error.line, 0),
              new vscode.Position(error.line, 1)
            );
          }
        } else {
          range = new vscode.Range(
            new vscode.Position(error.line, error.column),
            new vscode.Position(error.line, error.column + 1)
          );
        }
      }

      const messageWithFix = error.suggestedFix ? `${error.message}\n\nSuggested fix: ${error.suggestedFix}` : error.message;

      const diagnostic = new vscode.Diagnostic(range, messageWithFix, error.severity);
      diagnostic.source = 'buildout-linter';
      
      return diagnostic;
    });

    this.diagnosticCollection.set(uri, diagnostics);
  }

  /**
   * Clear diagnostics for a file
   */
  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
