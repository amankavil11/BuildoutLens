import * as vscode from 'vscode';
import {ProviderMetadata, SectionType} from '../../domain/index';
import {IFileService, IOneDCMTService, OneDCMTOwningTeamConfigs} from '../../application/interfaces/index';
import {getCurrentYamlSection, toSnakeCase} from './YamlSectionUtils';


export class NameCompletionProvider implements vscode.CompletionItemProvider, vscode.HoverProvider {
  private providerMap: Record<string, ProviderMetadata> = {};
  private providerNames: string[] = [];
  private contractsPath = 'Q:\\src\\BuildoutLens_Repo\\server\\contracts_metadata.json';
  private builtInProviders: string[] = ['SignalEventProvider', 'WaitForEventProvider', 'ManualOperationProvider'];
  
  // OneDCMT data for team completions
  private owningTeamConfigs: OneDCMTOwningTeamConfigs | null = null;
  private owningTeamIds: string[] = [];
  private serviceTreeIds: string[] = [];
  
  // Buildout phases data
  private plannerConfigPath = 'Q:\\src\\OneDCMT\\src\\Configuration\\ServiceMap\\PlannerConfig\\PhasedServicePlannerConfig.yml';
  private scenarios: Record<string, { originalName: string; phases: string[] }> = {};
  private scenarioNames: string[] = [];

  constructor(
    private fileService: IFileService,
    private oneDCMTService: IOneDCMTService
  ) {
    this.loadProviderMetadata();
    this.loadOneDCMTData();
    this.loadPlannerConfig();
  }


