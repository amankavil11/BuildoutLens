import * as vscode from 'vscode';
import { IChatService} from '../../application/interfaces';

//handles all VS Code LLM API interactions and abstracts them from the application layer

export class VsCodeChatService implements IChatService {
    //default is gpt-4o
    private modelId: string = 'gpt-4o';
    private languageModel: vscode.LanguageModelChat | null = null;
    private SERVICE_TEMPLATE_COMPLETION_PROMPT = `You are an expert YAML service template assistant specializing in cloud infrastructure and deployment configurations. Your role is to provide intelligent autocomplete suggestions as users type their service templates.
## Context
You will receive:
1. Current template content with cursor position marked as <CURSOR>
2. An example service template which is a current service template in deployment and serves as a gold standard which you will match the provider names exactly
## Your Task
Provide contextual completions that will be displayed as vscode inline completion items that help users write valid, maintainable service templates. Focus on:
- **Resource references**: Suggest valid resource names that exist in scope
- **NUMBER 1 RULE**: For provider completion, only give properties: header and the properties section in your JSON response, don't include resource name and provider.
- **NUMBER 2 RULE**: In the examples, most property values for fields like SettingsToSave, etc, they are based on the service name/owner. Using the pattern, mimic conventions to predict property names and values this current template would want based on its service name and owner fields.
- **Schema validation**: Ensure suggestions comply with template schemas and it propely tabbed relative to the current template context.
There are 2 types of service templates: phased, which have a buildout_phases section and phaseless which do not. There are examples provided for both.
## Response Format:
Return only a JSON array with this structure:
[
    {
        "insertText": \n\t\tproperties:\\n    \t WaitingEntityName: \\"Milestones.dSCM.InternallyReady\\"\\n    Scope: \\"Cloud\\"\\n    MaximumWaitTime: \\"1825.00:00:00\\"",
        "kind": "resource"
    }
]

## Guidelines:
1. Follow the reference example as closely as possible and focus on pattern matching

## Example templates
#example 1: phasless but with examples of every resource
---
name: test_all_providers
owner: Cis_NewDcNewRegion
resources:
  Manual_provider:
    provider: Manual
    properties:
      DisplayName: Create DSMS certifacte
      OwningTeamId: Jarvis
      AdditionalContent: https://admetrics.visualstudio.com/AD%20Metrics%20Experimental/_wiki/wikis/AD-Metrics-Experimental.wiki/97/DSMS-and-DSTS-Creation
  set_global_settings_provider_result:
    provider: set_global_settings_provider
    properties:
      SettingsToSave:
        SceeKustoClusterName: "https://cscpdi.kusto.windows.net"
        SceeKustoDbName: "SceeKustoDbName"
        SceeKustoResource: "https://cscpdi.kusto.windows.net"
        SceeKustoAuthority: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
        EnableFFPDataProviderClientTenantCertAuth: "true"
        EnableTenantAuth: "true"
        SceeDbServerName: "Katmai"
        SceeDbName: "Warehouse"
        SceeDbResource: "https://database.windows.net/"
        SceeDbAuthority: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
        EnableGitPatAuth: "true"
        UsePatForAuth: "true"
  azores_provider_result:
    provider: azores_provider
    properties:
      CloudName: "Public"
      RegionName: "italyn"
      ArmLocation: "italynorth"
      ServiceName: "Regional Directory Service"
      ServiceTreeId: "696c76fc-0331-4216-8960-5a0f3b305f64"
      KustoConnectionParams:
        KustoClusterName: "https://resilience.eastus.kusto.windows.net"
        DBName: "AZ"
        AadAuthority: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
  ffp_data:
    provider: buildout_capacity_provider_v2
    properties:
      CloudName: "Public"
      RegionName: "EUSSLV"
      Topology: "Zone"
      ZoneName: "EUSSLV-AZ01"
      LimitToFFP: "true"
  region_metadata_result:
    provider: region_metadata_provider
    properties:
      RegionName: "eusslv"
  cloud_metadata_provider_result:
    provider: cloud_metadata_provider
    properties:
      CloudName: "Public"
  zone_metadata_provider_result:
    provider: zone_metadata_provider
    properties:
      ZoneName: "EUSSLV-AZ01"
  datacenter_metadata_provider_result:
    provider: datacenter_metadata_provider
    properties:
      RegionName: "eusslv"
      DatacenterName: "SLV01"
  conditional_new_az_starter_provider_result:
    provider: conditional_new_az_starter_provider
    properties:
      AzInfo:
        - { name: "testName", guid: "testGuid" }
      ElementToStart: 1
      RemoteJobProviderInput:
        JobType: "testValue"
        Workflow: "testValue"
  create_records_provider_result:
    provider: create_records_provider
    properties:
      SubscriptionID: "bd0c277b-79f3-4800-b0d2-a71a10b8e611"
      ResourceGroup: "archit-rg"
      ZoneName: "retry.azure-test.net"
      AuthorityUrl: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
      AADResourceUrl: "https://management.azure.com/"
      AADAppID: "9602f7ed-8370-49ff-8955-86ba291d5997"
  create_zone_provider_result:
    provider: create_zone_provider
    properties:
      SubscriptionID: "bd0c277b-79f3-4800-b0d2-a71a10b8e611"
      ResourceGroup: "archit-rg"
      ZoneName: "retry.azure-test.net"
      AuthorityUrl: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
      AADResourceUrl: "https://management.azure.com/"
      AADAppID: "9602f7ed-8370-49ff-8955-86ba291d5997"
  formatted_string:
    provider: format_string_provider
    properties:
      Format: "testFormat"
      Values:
        - "testValue"
  manual_string_resource:
    provider: StdLib::format_string_provider
    properties:
      Format: "{0}-{1}"
      Values:
        - "Test"
        - "String"
  buildout_scenario_enum:
    provider: parse_geo_expansion_buildout_scenario_enum_provider
    properties:
      InputString: "Logical"
  identity_function_provider_result:
    provider: identity_function_provider_v2
    properties:
      Value: "testValue"
  increment_progress_provider_result:
    provider: increment_progress_provider
    properties:
      Name: "testName"
      Count: "4"
  leading_zone_services_starter_provider_result:
    provider: leading_zone_services_starter_provider
    properties:
      IsNewRegionNewAz: "true"
      LeadingZoneName: "AZ01"
      ZoneName: "AZ02"
      RemoteJobProviderInput:
        JobType: "testValue"
        Workflow: "testValue"
  newaz_retrofit_starter_provider_result:
    provider: newaz_retrofit_starter_provider
    properties:
      IsNewRegionNewAz: "true"
      RemoteJobProviderInput:
        JobType: "testValue"
        Workflow: "testValue"
  non_blocking_manual_operation_provider_exception_result:
    provider: non_blocking_manual_operation_valuepassing_exception
    properties:
      DisplayName: "testValue"
      OwningTeamId: "testValue"
      AdditionalContent: (manual_string_resource)
      MonitoringSystems: "testValue"
  non_blocking_manual_operation_provider_sharedcert_result:
    provider: non_blocking_manual_operation_valuepassing_sharedcert
    properties:
      DisplayName: "testValue"
      OwningTeamId: "testValue"
      AdditionalContent: (manual_string_resource)
      MonitoringSystems: "testValue"
  record_details_provider_result:
    provider: record_details_provider
    properties:
      SubscriptionID: "bd0c277b-79f3-4800-b0d2-a71a10b8e611"
      ResourceGroup: "archit-rg"
      ZoneName: "retry.azure-test.net"
      AuthorityUrl: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
      AADResourceUrl: "https://management.azure.com/"
      AADAppID: "9602f7ed-8370-49ff-8955-86ba291d5997"
  read_setting_or_default_provider_result:
    provider: read_setting_or_default_provider
    properties:
      SettingName: "testSetting"
      DefaultValue: "testValue"
  read_setting_or_default_provider_result_with_optionals:
    provider: read_setting_or_default_provider
    properties:
      SettingName: "testSetting"
      DefaultValue: "testValue"
      AllowEmptySettingValue: true
  read_setting_provider_result:
    provider: read_setting_provider
    properties:
      SettingName: "RegionName"
  read_setting_provider_result_with_optionals:
    provider: read_setting_provider
    properties:
      SettingName: "RegionCapabilityConstraint"
      AllowEmptySettingValue: true
  zone_details_provider_result:
    provider: zone_details_provider
    properties:
      SubscriptionID: "bd0c277b-79f3-4800-b0d2-a71a10b8e611"
      ResourceGroup: "archit-rg"
      ZoneName: "retry.azure-test.net"
      AuthorityUrl: "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47"
      AADResourceUrl: "https://management.azure.com/"
      AADAppID: "9602f7ed-8370-49ff-8955-86ba291d5997"
  remote_settings_retrieval_provider_result:
    provider: remote_settings_retrieval_provider
    properties:
      SearchInputs: []
  runner_environment_name_2:
    provider: EnvironmentProviderV2
    properties:
      CloudName: "Mooncake"
      CloudToEnvironmentMap:
        Public: Prod
        Mooncake: Mooncake
        Fairfax: Fairfax
  runner_instance_name_2:
    provider: RsrpRunnerInstanceV2
    properties:
      RegionFriendlyName: "East US SLV"
      Environment: "testEnvironment"
  tenant_name_2:
    provider: RsrpTenantNameV2
    properties:
      RegionFriendlyName: "East US SLV"
  start_newaz_starter_for_newregion_provider_result:
    provider: start_newaz_starter_for_newregion_provider
    properties:
      RegionType: "Satellite"
      RemoteJobProviderInput:
        JobType: "AzureFoundation"
        Workflow: "BuildoutMap"
  telemetry_provider_result:
    provider: telemetry_provider
    properties:
      ServiceName: "test_service"
      Scenario: "testScenario"
      PhaseName: "testPhase"
      ActionStatus: "testActionStatus"
  remote_job_provider_result:
    provider: remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
  signal_test_complete_event:
    provider: SignalEventProvider
    properties:
      EntityName: "Services.ServiceMap.TestComplete"
  wait_test_complete_event:
    provider: WaitForEventProvider
    properties:
      WaitingEntityName: "Services.ServiceMap.TestComplete"
      Scope: "Regional"
  azure_dns_MSFTRR_provider_result:
    provider: azure_dns_MSFTRR_provider
    properties:
      CloudName: "Public"
      DataFileContent: "{'MDMAccount': 'gfsdnsProd'}"
      DataFileName: "MsftRR_SmartDestinationSelectorService.json"
      DataFileRecord: "testValue"
      FirstLevelVariable: "MDMAccount"
      RegionName: "EUSSLV"
      ServiceName: "test_service"
  tenant_remote_job_Test:
    provider: RegionalStdLib::tenant_regional_remote_job_provider
    properties:
      Workflow: BuildoutMap
      WorkflowDefinition: BuildoutMap
      JobType: AzureFoundation
      WorkflowParameters:
        ServiceName: test_service_ODP
        OwningTeamOverride: (this::owner)
      RuntimeSettings:
        ServiceMapScope: "NewAZ"
  az_info:
    provider: prepare_az_starter_provider
    properties:
      RegionTopologyInfo: (region_metadata_result)
  remote_artifacts_retrieval_provider_result:
    provider: remote_artifacts_retrieval_provider
    properties:
      SearchInputs: []
  champion_datacenter_provider_result:
    provider: champion_datacenter_provider
    properties:
      RegionFriendlyName: Chile Central
      ZoneName: chilec-AZ01
      TenantAppId: 56954060-88b9-4146-b199-294d2b41261b
      GeoExpansionKustoConnectionParams:
        KustoClusterName: https://azcis.kusto.windows.net
        AadAuthority: https://login.microsoftonline.com/33e01921-4d64-4f8c-a055-5bdaffd5e33d
        DBName: azcispub
providers:
  azores_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzoresProvider.AzoresProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzoresProvider
  azure_dns_dcmt_configurator_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS.DCMTConfiguratorProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS
  azure_dns_MSFTRR_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS.MSFTRRProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS
  buildout_capacity_provider_v2:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.BuildoutCapacityProvider.BuildoutCapacityProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.BuildoutCapacityProvider
  cloud_metadata_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders.CloudMetadataProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders
  region_metadata_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders.RegionMetadataProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders
  zone_metadata_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders.ZoneMetadataProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders
  datacenter_metadata_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders.DatacenterMetadataProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.CloudMetadataProviders
  champion_datacenter_provider:
    base_provider: External
    properties:
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.ChampionDatacenterProvider
  conditional_new_az_starter_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.ConditionalNewAzStarterProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  post_core_az_starter_provider:
    base_provider: External
    properties:
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewAZProviders
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewAZProviders.PostCoreAZStarterProvider
  create_records_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS.CreateRecordsProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS
  create_zone_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS.CreateZoneProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS
  fabric_controller_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.FabricControllerProvider.FabricControllerProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.FabricControllerProvider
  format_string_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.FormatStringProvider.FormatStringProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.FormatStringProvider
  fgw_dns_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.FGWProviders.GitBasedFoundationalGatewayProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.FGWProviders
  frp_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.FRPProvider.FRPProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.FRPProvider
  geneva_health_check_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GenevaHealthCheck.GenevaHealthCheckProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GenevaHealthCheck
  geneva_health_check_provider_v2:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GenevaHealthCheck.GenevaHealthCheckProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GenevaHealthCheck
  geoexpansion_buildout_starter_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.GeoExpansionBuildoutStarterProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  EnvironmentProviderV2:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.SRP.EnvironmentProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.SRP
  RsrpRunnerInstanceV2:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.SRP.RsrpRunnerInstanceNameProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.SRP
  RsrpTenantNameV2:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.SRP.RsrpTenantNameProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.SRP
  parse_geo_expansion_buildout_scenario_enum_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.ParseGeoExpansionBuildoutScenarioEnumProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  identity_function_provider_v2:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.IdentityFunctionProvider.IdentityFunctionProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.IdentityFunctionProvider
  increment_progress_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.IncrementProgressProvider.IncrementProgressProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.IncrementProgressProvider
  leading_zone_services_starter_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.LeadingZoneServicesStarterProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  newaz_retrofit_starter_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.NewAZRetrofitStarterProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  non_blocking_manual_operation_valuepassing_exception:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider.NonBlockingExceptionBasedManualOperationProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider
  non_blocking_manual_operation_valuepassing_sharedcert:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider.NonBlockingSharedCertManualOperationProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider
  prepare_az_starter_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.PrepareAZStarterGlobalParametersProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  record_details_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS.RecordDetailsProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS
  read_setting_or_default_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.ReadSettingOrDefaultProvider.ReadSettingOrDefaultProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.ReadSettingOrDefaultProvider
  read_setting_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.ReadSettingProvider.ReadSettingProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.ReadSettingProvider
  zone_details_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS.ZoneDetailsProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.AzureDNS
  remote_artifacts_retrieval_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.RemoteArtifactsRetrievalProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  remote_job_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.RemoteJobProvider.RemoteJobProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.RemoteJobProvider
  remote_settings_retrieval_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.RemoteSettingsRetrievalProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  rnb_event_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.RNBEventProvider.RNBEventProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.RNBEventProvider
  set_global_settings_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.SetGlobalSettingsProvider.SetGlobalSettingsProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.SetGlobalSettingsProvider
  start_newaz_starter_for_newregion_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.StartNewAZStarterForNewRegionProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  telemetry_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.TelemetryProvider.TelemetryProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.TelemetryProvider
  tenant_based_remote_job_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.TenantBasedRemoteJobProvider.TenantBasedRemoteJobProviderV2
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.TenantBasedRemoteJobProvider
  zip_file_extract_to_directory_provider:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders.ZipFileExtractToDirectoryProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.GeoExpansionProviders.NewRegionProviders
  manual_valuepassing_ex:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider.ExceptionBasedManualOperationProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider
  manual_valuepassing_sc:
    base_provider: External
    properties:
      RPClass: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider.SharedCertManualOperationProvider
      RPAssembly: Microsoft.Azure.Cis.ServiceMap.Providers.ManualOperationProvider

imports:
  - RegionalStdLib
  - StdLib
  - AzoresLib


  #example 2: phaseless
  ---
name: test_service_phaseless
owner: Cis_NewDcNewRegion
resources:
  NoOp Test:
    provider: StdLib::remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
  NoOp Preparation:
    provider: TestRemoteJob
    properties:
      WorkflowParameters:
        ValidationString: NoOp Preparation
  NoOp Provisioning:
    provider: RegionalStdLib::regional_remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
      WorkflowParameters:
        ValidationString: NoOp Provisioning
  NoOp Deployment:
    provider: TestRemoteJob
    properties:
      WorkflowParameters:
        ValidationString: NoOp Deployment
    depends_on:
      - NoOp Test
  NoOp Deferred Provisioning:
    provider: TestRemoteJob
    properties:
      WorkflowParameters:
        ValidationString: NoOp Deferred Provisioning
providers:
  TestRemoteJob:
    base_provider: StdLib::remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
imports:
  - RegionalStdLib
  - StdLib

  #example 3: phased
  ---
name: test_service
service_tree: 00000000-0000-0000-0000-000000000000
owner: Cis_NewDcNewRegion
buildout_phases:
  newaz.preparation:
    - NoOp Test
    - NoOp Preparation
  newaz.provisioning:
    - NoOp Provisioning
  newaz.deployment:
    - NoOp Deployment
    - NoOp Provider Example
    - NoOp Tenant Remote Job Test
  newaz.deferred_provisioning:
    - NoOp Deferred Provisioning
resources:
  NoOp Test:
    provider: StdLib::remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
  NoOp Preparation:
    provider: TestRemoteJob
    properties:
      WorkflowParameters:
        ValidationString: NoOp Preparation
  NoOp Provisioning:
    provider: RegionalStdLib::regional_remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
      WorkflowParameters:
        ValidationString: NoOp Provisioning
  NoOp Deployment:
    provider: TestRemoteJob
    properties:
      WorkflowParameters:
        ValidationString: NoOp Deployment
    depends_on:
      - NoOp Test
      - ffp_data
  NoOp Tenant Remote Job Test:
    provider: RegionalStdLib::tenant_regional_remote_job_provider
    properties:
      Workflow: ServiceMapResourceBuilder
      WorkflowDefinition: ServiceMapResourceBuilder
      JobType: AzureFoundation
      WorkflowParameters:
        ServiceName: test_service_ODP
        OwningTeamOverride: (this::owner)
      RuntimeSettings:
        ServiceMapScope: "NewAZ"
  NoOp Deferred Provisioning:
    provider: TestRemoteJob
    properties:
      WorkflowParameters:
        ValidationString: NoOp Deferred Provisioning
  cloud_name:
    provider: StdLib::read_setting_provider
    properties:
      SettingName: CloudName
  region_name:
    provider: StdLib::read_setting_provider
    properties:
      SettingName: RegionName
  zone_name:
    provider: StdLib::read_setting_provider
    properties:
      SettingName: ZoneName
  ffp_data:
    provider: RegionalStdLib::buildout_capacity_provider
    properties:
      Topology: "Zone"
      CloudName: "(cloud_name)"
      RegionName: "(region_name)"
      ZoneName: "(zone_name)"
      ResourceTypes: "Compute"
      Policy: "Any:Count=2"
  cluster_sku:
    provider: StdLib::format_string_provider
    properties:
      Format: "ClusterName:{0} SKU:{1}"
      Values:
        - (ffp_data.Capacity[0].ClusterName)
        - (ffp_data.Capacity[0].PFAM)
  NoOp Provider Example:
    provider:
  signal_test_complete_event:
    provider: SignalEventProvider
    properties:
      EntityName: "Services.ServiceMap.TestComplete"
    depends_on:
      - NoOp Provider Example
providers:
  TestRemoteJob:
    base_provider: StdLib::remote_job_provider
    properties:
      Workflow: ServiceMapV2ValidationCheck
      JobType: AzureFoundation
      RuntimeSettings:
        IcmTitlePrefix: "NewRegion Buildout-[%(RegionName)]"
        RegionName: (region_name)
imports:
  - RegionalStdLib
  - StdLib

Remember: Your suggestions should feel natural and helpful, like having an expert teammate looking over the user's shoulder while they write infrastructure code.`;

