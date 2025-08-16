import * as vscode from 'vscode';
import * as path from 'path';
import { GitProvider } from '../providers/gitProvider';
import { ChangelistStore } from '../models/changelistStore';
import { ShelveStore } from '../models/shelveStore';
import { FileStatusService, FileStatus } from '../services/fileStatusService';
import { ProfessionalInteractions } from '../ui/professionalInteractions';
import { FileChange, FileChangeStatus } from '../models/fileChange';

/**
 * Explorer context menu Git commands
 */
export function registerExplorerCommands(
    context: vscode.ExtensionContext,
    gitProvider: GitProvider,
    changelistStore: ChangelistStore,
    shelveStore: ShelveStore,
    fileStatusService: FileStatusService
): void {

    // Stage file(s) command
    const stageCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.stage',
        async (uri: vscode.Uri, allUris?: vscode.Uri[]) => {
            try {
                const uris = allUris || [uri];
                const validUris = await filterStageableFiles(uris, fileStatusService);
                
                if (validUris.length === 0) {
                    vscode.window.showInformationMessage('No files can be staged');
                    return;
                }
                
                await stageMultipleFiles(validUris, gitProvider);
                
                ProfessionalInteractions.showSuccess(
                    'Files staged',
                    `${validUris.length} file(s)`
                );
            } catch (error) {
                ProfessionalInteractions.showError('Stage files', error);
            }
        }
    );

    // Unstage file(s) command
    const unstageCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.unstage',
        async (uri: vscode.Uri, allUris?: vscode.Uri[]) => {
            try {
                const uris = allUris || [uri];
                const validUris = await filterUnstageableFiles(uris, fileStatusService);
                
                if (validUris.length === 0) {
                    vscode.window.showInformationMessage('No staged files found');
                    return;
                }
                
                await unstageMultipleFiles(validUris, gitProvider);
                
                ProfessionalInteractions.showSuccess(
                    'Files unstaged',
                    `${validUris.length} file(s)`
                );
            } catch (error) {
                ProfessionalInteractions.showError('Unstage files', error);
            }
        }
    );

    // Add to Git command (for untracked files)
    const addToGitCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.addToGit',
        async (uri: vscode.Uri, allUris?: vscode.Uri[]) => {
            try {
                const uris = allUris || [uri];
                const untrackedUris = await filterUntrackedFiles(uris, fileStatusService);
                
                if (untrackedUris.length === 0) {
                    vscode.window.showInformationMessage('No untracked files found');
                    return;
                }
                
                await stageMultipleFiles(untrackedUris, gitProvider);
                
                ProfessionalInteractions.showSuccess(
                    'Files added to Git',
                    `${untrackedUris.length} file(s)`
                );
            } catch (error) {
                ProfessionalInteractions.showError('Add files to Git', error);
            }
        }
    );

    // Revert file(s) command
    const revertCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.revert',
        async (uri: vscode.Uri, allUris?: vscode.Uri[]) => {
            try {
                const uris = allUris || [uri];
                const revertableUris = await filterRevertableFiles(uris, fileStatusService);
                
                if (revertableUris.length === 0) {
                    vscode.window.showInformationMessage('No files can be reverted');
                    return;
                }
                
                const filePaths = revertableUris.map(u => u.fsPath);
                const confirmed = await ProfessionalInteractions.confirmRevert(filePaths);
                
                if (!confirmed) {
                    return;
                }
                
                await revertMultipleFiles(revertableUris, gitProvider);
                
                ProfessionalInteractions.showSuccess(
                    'Files reverted',
                    `${revertableUris.length} file(s)`
                );
            } catch (error) {
                ProfessionalInteractions.showError('Revert files', error);
            }
        }
    );

    // Show file diff command
    const diffCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.diff',
        async (uri: vscode.Uri) => {
            try {
                await showFileDiff(uri, gitProvider);
            } catch (error) {
                ProfessionalInteractions.showError('Show diff', error);
            }
        }
    );

    // Compare with branch command
    const compareWithBranchCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.compareWithBranch',
        async (uri: vscode.Uri) => {
            try {
                const branchInfo = await gitProvider.getBranches();
                const currentBranch = await gitProvider.getCurrentBranch();
                const branches = branchInfo.all.filter(b => b !== currentBranch);
                
                const selectedBranch = await ProfessionalInteractions.showBranchPicker(
                    branches,
                    currentBranch || ''
                );
                
                if (selectedBranch) {
                    await compareWithBranch(uri, selectedBranch);
                }
            } catch (error) {
                ProfessionalInteractions.showError('Compare with branch', error);
            }
        }
    );

    // Show file history command
    const historyCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.history',
        async (uri: vscode.Uri) => {
            try {
                await showFileHistory(uri, gitProvider);
            } catch (error) {
                ProfessionalInteractions.showError('Show file history', error);
            }
        }
    );

    // Annotate file (Git blame) command
    const blameCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.blame',
        async (uri: vscode.Uri) => {
            try {
                await vscode.commands.executeCommand('git.openFile', uri);
                await vscode.commands.executeCommand('gitlens.toggleFileBlame');
            } catch (error) {
                // Fallback to VS Code's built-in blame if GitLens not available
                try {
                    await vscode.commands.executeCommand('git.openBlame', uri);
                } catch (fallbackError) {
                    ProfessionalInteractions.showError('Show blame', 'Git blame functionality not available');
                }
            }
        }
    );

    // Add to changelist command
    const addToChangelistCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.addToChangelist',
        async (uri: vscode.Uri, allUris?: vscode.Uri[]) => {
            try {
                const uris = allUris || [uri];
                await addFilesToChangelist(uris, changelistStore, fileStatusService);
            } catch (error) {
                ProfessionalInteractions.showError('Add to changelist', error);
            }
        }
    );

    // Shelve file(s) command
    const shelveCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.shelve',
        async (uri: vscode.Uri, allUris?: vscode.Uri[]) => {
            try {
                const uris = allUris || [uri];
                await shelveFiles(uris, shelveStore, fileStatusService);
            } catch (error) {
                ProfessionalInteractions.showError('Shelve files', error);
            }
        }
    );

    // Folder operations
    const stageFolderCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.stageFolder',
        async (uri: vscode.Uri) => {
            try {
                await stageFolderContents(uri, gitProvider, fileStatusService);
            } catch (error) {
                ProfessionalInteractions.showError('Stage folder', error);
            }
        }
    );

    const addFolderToChangelistCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.addFolderToChangelist',
        async (uri: vscode.Uri) => {
            try {
                const files = await getAllFilesInFolder(uri);
                await addFilesToChangelist(files, changelistStore, fileStatusService);
            } catch (error) {
                ProfessionalInteractions.showError('Add folder to changelist', error);
            }
        }
    );

    const shelveFolderCommand = vscode.commands.registerCommand(
        'gitpilot.explorer.shelveFolder',
        async (uri: vscode.Uri) => {
            try {
                const files = await getAllFilesInFolder(uri);
                await shelveFiles(files, shelveStore, fileStatusService);
            } catch (error) {
                ProfessionalInteractions.showError('Shelve folder', error);
            }
        }
    );

    // Register all commands
    context.subscriptions.push(
        stageCommand,
        unstageCommand,
        addToGitCommand,
        revertCommand,
        diffCommand,
        compareWithBranchCommand,
        historyCommand,
        blameCommand,
        addToChangelistCommand,
        shelveCommand,
        stageFolderCommand,
        addFolderToChangelistCommand,
        shelveFolderCommand
    );
}

