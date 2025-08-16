/**
 * QuickPick UI helpers for GitPilot
 * Provides user-friendly file selection and other QuickPick utilities
 */

// Imports (grouped and ordered)
import * as vscode from 'vscode';

import type { IFileStatus, IQuickPickItem } from '../types';

/**
 * QuickPickHelper class - UI helpers for user selection
 */
export class QuickPickHelper {
    /**
     * Show file selection QuickPick for commit operations
     * @param files - Array of file status objects
     * @returns Promise resolving to selected file paths
     */
    static async selectFiles(files: IFileStatus[]): Promise<string[] | undefined> {
        if (!files || files.length === 0) {
            return undefined;
        }

        const items: IQuickPickItem[] = files.map(file => ({
            label: `$(file) ${file.path}`,
            description: this._getStatusDescription(file),
            detail: this._getStatusDetail(file),
            picked: file.index !== ' ', // Pre-select staged files
            value: file.path,
            data: file
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select files to commit (staged files are pre-selected)',
            matchOnDescription: true,
            matchOnDetail: true,
            ignoreFocusOut: true
        });

        return selected?.map(item => item.value);
    }

    /**
     * Show branch selection QuickPick
     * @param branches - Array of branch names
     * @param currentBranch - Currently active branch
     * @returns Promise resolving to selected branch name
     */
    static async selectBranch(branches: string[], currentBranch: string): Promise<string | undefined> {
        if (!branches || branches.length === 0) {
            return undefined;
        }

        const items: IQuickPickItem[] = branches.map(branch => ({
            label: branch === currentBranch ? `$(check) ${branch}` : `$(git-branch) ${branch}`,
            description: branch === currentBranch ? 'current' : '',
            detail: branch === currentBranch ? 'Currently active branch' : '',
            value: branch
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select branch to checkout',
            matchOnDescription: true,
            ignoreFocusOut: true
        });

        return selected?.value;
    }

    /**
     * Get user-friendly status description for file
     * @param file - File status object
     * @returns Human-readable status description
     */
    private static _getStatusDescription(file: IFileStatus): string {
        if (file.isConflicted) {
            return '$(warning) Conflicted';
        }
        
        if (file.index === 'A') {
            return '$(add) Added';
        }
        
        if (file.index === 'M') {
            return '$(edit) Modified';
        }
        
        if (file.index === 'D') {
            return '$(trash) Deleted';
        }
        
        if (file.index === 'R') {
            return '$(arrow-right) Renamed';
        }
        
        if (file.index === '?') {
            return '$(question) Untracked';
        }
        
        if (file.workingDir === 'M') {
            return '$(circle-filled) Modified';
        }
        
        return '$(circle-outline) Changed';
    }

    /**
     * Get detailed status information for file
     * @param file - File status object
     * @returns Detailed status information
     */
    private static _getStatusDetail(file: IFileStatus): string {
        const details: string[] = [];
        
        if (file.index !== ' ' && file.index !== '?') {
            details.push('staged');
        }
        
        if (file.workingDir !== ' ') {
            details.push('working directory');
        }
        
        if (file.isConflicted) {
            details.push('requires resolution');
        }
        
        return details.length > 0 ? `Changes in: ${details.join(', ')}` : '';
    }
}