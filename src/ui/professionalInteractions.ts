import * as vscode from 'vscode';

/**
 * Professional IDE-style interactions for confirmation dialogs,
 * progress indicators, and user feedback
 */
export class ProfessionalInteractions {
    
    /**
     * Show a professional confirmation dialog for destructive operations
     */
    static async showConfirmationDialog(
        operation: string,
        details: string,
        destructive = true
    ): Promise<boolean> {
        const options: vscode.MessageOptions = {
            modal: true,
            detail: details
        };

        const primaryAction = destructive ? 'Yes, Proceed' : 'Confirm';
        const result = await vscode.window.showWarningMessage(
            `⚠️ ${operation}`,
            options,
            primaryAction,
            'Cancel'
        );

        return result === primaryAction;
    }

    /**
     * Show confirmation for revert operations
     */
    static async confirmRevert(filePaths: string[]): Promise<boolean> {
        const fileCount = filePaths.length;
        const fileText = fileCount === 1 ? 'file' : 'files';
        const operation = `Revert ${fileCount} ${fileText}`;
        
        let details = 'This will discard all local changes to the selected files.\n\n';
        
        if (fileCount <= 5) {
            details += 'Files to revert:\n';
            details += filePaths.map(path => `• ${path}`).join('\n');
        } else {
            details += `${fileCount} files will be reverted.`;
        }
        
        details += '\n\n⚠️ This action cannot be undone.';
        
        return this.showConfirmationDialog(operation, details, true);
    }

    /**
     * Show confirmation for changelist deletion
     */
    static async confirmDeleteChangelist(
        changelistName: string,
        fileCount: number
    ): Promise<boolean> {
        const operation = `Delete changelist "${changelistName}"`;
        
        let details = `This will permanently delete the changelist.\n\n`;
        
        if (fileCount > 0) {
            details += `The ${fileCount} files in this changelist will be moved to the Default changelist.\n\n`;
        }
        
        details += '⚠️ This action cannot be undone.';
        
        return this.showConfirmationDialog(operation, details, true);
    }

    /**
     * Show confirmation for discard changes
     */
    static async confirmDiscardChanges(selectedFileCount: number): Promise<boolean> {
        const fileText = selectedFileCount === 1 ? 'file' : 'files';
        const operation = `Discard changes in ${selectedFileCount} ${fileText}`;
        
        const details = `This will permanently discard all uncommitted changes in the selected ${fileText}.\n\n⚠️ This action cannot be undone.`;
        
        return this.showConfirmationDialog(operation, details, true);
    }

    /**
     * Show confirmation for force push
     */
    static async confirmForcePush(branchName: string): Promise<boolean> {
        const operation = `Force push to "${branchName}"`;
        
        const details = `This will overwrite the remote branch history.\n\n⚠️ This can cause data loss for other team members.\n\nOnly proceed if you're certain this is necessary.`;
        
        return this.showConfirmationDialog(operation, details, true);
    }

    /**
     * Execute an operation with professional progress indication
     */
    static async withProgress<T>(
        title: string,
        operation: (progress: vscode.Progress<{
            message?: string;
            increment?: number;
        }>) => Promise<T>,
        location: vscode.ProgressLocation = vscode.ProgressLocation.Notification
    ): Promise<T> {
        return vscode.window.withProgress({
            location,
            title,
            cancellable: false
        }, operation);
    }

    /**
     * Execute a cancellable operation with progress
     */
    static async withCancellableProgress<T>(
        title: string,
        operation: (
            progress: vscode.Progress<{
                message?: string;
                increment?: number;
            }>,
            token: vscode.CancellationToken
        ) => Promise<T>,
        location: vscode.ProgressLocation = vscode.ProgressLocation.Notification
    ): Promise<T | undefined> {
        try {
            return await vscode.window.withProgress({
                location,
                title,
                cancellable: true
            }, operation);
        } catch (error) {
            if (error instanceof vscode.CancellationError) {
                vscode.window.showInformationMessage('Operation cancelled');
                return undefined;
            }
            throw error;
        }
    }

    /**
     * Show commit operation progress
     */
    static async commitWithProgress(
        operation: () => Promise<void>,
        message: string
    ): Promise<void> {
        await this.withProgress(
            '🔄 Committing changes...',
            async (progress) => {
                progress.report({ message: 'Preparing commit...' });
                
                try {
                    await operation();
                    progress.report({ message: 'Commit successful!', increment: 100 });
                } catch (error) {
                    throw new Error(`Commit failed: ${error}`);
                }
            }
        );
        
        vscode.window.showInformationMessage(`✅ Committed: ${message}`);
    }

    /**
     * Show push operation progress
     */
    static async pushWithProgress(
        operation: () => Promise<void>,
        branchName: string
    ): Promise<void> {
        await this.withProgress(
            '📤 Pushing to remote...',
            async (progress) => {
                progress.report({ message: `Pushing to ${branchName}...` });
                
                try {
                    await operation();
                    progress.report({ message: 'Push successful!', increment: 100 });
                } catch (error) {
                    throw new Error(`Push failed: ${error}`);
                }
            }
        );
        
        vscode.window.showInformationMessage(`✅ Pushed to ${branchName}`);
    }