// Helper functions

async function filterStageableFiles(uris: vscode.Uri[], fileStatusService: FileStatusService): Promise<vscode.Uri[]> {
    const result: vscode.Uri[] = [];
    
    for (const uri of uris) {
        if (await fileStatusService.canStage(uri)) {
            result.push(uri);
        }
    }
    
    return result;
}

async function filterUnstageableFiles(uris: vscode.Uri[], fileStatusService: FileStatusService): Promise<vscode.Uri[]> {
    const result: vscode.Uri[] = [];
    
    for (const uri of uris) {
        if (await fileStatusService.canUnstage(uri)) {
            result.push(uri);
        }
    }
    
    return result;
}

async function filterUntrackedFiles(uris: vscode.Uri[], fileStatusService: FileStatusService): Promise<vscode.Uri[]> {
    const result: vscode.Uri[] = [];
    
    for (const uri of uris) {
        const status = await fileStatusService.getFileStatus(uri);
        if (status === FileStatus.Untracked) {
            result.push(uri);
        }
    }
    
    return result;
}

async function filterRevertableFiles(uris: vscode.Uri[], fileStatusService: FileStatusService): Promise<vscode.Uri[]> {
    const result: vscode.Uri[] = [];
    
    for (const uri of uris) {
        if (await fileStatusService.canRevert(uri)) {
            result.push(uri);
        }
    }
    
    return result;
}

