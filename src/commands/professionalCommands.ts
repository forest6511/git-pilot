import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { ChangelistStore } from '../models/changelistStore';
import { ModalCommitDialog } from '../ui/dialogs/modalCommitDialog';
import { ProfessionalInteractions } from '../ui/professionalInteractions';

/**
 * Professional IDE-style commands for enhanced Git operations
 */
export function registerProfessionalCommands(
    context: vscode.ExtensionContext,
    gitProvider: GitProvider,
    changelistStore: ChangelistStore,
    modalCommitDialog: ModalCommitDialog
): void {
    
    // Quick commit command (without dialog)
    const quickCommitCommand = vscode.commands.registerCommand(
        'gitpilot.quickCommit',
        async () => {
            try {
                const activeChangelist = changelistStore.getActiveChangelist();
                const selectedFiles = activeChangelist.getSelectedFiles();
                
                if (selectedFiles.length === 0) {
                    vscode.window.showWarningMessage('No files selected for commit');
                    return;
                }
                
                const message = await ProfessionalInteractions.showCommitMessageDialog();
                if (!message) {
                    return;
                }
                
                await ProfessionalInteractions.commitWithProgress(
                    async () => {
                        // Execute commit operation
                        const filePaths = selectedFiles.map(f => f.path);
                        await gitProvider.add(filePaths);
                        await gitProvider.commit({ message, files: filePaths });
                    },
                    message
                );
            } catch (error) {
                ProfessionalInteractions.showError('Quick commit', error);
            }
        }
    );
    
    // Update project command
    const updateProjectCommand = vscode.commands.registerCommand(
        'gitpilot.updateProject',
        async () => {
            try {
                const branch = await gitProvider.getCurrentBranch();
                
                await ProfessionalInteractions.pullWithProgress(
                    async () => {
                        await gitProvider.pull();
                    },
                    branch || 'current branch'
                );
                
                // Refresh all views
                await vscode.commands.executeCommand('git-pilot.refresh');
            } catch (error) {
                ProfessionalInteractions.showError('Update project', error);
            }
        }
    );
    
    // Switch changelist command
    const switchChangelistCommand = vscode.commands.registerCommand(
        'gitpilot.changelist.switch',
        async () => {
            try {
                const changelists = changelistStore.getAllChangelists();
                const changelistData = changelists.map(cl => ({
                    id: cl.id,
                    name: cl.name,
                    fileCount: cl.fileCount,
                    isActive: cl.isActive,
                    description: cl.description
                }));
                
                const selectedId = await ProfessionalInteractions.showChangelistPicker(changelistData);
                if (selectedId) {
                    await changelistStore.setActiveChangelist(selectedId);
                    const changelist = changelistStore.getChangelist(selectedId);
                    ProfessionalInteractions.showSuccess(
                        'Switched changelist',
                        changelist?.name
                    );
                }
            } catch (error) {
                ProfessionalInteractions.showError('Switch changelist', error);
            }
        }
    );
    
    // Enhanced revert command with confirmation
    const revertWithConfirmationCommand = vscode.commands.registerCommand(
        'gitpilot.revert.withConfirmation',
        async (filePaths: string[]) => {
            try {
                if (!filePaths || filePaths.length === 0) {
                    vscode.window.showWarningMessage('No files selected for revert');
                    return;
                }
                
                const confirmed = await ProfessionalInteractions.confirmRevert(filePaths);
                if (!confirmed) {
                    return;
                }
                
                await ProfessionalInteractions.withProgress(
                    '🔄 Reverting changes...',
                    async (progress) => {
                        progress.report({ message: 'Reverting files...' });
                        
                        for (const filePath of filePaths) {
                            // Use checkout to revert file changes
                            await vscode.commands.executeCommand('git.checkout', filePath);
                        }
                        
                        progress.report({ message: 'Revert complete!', increment: 100 });
                    }
                );
                
                ProfessionalInteractions.showSuccess(
                    'Reverted changes',
                    `${filePaths.length} file(s)`
                );
                
                // Refresh views
                await vscode.commands.executeCommand('git-pilot.refresh');
            } catch (error) {
                ProfessionalInteractions.showError('Revert changes', error);
            }
        }
    );
    
    // Enhanced delete changelist command
    const deleteChangelistWithConfirmationCommand = vscode.commands.registerCommand(
        'gitpilot.changelist.deleteWithConfirmation',
        async (changelistId: string) => {
            try {
                const changelist = changelistStore.getChangelist(changelistId);
                if (!changelist) {
                    vscode.window.showErrorMessage('Changelist not found');
                    return;
                }
                
                if (changelist.isDefault) {
                    vscode.window.showErrorMessage('Cannot delete default changelist');
                    return;
                }
                
                const confirmed = await ProfessionalInteractions.confirmDeleteChangelist(
                    changelist.name,
                    changelist.fileCount
                );
                
                if (!confirmed) {
                    return;
                }
                
                await ProfessionalInteractions.withProgress(
                    '🗑️ Deleting changelist...',
                    async (progress) => {
                        progress.report({ message: 'Moving files to default changelist...' });
                        
                        // Move files to default changelist
                        if (changelist.hasFiles) {
                            const defaultChangelist = changelistStore.getActiveChangelist();
                            const filePaths = changelist.files.map(f => f.path);
                            changelistStore.moveFiles(filePaths, changelistId, defaultChangelist.id);
                        }
                        
                        // Delete the changelist
                        changelistStore.deleteChangelist(changelistId);
                        await changelistStore.save();
                        
                        progress.report({ message: 'Changelist deleted!', increment: 100 });
                    }
                );
                
                ProfessionalInteractions.showSuccess(
                    'Deleted changelist',
                    changelist.name
                );
            } catch (error) {
                ProfessionalInteractions.showError('Delete changelist', error);
            }
        }
    );
    
    // Force push command with confirmation
    const forcePushCommand = vscode.commands.registerCommand(
        'gitpilot.push.force',
        async () => {
            try {
                const branch = await gitProvider.getCurrentBranch();
                if (!branch) {
                    vscode.window.showErrorMessage('No current branch found');
                    return;
                }
                
                const confirmed = await ProfessionalInteractions.confirmForcePush(branch);
                if (!confirmed) {
                    return;
                }
                
                await ProfessionalInteractions.pushWithProgress(
                    async () => {
                        await gitProvider.push('origin', branch); // Regular push for now
                    },
                    branch
                );
            } catch (error) {
                ProfessionalInteractions.showError('Force push', error);
            }
        }
    );
    
    // Enhanced branch switch command
    const switchBranchCommand = vscode.commands.registerCommand(
        'gitpilot.branch.switch',
        async () => {
            try {
                const branchInfo = await gitProvider.getBranches();
                const currentBranch = await gitProvider.getCurrentBranch();
                
                if (!currentBranch) {
                    vscode.window.showErrorMessage('No current branch found');
                    return;
                }
                
                // Extract branch names from the branch info
                const branches = branchInfo.all || [];
                
                const selectedBranch = await ProfessionalInteractions.showBranchPicker(
                    branches,
                    currentBranch
                );
                
                if (!selectedBranch || selectedBranch === currentBranch) {
                    return;
                }
                
                await ProfessionalInteractions.withProgress(
                    `🌿 Switching to ${selectedBranch}...`,
                    async (progress) => {
                        progress.report({ message: 'Checking out branch...' });
                        await gitProvider.checkout(selectedBranch);
                        progress.report({ message: 'Switch complete!', increment: 100 });
                    }
                );
                
                ProfessionalInteractions.showSuccess(
                    'Switched to branch',
                    selectedBranch
                );
                
                // Refresh views
                await vscode.commands.executeCommand('git-pilot.refresh');
            } catch (error) {
                ProfessionalInteractions.showError('Switch branch', error);
            }
        }
    );
    
    // Open settings command
    const openSettingsCommand = vscode.commands.registerCommand(
        'gitpilot.openSettings',
        async () => {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                '@ext:forest6511.git-pilot'
            );
        }
    );
    
    // Show Git output command
    const showGitOutputCommand = vscode.commands.registerCommand(
        'gitpilot.showGitOutput',
        async () => {
            await vscode.commands.executeCommand('git.showOutput');
        }
    );
    
    // Register all commands
    context.subscriptions.push(
        quickCommitCommand,
        updateProjectCommand,
        switchChangelistCommand,
        revertWithConfirmationCommand,
        deleteChangelistWithConfirmationCommand,
        forcePushCommand,
        switchBranchCommand,
        openSettingsCommand,
        showGitOutputCommand
    );
}