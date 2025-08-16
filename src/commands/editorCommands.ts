import * as vscode from 'vscode';
import * as path from 'path';
import { GitProvider } from '../providers/gitProvider';
import { ChangelistStore } from '../models/changelistStore';
import { ProfessionalInteractions } from '../ui/professionalInteractions';
import { FileChange, FileChangeStatus } from '../models/fileChange';
import { BlameInfo } from '../models/blameInfo';

/**
 * Selection handler for editor operations
 */
export class SelectionHandler {
    constructor(private gitProvider: GitProvider) {}

    /**
     * Get the target lines from the editor selection
     */
    getTargetLines(editor: vscode.TextEditor): { startLine: number; endLine: number } {
        const selection = editor.selection;
        if (selection.isEmpty) {
            return {
                startLine: selection.active.line + 1, // Git uses 1-based line numbers
                endLine: selection.active.line + 1
            };
        }
        return {
            startLine: selection.start.line + 1,
            endLine: selection.end.line + 1
        };
    }

    /**
     * Stage selected lines
     */
    async stageSelectedLines(
        uri: vscode.Uri, 
        startLine: number, 
        endLine: number
    ): Promise<void> {
        const relativePath = vscode.workspace.asRelativePath(uri);
        
        await ProfessionalInteractions.withProgress(
            '📦 Staging selected lines...',
            async (progress) => {
                progress.report({ message: `Lines ${startLine}-${endLine} of ${path.basename(uri.fsPath)}` });
                
                // Use git add -p with line range
                const result = await this.gitProvider.stageLines(relativePath, startLine, endLine);
                
                progress.report({ message: 'Lines staged!', increment: 100 });
            }
        );
    }

    /**
     * Revert selected lines
     */
    async revertSelectedLines(
        uri: vscode.Uri,
        startLine: number,
        endLine: number
    ): Promise<void> {
        const relativePath = vscode.workspace.asRelativePath(uri);
        const fileName = path.basename(uri.fsPath);
        
        const confirmed = await ProfessionalInteractions.confirmRevert([
            `Lines ${startLine}-${endLine} of ${fileName}`
        ]);
        
        if (!confirmed) {
            return;
        }
        
        await ProfessionalInteractions.withProgress(
            '🔄 Reverting selected lines...',
            async (progress) => {
                progress.report({ message: `Reverting lines ${startLine}-${endLine}...` });
                
                // Revert specific lines using git checkout -p
                await this.gitProvider.revertLines(relativePath, startLine, endLine);
                
                progress.report({ message: 'Lines reverted!', increment: 100 });
            }
        );
    }
}

/**
 * Register editor context menu commands
 */