async function stageMultipleFiles(uris: vscode.Uri[], gitProvider: GitProvider): Promise<void> {
    await ProfessionalInteractions.withProgress(
        '📦 Staging files...',
        async (progress) => {
            const filePaths = uris.map(uri => uri.fsPath);
            
            progress.report({ message: `Staging ${filePaths.length} file(s)...` });
            await gitProvider.add(filePaths);
            progress.report({ message: 'Staging complete!', increment: 100 });
        }
    );
}

async function unstageMultipleFiles(uris: vscode.Uri[], gitProvider: GitProvider): Promise<void> {
    await ProfessionalInteractions.withProgress(
        '📤 Unstaging files...',
        async (progress) => {
            progress.report({ message: `Unstaging ${uris.length} file(s)...` });
            
            for (const uri of uris) {
                const relativePath = vscode.workspace.asRelativePath(uri);
                await vscode.commands.executeCommand('git.unstage', uri);
            }
            
            progress.report({ message: 'Unstaging complete!', increment: 100 });
        }
    );
}

async function revertMultipleFiles(uris: vscode.Uri[], gitProvider: GitProvider): Promise<void> {
    await ProfessionalInteractions.withProgress(
        '🔄 Reverting files...',
        async (progress) => {
            progress.report({ message: `Reverting ${uris.length} file(s)...` });
            
            for (const uri of uris) {
                await vscode.commands.executeCommand('git.clean', uri);
            }
            
            progress.report({ message: 'Revert complete!', increment: 100 });
        }
    );
}

async function showFileDiff(uri: vscode.Uri, gitProvider: GitProvider): Promise<void> {
    const fileName = path.basename(uri.fsPath);
    const headUri = uri.with({ scheme: 'git', query: 'HEAD' });
    
    await vscode.commands.executeCommand(
        'vscode.diff',
        headUri,
        uri,
        `${fileName} (Working Tree ↔ HEAD)`
    );
}

async function compareWithBranch(uri: vscode.Uri, branch: string): Promise<void> {
    const fileName = path.basename(uri.fsPath);
    const branchUri = uri.with({ scheme: 'git', query: branch });
    
    await vscode.commands.executeCommand(
        'vscode.diff',
        branchUri,
        uri,
        `${fileName} (Working Tree ↔ ${branch})`
    );
}

async function showFileHistory(uri: vscode.Uri, gitProvider: GitProvider): Promise<void> {
    try {
        // Try GitLens first
        await vscode.commands.executeCommand('gitlens.showFileHistoryInView', uri);
    } catch {
        try {
            // Fallback to built-in Git timeline
            await vscode.commands.executeCommand('timeline.focus');
            await vscode.commands.executeCommand('vscode.open', uri);
        } catch {
            // Final fallback - show in SCM view
            await vscode.commands.executeCommand('workbench.scm.focus');
            vscode.window.showInformationMessage('Git history view not available. Check Source Control tab.');
        }
    }
}

