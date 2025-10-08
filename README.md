# BuildoutLens V2

A Visual Studio Code extension with a C# backend that provides intelligent YAML template editing capabilities for Azure service buildout templates. The system indexes service templates, extracts provider-specific examples, and powers AI-driven autocomplete suggestions and inline completions.

## Overview

BuildoutLens V2 is a two-part system designed to make editing complex YAML service templates more efficient and error-free:

- **Client**: TypeScript VS Code extension providing completions, hover information, and AI-powered inline suggestions
- **Backend**: .NET console application that indexes templates, extracts provider contexts, and serves as a CLI for generating completion contexts

The system's core innovation is its ability to extract contextually relevant examples from existing templates and feed them to AI models for accurate, template-aware suggestions.

## Architecture

### High-Level Structure
```
BuildoutLens_Repo/
├── client/                 # VS Code Extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts           # Main entry point
│   │   ├── domain/               # Business entities and types
│   │   ├── application/          # Use cases and service interfaces  
│   │   ├── infrastructure/       # External integrations (AI, file system, backend CLI)
│   │   └── presentation/         # VS Code UI integration (commands, providers)
│   └── package.json
├── server/                 # C# Backend (.NET Console)
│   ├── Program.cs               # CLI entry point and command handling
│   ├── Domain/                  # DTOs and business entities
│   ├── Application/             # Service layer
│   └── Infrastructure/          # Template indexing and YAML parsing
└── README.md
```

## Key Files and Components

### Extension Entry Point
**`client/src/extension.ts`**
- Extension activation and service registration
- Wires together all completion providers, hover providers, and command handlers
- Configures dependency injection container and service lifecycle

### Core Backend Services

**`server/Program.cs`**
- CLI command parser and main entry point for backend operations
- Commands: `provider-completion`, `debug-context`, `debug-resources`, `index-info`
- Handles human-readable output formatting for AI consumption

**`server/Infrastructure/TemplateIndexer.cs`**
- Core template indexing engine
- Builds `ProviderCompletionContext` objects with resource examples and dependencies
- Methods: `GetProviderCompletionContexts()`, `HandleProviderCompletion()`, `PrintProviderCompletionContext()`

**`server/Infrastructure/FastYamlScanner.cs`**
- Indentation-aware YAML parser (replaced earlier regex-based approach)
- Extracts resource boundaries, provider references, and alias definitions
- Methods: `QuickScan()`, `GetRawResourceText()`, `GetRawProviderDefinitionText()`

### AI Integration Flow

**`client/src/infrastructure/services/VsCodeChatService.ts`**
- Wrapper around VS Code's AI/chat APIs
- Handles prompt engineering and response processing
- TODO: Integrates with provider context from backend CLI; as a fallback uses 3 pre-chosen templates as seeding

**`client/src/infrastructure/services/InlineCompletionService.ts`**
- Orchestrates inline completion requests
- Combines template context with AI suggestions
- Handles streaming completions and multi-line suggestions

### Completion and Hover Services

**`client/src/infrastructure/services/NameCompletionService.ts`**
- Provides deterministic completions for:
  - Provider names (snake_case conversion rules)
  - Buildout scenario names and phases
  - Team IDs and service tree IDs
  - OneDCMT configuration lookups

**`client/src/infrastructure/services/ProviderCompletionService.ts`** *[Needs Heavy Changing]*
- Currently based on Language Server Protocol client
- **Target**: Change code to call backend CLI directly as standalone executable
- Will handle provider context requests and feed results to AI services

### Development and Debug Tools During Authroring

**`client/src/infrastructure/services/BuildoutLinterService.ts`**
- Integration with external buildout linter tools
- Provides diagnostic information and error highlighting

### Creating Service Template Stub
**`client/src/applications/services/CreateServiceTemplate.ts`**
- Handles all the conectivity logic to have the user flow while creating the service template stub, Owning team fallback, or onboarding to DCMT

### OneDCMT Operations at Startup

**`client/src/applications/services/FallbackOwningteamService.ts`**
- Handles logic for if user's service team's owning config information cannot be found
- Makes entry into OwningTeamsConfig.json automatically

**`client/src/infrastructure/services/OneDCMTService.ts`**
- Handles logic for finding OneDCMT in user's local environment
- Adding entry to OwningTeamsConfig to onboard to OneDCMT; making file PR-ready if not previously onboarded
- Loading config file for searching and quick pick functionality


## Data Flow Diagrams

### AI Inline Completion Flow
```
User Types → InlineCompletionService → ProviderCompletionService → Backend CLI
                ↓                            ↑                         ↓
         VsCodeChatService ←─────────── Provider Context ←──── TemplateIndexer
                ↓                                                       ↓
         AI Model Request                                        FastYamlScanner
                ↓                                                       ↓
         Generated Suggestions                              Extract Resource Examples
                ↓                                                       ↓
         VS Code Inline Completion                          Index Templates & Providers
```

