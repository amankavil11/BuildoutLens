using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using YamlDotNet.RepresentationModel;
using BuildoutLensBackend.Domain;

namespace BuildoutLensBackend.Infrastructure
{
    public class TemplateIndexer
    {
        private readonly List<string> _templatePaths = new()
        {
            @"Q:\src\OneDCMT\src\CIS\Tenants\warpbuildout\ServiceTemplates\Phased\Warp.yml",
            @"Q:\src\OneDCMT\src\CIS\Tenants\networkdevicemanager\ServiceTemplates\Phased\ConfigUpdater.yml",
            @"Q:\src\OneDCMT\src\CIS\Tenants\dsmsbuildouttenant\ServiceTemplates\Phased\dSMS.yml",
            @"Q:\src\OneDCMT\src\CIS\Tenants\cplatbuildout\ServiceTemplates\Phased\CPlat.yml",
            @"Q:\src\OneDCMT\src\CIS\Tenants\anpserviceringzero\ServiceTemplates\Phased\ANP.yml",
            @"Q:\src\OneDCMT\src\CIS\Tenants\nrp-buildout-prod\ServiceTemplates\Phased\NRP.yml",
            @"Q:\src\OneDCMT\src\CIS\Tenants\newregion\ServiceTemplates\Phaseless\TestTemplates\test_all_providers.yml",


        };

        private readonly ConcurrentDictionary<string, TemplateMetadata> _filePathToMetadata = new();
        private readonly ConcurrentDictionary<string, HashSet<string>> _scenarioToFilePaths = new();
        private readonly ConcurrentDictionary<string, HashSet<string>> _providerToFilePaths = new();
        private readonly ConcurrentDictionary<string, HashSet<string>> _importToFilePaths = new();
        private readonly ConcurrentDictionary<string, QuickScanResult> _quickScanCache = new();

        private readonly DllExplorer _dllExplorer;

        public TemplateIndexer(DllExplorer dllExplorer)
        {
            _dllExplorer = dllExplorer;
        }

        public async Task IndexAllTemplatesAsync()
        {
            var quickScanTasks = _templatePaths.Select(async path =>
            {
                if (File.Exists(path))
                {
                    var content = await File.ReadAllTextAsync(path);
                    var quickResult = FastYamlScanner.QuickScan(content);
                    _quickScanCache[path] = quickResult;
                    UpdateIndexesFromQuickScan(path, quickResult);
                }
            });

            await Task.WhenAll(quickScanTasks);
        }

        private void UpdateIndexesFromQuickScan(string filePath, QuickScanResult quickResult)
        {
            foreach (var scenario in quickResult.BuildoutScenarios)
            {
                _scenarioToFilePaths.AddOrUpdate(scenario,
                    new HashSet<string> { filePath },
                    (_, set) => { set.Add(filePath); return set; });
            }

            foreach (var provider in quickResult.Providers)
            {
                _providerToFilePaths.AddOrUpdate(provider,
                    new HashSet<string> { filePath },
                    (_, set) => { set.Add(filePath); return set; });
            }

            foreach (var import in quickResult.Imports)
            {
                _importToFilePaths.AddOrUpdate(import,
                    new HashSet<string> { filePath },
                    (_, set) => { set.Add(filePath); return set; });
            }
        }