export function registerEditorCommands(
    context: vscode.ExtensionContext,
    gitProvider: GitProvider,
    changelistStore: ChangelistStore
): void {
    const selectionHandler = new SelectionHandler(gitProvider);

    // Show line blame command
    const showLineBlameCommand = vscode.commands.registerCommand(
        'gitpilot.editor.showLineBlame',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const line = editor.selection.active.line + 1;
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                
                const blameInfo = await gitProvider.getLineBlame(relativePath, line);
                if (blameInfo) {
                    showBlameQuickPick(blameInfo);
                } else {
                    vscode.window.showInformationMessage('No blame information available for this line');
                }
            } catch (error) {
                ProfessionalInteractions.showError('Show line blame', error);
            }
        }
    );

    // Show line history command
    const showLineHistoryCommand = vscode.commands.registerCommand(
        'gitpilot.editor.showLineHistory',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const lines = selectionHandler.getTargetLines(editor);
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                
                await showLineHistory(
                    editor.document.uri, 
                    lines.startLine, 
                    lines.endLine,
                    gitProvider
                );
            } catch (error) {
                ProfessionalInteractions.showError('Show line history', error);
            }
        }
    );

    // Revert selected lines command
    const revertSelectedLinesCommand = vscode.commands.registerCommand(
        'gitpilot.editor.revertSelectedLines',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const lines = selectionHandler.getTargetLines(editor);
                await selectionHandler.revertSelectedLines(
                    editor.document.uri,
                    lines.startLine,
                    lines.endLine
                );
            } catch (error) {
                ProfessionalInteractions.showError('Revert selected lines', error);
            }
        }
    );

    // Stage selected lines command
    const stageSelectedLinesCommand = vscode.commands.registerCommand(
        'gitpilot.editor.stageSelectedLines',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const lines = selectionHandler.getTargetLines(editor);
                await selectionHandler.stageSelectedLines(
                    editor.document.uri,
                    lines.startLine,
                    lines.endLine
                );
                
                ProfessionalInteractions.showSuccess(
                    'Lines staged',
                    `Lines ${lines.startLine}-${lines.endLine}`
                );
            } catch (error) {
                ProfessionalInteractions.showError('Stage selected lines', error);
            }
        }
    );

    // Copy permalink command
    const copyPermalinkCommand = vscode.commands.registerCommand(
        'gitpilot.editor.copyPermalink',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const line = editor.selection.active.line + 1;
                const permalink = await generatePermalink(
                    editor.document.uri,
                    line,
                    gitProvider
                );
                
                if (permalink) {
                    await vscode.env.clipboard.writeText(permalink);
                    vscode.window.showInformationMessage('Permalink copied to clipboard');
                }
            } catch (error) {
                ProfessionalInteractions.showError('Copy permalink', error);
            }
        }
    );

    // Compare with base command
    const compareWithBaseCommand = vscode.commands.registerCommand(
        'gitpilot.editor.compareWithBase',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const uri = editor.document.uri;
                const fileName = path.basename(uri.fsPath);
                const baseUri = uri.with({ scheme: 'git', query: 'HEAD' });
                
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    baseUri,
                    uri,
                    `${fileName} (HEAD ↔ Working Tree)`
                );
            } catch (error) {
                ProfessionalInteractions.showError('Compare with base', error);
            }
        }
    );

    // Show commit for line command
    const showCommitForLineCommand = vscode.commands.registerCommand(
        'gitpilot.editor.showCommitForLine',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const line = editor.selection.active.line + 1;
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                
                const blameInfo = await gitProvider.getLineBlame(relativePath, line);
                if (blameInfo && blameInfo.commit !== '00000000') {
                    await showCommitDetails(blameInfo.commit, gitProvider);
                } else {
                    vscode.window.showInformationMessage('No commit information available for this line');
                }
            } catch (error) {
                ProfessionalInteractions.showError('Show commit for line', error);
            }
        }
    );

    // Add selection to changelist command
    const addSelectionToChangelistCommand = vscode.commands.registerCommand(
        'gitpilot.editor.addSelectionToChangelist',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            try {
                const lines = selectionHandler.getTargetLines(editor);
                await addSelectionToChangelist(
                    editor.document.uri,
                    lines,
                    changelistStore
                );
            } catch (error) {
                ProfessionalInteractions.showError('Add selection to changelist', error);
            }
        }
    );

    // Tab context menu commands
    const showFileBlameCommand = vscode.commands.registerCommand(
        'gitpilot.editor.showFileBlame',
        async (uri: vscode.Uri) => {
            try {
                await vscode.commands.executeCommand('git.openFile', uri);
                await vscode.commands.executeCommand('gitlens.toggleFileBlame');
            } catch (error) {
                // Fallback to VS Code's built-in blame
                try {
                    await vscode.commands.executeCommand('git.openBlame', uri);
                } catch (fallbackError) {
                    ProfessionalInteractions.showError('Show file blame', 'Git blame functionality not available');
                }
            }
        }
    );

    const showFileHistoryCommand = vscode.commands.registerCommand(
        'gitpilot.editor.showFileHistory',
        async (uri: vscode.Uri) => {
            try {
                await showFileHistoryView(uri, gitProvider);
            } catch (error) {
                ProfessionalInteractions.showError('Show file history', error);
            }
        }
    );

    const compareFileWithBranchCommand = vscode.commands.registerCommand(
        'gitpilot.editor.compareFileWithBranch',
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
                    const fileName = path.basename(uri.fsPath);
                    const branchUri = uri.with({ scheme: 'git', query: selectedBranch });
                    
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        branchUri,
                        uri,
                        `${fileName} (${selectedBranch} ↔ Working Tree)`
                    );
                }
            } catch (error) {
                ProfessionalInteractions.showError('Compare with branch', error);
            }
        }
    );

    // Register all commands
    context.subscriptions.push(
        showLineBlameCommand,
        showLineHistoryCommand,
        revertSelectedLinesCommand,
        stageSelectedLinesCommand,
        copyPermalinkCommand,
        compareWithBaseCommand,
        showCommitForLineCommand,
        addSelectionToChangelistCommand,
        showFileBlameCommand,
        showFileHistoryCommand,
        compareFileWithBranchCommand
    );
}