  /**
   * Register the completion provider with VS Code
   */
  registerProvider(context: vscode.ExtensionContext): void {
    const completionProvider: vscode.CompletionItemProvider = {
      provideCompletionItems: async (document, position, token, context) => {
        return this.provideCompletionItems(document, position, token, context);
      }
    };
    
    const hoverProvider: vscode.HoverProvider = {
      provideHover: async (document, position, token) => {
        return this.provideHover(document, position, token);
      }
    };
    
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { language: 'yaml' },
        completionProvider,
        '.', // Trigger character for phase completion (after scenario.)
        ' '  // Trigger on space for general completion
      )
    );
    
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { language: 'yaml' }, 
        hoverProvider
      )
    );
  }

  private async loadOneDCMTData(): Promise<void> {
    if (!this.oneDCMTService) {
      return;
    }
    try {
      const oneDCMTPath = await this.oneDCMTService.findOneDCMTRepository();
      if (!oneDCMTPath) {
        console.warn('OneDCMT repository not found');
        return;
      }

      this.owningTeamConfigs = await this.oneDCMTService.loadOwningTeamConfigs(oneDCMTPath);
      if (this.owningTeamConfigs) {
        this.owningTeamIds = Object.keys(this.owningTeamConfigs);
        this.serviceTreeIds = Object.values(this.owningTeamConfigs).map(config => config.ServiceTreeId);
        
        console.log(`Loaded ${this.owningTeamIds.length} owning team configs for completion`);
      }
    } catch (error) {
      console.error('Failed to load OneDCMT data:', error);
    }
  }

  private async loadPlannerConfig(): Promise<void> {
    try {
      if (!await this.fileService.fileExists(this.plannerConfigPath)) {
        console.warn(`PhasedServicePlannerConfig.yml not found at: ${this.plannerConfigPath}`);
        return;
      }

      const content = await this.fileService.readFile(this.plannerConfigPath);
      this.parsePlannerConfig(content);
      
      console.log(`Loaded ${this.scenarioNames.length} scenarios for buildout phase completion`);
      console.log('Scenarios loaded:', this.scenarioNames);
      console.log('Sample scenario data:', Object.keys(this.scenarios).slice(0, 2).map(key => ({
        name: key,
        phases: this.scenarios[key].phases
      })));
    } catch (error) {
      console.error('Failed to load planner config:', error);
      this.scenarios = {};
      this.scenarioNames = [];
    }
  }

  private parsePlannerConfig(yamlContent: string): void {
    this.scenarios = {};
    
    // Parse scenarios section
    const lines = yamlContent.split('\n');
    let currentScenario = '';
    let inScenarios = false;
    let inPhases = false;
    let phases: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine === 'scenarios:') {
        inScenarios = true;
        continue;
      }
      
      if (inScenarios && line.match(/^  \w+:/)) {
        // Save previous scenario if exists
        if (currentScenario && phases.length > 0) {
          // Store with lowercase key for efficient lookup, but keep original name
          this.scenarios[currentScenario.toLowerCase()] = { 
            originalName: currentScenario,
            phases: [...phases] 
          };
        }
        
        // Start new scenario
        currentScenario = trimmedLine.replace(':', '');
        phases = [];
        inPhases = false;
      }
      
      if (inScenarios && trimmedLine === 'phases:') {
        inPhases = true;
        continue;
      }
      
      if (inPhases && line.match(/^      - id: /)) {
        const phaseId = trimmedLine.replace('- id: ', '');
        phases.push(phaseId);
      }
      
      // Stop if we hit another top-level section
      if (inScenarios && line.match(/^\w+:/) && !line.match(/^  /)) {
        break;
      }
    }
    
    // Save last scenario
    if (currentScenario && phases.length > 0) {
      // Store with lowercase key for efficient lookup, but keep original name
      this.scenarios[currentScenario.toLowerCase()] = { 
        originalName: currentScenario,
        phases: [...phases] 
      };
    }
    
    // Extract scenario keys (lowercase) for completion
    this.scenarioNames = Object.keys(this.scenarios);
  }

  //hard coded path for now; ideally once frontend is connected w backend, contracts_json is updated at startup
  private async loadProviderMetadata(): Promise<void> {
    //mimicing overloaded constructor
    if (!this.fileService) {
      return;
    }

    try {
      if (!await this.fileService.fileExists(this.contractsPath)) {
        console.warn(`contracts_metadata.json not found at: ${this.contractsPath}`);
        return;
      }

      const content = await this.fileService.readFile(this.contractsPath);
      const rawProviderMap = JSON.parse(content) as Record<string, ProviderMetadata>;
      
      // Remove duplicate provider entries and clean up field duplicates
      this.providerMap = {};
      for (const [key, metadata] of Object.entries(rawProviderMap)) {
        // Only keep the first occurrence of each provider
        if (!this.providerMap[key]) {
          this.providerMap[key] = {
            ...metadata,
            // Clean up duplicate fields
            InputFields: metadata.InputFields ? removeDuplicateFields(metadata.InputFields) : [],
            OutputFields: metadata.OutputFields ? removeDuplicateFields(metadata.OutputFields) : []
          };
        }
      }
      
      // Extract keys (provider names like "SignalEventProvider")
      this.providerNames = Object.keys(this.providerMap);
      
      console.log(`Loaded ${this.providerNames.length} provider contracts from metadata (duplicates removed)`);
    } catch (error) {
      console.error('Failed to load provider metadata:', error);
      this.providerMap = {};
      this.providerNames = [];
    }
  }


  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position).text;
    const linePrefix = line.substring(0, position.character);

    // Debug logging
    console.log('Completion triggered:', { linePrefix, scenarios: this.scenarioNames.length });

    // Check for provider completion - only match when typing the value after "provider: "
    // This should match "provider: " or "provider: partial_text" but not "some_provider:"
    const providerMatch = linePrefix.match(/^\s+provider:\s+(\w*)$/);
    if (providerMatch) {
      console.log('Provider match:', providerMatch[1]);
      return this.getProviderCompletions(providerMatch[1].toLowerCase(), position);
    }

    // Check for owner completion - only match when typing the value after "owner: "
    const ownerMatch = linePrefix.match(/^\s*owner:\s+(\w*)$/);
    if (ownerMatch) {
      console.log('Owner match:', ownerMatch[1]);
      return this.getOwningTeamCompletions(ownerMatch[1].toLowerCase(), position);
    }

    // Check for service_tree completion - only match when typing the value after "service_tree: "
    const serviceTreeMatch = linePrefix.match(/^\s*service_tree:\s+(\w*)$/);
    if (serviceTreeMatch) {
      console.log('Service tree match:', serviceTreeMatch[1]);
      return this.getServiceTreeCompletions(serviceTreeMatch[1].toLowerCase(), position);
    }

    // Check if we're in a buildout_phases section
    const currentSection = getCurrentYamlSection(document, position);
    const inBuildoutPhases = currentSection === SectionType.BuildoutPhases;

    if (inBuildoutPhases) {
      console.log('We are in buildout_phases section');
      
      // Check for phase completion (after dot)
      const phaseMatch = linePrefix.match(/^\s+(\w+)\.(\w*)$/);
      if (phaseMatch) {
        const scenarioName = phaseMatch[1];
        const phasePartial = phaseMatch[2];
        console.log('Phase completion match:', { scenarioName, phasePartial });
        return this.getPhaseCompletions(scenarioName, phasePartial, position);
      }

      // Check for scenario completion (indented under buildout_phases)
      const scenarioMatch = linePrefix.match(/^\s+(\w*)$/);
      if (scenarioMatch) {
        const scenarioPartial = scenarioMatch[1];
        console.log('Scenario completion match:', { scenarioPartial });
        return this.getScenarioCompletions(scenarioPartial, position);
      }
    }

    console.log('No matches found');
    return undefined;
  }

  private getProviderCompletions(partial: string, position: vscode.Position): vscode.CompletionItem[] {
    return this.providerNames
    .filter(name => toSnakeCase(name).startsWith(partial))
    .map(name => {
      let item: vscode.CompletionItem;

      if (this.builtInProviders.includes(name)) {
        if (name === 'ManualOperationProvider') {
          item = new vscode.CompletionItem('Manual', vscode.CompletionItemKind.Text);
        } else {
          item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Text);
          item.insertText = name;
        }
      } else {
        item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Text);
        item.insertText = toSnakeCase(name);
      }


      const startCol = position.character - partial.length;
      item.range = new vscode.Range(
        new vscode.Position(position.line, startCol),
        position
      );

      // Add provider metadata as documentation
      const metadata = this.providerMap[name];
      if (metadata) {
        item.detail = `Provider: ${name}`;
        item.documentation = createProviderDocumentation(metadata);
      }

      return item;
    });
  }

  private getOwningTeamCompletions(partial: string, position: vscode.Position): vscode.CompletionItem[] {
    return this.owningTeamIds
      .filter(id => id.startsWith(partial))
      .map(id => {
        const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Text);
        item.insertText = id;
        
        const startCol = position.character - partial.length;
        item.range = new vscode.Range(
          new vscode.Position(position.line, startCol),
          position
        );

        const config = this.owningTeamConfigs?.[id];
        if (config) {
          item.detail = `Team: ${config.DisplayName}`;
          item.documentation = `Service Tree: ${config.ServiceTreeId}`;
        }

        return item;
      });
  }

  private getServiceTreeCompletions(partial: string, position: vscode.Position): vscode.CompletionItem[] {
    return this.serviceTreeIds
      .filter(id => id.startsWith(partial))
      .map(id => {
        const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Text);
        item.insertText = id;
        
        const startCol = position.character - partial.length;
        item.range = new vscode.Range(
          new vscode.Position(position.line, startCol),
          position
        );

        //find the config that has this service tree ID
        const config = Object.values(this.owningTeamConfigs || {}).find(c => c.ServiceTreeId === id);
        if (config) {
          item.detail = `Service Tree: ${id}`;
          item.documentation = `Team: ${config.DisplayName} (${config.OwningTeamId})`;
        }

        return item;
      });
  }
  
  private getScenarioCompletions(partial: string, position: vscode.Position): vscode.CompletionItem[] {
    console.log('getScenarioCompletions called:', { partial, scenarioCount: this.scenarioNames.length });
    console.log('Available scenarios:', this.scenarioNames);
    
    const completions = this.scenarioNames
      .filter(name => name.startsWith(partial))
      .map(name => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Text);
        item.insertText = name;
        
        const startCol = position.character - partial.length;
        item.range = new vscode.Range(
          new vscode.Position(position.line, startCol),
          position
        );

        return item;
      });
    
    console.log('Returning completion items:', completions.length);
    return completions;
  }

  private getPhaseCompletions(scenarioName: string, phasePartial: string, position: vscode.Position): vscode.CompletionItem[] {
    // Use lowercase key for efficient O(1) lookup
    const scenario = this.scenarios[scenarioName];
    if (!scenario) return [];

    return scenario.phases
      .filter((phase: string) => phase.startsWith(phasePartial))
      .map((phase: string) => {
        const item = new vscode.CompletionItem(phase, vscode.CompletionItemKind.Text);
        
        const startCol = position.character - phasePartial.length;
        item.range = new vscode.Range(
          new vscode.Position(position.line, startCol),
          position
        );

        // item.detail = `Phase: ${phase}`;
        // item.documentation = `Scenario: ${scenario.originalName}`;

        return item;
      });
  }

  /**
   * Provide hover information for provider names
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position).text;
    const wordRange = document.getWordRangeAtPosition(position);
    
    if (!wordRange) return undefined;
    
    const word = document.getText(wordRange);
    
    // Check if we're hovering over a provider name after "provider:"
    const linePrefix = line.substring(0, wordRange.start.character);
    if (!linePrefix.match(/provider:\s*$/)) return undefined;
    
    // Find provider by snake_case name
      var providerName = this.providerNames.find(name => 
      toSnakeCase(name) === word.toLowerCase()
    );

    if (word == 'Manual') {
      providerName = 'ManualOperationProvider';
    }
    if (this.builtInProviders.includes(word)) {
      providerName = word;
    }
    
    if (!providerName || !this.providerMap[providerName]) return undefined;
    
    const metadata = this.providerMap[providerName];
    const documentation = createProviderDocumentation(metadata);
    
    return new vscode.Hover(documentation, wordRange);
  }

  /**
   * Get available scenario names (for use by other services)
   */
  public getScenarioNames(): string[] {
    return [...this.scenarioNames];
  }

  /**
   * Get scenarios data (for use by other services)
   */
  public getScenarios(): Record<string, { originalName: string; phases: string[] }> {
    return { ...this.scenarios };
  }

  /**
   * Find scenario by original name (case-insensitive) and return the original casing
   */
  public findScenarioByOriginalName(searchName: string): string | null {
    const scenario = this.scenarios[searchName];
    return scenario ? scenario.originalName : null;
  }
}

