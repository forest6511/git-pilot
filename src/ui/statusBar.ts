import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { ChangelistStore } from '../models/changelistStore';

/**
 * Professional IDE-style status bar with comprehensive Git information
 */
export class StatusBar implements vscode.Disposable {
    private branchStatusBarItem!: vscode.StatusBarItem;
    private changelistStatusBarItem!: vscode.StatusBarItem;
    private changesStatusBarItem!: vscode.StatusBarItem;
    private quickCommitStatusBarItem!: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    
    constructor() {
        this.createStatusBarItems();
        this.setupEventListeners();
    }
    
    private createStatusBarItems(): void {
        // Branch status item (priority 100)
        this.branchStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.branchStatusBarItem.text = "$(git-branch) Loading...";
        this.branchStatusBarItem.tooltip = "Current branch - Click to switch";
        this.branchStatusBarItem.command = 'git-pilot.branches';
        this.branchStatusBarItem.show();
        
        // Active changelist item (priority 99)
        this.changelistStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.changelistStatusBarItem.text = "$(list-selection) Default";
        this.changelistStatusBarItem.tooltip = "Active changelist - Click to switch";
        this.changelistStatusBarItem.command = 'gitpilot.changelist.switch';
        this.changelistStatusBarItem.show();
        
        // Changes count item (priority 98)
        this.changesStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            98
        );
        this.changesStatusBarItem.text = "$(git-compare) 0 changes";
        this.changesStatusBarItem.tooltip = "Pending changes - Click to view";
        this.changesStatusBarItem.command = 'gitpilot.openCommitDialog';
        this.changesStatusBarItem.show();
        
