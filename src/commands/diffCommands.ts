import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

export class DiffCommands {
    constructor(private gitProvider: GitProvider) {}

    async showFileDiff(file: string): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file);
            
            // Check if file exists in working directory
            const workingTreeUri = filePath;
            const headUri = filePath.with({ 
                scheme: 'git', 
                query: 'HEAD'
            });

            await vscode.commands.executeCommand(
                'vscode.diff',
                headUri,
                workingTreeUri,
                `${file} (HEAD ↔ Working Tree)`
            );
        } catch (error) {
            console.error('Error showing diff:', error);
            vscode.window.showErrorMessage(`Failed to show diff for ${file}: ${error}`);
        }
    }

    async rollbackFile(file: string): Promise<void> {
        try {
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to rollback changes in ${file}? This action cannot be undone.`,
                { modal: true },
                'Rollback',
                'Cancel'
            );

            if (confirmation === 'Rollback') {
                // Use the existing checkout method to revert file changes
                await this.gitProvider.checkout(`-- ${file}`);
                vscode.window.showInformationMessage(`Rolled back changes in ${file}`);
            }
        } catch (error) {
            console.error('Error rolling back file:', error);
            vscode.window.showErrorMessage(`Failed to rollback ${file}: ${error}`);
        }
    }

    async showGitBlame(file: string): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            // For now, show a placeholder since GitProvider doesn't have blame method
            vscode.window.showInformationMessage(`Git blame for ${file} - Feature coming soon!`);
            
            // TODO: Implement blame functionality in GitProvider
            // const blame = await this.gitProvider.blame(file);
            
        } catch (error) {
            console.error('Error showing blame:', error);
            vscode.window.showErrorMessage(`Failed to show blame for ${file}: ${error}`);
        }
    }

    async compareWithRevision(file?: string): Promise<void> {
        try {
            if (!file) {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    vscode.window.showErrorMessage('No file selected');
                    return;
                }
                file = vscode.workspace.asRelativePath(activeEditor.document.uri);
            }

            // Get commit history using existing getLog method
            const logResult = await this.gitProvider.getLog(20);
            if (!logResult.all || logResult.all.length === 0) {
                vscode.window.showInformationMessage('No history found for this repository');
                return;
            }

            const selectedRevision = await vscode.window.showQuickPick(
                logResult.all.map(commit => ({
                    label: commit.hash.substring(0, 8),
                    description: commit.message,
                    detail: `${commit.author_name} - ${commit.date}`,
                    commit: commit
                })),
                { placeHolder: 'Select a revision to compare with' }
            );

            if (selectedRevision) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) return;

                const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file);
                const revisionUri = filePath.with({
                    scheme: 'git',
                    query: selectedRevision.commit.hash
                });

                await vscode.commands.executeCommand(
                    'vscode.diff',
                    revisionUri,
                    filePath,
                    `${file} (${selectedRevision.label} ↔ Working Tree)`
                );
            }
        } catch (error) {
            console.error('Error comparing with revision:', error);
            vscode.window.showErrorMessage(`Failed to compare with revision: ${error}`);
        }
    }

    async compareWithBranch(file?: string): Promise<void> {
        try {
            if (!file) {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    vscode.window.showErrorMessage('No file selected');
                    return;
                }
                file = vscode.workspace.asRelativePath(activeEditor.document.uri);
            }

            const branchInfo = await this.gitProvider.getBranches();
            if (!branchInfo.all || branchInfo.all.length === 0) {
                vscode.window.showInformationMessage('No branches found');
                return;
            }

            const selectedBranch = await vscode.window.showQuickPick(
                branchInfo.all.map(branchName => ({
                    label: branchName,
                    description: branchName === branchInfo.current ? '(current)' : '',
                    detail: `Branch: ${branchName}`,
                    branchName: branchName
                })),
                { placeHolder: 'Select a branch to compare with' }
            );

            if (selectedBranch && selectedBranch.branchName !== branchInfo.current) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) return;

                const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file);
                const branchUri = filePath.with({
                    scheme: 'git',
                    query: selectedBranch.branchName
                });

                await vscode.commands.executeCommand(
                    'vscode.diff',
                    branchUri,
                    filePath,
                    `${file} (${selectedBranch.label} ↔ Working Tree)`
                );
            }
        } catch (error) {
            console.error('Error comparing with branch:', error);
            vscode.window.showErrorMessage(`Failed to compare with branch: ${error}`);
        }
    }
}