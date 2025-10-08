using System;
using System.IO;
using System.Threading.Tasks;
using System.Text.Json;
using BuildoutLensBackend.Domain;
using BuildoutLensBackend.Infrastructure;
using BuildoutLensBackend.Application.Services;

namespace BuildoutLensBackend
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args == null || args.Length == 0)
            {
                // Show help if no arguments provided
                args = new[] { "help" };
            }
            
            await RunCliAsync(args);
        }

        private static async Task RunCliAsync(string[] args)
        {
            // Simple option parsing: first arg is command
            var cmd = args[0].ToLowerInvariant();

            // Setup services manually (no DI container needed for CLI)
            var dllExplorer = new DllExplorer();
            var indexer = new TemplateIndexer(dllExplorer);
            var svc = new ProviderCompletionService(indexer);

            // Helper to write JSON to stdout
            // Replace human-readable prints with this call if model gathers context better from JSON
            void WriteJson(object obj)
            {
                var json = JsonSerializer.Serialize(obj, new JsonSerializerOptions
                {
                    WriteIndented = false
                });
                Console.Out.WriteLine(json);
            }

            // Helper to write debug to stderr
            void Debug(string message) => Console.Error.WriteLine($"[BuildoutLens CLI] {message}");

            switch (cmd)
            {
                case "index-info":
                    Debug("Indexing templates...");
                    await indexer.IndexAllTemplatesAsync();
                    var summary = indexer.GetDebugSummary();
                    WriteJson(summary);
                    break;

                case "provider-completion":
                {
                    // Expected options:
                    // --provider <name> [--file <path>] [--resource <name>] [--line <n>] [--col <n>] [--stdin] [--examples <n>]
                    string provider = null;
                    string file = null;
                    string resource = null;
                    int line = 0;
                    int col = 0;
                    bool useStdin = false;
                    int examples = 5;

                    for (int i = 1; i < args.Length; i++)
                    {
                        switch (args[i])
                        {
                            case "--provider":
                                provider = (i + 1 < args.Length) ? args[++i] : null;
                                break;
                            case "--file":
                                file = (i + 1 < args.Length) ? args[++i] : null;
                                break;
                            case "--resource":
                                resource = (i + 1 < args.Length) ? args[++i] : null;
                                break;
                            case "--line":
                                int.TryParse((i + 1 < args.Length) ? args[++i] : "0", out line);
                                break;
                            case "--col":
                                int.TryParse((i + 1 < args.Length) ? args[++i] : "0", out col);
                                break;
                            case "--stdin":
                                useStdin = true;
                                break;
                            case "--examples":
                                int.TryParse((i + 1 < args.Length) ? args[++i] : "5", out examples);
                                if (examples < 0) examples = 0;
                                break;
                        }
                    }

                    if (string.IsNullOrWhiteSpace(provider))
                    {
                        Console.WriteLine("Missing --provider <name>");
                        return;
                    }

                    string content = string.Empty;
                    if (!string.IsNullOrEmpty(file) && File.Exists(file))
                    {
                        content = await File.ReadAllTextAsync(file);
                    }
                    else if (useStdin)
                    {
                        Debug("Reading template content from STDIN...");
                        content = await Console.In.ReadToEndAsync();
                    }

                    Debug("Indexing templates...");
                    await indexer.IndexAllTemplatesAsync();

                    var req = new ProviderCompletionRequest
                    {
                        ProviderName = provider,
                        CurrentTemplateContent = content ?? string.Empty,
                        CursorLine = line,
                        CursorColumn = col
                    };

                    var resp = await svc.GetProviderCompletionAsync(req);

                    // Replace WriteJson(resp) with human-readable output:
                    if (resp != null && resp.Contexts != null && examples > 0)
                    {
                        var allExamples = resp.Contexts.SelectMany(c => c.ResourceExamples).ToList();
                        var take = Math.Min(examples, allExamples.Count);
                        
                        Console.Out.WriteLine($"Provider completion context for '{provider}'");
                        Console.Out.WriteLine(new string('=', 60));
                        Console.Out.WriteLine($"Available example resources: {allExamples.Count}");
                        Console.Out.WriteLine($"Printing {take} example(s):");
                        Console.Out.WriteLine();

                        for (int x = 0; x < take; x++)
                        {
                            var r = allExamples[x];
                            Console.Out.WriteLine("---");
                            Console.Out.WriteLine($"Example #{x + 1}:");
                            Console.Out.WriteLine($"ResourceName: {r.ResourceName ?? "<unknown>"}");
                            Console.Out.WriteLine($"ProviderType: {r.ProviderType}");
                            Console.Out.WriteLine("Raw:");
                            Console.Out.WriteLine(r.RawText?.TrimEnd() ?? "");
                            Console.Out.WriteLine();
                        }

                        // Print aliases if available
                        var allAliases = resp.Contexts.SelectMany(c => c.ResourceExamples).SelectMany(r => r.AliasDefinitions).ToList();
                        if (allAliases.Any())
                        {
                            Console.Out.WriteLine("Aliases / provider definitions:");
                            foreach (var a in allAliases)
                            {
                                Console.Out.WriteLine($" - {a.AliasName ?? ""} => {a.RawText ?? ""}");
                            }
                        }
                    }
                    else
                    {
                        Console.Out.WriteLine($"No examples found for provider '{provider}'");
                    }
                }
                break;

                case "debug-resources":
                {
                    // Expected option: --provider <name>
                    string provider = null;

                    for (int i = 1; i < args.Length; i++)
                    {
                        switch (args[i])
                        {
                            case "--provider":
                                provider = (i + 1 < args.Length) ? args[++i] : null;
                                break;
                        }
                    }

                    if (string.IsNullOrWhiteSpace(provider))
                    {
                        Console.WriteLine("Missing --provider <name>" );
                        return;
                    }

                    Debug("Indexing templates...");
                    await indexer.IndexAllTemplatesAsync();
                    
                    // prints to stderr; won't interfere with JSON output
                    indexer.PrintProviderResourceExamples(provider);
                    
                }
                break;

                case "debug-context":
                {
                    // Expected options: --provider <name> [--file <path>] [--stdin]
                    string provider = null;
                    string file = null;
                    bool useStdin = false;

                    for (int i = 1; i < args.Length; i++)
                    {
                        switch (args[i])
                        {
                            case "--provider":
                                provider = (i + 1 < args.Length) ? args[++i] : null;
                                break;
                            case "--file":
                                file = (i + 1 < args.Length) ? args[++i] : null;
                                break;
                            case "--stdin":
                                useStdin = true;
                                break;
                        }
                    }

                    if (string.IsNullOrWhiteSpace(provider))
                    {
                        Console.WriteLine("Missing --provider <name>");
                        return;
                    }

                    string content = string.Empty;
                    if (!string.IsNullOrEmpty(file) && File.Exists(file))
                    {
                        content = await File.ReadAllTextAsync(file);
                    }
                    else if (useStdin)
                    {
                        Debug("Reading template content from STDIN...");
                        content = await Console.In.ReadToEndAsync();
                    }

                    Debug("Indexing templates...");
                    await indexer.IndexAllTemplatesAsync();
                    
                    // prints comprehensive context to stderr; won't interfere with JSON output
                    indexer.PrintProviderCompletionContext(provider, content);
                    
                }
                break;

                default:
                    
                    var help = new System.Text.StringBuilder();
                    help.AppendLine("BuildoutLensBackend CLI");
                    help.AppendLine();
                    help.AppendLine("Usage:");
                    help.AppendLine("  BuildoutLensBackend.exe <command> [options]");
                    help.AppendLine();
                    help.AppendLine("Commands:");
                    help.AppendLine("  index-info");
                    help.AppendLine("      Index known templates and output a debug summary as JSON");
                    help.AppendLine();
                    help.AppendLine("  provider-completion --provider <name> [--file <path>] [--resource <name>] [--line <n>] [--col <n>] [--stdin] [--examples <n>]");
                    help.AppendLine("      Build context for a provider and print a human-readable summary and example resources to stdout.");
                    help.AppendLine("      Options:");
                    help.AppendLine("        --provider <name>          (required)");
                    help.AppendLine("        --file <path>              (optional) path to template file");
                    help.AppendLine("        --resource <name>          (optional) current resource name");
                    help.AppendLine("        --line <n> --col <n>       (optional) cursor location");
                    help.AppendLine("        --stdin                    (optional) read template content from STDIN");
                    help.AppendLine("        --examples <n>             (optional) number of examples to print (default 5)");
                    help.AppendLine();
                    help.AppendLine("  debug-resources --provider <name>");
                    help.AppendLine("      Print detailed resource examples for a provider to stderr (keeps stdout for machine output).");
                    help.AppendLine();
                    help.AppendLine("  debug-context --provider <name> [--file <path>] [--stdin]");
                    help.AppendLine("      Print comprehensive provider completion context including dependencies and aliases to stderr.");
                    help.AppendLine("      Options:");
                    help.AppendLine("        --provider <name>          (required)");
                    help.AppendLine("        --file <path>              (optional) path to template file for context");
                    help.AppendLine("        --stdin                    (optional) read template content from STDIN");
                    help.AppendLine();
                    help.AppendLine("Examples:");
                    help.AppendLine("  BuildoutLensBackend.exe provider-completion --provider ManualOperationProvider --file C:\\templates\\warp.yml --examples 3");
                    help.AppendLine("  Get-Content warp.yml -Raw | BuildoutLensBackend.exe provider-completion --provider ManualOperationProvider --stdin --examples 2");
                    help.AppendLine("  BuildoutLensBackend.exe debug-context --provider ManualOperationProvider --file C:\\templates\\warp.yml");
                    help.AppendLine("  Get-Content warp.yml -Raw | BuildoutLensBackend.exe debug-context --provider ManualOperationProvider --stdin");
                    Console.Out.WriteLine(help.ToString());

                    break;
            }       
        }
    }
}