        // Quick commit button (priority 97)
        this.quickCommitStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            97
        );
        this.quickCommitStatusBarItem.text = "$(git-commit) Commit";
        this.quickCommitStatusBarItem.tooltip = "Quick commit (Ctrl+K)";
        this.quickCommitStatusBarItem.command = 'gitpilot.openCommitDialog';
        this.quickCommitStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        this.quickCommitStatusBarItem.show();
    }
    
    private setupEventListeners(): void {
        // Listen for file system changes to update status
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        fileWatcher.onDidChange(() => this.updateChangesCount());
        fileWatcher.onDidCreate(() => this.updateChangesCount());
        fileWatcher.onDidDelete(() => this.updateChangesCount());
        this.disposables.push(fileWatcher);
        
        // Listen for active editor changes
        const editorListener = vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateAll();
        });
        this.disposables.push(editorListener);
    }
    
    async updateAll(gitProvider?: GitProvider, changelistStore?: ChangelistStore): Promise<void> {
        if (gitProvider) {
            await this.updateBranch(gitProvider);
            await this.updateChangesCount(gitProvider);
        }
        
        if (changelistStore) {
            this.updateChangelist(changelistStore);
        }
    }
    
    async update(gitProvider: GitProvider, changelistStore?: ChangelistStore): Promise<void> {
        await this.updateAll(gitProvider, changelistStore);
    }
    
    private async updateBranch(gitProvider: GitProvider): Promise<void> {
        try {
            const branch = await gitProvider.getCurrentBranch();
            const isClean = await this.isRepositoryClean(gitProvider);
            
            // Enhanced branch display with status indicators
            let branchText = `$(git-branch) ${branch}`;
            let branchColor: vscode.ThemeColor | undefined;
            
            if (!isClean) {
                branchText += " $(warning)";
                branchColor = new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
            }
            
            this.branchStatusBarItem.text = branchText;
            this.branchStatusBarItem.color = branchColor;
            this.branchStatusBarItem.tooltip = this.generateBranchTooltip(branch || 'unknown', isClean);
        } catch (error) {
            this.branchStatusBarItem.text = "$(git-branch) No Git";
            this.branchStatusBarItem.tooltip = "No Git repository found";
            this.branchStatusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        }
    }
    
    private updateChangelist(changelistStore: ChangelistStore): void {
        try {
            const activeChangelist = changelistStore.getActiveChangelist();
            const selectedCount = activeChangelist.selectedFileCount;
            
            let changelistText = `$(list-selection) ${activeChangelist.name}`;
            let changelistColor: vscode.ThemeColor | undefined;
            
            if (selectedCount > 0) {
                changelistText += ` (${selectedCount})`;
                changelistColor = new vscode.ThemeColor('gitDecoration.addedResourceForeground');
            }
            
            this.changelistStatusBarItem.text = changelistText;
            this.changelistStatusBarItem.color = changelistColor;
            this.changelistStatusBarItem.tooltip = this.generateChangelistTooltip(activeChangelist);
        } catch (error) {
            this.changelistStatusBarItem.text = "$(list-selection) Default";
            this.changelistStatusBarItem.tooltip = "Default changelist";
        }
    }
    
    private async updateChangesCount(gitProvider?: GitProvider): Promise<void> {
        if (!gitProvider) {
            return;
        }
        
        try {
            // Get file counts from git status
            const status = await this.getGitStatus(gitProvider);
            const { modified, added, deleted, untracked } = status;
            const totalChanges = modified + added + deleted + untracked;
            
            let changesText: string;
            let changesColor: vscode.ThemeColor | undefined;
            let changesBackground: vscode.ThemeColor | undefined;
            
            if (totalChanges === 0) {
                changesText = "$(check) Clean";
                changesColor = new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
            } else {
                changesText = `$(git-compare) ${totalChanges} changes`;
                changesColor = new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
                if (totalChanges > 10) {
                    changesBackground = new vscode.ThemeColor('statusBarItem.warningBackground');
                }
            }
            
            this.changesStatusBarItem.text = changesText;
            this.changesStatusBarItem.color = changesColor;
            this.changesStatusBarItem.backgroundColor = changesBackground;
            this.changesStatusBarItem.tooltip = this.generateChangesTooltip(status);
            
            // Update quick commit button visibility
            this.quickCommitStatusBarItem.show();
            if (totalChanges === 0) {
                this.quickCommitStatusBarItem.hide();
            }
        } catch (error) {
            this.changesStatusBarItem.text = "$(git-compare) Unknown";
            this.changesStatusBarItem.tooltip = "Cannot read git status";
        }
    }
    
    private async isRepositoryClean(gitProvider: GitProvider): Promise<boolean> {
        try {
            const status = await this.getGitStatus(gitProvider);
            return status.modified + status.added + status.deleted + status.untracked === 0;
        } catch {
            return false;
        }
    }
    
    private async getGitStatus(gitProvider: GitProvider): Promise<{
        modified: number;
        added: number;
        deleted: number;
        untracked: number;
    }> {
        // This is a simplified implementation
        // In a real implementation, you would parse git status output
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return { modified: 0, added: 0, deleted: 0, untracked: 0 };
        }
        
        try {
            // Use VSCode's built-in git API if available
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                const repository = git.repositories[0];
                
                if (repository) {
                    const changes = repository.state.workingTreeChanges;
                    const indexed = repository.state.indexChanges;
                    const untracked = repository.state.untrackedChanges;
                    
                    return {
                        modified: changes.length,
                        added: indexed.length,
                        deleted: 0, // Simplified
                        untracked: untracked.length
                    };
                }
            }
        } catch {
            // Fallback to default values
        }
        
        return { modified: 0, added: 0, deleted: 0, untracked: 0 };
    }
    
    private generateBranchTooltip(branch: string, isClean: boolean): string {
        const lines = [
            `🌿 Current Branch: ${branch}`,
            `📊 Status: ${isClean ? 'Clean' : 'Has Changes'}`,
            '',
            '🔧 Quick Actions:',
            '• Click to switch branches',
            '• Ctrl+B for branch menu',
            '• Ctrl+T to pull changes'
        ];
        
        if (!isClean) {
            lines.splice(2, 0, '⚠️ Uncommitted changes present');
        }
        
        return lines.join('\n');
    }
    
    private generateChangelistTooltip(changelist: any): string {
        const lines = [
            `📁 Active Changelist: ${changelist.name}`,
            `📄 Total Files: ${changelist.fileCount}`,
            `✅ Selected Files: ${changelist.selectedFileCount}`,
            '',
            '🔧 Quick Actions:',
            '• Click to switch changelists',
            '• Alt+Shift+C for changelist menu',
            '• Alt+Shift+N to create new'
        ];
        
        if (changelist.description) {
            lines.splice(3, 0, `📝 Description: ${changelist.description}`);
        }
        
        return lines.join('\n');
    }
    
    private generateChangesTooltip(status: {
        modified: number;
        added: number;
        deleted: number;
        untracked: number;
    }): string {
        const { modified, added, deleted, untracked } = status;
        const total = modified + added + deleted + untracked;
        
        if (total === 0) {
            return [
                '✅ Repository is clean',
                '',
                '🔧 Quick Actions:',
                '• Ctrl+T to pull changes',
                '• Ctrl+K to commit'
            ].join('\n');
        }
        
        const lines = [
            `📊 Pending Changes: ${total}`,
            ''
        ];
        
        if (modified > 0) lines.push(`📝 Modified: ${modified}`);
        if (added > 0) lines.push(`➕ Added: ${added}`);
        if (deleted > 0) lines.push(`❌ Deleted: ${deleted}`);
        if (untracked > 0) lines.push(`❓ Untracked: ${untracked}`);
        
        lines.push('');
        lines.push('🔧 Quick Actions:');
        lines.push('• Click to open commit dialog');
        lines.push('• Ctrl+K to commit');
        lines.push('• Ctrl+A to select all');
        
        return lines.join('\n');
    }
    
    dispose(): void {
        this.branchStatusBarItem.dispose();
        this.changelistStatusBarItem.dispose();
        this.changesStatusBarItem.dispose();
        this.quickCommitStatusBarItem.dispose();
        
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}