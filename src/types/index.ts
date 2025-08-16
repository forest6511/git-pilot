/**
 * Public type definitions for GitPilot extension
 */

import * as vscode from 'vscode';

// Export Git-specific types
export * from './git.types';

// Common UI types
export interface IQuickPickItem extends vscode.QuickPickItem {
    value: string;
    data?: unknown;
}

export interface IProgressOptions {
    title: string;
    location?: vscode.ProgressLocation;
    cancellable?: boolean;
}

// Command-related types
export interface ICommandContext {
    workspaceRoot: string;
    gitRoot: string;
    isGitRepository: boolean;
}

// Extension state types
export interface IExtensionState {
    isActive: boolean;
    hasGitRepo: boolean;
    currentBranch?: string;
    hasChanges?: boolean;
}

// Error types
export interface IOperationResult<T = void> {
    success: boolean;
    data?: T;
    error?: string;
}