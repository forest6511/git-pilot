/**
 * Basic Git commands implementation
 * Handles commit and push operations with comprehensive validation and user feedback
 */

// Imports (grouped and ordered)
import * as vscode from 'vscode';

import { GitProvider } from '../providers/gitProvider';
import { QuickPickHelper } from '../ui/quickPick';

import type { ICommitOptions, IFileStatus } from '../types';

// Constants
const MIN_COMMIT_MESSAGE_LENGTH = 3;
const MAX_COMMIT_MESSAGE_LENGTH = 72;

/**
 * BasicCommands class - Core Git operations
 */
export class BasicCommands {
    constructor(private _gitProvider: GitProvider) {}

    /**
     * Execute commit operation with comprehensive validation and user interaction
     * @returns Promise that resolves when commit is complete
     */
    async commit(): Promise<void> {
        try {
            // 1. Validate preconditions
            if (!await this._validateGitRepository()) {
                return;
            }

            // 2. Get current status
            const status = await this._gitProvider.getStatus();
            
            if (status.files.length === 0) {
                vscode.window.showInformationMessage('No changes to commit');
                return;
            }

            // 3. Let user select files to commit
            const selectedFiles = await this._selectFilesToCommit(status.files);
            if (!selectedFiles || selectedFiles.length === 0) {
                return; // User cancelled or no files selected
            }

            // 4. Get commit message from user
            const commitMessage = await this._getCommitMessage();
            if (!commitMessage) {
                return; // User cancelled
            }

            // 5. Execute commit with progress indication
            await this._executeCommitWithProgress({
                message: commitMessage,
                files: selectedFiles
            });

            // 6. Show success message
            vscode.window.showInformationMessage(
                `$(check) Committed: ${commitMessage.substring(0, 50)}${commitMessage.length > 50 ? '...' : ''}`
            );

        } catch (error) {
            this._handleCommandError(error, 'Commit operation failed');
        }
    }

    /**
     * Execute push operation with progress indication
     * @returns Promise that resolves when push is complete
     */
    async push(): Promise<void> {
        try {
            // 1. Validate preconditions
            if (!await this._validateGitRepository()) {
                return;
            }

            // 2. Check if there are commits to push
            const currentBranch = await this._gitProvider.getCurrentBranch();
            if (!currentBranch) {
                vscode.window.showErrorMessage('Unable to determine current branch');
                return;
            }

            // 3. Confirm push operation
            const shouldPush = await this._confirmPushOperation(currentBranch);
            if (!shouldPush) {
                return;
            }

            // 4. Execute push with progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Pushing to origin/${currentBranch}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                await this._gitProvider.push();
                
                progress.report({ increment: 100 });
            });

            // 5. Show success message
            vscode.window.showInformationMessage(
                `$(arrow-up) Push successful to origin/${currentBranch}`
            );

        } catch (error) {
            this._handleCommandError(error, 'Push operation failed');
        }
    }

    /**
     * Validate that we're in a Git repository
     * @returns Promise resolving to true if valid Git repo
     */
    private async _validateGitRepository(): Promise<boolean> {
        return await this._gitProvider.ensureGitRepository();
    }

    /**
     * Let user select files to commit using QuickPick
     * @param files - Available files to select from
     * @returns Promise resolving to selected file paths
     */
    private async _selectFilesToCommit(files: IFileStatus[]): Promise<string[] | undefined> {
        return await QuickPickHelper.selectFiles(files);
    }

    /**
     * Get commit message from user with validation
     * @returns Promise resolving to validated commit message
     */
    private async _getCommitMessage(): Promise<string | undefined> {
        const commitMessage = await vscode.window.showInputBox({
            prompt: 'Enter commit message',
            placeHolder: 'feat: add new feature (follow conventional commits)',
            validateInput: this._validateCommitMessage.bind(this),
            ignoreFocusOut: true
        });

        return commitMessage?.trim();
    }

    /**
     * Validate commit message format and length
     * @param message - Commit message to validate
     * @returns Error message if invalid, undefined if valid
     */
    private _validateCommitMessage(message: string): string | undefined {
        if (!message || message.trim().length === 0) {
            return 'Commit message cannot be empty';
        }

        const trimmed = message.trim();
        
        if (trimmed.length < MIN_COMMIT_MESSAGE_LENGTH) {
            return `Commit message must be at least ${MIN_COMMIT_MESSAGE_LENGTH} characters`;
        }

        if (trimmed.length > MAX_COMMIT_MESSAGE_LENGTH) {
            return `Commit message should not exceed ${MAX_COMMIT_MESSAGE_LENGTH} characters`;
        }

        return undefined;
    }

    /**
     * Execute commit operation with progress indication
     * @param options - Commit options including message and files
     * @returns Promise that resolves when commit is complete
     */
    private async _executeCommitWithProgress(options: ICommitOptions): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating commit...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Staging files...' });
            
            // The GitProvider will handle staging files if they're provided
            await this._gitProvider.commit(options);
            
            progress.report({ increment: 100, message: 'Commit created' });
        });
    }

    /**
     * Confirm push operation with user
     * @param branchName - Current branch name
     * @returns Promise resolving to true if user confirms
     */
    private async _confirmPushOperation(branchName: string): Promise<boolean> {
        const choice = await vscode.window.showInformationMessage(
            `Push commits to origin/${branchName}?`,
            { modal: true },
            'Push',
            'Cancel'
        );

        return choice === 'Push';
    }

    /**
     * Execute pull operation with progress indication
     * @returns Promise that resolves when pull is complete
     */
    async pull(): Promise<void> {
        try {
            // 1. Validate preconditions
            if (!await this._validateGitRepository()) {
                return;
            }

            // 2. Get current branch
            const currentBranch = await this._gitProvider.getCurrentBranch();
            if (!currentBranch) {
                vscode.window.showErrorMessage('Unable to determine current branch');
                return;
            }

            // 3. Execute pull with progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Pulling from origin/${currentBranch}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                await this._gitProvider.pull();
                
                progress.report({ increment: 100 });
            });

            // 4. Show success message
            vscode.window.showInformationMessage(
                `$(arrow-down) Pull successful from origin/${currentBranch}`
            );

        } catch (error) {
            this._handleCommandError(error, 'Pull operation failed');
        }
    }

    /**
     * Handle command errors with user-friendly messages and logging
     * @param error - The error that occurred
     * @param context - Context message for the error
     */
    private _handleCommandError(error: unknown, context: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const fullMessage = `${context}: ${errorMessage}`;
        
        // Log detailed error for debugging
        console.error(`[GitPilot] ${fullMessage}`, error);
        
        // Show user-friendly error message
        vscode.window.showErrorMessage(fullMessage);
    }
}