    constructor(preferredModelId?: string) {
        if (preferredModelId) {
            this.modelId = preferredModelId;
        }
    }

    //check llm availability/validity
    async isAvailable(): Promise<boolean> {
        try {
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: this.modelId
            });
    
            this.languageModel = models[0];
            console.log(`Current Model: ${models[0].id}`);
            return models.length > 0;
        } catch (error) {
            console.error('Failed to check language model availability:', error);
            return false;
        }
    }

    //getter for curr model ID
    getModelId(): string {
        return this.modelId;
    }

    //send messages to the language model and get response
    async sendMessage(messages: string[], isLinter: boolean): Promise<string> {
        //console.log("Messages about to send to AI: " + messages);
        if (!this.languageModel) {
            const available = await this.isAvailable();
            if (!available) {
                throw new Error('Language model not available');
            }
            if (!this.languageModel) {
                throw new Error('Failed to initialize language model');
            }
        }
        
        try {
            //messages to VS Code format
            const vsCodeMessages: vscode.LanguageModelChatMessage[] = messages.map(msg => 
                vscode.LanguageModelChatMessage.User(msg)
            );
            if (!isLinter) {
              vsCodeMessages.push(
                vscode.LanguageModelChatMessage.User(this.SERVICE_TEMPLATE_COMPLETION_PROMPT));
            }

            //send request to language model
            const chatResponse = await this.languageModel.sendRequest(vsCodeMessages, {}, new vscode.CancellationTokenSource().token);
            // Collect the full response
            let response = '';
            for await (const fragment of chatResponse.text) {
                response += fragment;
            }

            return response; 

        } catch (error) {
            throw new Error(`Failed to send message to language model: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    //wrapper around sendMessage
    async getInlineCompletions(messages: string[]): Promise<any[]> {
        const response = await this.sendMessage(messages, false);

        //parse the JSON response
        try {
            const parsed = JSON.parse(response);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (parseError) {
            console.error('Failed to parse completion response:', parseError);
            return [];
        }

    }

}