### Provider Context Building Flow
```
Template Files → FastYamlScanner → Resource Boundaries & Provider References
       ↓               ↓                        ↓
TemplateIndexer → QuickScan Results → ProviderCompletionContext
       ↓               ↓                        ↓
CLI Commands → Resource Examples → Human-Readable Output → AI Prompts
```

### Completion Provider Flow
```
User Input → NameCompletionService → OneDCMT Lookups → Deterministic Completions

VS Code Position → Pattern Matching → Team/Service Data → Completion Items
```

## CLI Usage and Commands

The backend CLI serves as both a development tool and the primary interface for the VS Code extension to gather template context.

### Primary Commands

**provider-completion** - Extract provider examples for AI context
#### From file
```
dotnet run provider-completion --provider Manual --file "path\to\template.yml" --examples 3
```

**debug-context** - Comprehensive provider analysis with dependencies and aliases
TODO: Make it a command "provider-context" to use for actual AI prompting; almost integration-ready.
#### Show full context with all examples indexed
```
dotnet run debug-context --provider read_setting_provider
```

NOTE: Currently --examples flag is only supported with the --provider-compeltion flag.

**debug-resources** - Raw resource extraction for testing with templates and index to verify accuracy
```
dotnet run debug-resources --provider Manual
```

**index-info** - Template indexing summary in JSON
```
dotnet run index-info
```

### Output Formats
- **Human-readable**: Formatted for better understanding during debugging and examples for AI 
- **Structured**: Includes resource examples, dependencies, alias definitions, and provider metadata
- **JSON**: JSON output available incase it serves better for model parsing

## Development Setup

### Prerequisites
- Node.js 18+
- .NET 8.0 SDK
- VS Code 1.74.0+

### Build Instructions

**Client (Launch Extension through VS Code Extension Development Host)**
```bash
cd client
npm install
npm run compile
F5 or Run and Debug (Ctrl + Shift + D)
```
Extension is now usable through this development host; user can create or edit existing files through their local environment as per the demo

**Server (C# Backend)**
```bash
cd server
dotnet build
dotnet run --help  #Test CLI commands
```

**Full Development Setup**
```bash
# From repository root
cd client && npm install && npm run compile
cd ../server && dotnet build

# Launch VS Code Extension Host for testing
# Press F5 in VS Code or use Run and Debug panel
```

### Testing the System
```powershell
# Test backend CLI
cd server
dotnet run debug-context --provider Manual --examples 1

# Test with real template
dotnet run provider-completion --provider WaitForEventProvider --file "Q:\src\OneDCMT\src\CIS\Tenants\warpbuildout\ServiceTemplates\Phased\Warp.yml" --examples 2
```

## On-Going Fixes and Tech Debt

### High Priority Fixes

**ProviderCompletionService Migration** *[In Progress]*
- **Current State**: Based on Language Server Protocol client architecture that failed for POC
- **Target State**: Direct CLI process execution calling backend as standalone executable
- **Files Affected**:
  - `client/src/infrastructure/services/ProviderCompletionService.ts`
  - `client/src/infrastructure/services/InlineCompletionService.ts`
  - Backend CLI integration points

**Provider Completion Triggers with Regex**
- Fix triggers so valid AI suggestions appear only if the user follows linting whitespace rules; currently AI suggestions triggered if space after provider declaration in the resource definition.

**Manual Trigger Keystroke for AI completions**
- Currently, flow mimics github copilot autocompletes with ghost-text, triggered when the user stops typing. For developers to have better control, it will be worth adding a manual keystroke such that they can trigger completions on their own accord.

**Template Path Configuration**
- **Current**: Hardcoded template paths in `TemplateIndexer.cs`
- **Target**: Configurable template discovery with workspace scanning and local OneDCMT

**BuildoutMapCLI Path Resolution**
- **Current**: Hardcoded path based on CLI that is already downloaded on local machine
- **Target**: Package CLI with the extension so executable can always be resolved even if user doesn't already have CLI package installed

**Post AI response Processing**
- **Current**: AI is non-deterministic; can't learn proper tabbing for autocompletions based on template's current state and cannot resolve line numbers for linting with 100% accuracy even though suggestions and autocomplete content is accurate.
- **Target**: Add a function for post processing such that we use stored information on property tabbing, etc to construct a valid autocomplete on tab, and to manually extract the line number from the linter stack trace to ensure consistency.


### Future Enhancements Ideas

**Language Server Protocol**
- Full LSP implementation for broader editor support
- Protocol-compliant diagnostic and completion services

**Document Listener Service**
- EditorService is currently not used but it abstracts editing the user's workspace. Can be used in the furture for a live listening feature that creates an empty resource stub for each resource declared in buildout_phases.
- Using set difference operations to edit, insert or delete these stubs based on if the author changed, added or deleted a resource declaration.
