import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { LocalChangesProvider } from '../views/localChangesProvider';

export interface CommitOptions {
    message: string;
    amend?: boolean;
    signOff?: boolean;
    files?: string[];
}

export class CommitCommands {
    constructor(
        private gitProvider: GitProvider,
        private localChangesProvider: LocalChangesProvider
    ) {}

    async commit(): Promise<void> {
        try {
            const selectedFiles = this.localChangesProvider.getSelectedFiles();
            
            if (selectedFiles.length === 0) {
                vscode.window.showWarningMessage('No files selected for commit');
                return;
            }

            const message = await this.getCommitMessage();
            if (!message) {
                return; // User cancelled
            }

            const options: CommitOptions = {
                message,
                files: selectedFiles
            };

            await this.performCommit(options);
            
        } catch (error) {
            console.error('Failed to commit:', error);
            vscode.window.showErrorMessage(`Failed to commit: ${error}`);
        }
    }

    async commitAndPush(): Promise<void> {
        try {
            await this.commit();
            
            // If commit was successful, push
            await this.gitProvider.push();
            vscode.window.showInformationMessage('Changes committed and pushed successfully');
            
        } catch (error) {
            console.error('Failed to commit and push:', error);
            vscode.window.showErrorMessage(`Failed to commit and push: ${error}`);
        }
    }

    async commitFile(filePath: string): Promise<void> {
        try {
            const message = await this.getCommitMessage(`Commit ${filePath}`);
            if (!message) {
                return; // User cancelled
            }

            const options: CommitOptions = {
                message,
                files: [filePath]
            };

            await this.performCommit(options);
            
        } catch (error) {
            console.error('Failed to commit file:', error);
            vscode.window.showErrorMessage(`Failed to commit file: ${error}`);
        }
    }

    async amendCommit(): Promise<void> {
        try {
            const selectedFiles = this.localChangesProvider.getSelectedFiles();
            
            // Get last commit message for amending
            const lastCommitMessage = await this.getLastCommitMessage();
            const message = await this.getCommitMessage(lastCommitMessage, true);
            
            if (!message) {
                return; // User cancelled
            }

            const options: CommitOptions = {
                message,
                amend: true,
                files: selectedFiles.length > 0 ? selectedFiles : undefined
            };

            await this.performCommit(options);
            
        } catch (error) {
            console.error('Failed to amend commit:', error);
            vscode.window.showErrorMessage(`Failed to amend commit: ${error}`);
        }
    }

    private async performCommit(options: CommitOptions): Promise<void> {
        try {
            // If specific files provided, stage them first
            if (options.files && options.files.length > 0) {
                await this.gitProvider.add(options.files);
            }

            // Perform the commit
            await this.gitProvider.commit({
                message: options.message,
                files: options.files || []
            });

            const fileCount = options.files ? options.files.length : 'staged';
            vscode.window.showInformationMessage(
                `Successfully committed ${fileCount} file${typeof fileCount === 'number' && fileCount === 1 ? '' : 's'}`
            );

            // Refresh the local changes view
            await this.localChangesProvider.refresh();
            
        } catch (error) {
            throw new Error(`Commit failed: ${error}`);
        }
    }

    private async getCommitMessage(defaultMessage?: string, isAmend = false): Promise<string | undefined> {
        const prompt = isAmend ? 'Amend commit message:' : 'Commit message:';
        const placeHolder = isAmend ? 'Enter amended commit message' : 'Enter commit message';
        
        return await vscode.window.showInputBox({
            prompt,
            placeHolder,
            value: defaultMessage,
            validateInput: (input: string) => {
                if (!input.trim()) {
                    return 'Commit message cannot be empty';
                }
                if (input.trim().length < 3) {
                    return 'Commit message must be at least 3 characters long';
                }
                return null;
            }
        });
    }

    private async getLastCommitMessage(): Promise<string> {
        try {
            // This would need to be implemented in GitProvider
            // For now, return empty string
            return '';
        } catch (error) {
            console.error('Failed to get last commit message:', error);
            return '';
        }
    }

    async showCommitHistory(): Promise<void> {
        try {
            // This would show a commit history view
            vscode.window.showInformationMessage('Commit history view - Not implemented yet');
        } catch (error) {
            console.error('Failed to show commit history:', error);
            vscode.window.showErrorMessage(`Failed to show commit history: ${error}`);
        }
    }

    async createPatch(): Promise<void> {
        try {
            const selectedFiles = this.localChangesProvider.getSelectedFiles();
            
            if (selectedFiles.length === 0) {
                vscode.window.showWarningMessage('No files selected for patch creation');
                return;
            }

            // This would create a patch file
            vscode.window.showInformationMessage(`Create patch for ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} - Not implemented yet`);
            
        } catch (error) {
            console.error('Failed to create patch:', error);
            vscode.window.showErrorMessage(`Failed to create patch: ${error}`);
        }
    }

    async shelveChanges(): Promise<void> {
        try {
            const selectedFiles = this.localChangesProvider.getSelectedFiles();
            
            if (selectedFiles.length === 0) {
                vscode.window.showWarningMessage('No files selected for shelving');
                return;
            }

            const shelfName = await vscode.window.showInputBox({
                prompt: 'Enter shelf name:',
                placeHolder: 'Enter name for this shelf',
                validateInput: (input: string) => {
                    if (!input.trim()) {
                        return 'Shelf name cannot be empty';
                    }
                    return null;
                }
            });

            if (!shelfName) {
                return; // User cancelled
            }

            // This would implement shelving functionality
            vscode.window.showInformationMessage(`Shelve ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} as "${shelfName}" - Not implemented yet`);
            
        } catch (error) {
            console.error('Failed to shelve changes:', error);
            vscode.window.showErrorMessage(`Failed to shelve changes: ${error}`);
        }
    }
}