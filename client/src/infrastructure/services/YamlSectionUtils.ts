import * as vscode from 'vscode';
import { SectionType } from '../../domain/index';

/**
 * Get the current YAML section at a given position
 * Shared utility used by both InlineCompletionService and NameCompletionProvider
 */
export function getCurrentYamlSection(document: vscode.TextDocument, position: vscode.Position): SectionType | null {
  for (let lineNumber = position.line; lineNumber >= 0; lineNumber--) {
    const line = document.lineAt(lineNumber).text;
    const trimmedLine = line.trim();

    // Stop scanning if we hit header; no section defined yet
    const topLevelHeaderKeys = ['name', 'service_tree', 'owner'];
    if (topLevelHeaderKeys.some(key => trimmedLine.startsWith(`${key}:`))) {
      break;
    }

    // Match section header with any amount of leading whitespace (spaces or tabs)
    const sectionMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      if (Object.values(SectionType).includes(section as SectionType)) {
        return section as SectionType;
      }
    }
  }
  return null; // No section found
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(input: string): string {
  return input
    .replace(/([A-Z])/g, '_$1')   
    .replace(/^_/, '')            
    .toLowerCase();
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(?:^|_)(\w)/g, (_, letter) => letter.toUpperCase());
}