    /**
     * Show pull operation progress
     */
    static async pullWithProgress(
        operation: () => Promise<void>,
        branchName: string
    ): Promise<void> {
        await this.withProgress(
            '📥 Pulling from remote...',
            async (progress) => {
                progress.report({ message: `Pulling from ${branchName}...` });
                
                try {
                    await operation();
                    progress.report({ message: 'Pull successful!', increment: 100 });
                } catch (error) {
                    throw new Error(`Pull failed: ${error}`);
                }
            }
        );
        
        vscode.window.showInformationMessage(`✅ Pulled from ${branchName}`);
    }

    /**
     * Show shelve operation progress
     */
    static async shelveWithProgress(
        operation: () => Promise<void>,
        shelfName: string
    ): Promise<void> {
        await this.withProgress(
            '📦 Creating shelf...',
            async (progress) => {
                progress.report({ message: 'Saving changes to shelf...' });
                
                try {
                    await operation();
                    progress.report({ message: 'Shelf created!', increment: 100 });
                } catch (error) {
                    throw new Error(`Shelve failed: ${error}`);
                }
            }
        );
        
        vscode.window.showInformationMessage(`✅ Created shelf: ${shelfName}`);
    }

    /**
     * Show loading history progress
     */
    static async loadHistoryWithProgress<T>(
        operation: (progress: vscode.Progress<{
            message?: string;
            increment?: number;
        }>) => Promise<T>,
        filePath?: string
    ): Promise<T> {
        const title = filePath 
            ? `📚 Loading history for ${filePath.split('/').pop()}...`
            : '📚 Loading repository history...';
            
        return this.withProgress(title, operation);
    }

    /**
     * Show operation success with appropriate icon and message
     */
    static showSuccess(operation: string, details?: string): void {
        const message = details ? `✅ ${operation}: ${details}` : `✅ ${operation}`;
        vscode.window.showInformationMessage(message);
    }

    /**
     * Show operation error with appropriate icon and message
     */
    static showError(operation: string, error: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`❌ ${operation} failed: ${errorMessage}`);
    }

    /**
     * Show operation warning
     */
    static showWarning(message: string): void {
        vscode.window.showWarningMessage(`⚠️ ${message}`);
    }

    /**
     * Show professional input dialog for operations like renaming
     */
    static async showInputDialog(
        prompt: string,
        placeholder?: string,
        defaultValue?: string,
        validator?: (value: string) => string | null
    ): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt,
            placeHolder: placeholder,
            value: defaultValue,
            validateInput: validator
        });
    }

    /**
     * Show changelist rename dialog
     */
    static async showChangelistRenameDialog(
        currentName: string,
        existingNames: string[]
    ): Promise<string | undefined> {
        return this.showInputDialog(
            'Enter new changelist name:',
            'Changelist name',
            currentName,
            (value) => {
                if (!value || !value.trim()) {
                    return 'Changelist name cannot be empty';
                }
                
                if (value.trim() === currentName) {
                    return null; // No change
                }
                
                if (existingNames.includes(value.trim())) {
                    return `Changelist "${value}" already exists`;
                }
                
                return null;
            }
        );
    }

    /**
     * Show commit message dialog
     */
    static async showCommitMessageDialog(): Promise<string | undefined> {
        return this.showInputDialog(
            'Enter commit message:',
            'Commit message',
            undefined,
            (value) => {
                if (!value || !value.trim()) {
                    return 'Commit message cannot be empty';
                }
                
                if (value.trim().length < 3) {
                    return 'Commit message must be at least 3 characters long';
                }
                
                return null;
            }
        );
    }

    /**
     * Show shelf name dialog
     */
    static async showShelfNameDialog(
        existingNames: string[] = []
    ): Promise<string | undefined> {
        return this.showInputDialog(
            'Enter shelf name:',
            'Shelf name',
            undefined,
            (value) => {
                if (!value || !value.trim()) {
                    return 'Shelf name cannot be empty';
                }
                
                if (existingNames.includes(value.trim())) {
                    return `Shelf "${value}" already exists`;
                }
                
                return null;
            }
        );
    }

    /**
     * Show branch selection quick pick
     */
    static async showBranchPicker(
        branches: string[],
        currentBranch: string
    ): Promise<string | undefined> {
        const items = branches.map(branch => ({
            label: branch,
            description: branch === currentBranch ? '$(check) Current' : '',
            detail: branch === currentBranch ? 'Currently active branch' : undefined
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a branch to switch to',
            matchOnDescription: true,
            matchOnDetail: true
        });

        return selected?.label;
    }

    /**
     * Show changelist selection quick pick
     */
    static async showChangelistPicker(
        changelists: Array<{
            id: string;
            name: string;
            fileCount: number;
            isActive: boolean;
            description?: string;
        }>
    ): Promise<string | undefined> {
        const items = changelists.map(changelist => ({
            label: changelist.name,
            description: changelist.isActive ? '$(check) Active' : `${changelist.fileCount} files`,
            detail: changelist.description || undefined,
            id: changelist.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a changelist to switch to',
            matchOnDescription: true,
            matchOnDetail: true
        });

        return selected?.id;
    }
}