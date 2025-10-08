using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using BuildoutLensBackend.Domain;

namespace BuildoutLensBackend.Infrastructure
{
    public class DllExplorer
    {
    //consider moving entities to domain

        private readonly ConcurrentDictionary<string, ProviderMetadata> _contracts =
            new(StringComparer.Ordinal);

        public IReadOnlyDictionary<string, ProviderMetadata> Contracts => _contracts;

        public void ScanDirectory(string rootPath)
        {
            if (!Directory.Exists(rootPath))
                throw new DirectoryNotFoundException($"Directory not found: {rootPath}");

            // match Microsoft.Azure.Cis.ServiceMap.Providers.<anything>.Contract.dll
            var dllPattern = new Regex(
                @"^Microsoft\.Azure\.Cis\.ServiceMap\.Providers\..+\.Contract\.dll$",
                RegexOptions.IgnoreCase | RegexOptions.Compiled);

            var dllPaths = Directory
                .EnumerateFiles(rootPath, "*.dll", SearchOption.AllDirectories)
                .Where(path => dllPattern.IsMatch(Path.GetFileName(path)))
                .ToList();

            foreach (var path in dllPaths)
            {
                //Console.WriteLine(path);
            }

            Parallel.ForEach(dllPaths, dllPath =>
            {
                try
                {
                    ProcessDll(dllPath);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to process {dllPath}: {ex.Message}"); 
                }
            });
        }


        private void ProcessDll(string dllPath)
        {
            var assembly = Assembly.LoadFrom(dllPath);

            //regex to match provider names even when they have a version number like BaseNameV2Input; not hardcoded incase there's more versions in future
        
            var pattern = new Regex(@"^(?<base>.+?)(?:V[0-9]+)?(?:(?<suffix>Input|Output))?$", RegexOptions.Compiled);
            foreach (var type in assembly.GetTypes())
            {
                //classes suffixed Input/Output
                //class check to get properties/memeber vars of input and output types
                if (type.IsClass && type.IsPublic && !type.IsAbstract)
                {
                    var match = pattern.Match(type.Name);
                    if (match.Success)
                    {
                        var suffix = match.Groups["suffix"].Value;   // "Input" or "Output"
                        var baseName = match.Groups["base"].Value;   // e.g. "ReadSettingProvider"

                        bool isInput = suffix.Equals("Input", StringComparison.Ordinal);
                        AddOrUpdateContract(baseName, isInput, type);
                    }
                }

                //interfaces implementing IServiceMapResourceProvider<TInput, TOutput>
                //interface check to get input and output types
                if (type.IsInterface && type.IsPublic)
                {
                    //C# decompile -> read the whole class and output as a string; read the string until we get IServiceMapResourceProvider<,>
                    var inheritedInterface = FindIServiceMapResourceProviderInheritence(type);
                    //var inheritedInterface = type.BaseType;
                    if (inheritedInterface != null)
                    {
                        var args = inheritedInterface.GetGenericArguments();
                        //Console.WriteLine($"Interface: {type.Name} with {args.Length}");
                        var inputType = args[0];
                        //Console.WriteLine(inputType);
                        var outputType = args[1];
                        //Console.WriteLine(outputType);

                        var name = type.Name;
                        if (name.StartsWith("I"))
                            name = name.Substring(1);
                        var match = pattern.Match(name);
                        //Console.WriteLine($"Match: {match.Success}, Name: {name}");
                        var baseName = match.Groups["base"].Value; // e.g. "ReadSettingProvider"

                        //Console.WriteLine($"Base Name: {baseName}, Input: {inputType}, Output: {outputType}");

                        AddOrUpdateContract(baseName, true, inputType);
                        AddOrUpdateContract(baseName, false, outputType);
                    }
                }
            }
        }

        //iteratively find inherited provider with generic type; IServiceMapResourceProvider<input, output>
        private static Type? FindIServiceMapResourceProviderInheritence(Type type)
        {
            while (type != null)
            {
                foreach (var iface in type.GetInterfaces())
                {
                    //Console.WriteLine("Interface: " + iface.Name + " Interface Get GenericTypeDef: " + iface.GetGenericTypeDefinition() + " " + iface.IsGenericType);
                    //Console.WriteLine($"Interface inheritence on {type.Name}: {iface.GetGenericTypeDefinition()}");
                    if (iface.IsGenericType && iface.GetGenericTypeDefinition().Name == "IServiceMapResourceProvider`2")
                    {
                        //Console.WriteLine($"Found IServiceMapResourceProvider in {type.Name}, GenericTypeDef: {iface.GetGenericTypeDefinition()}, argCount = {iface.GetGenericArguments().Length}");
                        return iface;
                    }
                }
                type = type.BaseType; //typeof(B).BaseType  --> returns the Type object for A
            }
            return null;
        }

        /// <summary>
        /// Add or update contract entry based on suffixed type
        /// </summary>
        private void AddOrUpdateContract(string baseName, bool isInput, Type type)
        {
            if (!_contracts.TryGetValue(baseName, out var metadata))
            {
                metadata = new ProviderMetadata
                {
                    ProviderName = baseName
                };
                _contracts[baseName] = metadata;
            }

            var targetList = isInput ? metadata.InputFields : metadata.OutputFields;

            if (isInput)
                metadata.InputTypeName = type.Name;
            else
                metadata.OutputTypeName = type.Name;

           
            ReflectFields(type, targetList);
        }

        /// <summary>
        /// Reflect public instance fields of a type into the target list
        /// </summary>
        private void ReflectFields(Type type, List<FieldEntry> targetList)
        {
            if (type.IsPrimitive || type == typeof(string))
            {
                targetList.Add(new FieldEntry
                {
                    PropertyName = "Primative Type",
                    ValueType = GetFriendlyTypeName(type),
                    IsOptional = false,
                });
            }
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
            
                
                bool isOptional = field.GetCustomAttributes(inherit: true)
                                        .Any(attr => attr.GetType().Name == "ServiceMapOptionalPropertyAttribute");

                targetList.Add(new FieldEntry
                {
                    PropertyName = field.Name,
                    ValueType = GetFriendlyTypeName(field.FieldType),
                    IsOptional = isOptional
                });
            }
        }

        /// <summary>
        /// Convert a System.Type into a readable string, e.g. IDictionary<string, int>
        /// </summary>
        private static string GetFriendlyTypeName(Type type)
        {
            if (type.IsGenericType)
            {
                var genericDef = type.GetGenericTypeDefinition();
                var name = genericDef.Name;
                int tickIndex = name.IndexOf('`');
                if (tickIndex > 0)
                    name = name.Substring(0, tickIndex);

                var args = type.GetGenericArguments().Select(GetFriendlyTypeName);
                return $"{name}<{string.Join(", ", args)}>";
            }

            if (type.IsArray)
                return GetFriendlyTypeName(type.GetElementType()!) + "[]";

            return type.Name;
        }

    }
}


    