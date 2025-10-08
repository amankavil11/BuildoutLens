export interface TemplateHeader {
    owning_team_id: string;
    service_tree: string;
}

export interface ServiceTemplate {
    name: string;
    service_tree: string;
    owner: string;
    buildout_phases: string[];
    resources: string[];
}

export enum SectionType {
    BuildoutPhases = 'buildout_phases',
    Resources = 'resources',
    Providers = 'providers',
    Imports = 'imports'
}
//TODO: need a trigger for provider: <>

export interface FieldEntry {
  PropertyName: string;
  ValueType: string;
  IsOptional: boolean;
}

export interface ProviderMetadata {
  ProviderName: string;             // PascalCase name of the provider
  InputTypeName?: string;           // Optional
  OutputTypeName?: string;          // Optional
  InputFields: FieldEntry[];        // Defaults to empty list if missing
  OutputFields: FieldEntry[];       // Defaults to empty list if missing
}