        public TemplateContext GetContextForPosition(string filePath, int line, string currentSection)
        {
            var context = new TemplateContext
            {
                CurrentFilePath = filePath,
                CurrentLine = line,
                CurrentSection = currentSection,
                MainContent = new Dictionary<string, object>(), // Initialize empty instead of null
                // AvailableProviders = _dllExplorer.Contracts.ToDictionary(
                //     kvp => kvp.Key, 
                //     kvp => kvp.Value)
            };

            if (!_quickScanCache.TryGetValue(filePath, out var quickScan))
            {
                return context;
            }

            if (!_filePathToMetadata.TryGetValue(filePath, out var metadata))
            {
                metadata = LoadFullMetadata(filePath);
                if (metadata == null)
                    return context;
                    
                _filePathToMetadata[filePath] = metadata;
            }

            if (string.IsNullOrEmpty(currentSection))
            {
                var content = File.ReadAllText(filePath);
                currentSection = FastYamlScanner.GetCurrentSection(content, line);
            }

            if (metadata.Resources.TryGetValue(currentSection, out var resourceNode))
            {
                context.MainContent = ConvertYamlNodeToDictionary(resourceNode);

                if (quickScan.Dependencies.TryGetValue(currentSection, out var deps))
                {
                    foreach (var dep in deps)
                    {
                        if (metadata.Resources.TryGetValue(dep, out var depNode))
                        {
                            context.RelatedSections.Add(new DependencyContext
                            {
                                FilePath = filePath,
                                ResourceName = dep,
                                Content = ConvertYamlNodeToDictionary(depNode),
                                DependencyType = "depends_on"
                            });
                        }

                        foreach (var otherPath in _filePathToMetadata.Keys.Where(p => p != filePath))
                        {
                            var otherQuickScan = _quickScanCache.GetValueOrDefault(otherPath);
                            if (otherQuickScan?.ResourceBoundaries.ContainsKey(dep) == true)
                            {
                                if (!_filePathToMetadata.TryGetValue(otherPath, out var otherMetadata))
                                {
                                    otherMetadata = LoadFullMetadata(otherPath);
                                    if (otherMetadata != null)
                                        _filePathToMetadata[otherPath] = otherMetadata;
                                }

                                if (otherMetadata?.Resources.TryGetValue(dep, out var externalDepNode) == true)
                                {
                                    context.RelatedSections.Add(new DependencyContext
                                    {
                                        FilePath = otherPath,
                                        ResourceName = dep,
                                        Content = ConvertYamlNodeToDictionary(externalDepNode),
                                        DependencyType = "external_depends_on"
                                    });
                                }
                            }
                        }
                    }
                }

                foreach (var kvp in quickScan.Dependencies)
                {
                    if (kvp.Value.Contains(currentSection))
                    {
                        if (metadata.Resources.TryGetValue(kvp.Key, out var dependentNode))
                        {
                            context.RelatedSections.Add(new DependencyContext
                            {
                                FilePath = filePath,
                                ResourceName = kvp.Key,
                                Content = ConvertYamlNodeToDictionary(dependentNode),
                                DependencyType = "dependent"
                            });
                        }
                    }
                }
            }

            return context;
        }

        private TemplateMetadata LoadFullMetadata(string filePath)
        {
            try
            {
                var content = File.ReadAllText(filePath);
                return ExtractMetadata(filePath, content);
            }
            catch (Exception ex)
            {
                // Console.WriteLine($"Error loading metadata for {filePath}: {ex.Message}");  // Commented out to prevent LSP protocol interference
                return null;
            }
        }

        private TemplateMetadata ExtractMetadata(string filePath, string content)
        {
            var metadata = new TemplateMetadata { FilePath = filePath };
            
            var quickScan = _quickScanCache.GetValueOrDefault(filePath);
            if (quickScan != null)
            {
                metadata.BuildoutScenarios = quickScan.BuildoutScenarios;
                metadata.Providers = quickScan.Providers;
                metadata.Imports = quickScan.Imports;
                metadata.Dependencies = quickScan.Dependencies;
            }

            using var reader = new StringReader(content);
            var yaml = new YamlStream();
            yaml.Load(reader);

            if (yaml.Documents.Count == 0)
                return metadata;

            var root = yaml.Documents[0].RootNode as YamlMappingNode;
            if (root == null)
                return metadata;

            if (root.Children.TryGetValue(new YamlScalarNode("resources"), out var resourcesNode)
                && resourcesNode is YamlMappingNode resources)
            {
                metadata.Resources = resources.Children.ToDictionary(
                    kvp => kvp.Key.ToString(),
                    kvp => kvp.Value
                );
            }

            return metadata;
        }