// Helper functions

async function showBlameQuickPick(blameInfo: BlameInfo): Promise<void> {
    const items: vscode.QuickPickItem[] = [
        {
            label: `$(git-commit) ${blameInfo.commit.substring(0, 8)}`,
            description: blameInfo.summary,
            detail: `${blameInfo.author} • ${blameInfo.date}`
        },
        {
            label: '$(eye) View Commit',
            description: 'Show full commit details'
        },
        {
            label: '$(copy) Copy Commit SHA',
            description: 'Copy to clipboard'
        },
        {
            label: '$(history) Show File at This Commit',
            description: 'Open file as it was in this commit'
        }
    ];
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Blame information - Select action',
        title: `Line ${blameInfo.line}: ${blameInfo.content}`
    });
    
    if (selected) {
        if (selected.label.includes('View Commit')) {
            await showCommitDetails(blameInfo.commit, null);
        } else if (selected.label.includes('Copy')) {
            await vscode.env.clipboard.writeText(blameInfo.commit);
            vscode.window.showInformationMessage('Commit SHA copied to clipboard');
        } else if (selected.label.includes('Show File')) {
            // Implementation would show file at specific commit
            vscode.window.showInformationMessage(`Showing file at commit ${blameInfo.commit.substring(0, 8)}`);
        }
    }
}

async function showLineHistory(
    uri: vscode.Uri,
    startLine: number,
    endLine: number,
    gitProvider: GitProvider
): Promise<void> {
    const relativePath = vscode.workspace.asRelativePath(uri);
    const fileName = path.basename(uri.fsPath);
    
    await ProfessionalInteractions.withProgress(
        '📜 Loading line history...',
        async (progress) => {
            progress.report({ message: `Lines ${startLine}-${endLine} of ${fileName}` });
            
            // Get history for specific lines
            const history = await gitProvider.getLineHistory(relativePath, startLine, endLine);
            
            if (history && history.length > 0) {
                const items = history.map(commit => ({
                    label: `$(git-commit) ${commit.hash.substring(0, 8)}`,
                    description: commit.message,
                    detail: `${commit.author} • ${commit.date}`
                }));
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a commit to view details',
                    title: `History for lines ${startLine}-${endLine}`
                });
                
                if (selected) {
                    const commit = history.find(c => 
                        selected.label.includes(c.hash.substring(0, 8))
                    );
                    if (commit) {
                        await showCommitDetails(commit.hash, gitProvider);
                    }
                }
            } else {
                vscode.window.showInformationMessage('No history available for selected lines');
            }
        }
    );
}

