// ...existing code...
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using BuildoutLensBackend.Domain;

namespace BuildoutLensBackend.Infrastructure
{
    public class FastYamlScanner
    {
        // Core patterns based on actual template structure
        private static readonly Regex BuildoutPhasesRegex = new Regex(
            @"^buildout_phases:\s*\n((?:\s+\w+\.\w+:.*\n(?:\s{2,}.*\n)*)*)",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex ScenarioPhaseRegex = new Regex(
            @"^\s+(\w+)\.(\w+):",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex ResourcesRegex = new Regex(
            @"^resources:\s*\n((?:\s+.+\n)*)",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex ProviderRefRegex = new Regex(
            @"^\s+provider:\s*(.+?)$",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex ImportsRegex = new Regex(
            @"^imports:\s*\n((?:\s+-\s*.+\n?)*)",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex DependsOnRegex = new Regex(
            @"^\s+depends_on:\s*\n((?:\s+-\s*.+\n?)*)",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex ProvidersRegex = new Regex(
            @"^providers:\s*\n((?:\s+\w+:.*\n(?:\s{2,}.*\n)*)*)",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex ProviderDefRegex = new Regex(
            @"^\s+(\w+):\s*\n((?:\s{2,}.*\n)*)",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex BaseProviderRegex = new Regex(
            @"^\s+base_provider:\s*(.+)$",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex RPClassRegex = new Regex(
            @"^\s+RPClass:\s*(.+)$",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        private static readonly Regex RPAssemblyRegex = new Regex(
            @"^\s+RPAssembly:\s*(.+)$",
            RegexOptions.Multiline | RegexOptions.Compiled
        );

        public static QuickScanResult QuickScan(string content)
        {
            var result = new QuickScanResult();

            // Extract buildout scenarios from phases (newaz.deployment -> "newaz")
            var phasesMatch = BuildoutPhasesRegex.Match(content);
            if (phasesMatch.Success)
            {
                var phasesBlock = phasesMatch.Groups[1].Value;
                var scenarioPhaseMatches = ScenarioPhaseRegex.Matches(phasesBlock);

                result.BuildoutScenarios = scenarioPhaseMatches
                    .Select(m => m.Groups[1].Value) // Extract scenario part (before the dot)
                    .Distinct()
                    .ToList();
            }

            // Extract imports
            var importsMatch = ImportsRegex.Match(content);
            if (importsMatch.Success)
            {
                result.Imports = Regex.Matches(importsMatch.Groups[1].Value, @"-\s*(.+)")
                    .Select(m => m.Groups[1].Value.Trim())
                    .ToList();
            }

            // Extract provider definitions from providers section (if any)
            ExtractProviderDefinitions(content, result);

            // Extract resources, their provider references, and dependencies
            ExtractResourcesAndProviders(content, result);

            // Resolve provider chains and create final provider list
            ResolveProviderChains(result);

            return result;
        }

        private static void ExtractProviderDefinitions(string content, QuickScanResult result)
        {
            var providersMatch = ProvidersRegex.Match(content);
            if (!providersMatch.Success) return;

            var providersBlock = providersMatch.Groups[1].Value;
            var providerMatches = ProviderDefRegex.Matches(providersBlock);

            foreach (Match providerMatch in providerMatches)
            {
                var providerName = providerMatch.Groups[1].Value;
                var providerContent = providerMatch.Groups[2].Value;

                var providerDef = new ProviderDefinition
                {
                    Name = providerName
                };

                // Extract base_provider
                var baseProviderMatch = BaseProviderRegex.Match(providerContent);
                if (baseProviderMatch.Success)
                {
                    providerDef.BaseProvider = baseProviderMatch.Groups[1].Value.Trim();
                }

                // Extract RPClass
                var rpClassMatch = RPClassRegex.Match(providerContent);
                if (rpClassMatch.Success)
                {
                    providerDef.RPClass = rpClassMatch.Groups[1].Value.Trim();
                }

                // Extract RPAssembly
                var rpAssemblyMatch = RPAssemblyRegex.Match(providerContent);
                if (rpAssemblyMatch.Success)
                {
                    providerDef.RPAssembly = rpAssemblyMatch.Groups[1].Value.Trim();
                }

                result.ProviderDefinitions[providerName] = providerDef;
            }
        }

        // Improved indentation-aware resource extractor
        private static void ExtractResourcesAndProviders(string content, QuickScanResult result)
        {
            var blocks = ParseResourceBlocks(content).ToList();
            if (!blocks.Any()) return;

            foreach (var b in blocks)
            {
                var resourceName = b.ResourceName;
                var resourceContent = b.RawText;

                // Store resource boundary (use absolute indices)
                result.ResourceBoundaries[resourceName] = new ResourceBoundary
                {
                    StartIndex = b.StartIndex,
                    EndIndex = b.EndIndex,
                    Content = resourceContent
                };

                // Extract provider reference from this resource
                var providerMatch = ProviderRefRegex.Match(resourceContent);
                if (providerMatch.Success)
                {
                    var providerRef = providerMatch.Groups[1].Value.Trim();

                    if (!result.ProviderReferences.ContainsKey(providerRef))
                    {
                        var providerReference = new ProviderReference
                        {
                            Name = providerRef
                        };

                        // Determine provider type and resolved name
                        if (providerRef.Contains("::"))
                        {
                            // Library provider (e.g., "RegionalStdLib::buildout_capacity_provider")
                            var (library, providerName) = NamingHelper.ParseLibraryProvider(providerRef);
                            providerReference.Type = ProviderType.Library;
                            providerReference.Library = library;
                            providerReference.ResolvedName = NamingHelper.SnakeCaseToPascalCase(providerName);
                        }
                        else if (char.IsUpper(providerRef[0]))
                        {
                            // Builtin provider (already in PascalCase)
                            providerReference.Type = ProviderType.Builtin;
                            providerReference.ResolvedName = providerRef;
                        }
                        else
                        {
                            // Custom or alias provider (snake_case)
                            if (result.ProviderDefinitions.ContainsKey(providerRef))
                            {
                                var def = result.ProviderDefinitions[providerRef];
                                if (def.BaseProvider == "External")
                                {
                                    providerReference.Type = ProviderType.Custom;
                                    providerReference.ResolvedName = NamingHelper.ExtractProviderNameFromRPClass(def.RPClass);
                                }
                                else
                                {
                                    providerReference.Type = ProviderType.Alias;
                                    // Will be resolved in ResolveProviderChains
                                }
                            }
                            else
                            {
                                // Assume it's a simple snake_case to PascalCase conversion
                                providerReference.Type = ProviderType.Custom;
                                providerReference.ResolvedName = NamingHelper.SnakeCaseToPascalCase(providerRef);
                            }
                        }

                        result.ProviderReferences[providerRef] = providerReference;
                    }
                }

                // Extract dependencies for this resource
                var depsMatch = DependsOnRegex.Match(resourceContent);
                if (depsMatch.Success)
                {
                    var deps = Regex.Matches(depsMatch.Groups[1].Value, @"-\s*(\w+)")
                        .Select(m => m.Groups[1].Value.Trim())
                        .ToList();
                    if (deps.Any())
                    {
                        result.Dependencies[resourceName] = deps;
                    }
                }
            }
        }

        private static void ResolveProviderChains(QuickScanResult result)
        {
            foreach (var kvp in result.ProviderReferences.Where(p => p.Value.Type == ProviderType.Alias))
            {
                var providerRef = kvp.Value;
                var chain = new List<string>();
                var currentProvider = providerRef.Name;

                // Follow the chain of aliases
                while (result.ProviderDefinitions.ContainsKey(currentProvider))
                {
                    var def = result.ProviderDefinitions[currentProvider];
                    chain.Add(currentProvider);

                    if (def.BaseProvider == "External")
                    {
                        // Reached the end - external provider
                        providerRef.Type = ProviderType.Custom;
                        providerRef.ResolvedName = NamingHelper.ExtractProviderNameFromRPClass(def.RPClass);
                        break;
                    }
                    else if (def.BaseProvider.Contains("::"))
                    {
                        // Reached a library provider
                        var (library, providerName) = NamingHelper.ParseLibraryProvider(def.BaseProvider);
                        providerRef.Type = ProviderType.Library;
                        providerRef.Library = library;
                        providerRef.ResolvedName = NamingHelper.SnakeCaseToPascalCase(providerName);
                        break;
                    }
                    else if (char.IsUpper(def.BaseProvider[0]))
                    {
                        // Reached a builtin provider
                        providerRef.Type = ProviderType.Builtin;
                        providerRef.ResolvedName = def.BaseProvider;
                        break;
                    }
                    else
                    {
                        // Continue following the chain
                        currentProvider = def.BaseProvider;
                        if (chain.Contains(currentProvider))
                        {
                            // Circular reference - break the loop
                            break;
                        }
                    }
                }

                providerRef.AliasChain = chain;
            }

            // Create simple provider list for backward compatibility
            // For library providers, use the actual provider name after ::, not the library name
            result.Providers = result.ProviderReferences.Values
                .Select(p =>
                {
                    if (p.Type == ProviderType.Library && !string.IsNullOrEmpty(p.ResolvedName))
                    {
                        // Use the resolved provider name (e.g., "BuildoutCapacityProvider" not "RegionalStdLib")
                        return p.ResolvedName;
                    }
                    return p.ResolvedName;
                })
                .Where(name => !string.IsNullOrEmpty(name))
                .Distinct()
                .ToList();
        }

        public static string GetCurrentSection(string content, int lineNumber)
        {
            var lines = content.Split('\n');
            var currentLine = 0;
            string currentSection = null;
            int currentIndent = -1;

            foreach (var line in lines)
            {
                if (currentLine >= lineNumber)
                    break;

                var trimmed = line.TrimStart();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#"))
                {
                    currentLine++;
                    continue;
                }

                var indent = line.Length - trimmed.Length;

                // Check if this is a section header (ends with :)
                if (trimmed.EndsWith(":") && !trimmed.StartsWith("-"))
                {
                    var sectionName = trimmed.TrimEnd(':');

                    // If it's at a lower or equal indentation level, it's a new section
                    if (currentIndent == -1 || indent <= currentIndent)
                    {
                        currentSection = sectionName;
                        currentIndent = indent;
                    }
                }

                currentLine++;
            }

            return currentSection;
        }

        /// <summary>
        /// Parse resources blocks using indentation-aware rules.
        /// Returns resource name, absolute start/end indices (in original content), and raw text.
        /// </summary>
        private static IEnumerable<(string ResourceName, int StartIndex, int EndIndex, string RawText)> ParseResourceBlocks(string content)
        {
            if (string.IsNullOrEmpty(content))
                yield break;

            var resourcesMatches = ResourcesRegex.Matches(content);
            if (resourcesMatches.Count == 0)
                yield break;

            foreach (Match resourcesMatch in resourcesMatches)
            {
                var resourcesBlock = resourcesMatch.Groups[1].Value;
                var baseIndex = resourcesMatch.Groups[1].Index; // start index of resourcesBlock in original content

                // Split lines (preserve line text, we will compute positions)
                var lines = Regex.Split(resourcesBlock, "\r\n|\n");
                var linePositions = new List<int>();
                int searchPos = 0;
                for (int i = 0; i < lines.Length; i++)
                {
                    var ln = lines[i];
                    var pos = resourcesBlock.IndexOf(ln, searchPos, StringComparison.Ordinal);
                    if (pos < 0) pos = searchPos;
                    linePositions.Add(pos);
                    searchPos = pos + ln.Length;
                }

                int iLine = 0;
                while (iLine < lines.Length)
                {
                    var line = lines[iLine];
                    var trimmed = line.Trim();
                    // Skip blanks/comments
                    if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#"))
                    {
                        iLine++;
                        continue;
                    }

                    int indent = GetIndent(line);

                    // Candidate resource header:
                    // - line ends with ':' and has indent >= 2 (typical resource key)
                    if (trimmed.EndsWith(":") && indent >= 2)
                    {
                        // Extract a simple resource name from header:
                        // remove leading "-" if present and trailing ":".
                        var nameCandidate = trimmed.TrimStart('-').Trim();
                        if (nameCandidate.EndsWith(":")) nameCandidate = nameCandidate.Substring(0, nameCandidate.Length - 1);
                        var resourceName = nameCandidate.Trim();

                        int headerIndent = indent;
                        int propertiesIndent = -1;
                        bool lastWasDependsOn = false;

                        int k = iLine + 1;
                        for (; k < lines.Length; k++)
                        {
                            var curLine = lines[k];
                            var curTrim = curLine.Trim();
                            int curIndent = GetIndent(curLine);

                            // Skip blank/comment lines
                            if (string.IsNullOrWhiteSpace(curTrim) || curTrim.StartsWith("#"))
                            {
                                continue;
                            }

                            // depends_on handling
                            if (curTrim.StartsWith("depends_on:", StringComparison.OrdinalIgnoreCase))
                            {
                                lastWasDependsOn = true;
                                continue;
                            }

                            if (lastWasDependsOn)
                            {
                                if (curTrim.StartsWith("-"))
                                {
                                    // list item continuation of depends_on
                                    continue;
                                }
                                else
                                {
                                    lastWasDependsOn = false;
                                }
                            }

                            // properties block handling
                            if (curTrim.StartsWith("properties:", StringComparison.OrdinalIgnoreCase))
                            {
                                propertiesIndent = curIndent;
                                continue;
                            }

                            if (propertiesIndent >= 0)
                            {
                                if (curIndent > propertiesIndent)
                                {
                                    // still inside properties block
                                    continue;
                                }
                                else
                                {
                                    // left properties block
                                    propertiesIndent = -1;
                                    // fallthrough to evaluate end conditions
                                }
                            }

                            // If we encounter a non-blank line with indent <= headerIndent,
                            // it's likely the start of another resource or a sibling key -> stop.
                            if (!string.IsNullOrWhiteSpace(curTrim) && curIndent <= headerIndent)
                            {
                                break;
                            }

                            // otherwise continue scanning lines of this resource
                        }

                        int startPos = linePositions[iLine];
                        int endPos = (k < linePositions.Count) ? linePositions[k] : resourcesBlock.Length;
                        int absStart = baseIndex + startPos;
                        int absEnd = baseIndex + endPos;

                        var raw = resourcesBlock.Substring(startPos, endPos - startPos);
                        yield return (resourceName, absStart, absEnd, raw.TrimEnd());

                        // continue scanning after this resource block
                        iLine = k;
                    }
                    else
                    {
                        iLine++;
                    }
                }
            }
        }

        private static int GetIndent(string line)
        {
            if (string.IsNullOrEmpty(line)) return 0;
            int count = 0;
            foreach (var ch in line)
            {
                if (ch == ' ') count++;
                else if (ch == '\t') count += 4; // treat tab as 4 spaces
                else break;
            }
            return count;
        }

        /// <summary>
        /// Extract raw text chunk for a specific resource, preserving formatting
        /// </summary>
        public static string GetRawResourceText(string content, string resourceName)
        {
            if (string.IsNullOrEmpty(content) || string.IsNullOrEmpty(resourceName)) return string.Empty;

            foreach (var b in ParseResourceBlocks(content))
            {
                if (string.Equals(b.ResourceName, resourceName, StringComparison.OrdinalIgnoreCase))
                    return b.RawText;
            }

            // fallback: look for resource names that contain resourceName (looser)
            foreach (var b in ParseResourceBlocks(content))
            {
                if (b.ResourceName.IndexOf(resourceName, StringComparison.OrdinalIgnoreCase) >= 0)
                    return b.RawText;
            }

            return string.Empty;
        }

        /// <summary>
        /// Extract raw text for multiple resources (e.g., dependencies)
        /// </summary>
        public static List<string> GetRawResourceTexts(string content, List<string> resourceNames)
        {
            var results = new List<string>();
            if (resourceNames == null || resourceNames.Count == 0) return results;

            foreach (var resourceName in resourceNames)
            {
                var rawText = GetRawResourceText(content, resourceName);
                if (!string.IsNullOrEmpty(rawText))
                {
                    results.Add(rawText);
                }
            }
            return results;
        }

        /// <summary>
        /// Extract raw text for provider alias definitions
        /// </summary>
        public static string GetRawProviderDefinitionText(string content, string providerName)
        {
            if (string.IsNullOrEmpty(content) || string.IsNullOrEmpty(providerName)) return string.Empty;

            var providersMatch = ProvidersRegex.Match(content);
            if (!providersMatch.Success) return string.Empty;

            var providersBlock = providersMatch.Groups[1].Value;

            var lines = Regex.Split(providersBlock, "\r\n|\n");
            var search = providerName + ":";
            
            for (int i = 0; i < lines.Length; i++)
            {
                var ln = lines[i];
                if (ln.TrimStart().StartsWith(search, StringComparison.OrdinalIgnoreCase))
                {
                    // Found the provider header, now find the end of this provider block
                    int headerIndent = GetIndent(ln);
                    var providerLines = new List<string> { ln };
                    
                    // Scan forward to find end of this provider block (indent-based)
                    int k = i + 1;
                    for (; k < lines.Length; k++)
                    {
                        var cur = lines[k];
                        var curTrim = cur.Trim();
                        
                        // Skip empty lines and comments
                        if (string.IsNullOrWhiteSpace(curTrim) || curTrim.StartsWith("#"))
                        {
                            providerLines.Add(cur);
                            continue;
                        }
                        
                        int curIndent = GetIndent(cur);
                        
                        // If we hit a line at the same or less indentation as the header, we're done
                        if (curIndent <= headerIndent)
                            break;
                            
                        // This line is part of the provider definition
                        providerLines.Add(cur);
                    }

                    return string.Join("\n", providerLines).TrimEnd();
                }
            }
            
            return string.Empty;
        }
    }
}