        private Dictionary<string, object> ConvertYamlNodeToDictionary(YamlNode node)
        {
            var result = new Dictionary<string, object>();

            if (node is YamlMappingNode mapping)
            {
                foreach (var kvp in mapping.Children)
                {
                    var key = kvp.Key.ToString();
                    result[key] = ConvertYamlNodeToObject(kvp.Value);
                }
            }

            return result;
        }

        private object ConvertYamlNodeToObject(YamlNode node)
        {
            switch (node)
            {
                case YamlScalarNode scalar:
                    return scalar.Value;
                case YamlSequenceNode sequence:
                    return sequence.Children.Select(ConvertYamlNodeToObject).ToList();
                case YamlMappingNode mapping:
                    return ConvertYamlNodeToDictionary(mapping);
                default:
                    return node.ToString();
            }
        }

        //for building provider context
        public List<ProviderCompletionContext> GetProviderCompletionContexts(
            string providerName, 
            string currentTemplateContent)
        {
            var contexts = new List<ProviderCompletionContext>();
            
            // First, determine the provider type and get the resolved name
            string resolvedProviderName = providerName;
            bool isSnakeCase = !char.IsUpper(providerName[0]) && !providerName.Contains("::") && providerName.Contains("_");
            
            if (isSnakeCase)
            {
                // Convert snake_case to PascalCase for lookup
                resolvedProviderName = NamingHelper.SnakeCaseToPascalCase(providerName);
            }
            
            // Find all templates that use this provider
            var relevantTemplates = new List<(string filePath, QuickScanResult scan)>();
            
            foreach (var (filePath, scan) in _quickScanCache)
            {
                // Check if this template uses the provider
                bool hasProvider = false;
                
                // Check in provider references
                foreach (var (refName, providerRef) in scan.ProviderReferences)
                {
                    if (providerRef.ResolvedName == resolvedProviderName ||
                        refName == providerName ||
                        (providerRef.Type == ProviderType.Library && refName.EndsWith($"::{providerName}")))
                    {
                        hasProvider = true;
                        break;
                    }
                }
                
                if (hasProvider)
                {
                    relevantTemplates.Add((filePath, scan));
                }
            }
            
            // Build context for each relevant template
            foreach (var (templatePath, scan) in relevantTemplates)
            {
                try
                {
                    var templateContent = File.ReadAllText(templatePath);
                    var context = BuildProviderContext(templatePath, templateContent, scan, providerName, resolvedProviderName);
                    if (context != null)
                    {
                        contexts.Add(context);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error building context for {templatePath}: {ex.Message}");
                }
            }
            
            return contexts;
        }

        private ProviderCompletionContext BuildProviderContext(
            string templatePath,
            string templateContent,
            QuickScanResult scan,
            string originalProviderName,
            string resolvedProviderName)
        {
            var context = new ProviderCompletionContext
            {
                TemplatePath = templatePath,
                TemplateType = scan.BuildoutScenarios.Any() ? "phased" : "phaseless"
            };
            
            // Find all resources using this provider
            foreach (var (resourceName, boundary) in scan.ResourceBoundaries)
            {
                var resourceText = FastYamlScanner.GetRawResourceText(templateContent, resourceName);
                if (string.IsNullOrEmpty(resourceText)) continue;
                
                // Check if this resource uses the provider
                var providerMatch = Regex.Match(resourceText, @"provider:\s*([^\r\n]+)");
                if (!providerMatch.Success) continue;
                
                var resourceProvider = providerMatch.Groups[1].Value.Trim();
                
                // Match the provider
                bool isMatch = false;
                ProviderType providerType = ProviderType.Builtin;
                List<string> aliasChain = new List<string>();
                
                if (scan.ProviderReferences.TryGetValue(resourceProvider, out var providerRef))
                {
                    if (providerRef.ResolvedName == resolvedProviderName ||
                        resourceProvider == originalProviderName ||
                        (providerRef.Type == ProviderType.Library && resourceProvider.EndsWith($"::{originalProviderName}")))
                    {
                        isMatch = true;
                        providerType = providerRef.Type;
                        aliasChain = providerRef.AliasChain;
                    }
                }
                
                if (!isMatch) continue;
                
                // Create resource chunk
                var chunk = new ResourceChunk
                {
                    ResourceName = resourceName,
                    RawText = resourceText,
                    ProviderType = providerType,
                    ProviderReference = resourceProvider
                };
                
                // Add dependencies if any
                if (scan.Dependencies.TryGetValue(resourceName, out var deps))
                {
                    chunk.Dependencies = deps;
                    chunk.DependencyChunks = FastYamlScanner.GetRawResourceTexts(templateContent, deps);
                }
                
                // Add alias definitions if needed
                if (aliasChain.Any())
                {
                    foreach (var alias in aliasChain)
                    {
                        var aliasText = FastYamlScanner.GetRawProviderDefinitionText(templateContent, alias);
                        if (!string.IsNullOrEmpty(aliasText))
                        {
                            chunk.AliasDefinitions.Add(new AliasDefinition
                            {
                                AliasName = alias,
                                RawText = aliasText
                            });
                        }
                    }
                } 
                else if (providerType == ProviderType.Custom && resourceProvider == originalProviderName)
                {
                    // For custom providers that match exactly (not library providers), 
                    // check if they have a local definition
                    var aliasText = FastYamlScanner.GetRawProviderDefinitionText(templateContent, resourceProvider);
                    if (!string.IsNullOrEmpty(aliasText))
                    {
                        chunk.AliasDefinitions.Add(new AliasDefinition
                        {
                            AliasName = resourceProvider,
                            RawText = aliasText
                        });
                    }
                }
            
                context.ResourceExamples.Add(chunk);
            }
            
            // Add provider metadata
            if (_dllExplorer?.Contracts?.ContainsKey(resolvedProviderName) == true)
            {
                var metadata = _dllExplorer.Contracts[resolvedProviderName];
                context.ProviderMetadata = new ProviderInfo
                {
                    Name = resolvedProviderName,
                    InputFields = metadata.InputFields,
                    OutputFields = metadata.OutputFields
                };
            }
            
            return context.ResourceExamples.Any() ? context : null;
        }

        // Add method to handle provider completion request from client
        public ProviderCompletionResponse HandleProviderCompletion(ProviderCompletionRequest request)
        {
            var response = new ProviderCompletionResponse
            {
                ProviderName = request.ProviderName,
                //not a library and not a built-in
                IsSnakeCase = !char.IsUpper(request.ProviderName[0]) && !request.ProviderName.Contains("::") && request.ProviderName.Contains("_")
            };
            
            try
            {
                // Get completion contexts
                var contexts = GetProviderCompletionContexts(
                    request.ProviderName,
                    request.CurrentTemplateContent
                );
                
                response.Contexts = contexts;
                //response.Success = true;
                
                // Determine if we need two-part completion (for snake_case aliases)
                if (response.IsSnakeCase)
                {
                    // Check if this is an alias that needs provider definition
                    response.NeedsProviderDefinition = contexts.Any(c => 
                        c.ResourceExamples.Any(r => 
                            r.ProviderType == ProviderType.Alias || 
                            r.ProviderType == ProviderType.Custom));
                    
                    if (response.NeedsProviderDefinition)
                    {
                        // Find the provider definition from examples
                        var exampleWithDef = contexts
                            .SelectMany(c => c.ResourceExamples)
                            .FirstOrDefault(r => r.AliasDefinitions.Any());
                            
                        if (exampleWithDef != null)
                        {
                            response.SuggestedProviderDefinition = GenerateProviderDefinitionSuggestion(
                                request.ProviderName,
                                exampleWithDef.AliasDefinitions.LastOrDefault());
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                //response.Success = false;
                response.ErrorMessage = ex.Message;
            }
            
            return response;
        }

        private string GenerateProviderDefinitionSuggestion(string providerName, AliasDefinition exampleDef)
        {
            if (exampleDef == null)
            {
                // Default external provider template
                return $@"  {providerName}:
            base_provider: External
            properties:
            RPClass: # TODO: Add provider class
            RPAssembly: # TODO: Add assembly";
            }
            
            // Use the example as a template
            return exampleDef.RawText;
        }

        public object GetDebugSummary()
        {
            return new
            {
                templatesIndexed = _quickScanCache.Count,
                scenarios = _scenarioToFilePaths.ToDictionary(k => k.Key, v => v.Value.Count),
                providers = _providerToFilePaths.ToDictionary(k => k.Key, v => v.Value.Count),
                imports = _importToFilePaths.ToDictionary(k => k.Key, v => v.Value.Count),
                templatePaths = _templatePaths.Where(File.Exists).ToList()
            };
        }

        /// <summary>
        /// Debug method to print resource examples for a specific provider
        /// </summary>
        public void PrintProviderResourceExamples(string providerName)
        {
            Console.Error.WriteLine($"\n=== RESOURCE EXAMPLES FOR PROVIDER: {providerName} ===");
            
            if (!_providerToFilePaths.TryGetValue(providerName, out var filePaths))
            {
                Console.Error.WriteLine($"No templates found for provider: {providerName}");
                return;
            }

            foreach (var filePath in filePaths)
            {
                if (!_quickScanCache.TryGetValue(filePath, out var quickScan))
                {
                    Console.Error.WriteLine($"No quick scan data for: {filePath}");
                    continue;
                }

                Console.Error.WriteLine($"\n--- TEMPLATE: {Path.GetFileName(filePath)} ---");
                
                // Read the template content to get raw resource text
                string templateContent;
                try
                {
                    templateContent = File.ReadAllText(filePath);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Error reading template: {ex.Message}");
                    continue;
                }

                // Find resources that use this provider
                var matchingResources = new List<(string resourceName, string resourceText, string providerRef)>();
                
                foreach (var (resourceName, boundary) in quickScan.ResourceBoundaries)
                {
                    var resourceText = FastYamlScanner.GetRawResourceText(templateContent, resourceName);
                    if (string.IsNullOrEmpty(resourceText)) continue;
                    
                    // Check if this resource uses the provider
                    var providerMatch = Regex.Match(resourceText, @"provider:\s*([^\r\n]+)");
                    if (!providerMatch.Success) continue;
                    
                    var resourceProvider = providerMatch.Groups[1].Value.Trim();
                    
                    // Check if this matches our target provider
                    bool isMatch = false;
                    if (quickScan.ProviderReferences.TryGetValue(resourceProvider, out var providerRef))
                    {
                        if (providerRef.ResolvedName?.Equals(providerName, StringComparison.OrdinalIgnoreCase) == true ||
                            resourceProvider.Equals(providerName, StringComparison.OrdinalIgnoreCase) ||
                            (providerRef.Type == ProviderType.Library && resourceProvider.EndsWith($"::{providerName}")))
                        {
                            isMatch = true;
                        }
                    }
                    else if (resourceProvider.Equals(providerName, StringComparison.OrdinalIgnoreCase))
                    {
                        isMatch = true;
                    }
                    
                    if (isMatch)
                    {
                        matchingResources.Add((resourceName, resourceText, resourceProvider));
                    }
                }

                if (!matchingResources.Any())
                {
                    Console.Error.WriteLine($"No resources found for provider {providerName} in this file");
                    continue;
                }

                foreach (var (resourceName, resourceText, providerRef) in matchingResources)
                {
                    Console.Error.WriteLine($"\n  RESOURCE: {resourceName}");
                    Console.Error.WriteLine($"  PROVIDER: {providerRef}");
                    Console.Error.WriteLine($"  CONTENT LENGTH: {resourceText?.Length ?? 0} characters");
                    Console.Error.WriteLine($"  CONTENT:");
                    Console.Error.WriteLine("  " + new string('-', 60));
                    
                    if (!string.IsNullOrEmpty(resourceText))
                    {
                        // Print each line with indentation for clarity
                        var lines = resourceText.Split('\n');
                        foreach (var line in lines)
                        {
                            Console.Error.WriteLine($"  {line}");
                        }
                    }
                    else
                    {
                        Console.Error.WriteLine("  [NO CONTENT]");
                    }
                    
                    Console.Error.WriteLine("  " + new string('-', 60));
                }
            }
            
            Console.Error.WriteLine($"\n=== END EXAMPLES FOR {providerName} ===\n");
        }

        /// <summary>
        /// Debug method to print complete dependency and alias chain context for a provider
        /// </summary>
        public void PrintProviderCompletionContext(string providerName, string testTemplateContent = null)
        {
            Console.Error.WriteLine($"\n=== PROVIDER COMPLETION CONTEXT FOR: {providerName} ===");

            // test request
            var request = new ProviderCompletionRequest
            {
                ProviderName = providerName,
                CurrentTemplateContent = testTemplateContent ?? string.Empty,
                CursorLine = 0,
                CursorColumn = 0
            };

            Console.Error.WriteLine($"TEST REQUEST:");
            Console.Error.WriteLine($"  Provider: {request.ProviderName}");
            Console.Error.WriteLine($"  Template Content Length: {request.CurrentTemplateContent.Length} chars");

            try
            {
                var response = HandleProviderCompletion(request);
                
                Console.Error.WriteLine($"\n=== RESPONSE SUMMARY ===");
                Console.Error.WriteLine($"Provider Name: {response.ProviderName}");
                Console.Error.WriteLine($"Error Message: {response.ErrorMessage ?? "[None]"}");
                Console.Error.WriteLine($"Suggested Provider Definition Length: {response.SuggestedProviderDefinition?.Length ?? 0} chars");
                                Console.Error.WriteLine($"Number of Contexts: {response.Contexts?.Count ?? 0}");

                if (!string.IsNullOrEmpty(response.ErrorMessage))
                {
                    Console.Error.WriteLine($"\n=== ERROR DETAILS ===");
                    Console.Error.WriteLine(response.ErrorMessage);
                    return;
                }

                // Print suggested provider definition
                if (!string.IsNullOrEmpty(response.SuggestedProviderDefinition))
                {
                    Console.Error.WriteLine($"\n=== SUGGESTED PROVIDER DEFINITION ===");
                    Console.Error.WriteLine("  " + new string('-', 60));
                    var lines = response.SuggestedProviderDefinition.Split('\n');
                    foreach (var line in lines)
                    {
                        Console.Error.WriteLine($"  {line}");
                    }
                    Console.Error.WriteLine("  " + new string('-', 60));
                }

                // Print contexts with full resource examples
                if (response.Contexts?.Any() == true)
                {
                    Console.Error.WriteLine($"\n=== CONTEXTS WITH RESOURCE EXAMPLES ===");
                    
                    for (int contextIndex = 0; contextIndex < response.Contexts.Count; contextIndex++)
                    {
                        var context = response.Contexts[contextIndex];
                        Console.Error.WriteLine($"\n--- CONTEXT {contextIndex + 1}: {Path.GetFileName(context.TemplatePath)} ---");
                        Console.Error.WriteLine($"Template Type: {context.TemplateType}");
                        Console.Error.WriteLine($"Resource Examples Count: {context.ResourceExamples?.Count ?? 0}");
                        
                        if (context.ResourceExamples?.Any() == true)
                        {
                            for (int i = 0; i < context.ResourceExamples.Count; i++)
                            {
                                var example = context.ResourceExamples[i];
                                Console.Error.WriteLine($"\n    --- RESOURCE {i + 1}: {example.ResourceName} ---");
                                Console.Error.WriteLine($"    Provider Type: {example.ProviderType}");
                                Console.Error.WriteLine($"    Provider Reference: {example.ProviderReference}");
                                Console.Error.WriteLine($"    Dependencies Count: {example.Dependencies?.Count ?? 0}");
                                Console.Error.WriteLine($"    Alias Definitions Count: {example.AliasDefinitions?.Count ?? 0}");
                                
                                // Show main resource content
                                Console.Error.WriteLine($"\n    MAIN RESOURCE CONTENT:");
                                Console.Error.WriteLine("    " + new string('=', 50));
                                if (!string.IsNullOrEmpty(example.RawText))
                                {
                                    var lines = example.RawText.Split('\n');
                                    foreach (var line in lines)
                                    {
                                        Console.Error.WriteLine($"    {line}");
                                    }
                                }
                                else
                                {
                                    Console.Error.WriteLine("    [NO CONTENT]");
                                }
                                Console.Error.WriteLine("    " + new string('=', 50));

                                // Show dependencies
                                if (example.Dependencies?.Any() == true)
                                {
                                    Console.Error.WriteLine($"\n    DEPENDENCIES:");
                                    foreach (var dep in example.Dependencies)
                                    {
                                        Console.Error.WriteLine($"      - {dep}");
                                    }

                                    if (example.DependencyChunks?.Any() == true)
                                    {
                                        Console.Error.WriteLine($"\n    DEPENDENCY CONTENT:");
                                        for (int depIndex = 0; depIndex < example.DependencyChunks.Count; depIndex++)
                                        {
                                            var depChunk = example.DependencyChunks[depIndex];
                                            Console.Error.WriteLine($"      >>> DEPENDENCY {depIndex + 1} <<<");
                                            Console.Error.WriteLine("      " + new string('-', 40));
                                            if (!string.IsNullOrEmpty(depChunk))
                                            {
                                                var depLines = depChunk.Split('\n');
                                                foreach (var line in depLines)
                                                {
                                                    Console.Error.WriteLine($"        {line}");
                                                }
                                            }
                                            else
                                            {
                                                Console.Error.WriteLine("        [NO CONTENT]");
                                            }
                                            Console.Error.WriteLine("      " + new string('-', 40));
                                        }
                                    }
                                }

                                // Show alias definitions
                                if (example.AliasDefinitions?.Any() == true)
                                {
                                    Console.Error.WriteLine($"\n    ALIAS DEFINITIONS:");
                                    foreach (var alias in example.AliasDefinitions)
                                    {
                                        Console.Error.WriteLine($"      >>> ALIAS: {alias.AliasName} <<<");
                                        Console.Error.WriteLine("      " + new string('-', 40));
                                        if (!string.IsNullOrEmpty(alias.RawText))
                                        {
                                            var aliasLines = alias.RawText.Split('\n');
                                            foreach (var line in aliasLines)
                                            {
                                                Console.Error.WriteLine($"        {line}");
                                            }
                                        }
                                        else
                                        {
                                            Console.Error.WriteLine("        [NO CONTENT]");
                                        }
                                        Console.Error.WriteLine("      " + new string('-', 40));
                                    }
                                }
                            }
                        }
                        else
                        {
                            Console.Error.WriteLine($"    [NO RESOURCE EXAMPLES IN THIS CONTEXT]");
                        }
                    }
                }
                else
                {
                    Console.Error.WriteLine($"\n=== NO CONTEXTS FOUND ===");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"\n=== EXCEPTION DURING CONTEXT BUILDING ===");
                Console.Error.WriteLine($"Error: {ex.Message}");
                Console.Error.WriteLine($"Stack Trace: {ex.StackTrace}");
            }

            Console.Error.WriteLine($"\n=== END COMPLETION CONTEXT FOR {providerName} ===\n");
        }

    }
}