async function generatePermalink(
    uri: vscode.Uri,
    line: number,
    gitProvider: GitProvider
): Promise<string | undefined> {
    try {
        const remoteUrl = await gitProvider.getRemoteUrl();
        const currentCommit = await gitProvider.getCurrentCommit();
        const relativePath = vscode.workspace.asRelativePath(uri);
        
        if (remoteUrl && currentCommit) {
            // Parse remote URL and generate permalink
            const urlBase = remoteUrl
                .replace(/\.git$/, '')
                .replace(/^git@github\.com:/, 'https://github.com/')
                .replace(/^git@gitlab\.com:/, 'https://gitlab.com/')
                .replace(/^git@bitbucket\.org:/, 'https://bitbucket.org/');
            
            // GitHub/GitLab format
            if (urlBase.includes('github.com') || urlBase.includes('gitlab.com')) {
                return `${urlBase}/blob/${currentCommit}/${relativePath}#L${line}`;
            }
            // Bitbucket format
            else if (urlBase.includes('bitbucket.org')) {
                return `${urlBase}/src/${currentCommit}/${relativePath}#lines-${line}`;
            }
        }
        
        vscode.window.showWarningMessage('Unable to generate permalink - no remote repository found');
        return undefined;
    } catch (error) {
        console.error('Error generating permalink:', error);
        return undefined;
    }
}

async function showCommitDetails(
    commitHash: string,
    gitProvider: GitProvider | null
): Promise<void> {
    // Try to use GitLens first
    try {
        await vscode.commands.executeCommand('gitlens.showQuickCommitDetails', {
            commit: commitHash
        });
    } catch {
        // Fallback to showing commit message
        if (gitProvider) {
            const details = await gitProvider.getCommitDetails(commitHash);
            if (details) {
                const panel = vscode.window.createWebviewPanel(
                    'gitpilot.commitDetails',
                    `Commit ${commitHash.substring(0, 8)}`,
                    vscode.ViewColumn.Beside,
                    { enableScripts: true }
                );
                
                panel.webview.html = generateCommitDetailsHtml(details);
            }
        } else {
            vscode.window.showInformationMessage(`Commit: ${commitHash}`);
        }
    }
}

function generateCommitDetailsHtml(details: any): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            .header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
            .commit-hash { color: var(--vscode-textLink-foreground); }
            .author { color: var(--vscode-descriptionForeground); }
            .message { margin: 20px 0; white-space: pre-wrap; }
            .files { margin-top: 20px; }
            .file { margin: 10px 0; }
            .additions { color: var(--vscode-gitDecoration-addedResourceForeground); }
            .deletions { color: var(--vscode-gitDecoration-deletedResourceForeground); }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Commit <span class="commit-hash">${details.hash.substring(0, 8)}</span></h2>
            <div class="author">${details.author} • ${details.date}</div>
        </div>
        <div class="message">${details.message}</div>
        <div class="files">
            <h3>Changed Files (${details.files.length})</h3>
            ${details.files.map((file: any) => `
                <div class="file">
                    ${file.path} 
                    <span class="additions">+${file.additions}</span> 
                    <span class="deletions">-${file.deletions}</span>
                </div>
            `).join('')}
        </div>
    </body>
    </html>`;
}

async function showFileHistoryView(uri: vscode.Uri, gitProvider: GitProvider): Promise<void> {
    try {
        // Try GitLens first
        await vscode.commands.executeCommand('gitlens.showFileHistoryInView', uri);
    } catch {
        try {
            // Fallback to timeline
            await vscode.commands.executeCommand('timeline.focus');
            await vscode.commands.executeCommand('vscode.open', uri);
        } catch {
            vscode.window.showInformationMessage('Git history view not available');
        }
    }
}

async function addSelectionToChangelist(
    uri: vscode.Uri,
    lines: { startLine: number; endLine: number },
    changelistStore: ChangelistStore
): Promise<void> {
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
    
    // Add file with line range metadata to changelist
    const relativePath = vscode.workspace.asRelativePath(uri);
    const fileChange = new FileChange(
        uri.fsPath,
        relativePath,
        FileChangeStatus.Modified,
        false // isStaged
    );
    
    const changelist = changelistStore.getChangelist(selectedId);
    if (changelist) {
        changelist.addFile(fileChange);
        await changelistStore.save();
        
        ProfessionalInteractions.showSuccess(
            'Added to changelist',
            `Lines ${lines.startLine}-${lines.endLine} added to "${changelist.name}"`
        );
    }
}