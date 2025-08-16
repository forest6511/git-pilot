import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { BasicCommands } from './basicCommands';
import { BranchCommands } from './branchCommands';
import { HistoryCommands } from './historyCommands';
import { DiffCommands } from './diffCommands';
import { StageCommands } from './stageCommands';
import { CommitCommands } from './commitCommands';
import { ChangelistCommands } from './changelistCommands';

export function registerCommands(
    context: vscode.ExtensionContext, 
    gitProvider: GitProvider,
    localChangesProvider?: any,
    changelistProvider?: any
) {
    const basicCommands = new BasicCommands(gitProvider);
    const branchCommands = new BranchCommands(gitProvider);
    const historyCommands = new HistoryCommands(gitProvider);
    const diffCommands = new DiffCommands(gitProvider);
    
    // New Phase 1.2 commands
    const stageCommands = localChangesProvider ? new StageCommands(gitProvider, localChangesProvider) : null;
    const commitCommands = localChangesProvider ? new CommitCommands(gitProvider, localChangesProvider) : null;
    
    // Phase 2 Multiple Changelists commands
    const changelistCommands = changelistProvider ? new ChangelistCommands(changelistProvider) : null;
    
    const commands = [
        // Basic commands
        vscode.commands.registerCommand(
            'git-pilot.commit', 
            () => basicCommands.commit()
        ),
        vscode.commands.registerCommand(
            'git-pilot.push', 
            () => basicCommands.push()
        ),
        vscode.commands.registerCommand(
            'git-pilot.pull', 
            () => basicCommands.pull()
        ),
        
        // Branch commands
        vscode.commands.registerCommand(
            'git-pilot.branches', 
            () => branchCommands.showBranches()
        ),
        
        // History commands
        vscode.commands.registerCommand(
            'git-pilot.showHistory', 
            () => historyCommands.showHistory()
        ),
        vscode.commands.registerCommand(
            'git-pilot.stash', 
            () => historyCommands.stashManager()
        ),

        // Diff commands
        vscode.commands.registerCommand('git-pilot.showFileDiff', 
            (file: string) => diffCommands.showFileDiff(file)),
        vscode.commands.registerCommand('git-pilot.rollbackFile', 
            (file: string) => diffCommands.rollbackFile(file)),
        vscode.commands.registerCommand('git-pilot.blameFile', 
            (file: string) => diffCommands.showGitBlame(file)),
        vscode.commands.registerCommand('git-pilot.compareRevision', 
            (file?: string) => diffCommands.compareWithRevision(file)),
        vscode.commands.registerCommand('git-pilot.compareBranch', 
            (file?: string) => diffCommands.compareWithBranch(file)),

        // Professional IDE-style context menu commands
        vscode.commands.registerCommand('git-pilot.showHistoryForSelection', 
            (file: string) => diffCommands.showGitBlame(file)),
        vscode.commands.registerCommand('git-pilot.addToVCS', 
            (file: string) => gitProvider.add([file])),
        vscode.commands.registerCommand('git-pilot.revert', 
            (file: string) => diffCommands.rollbackFile(file)),
        vscode.commands.registerCommand('git-pilot.commitFile', 
            (file: string) => vscode.window.showInformationMessage(`Commit file: ${file} - Not implemented yet`)),
        vscode.commands.registerCommand('git-pilot.compareWithBranch', 
            (file: string) => diffCommands.compareWithBranch(file)),
        vscode.commands.registerCommand('git-pilot.createPatch', 
            () => vscode.window.showInformationMessage('Create Patch - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.shelveChanges', 
            () => vscode.window.showInformationMessage('Shelve Changes - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.showAllDiff', 
            () => vscode.window.showInformationMessage('Show All Diff - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.revertAll', 
            () => vscode.window.showInformationMessage('Revert All - Not implemented yet')),

        // Additional commands for tree view (placeholders for now)
        vscode.commands.registerCommand('git-pilot.add', () => 
            vscode.window.showInformationMessage('Git Add - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.gitignore', () => 
            vscode.window.showInformationMessage('Gitignore - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.showDiff', () => 
            vscode.window.showInformationMessage('Show Diff - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.showCurrentRevision', () => 
            vscode.window.showInformationMessage('Show Current Revision - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.rollback', () => 
            vscode.window.showInformationMessage('Rollback - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.fetch', () => 
            vscode.window.showInformationMessage('Fetch - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.newTag', () => 
            vscode.window.showInformationMessage('New Tag - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.merge', () => 
            vscode.window.showInformationMessage('Merge - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.rebase', () => 
            vscode.window.showInformationMessage('Rebase - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.resetHead', () => 
            vscode.window.showInformationMessage('Reset HEAD - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.unstashChanges', () => 
            vscode.window.showInformationMessage('Unstash Changes - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.manageRemotes', () => 
            vscode.window.showInformationMessage('Manage Remotes - Not implemented yet')),
        vscode.commands.registerCommand('git-pilot.clone', () => 
            vscode.window.showInformationMessage('Clone Repository - Not implemented yet')),

        // Phase 1.2 Staging Commands
        vscode.commands.registerCommand('git-pilot.stageSelected', () => 
            stageCommands?.stageSelected() || vscode.window.showWarningMessage('Local Changes view not available')),
        vscode.commands.registerCommand('git-pilot.unstageSelected', () => 
            stageCommands?.unstageSelected() || vscode.window.showWarningMessage('Local Changes view not available')),
        vscode.commands.registerCommand('git-pilot.selectAllFiles', () => 
            stageCommands?.selectAllFiles() || vscode.window.showWarningMessage('Local Changes view not available')),
        vscode.commands.registerCommand('git-pilot.deselectAllFiles', () => 
            stageCommands?.deselectAllFiles() || vscode.window.showWarningMessage('Local Changes view not available')),

        // Phase 1.2 Enhanced Commit Commands
        vscode.commands.registerCommand('git-pilot.commitAndPush', () => 
            commitCommands?.commitAndPush() || vscode.window.showWarningMessage('Local Changes view not available')),
        vscode.commands.registerCommand('git-pilot.amendCommit', () => 
            commitCommands?.amendCommit() || vscode.window.showWarningMessage('Local Changes view not available')),

        // Updated context menu commands with new implementations
        vscode.commands.registerCommand('git-pilot.addToVCS', 
            (file: string) => stageCommands?.addToVCS(file) || gitProvider.add([file])),
        vscode.commands.registerCommand('git-pilot.revert', 
            (file: string) => stageCommands?.revertFile(file) || vscode.window.showInformationMessage(`Revert ${file} - Not implemented yet`)),

        // Phase 2 Multiple Changelists Commands
        vscode.commands.registerCommand('git-pilot.createChangelist', () => 
            changelistCommands?.createChangelist() || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.deleteChangelist', (changelistId?: string) => 
            changelistCommands?.deleteChangelist(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.renameChangelist', (changelistId?: string) => 
            changelistCommands?.renameChangelist(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.setActiveChangelist', (changelistId?: string) => 
            changelistCommands?.setActiveChangelist(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.moveFilesToChangelist', (sourceChangelistId?: string, filePaths?: string[]) => 
            changelistCommands?.moveFilesToChangelist(sourceChangelistId, filePaths) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.showChangelistInfo', (changelistId?: string) => 
            changelistCommands?.showChangelistInfo(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.stageChangelistFiles', (changelistId?: string) => 
            changelistCommands?.stageSelectedFiles(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.unstageChangelistFiles', (changelistId?: string) => 
            changelistCommands?.unstageSelectedFiles(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.selectAllChangelistFiles', (changelistId?: string) => 
            changelistCommands?.selectAllFiles(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
        vscode.commands.registerCommand('git-pilot.deselectAllChangelistFiles', (changelistId?: string) => 
            changelistCommands?.deselectAllFiles(changelistId) || vscode.window.showWarningMessage('Multiple Changelists not available')),
    ];
    
    commands.forEach(cmd => context.subscriptions.push(cmd));
}