function createProviderDocumentation(metadata: ProviderMetadata): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  
  // Provider name header
  md.appendMarkdown(`### ${metadata.ProviderName}\n\n`);
  
  // Type information
  if (metadata.InputTypeName || metadata.OutputTypeName) {
    md.appendMarkdown(`**Type Information:**\n`);
    if (metadata.InputTypeName) {
      md.appendMarkdown(`- Input Type: \`${metadata.InputTypeName}\`\n`);
    }
    if (metadata.OutputTypeName) {
      md.appendMarkdown(`- Output Type: \`${metadata.OutputTypeName}\`\n`);
    }
    md.appendMarkdown(`\n`);
  }
  
  // Input fields - remove duplicates
  if (metadata.InputFields && metadata.InputFields.length > 0) {
    md.appendMarkdown(`**Input Fields:**\n`);
    //const uniqueInputFields = removeDuplicateFields(metadata.InputFields);
    metadata.InputFields.forEach(field => {
      const required = field.IsOptional ? ' *(optional)*' : ' *(required)*';
      md.appendMarkdown(`- \`${field.PropertyName}\`: ${field.ValueType}${required}\n`);
    });
    md.appendMarkdown(`\n`);
  }
  
  // Output fields - remove duplicates
  if (metadata.OutputFields && metadata.OutputFields.length > 0) {
    md.appendMarkdown(`**Output Fields:**\n`);
    //const uniqueOutputFields = removeDuplicateFields(metadata.OutputFields);
    metadata.OutputFields.forEach(field => {
      const optional = field.IsOptional ? ' *(optional)*' : '';
      md.appendMarkdown(`- \`${field.PropertyName}\`: ${field.ValueType}${optional}\n`);
    });
    md.appendMarkdown(`\n`);
  }
  
  return md;
}

/**
 * Remove duplicate fields based on PropertyName
 */
function removeDuplicateFields(fields: any[]): any[] {
  const seen = new Set<string>();
  return fields.filter(field => {
    if (seen.has(field.PropertyName)) {
      return false;
    }
    seen.add(field.PropertyName);
    return true;
  });
}


