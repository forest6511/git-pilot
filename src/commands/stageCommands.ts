import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { LocalChangesProvider } from '../views/localChangesProvider';

export class StageCommands {
    constructor(
        private gitProvider: GitProvider,
        private localChangesProvider: LocalChangesProvider
    ) {}

    async stageSelected(): Promise<void> {
        try {
            const selectedFiles = this.localChangesProvider.getSelectedFiles();
            
            if (selectedFiles.length === 0) {
                vscode.window.showWarningMessage('No files selected for staging');
                return;
            }

            await this.gitProvider.add(selectedFiles);
            vscode.window.showInformationMessage(`Staged ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}`);
            
            // Refresh the view
            await this.localChangesProvider.refresh();
            
        } catch (error) {
            console.error('Failed to stage selected files:', error);
            vscode.window.showErrorMessage(`Failed to stage files: ${error}`);
        }
    }

    async unstageSelected(): Promise<void> {
        try {
            const selectedFiles = this.localChangesProvider.getSelectedFiles();
            
            if (selectedFiles.length === 0) {
                vscode.window.showWarningMessage('No files selected for unstaging');
                return;
            }

            // Note: GitProvider would need an unstage method
            // For now, we'll show a placeholder message
            vscode.window.showInformationMessage(`Unstage functionality for ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} - Not implemented yet`);
            
        } catch (error) {
            console.error('Failed to unstage selected files:', error);
            vscode.window.showErrorMessage(`Failed to unstage files: ${error}`);
        }
    }

    selectAllFiles(): void {
        try {
            this.localChangesProvider.selectAllFiles();
            vscode.window.showInformationMessage('All files selected');
        } catch (error) {
            console.error('Failed to select all files:', error);
            vscode.window.showErrorMessage(`Failed to select all files: ${error}`);
        }
    }

    deselectAllFiles(): void {
        try {
            this.localChangesProvider.deselectAllFiles();
            vscode.window.showInformationMessage('All files deselected');
        } catch (error) {
            console.error('Failed to deselect all files:', error);
            vscode.window.showErrorMessage(`Failed to deselect all files: ${error}`);
        }
    }

    async addToVCS(filePath?: string): Promise<void> {
        try {
            let filesToAdd: string[] = [];
            
            if (filePath) {
                filesToAdd = [filePath];
            } else {
                filesToAdd = this.localChangesProvider.getSelectedFiles();
            }
            
            if (filesToAdd.length === 0) {
                vscode.window.showWarningMessage('No files to add to VCS');
                return;
            }

            await this.gitProvider.add(filesToAdd);
            vscode.window.showInformationMessage(`Added ${filesToAdd.length} file${filesToAdd.length === 1 ? '' : 's'} to VCS`);
            
            // Refresh the view
            await this.localChangesProvider.refresh();
            
        } catch (error) {
            console.error('Failed to add files to VCS:', error);
            vscode.window.showErrorMessage(`Failed to add files to VCS: ${error}`);
        }
    }

    async revertFile(filePath?: string): Promise<void> {
        try {
            let filesToRevert: string[] = [];
            
            if (filePath) {
                filesToRevert = [filePath];
            } else {
                filesToRevert = this.localChangesProvider.getSelectedFiles();
            }
            
            if (filesToRevert.length === 0) {
                vscode.window.showWarningMessage('No files to revert');
                return;
            }

            const confirmMessage = `Are you sure you want to revert ${filesToRevert.length} file${filesToRevert.length === 1 ? '' : 's'}? This action cannot be undone.`;
            const confirmation = await vscode.window.showWarningMessage(
                confirmMessage,
                { modal: true },
                'Revert',
                'Cancel'
            );

            if (confirmation !== 'Revert') {
                return;
            }

            // Note: GitProvider would need a revert method
            // For now, we'll show a placeholder message
            vscode.window.showInformationMessage(`Revert functionality for ${filesToRevert.length} file${filesToRevert.length === 1 ? '' : 's'} - Not implemented yet`);
            
        } catch (error) {
            console.error('Failed to revert files:', error);
            vscode.window.showErrorMessage(`Failed to revert files: ${error}`);
        }
    }
}