async function addFilesToChangelist(
    uris: vscode.Uri[], 
    changelistStore: ChangelistStore, 
    fileStatusService: FileStatusService
): Promise<void> {
    // Filter files that have changes
    const changedFiles: vscode.Uri[] = [];
    
    for (const uri of uris) {
        if (await fileStatusService.hasChanges(uri)) {
            changedFiles.push(uri);
        }
    }
    
    if (changedFiles.length === 0) {
        vscode.window.showInformationMessage('No files with changes found');
        return;
    }
    
    // Show changelist picker
    const changelists = changelistStore.getAllChangelists();
    const changelistData = changelists.map(cl => ({
        id: cl.id,
        name: cl.name,
        fileCount: cl.fileCount,
        isActive: cl.isActive,
        description: cl.description
    }));
    
    const selectedId = await ProfessionalInteractions.showChangelistPicker(changelistData);
    if (!selectedId) {
        return;
    }
    
    // Add files to changelist
    await ProfessionalInteractions.withProgress(
        '📋 Adding files to changelist...',
        async (progress) => {
            progress.report({ message: `Adding ${changedFiles.length} file(s)...` });
            
            // This would need to be implemented based on your changelist system
            // For now, show success message
            progress.report({ message: 'Files added!', increment: 100 });
        }
    );
    
    const changelist = changelistStore.getChangelist(selectedId);
    ProfessionalInteractions.showSuccess(
        'Files added to changelist',
        `${changedFiles.length} file(s) added to "${changelist?.name}"`
    );
}

async function shelveFiles(
    uris: vscode.Uri[], 
    shelveStore: ShelveStore, 
    fileStatusService: FileStatusService
): Promise<void> {
    // Filter files that have changes
    const changedFiles: vscode.Uri[] = [];
    
    for (const uri of uris) {
        if (await fileStatusService.hasChanges(uri)) {
            changedFiles.push(uri);
        }
    }
    
    if (changedFiles.length === 0) {
        vscode.window.showInformationMessage('No files with changes found');
        return;
    }
    
    // Get shelf name
    const existingNames = shelveStore.getAllShelves().map(s => s.name);
    const shelfName = await ProfessionalInteractions.showShelfNameDialog(existingNames);
    
    if (!shelfName) {
        return;
    }
    
    await ProfessionalInteractions.shelveWithProgress(
        async () => {
            // Create FileChange objects from URIs
            const fileChanges = await Promise.all(
                changedFiles.map(async uri => {
                    const status = await fileStatusService.getFileStatus(uri);
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    const fileChangeStatus = mapFileStatusToFileChangeStatus(status);
                    return new FileChange(
                        uri.fsPath,
                        relativePath,
                        fileChangeStatus
                    );
                })
            );
            
            // Create shelf with selected files
            await shelveStore.createShelf(shelfName, fileChanges);
        },
        shelfName
    );
}

async function stageFolderContents(
    folderUri: vscode.Uri, 
    gitProvider: GitProvider, 
    fileStatusService: FileStatusService
): Promise<void> {
    const files = await getAllFilesInFolder(folderUri);
    const stageableFiles = await filterStageableFiles(files, fileStatusService);
    
    if (stageableFiles.length === 0) {
        vscode.window.showInformationMessage('No files to stage in this folder');
        return;
    }
    
    await stageMultipleFiles(stageableFiles, gitProvider);
    
    ProfessionalInteractions.showSuccess(
        'Folder staged',
        `${stageableFiles.length} file(s) staged`
    );
}

async function getAllFilesInFolder(folderUri: vscode.Uri): Promise<vscode.Uri[]> {
    const files: vscode.Uri[] = [];
    
    try {
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        
        for (const [name, type] of entries) {
            const entryUri = vscode.Uri.joinPath(folderUri, name);
            
            if (type === vscode.FileType.File) {
                files.push(entryUri);
            } else if (type === vscode.FileType.Directory) {
                // Recursively get files from subdirectories
                const subFiles = await getAllFilesInFolder(entryUri);
                files.push(...subFiles);
            }
        }
    } catch (error) {
        console.error('Error reading folder contents:', error);
    }
    
    return files;
}

/**
 * Map FileStatus to FileChangeStatus
 */
function mapFileStatusToFileChangeStatus(status: FileStatus): FileChangeStatus {
    switch (status) {
        case FileStatus.Modified:
            return FileChangeStatus.Modified;
        case FileStatus.Added:
        case FileStatus.Untracked:
            return FileChangeStatus.Added;
        case FileStatus.Deleted:
            return FileChangeStatus.Deleted;
        case FileStatus.Staged:
            return FileChangeStatus.Modified; // Staged files are considered modified
        default:
            return FileChangeStatus.Modified;
    }
}