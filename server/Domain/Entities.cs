using YamlDotNet.RepresentationModel;
using System.Collections.Generic;

namespace BuildoutLensBackend.Domain 
{
    public class TemplateMetadata  {
        public string FilePath { get; set; }
        public List<string> BuildoutScenarios { get; set; } = new(); // e.g., ["newaz", "newregion"]
        public List<string> Providers { get; set; } = new(); // Simple list for backward compatibility
        public Dictionary<string, ProviderReference> ProviderReferences { get; set; } = new(); // Detailed provider info
        public Dictionary<string, ProviderDefinition> ProviderDefinitions { get; set; } = new(); // From providers section
        public List<string> Imports { get; set; } = new();
        public Dictionary<string, YamlNode> Resources { get; set; } = new();
        public Dictionary<string, List<string>> Dependencies { get; set; } = new(); // Resource -> List of dependencies
    }

    public class TemplateContext
    {
        public string CurrentFilePath { get; set; }
        public string CurrentSection { get; set; }
        public int CurrentLine { get; set; }
        public Dictionary<string, object> MainContent { get; set; }
        public List<DependencyContext> RelatedSections { get; set; } = new();
        //public Dictionary<string, ProviderMetadata> AvailableProviders { get; set; } = new();
    }

    public class DependencyContext
    {
        public string FilePath { get; set; }
        public string ResourceName { get; set; }
        public Dictionary<string, object> Content { get; set; }
        public string DependencyType { get; set; } // "depends_on", "provider_reference", "phase_reference", etc.
    }

    public class QuickScanResult
    {
        public List<string> BuildoutScenarios { get; set; } = new();
        public List<string> Providers { get; set; } = new(); // Simple provider names for compatibility
        public Dictionary<string, ProviderReference> ProviderReferences { get; set; } = new(); // Detailed provider info
        public Dictionary<string, ProviderDefinition> ProviderDefinitions { get; set; } = new(); // Provider definitions
        public List<string> Imports { get; set; } = new();
        public Dictionary<string, List<string>> Dependencies { get; set; } = new();
        public Dictionary<string, ResourceBoundary> ResourceBoundaries { get; set; } = new();
    }

    public class ResourceBoundary
    {
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
        public string Content { get; set; }
    }

    // Single field/property for a provider type
    public class FieldEntry
    {
        public required string PropertyName { get; set; }
        public required string ValueType { get; set; }
        public bool IsOptional { get; set; }
    }

    // Combined input/output metadata for a provider
    public class ProviderMetadata
    {
        // Base provider name in pascal case
        public required string ProviderName { get; set; }

        public string? InputTypeName { get; set; }
        public string? OutputTypeName { get; set; }

        public List<FieldEntry> InputFields { get; set; } = new();
        public List<FieldEntry> OutputFields { get; set; } = new();
    }

    // Provider discovery and resolution classes
    public class ProviderReference
    {
        public string Name { get; set; } // Original name as found in template
        public ProviderType Type { get; set; }
        public string ResolvedName { get; set; } // Final Pascal case provider name
        public List<string> AliasChain { get; set; } = new(); // Chain of aliases if any
        public string Library { get; set; } // Library name if applicable (e.g., "StdLib", "RegionalStdLib")
    }

    public enum ProviderType
    {
        Library,    // Format: LibraryName::provider_name
        Custom,     // Defined in providers section with base_provider: External
        Alias,      // Defined in providers section with base_provider: another_provider
        Builtin     // Direct Pascal case reference like WaitForEventProvider
    }

    public class ProviderDefinition
    {
        public string Name { get; set; } // snake_case name as defined in template
        public string BaseProvider { get; set; } // Value of base_provider field
        public string RPClass { get; set; } // For External providers
        public string RPAssembly { get; set; } // For External providers
        public Dictionary<string, string> Properties { get; set; } = new();
    }

    // Helper class for provider name conversions
    public static class NamingHelper
    {
        public static string SnakeCaseToPascalCase(string snakeCaseStr)
        {
            if (string.IsNullOrEmpty(snakeCaseStr))
                return snakeCaseStr;

            var parts = snakeCaseStr.Split('_', StringSplitOptions.RemoveEmptyEntries);
            var result = string.Join("", parts.Select(part => 
                char.ToUpperInvariant(part[0]) + part.Substring(1).ToLowerInvariant()));
            
            return result;
        }

        public static string ExtractProviderNameFromRPClass(string rpClass)
        {
            if (string.IsNullOrEmpty(rpClass))
                return rpClass;

            var lastDotIndex = rpClass.LastIndexOf('.');
            return lastDotIndex >= 0 ? rpClass.Substring(lastDotIndex + 1) : rpClass;
        }

        public static (string library, string providerName) ParseLibraryProvider(string libraryProviderRef)
        {
            if (string.IsNullOrEmpty(libraryProviderRef) || !libraryProviderRef.Contains("::"))
                return (null, libraryProviderRef);

            var parts = libraryProviderRef.Split(new[] { "::" }, 2, StringSplitOptions.None);
            return (parts[0], parts[1]);
        }

        public static string PascalCaseToSnakeCase(string pascalCaseStr)
        {
            if (string.IsNullOrEmpty(pascalCaseStr))
                return pascalCaseStr;

            var result = new System.Text.StringBuilder();
            
            for (int i = 0; i < pascalCaseStr.Length; i++)
            {
                char c = pascalCaseStr[i];
                
                if (char.IsUpper(c) && i > 0)
                {
                    result.Append('_');
                }
                
                result.Append(char.ToLowerInvariant(c));
            }
            
            return result.ToString();
        }
    }

    public class ProviderCompletionRequest
    {
        public string ProviderName { get; set; }
        public string CurrentTemplateContent { get; set; }
        public int CursorLine { get; set; }
        public int CursorColumn { get; set; }
    }

    public class ProviderCompletionResponse
    {
        public string ErrorMessage { get; set; }
        public string ProviderName { get; set; }
        public bool IsSnakeCase { get; set; }
        public bool NeedsProviderDefinition { get; set; }
        public string SuggestedProviderDefinition { get; set; }
        public List<ProviderCompletionContext> Contexts { get; set; } = new();
    }

    public class ProviderCompletionContext
    {
        public string TemplatePath { get; set; }
        public string TemplateType { get; set; } // "phased" or "phaseless"
        public List<ResourceChunk> ResourceExamples { get; set; } = new();
        public ProviderInfo ProviderMetadata { get; set; }
    }

    public class ResourceChunk
    {
        public string ResourceName { get; set; }
        public string RawText { get; set; } // Preserves formatting, indentation
        public ProviderType ProviderType { get; set; }
        public string ProviderReference { get; set; } // How provider is referenced in this resource
        public List<string> Dependencies { get; set; } = new();
        public List<string> DependencyChunks { get; set; } = new(); // Raw text of dependencies
        public List<AliasDefinition> AliasDefinitions { get; set; } = new();
    }

    public class AliasDefinition
    {
        public string AliasName { get; set; }
        public string RawText { get; set; } // Raw provider definition text
    }

    public class ProviderInfo
    {
        public string Name { get; set; }
        public List<FieldEntry> InputFields { get; set; } = new();
        public List<FieldEntry> OutputFields { get; set; } = new();
    }
}