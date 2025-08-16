import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

/**
 * Represents a Git branch with metadata
 */
export interface GitBranch {
    name: string;
    current: boolean;
    remote: boolean;
    upstream?: string;
    ahead?: number;
    behind?: number;
    lastCommit?: {
        hash: string;
        message: string;
        author: string;
        date: Date;
    };
}

/**
 * Tree item for Git branches with enhanced visualization
 */
export class BranchTreeItem extends vscode.TreeItem {
    constructor(
        public readonly branch: GitBranch,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(branch.name, collapsibleState);
        
        this.tooltip = this.generateTooltip();
        this.iconPath = this.getIcon();
        this.description = this.generateDescription();
        this.contextValue = this.getContextValue();
        
        // Highlight current branch
        if (branch.current) {
            this.resourceUri = vscode.Uri.parse(`branch:current:${branch.name}`);
        }
    }
    
    private generateTooltip(): string {
        const lines = [`Branch: ${this.branch.name}`];
        
        if (this.branch.current) {
            lines.push('✓ Current branch');
        }
        
        if (this.branch.upstream) {
            lines.push(`Upstream: ${this.branch.upstream}`);
            
            if (this.branch.ahead && this.branch.ahead > 0) {
                lines.push(`Ahead: ${this.branch.ahead} commits`);
            }
            
            if (this.branch.behind && this.branch.behind > 0) {
                lines.push(`Behind: ${this.branch.behind} commits`);
            }
        }
        
        if (this.branch.lastCommit) {
            lines.push(`Last commit: ${this.branch.lastCommit.message}`);
            lines.push(`By: ${this.branch.lastCommit.author}`);
            lines.push(`Date: ${this.branch.lastCommit.date.toLocaleDateString()}`);
        }
        
        return lines.join('\n');
    }
    
    private getIcon(): vscode.ThemeIcon {
        if (this.branch.current) {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
        }
        
        if (this.branch.remote) {
            return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        }
        
        return new vscode.ThemeIcon('git-branch');
    }
    
    private generateDescription(): string {
        const parts: string[] = [];
        
        if (this.branch.ahead && this.branch.ahead > 0) {
            parts.push(`↑${this.branch.ahead}`);
        }
        
        if (this.branch.behind && this.branch.behind > 0) {
            parts.push(`↓${this.branch.behind}`);
        }
        
        if (this.branch.upstream && !this.branch.remote) {
            parts.push(`→ ${this.branch.upstream.split('/').pop()}`);
        }
        
        return parts.join(' ');
    }
    
    private getContextValue(): string {
        const parts = ['branch'];
        
        if (this.branch.current) {
            parts.push('current');
        } else {
            parts.push('other');
        }
        
        if (this.branch.remote) {
            parts.push('remote');
        } else {
            parts.push('local');
        }
        
        return parts.join('.');
    }
}

/**
 * Enhanced tree provider for Git branch management
 */
export class BranchTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = 
        new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private branches: GitBranch[] = [];
    private updateTimer: NodeJS.Timeout | undefined;

    constructor(private gitProvider: GitProvider) {
        this.setupEventListeners();
        this.refresh();
    }

    private setupEventListeners(): void {
        // Listen to Git operations that might affect branches (if available)
        if (this.gitProvider.onDidChangeStatus) {
            this.gitProvider.onDidChangeStatus(() => this.scheduleRefresh());
        }
        
        // Listen to workspace changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/.git/refs/**');
        watcher.onDidChange(() => this.scheduleRefresh());
        watcher.onDidCreate(() => this.scheduleRefresh());
        watcher.onDidDelete(() => this.scheduleRefresh());
    }

    private scheduleRefresh(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.updateTimer = setTimeout(() => {
            this.refresh();
        }, 500);
    }

    async refresh(): Promise<void> {
        try {
            this.branches = await this.loadBranches();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Failed to refresh branches:', error);
        }
    }

    private async loadBranches(): Promise<GitBranch[]> {
        try {
            const branches: GitBranch[] = [];
            
            // Get all branches (local and remote)
            const branchResult = await this.gitProvider.getBranches();
            const currentBranch = await this.gitProvider.getCurrentBranch();
            
            // Process local branches
            for (const branch of branchResult.all) {
                if (!branch.startsWith('remotes/')) {
                    const branchInfo = await this.getBranchInfo(branch, currentBranch === branch);
                    branches.push(branchInfo);
                }
            }
            
            // Process remote branches
            for (const branch of branchResult.all) {
                if (branch.startsWith('remotes/')) {
                    const branchName = branch.replace('remotes/', '');
                    const branchInfo = await this.getBranchInfo(branchName, false, true);
                    branches.push(branchInfo);
                }
            }
            
            // Sort branches: current first, then local, then remote
            return branches.sort((a, b) => {
                if (a.current) return -1;
                if (b.current) return 1;
                if (!a.remote && b.remote) return -1;
                if (a.remote && !b.remote) return 1;
                return a.name.localeCompare(b.name);
            });
            
        } catch (error) {
            console.error('Failed to load branches:', error);
            return [];
        }
    }

    private async getBranchInfo(branchName: string, isCurrent: boolean, isRemote: boolean = false): Promise<GitBranch> {
        const branch: GitBranch = {
            name: branchName,
            current: isCurrent,
            remote: isRemote
        };

        try {
            // Get upstream information for local branches
            if (!isRemote) {
                const upstream = await this.getUpstreamBranch(branchName);
                if (upstream) {
                    branch.upstream = upstream;
                    const status = await this.getBranchStatus(branchName, upstream);
                    branch.ahead = status.ahead;
                    branch.behind = status.behind;
                }
            }

            // Get last commit information
            branch.lastCommit = await this.getLastCommit(branchName);

        } catch (error) {
            console.error(`Failed to get info for branch ${branchName}:`, error);
        }

        return branch;
    }

    private async getUpstreamBranch(branchName: string): Promise<string | undefined> {
        try {
            const result = await this.gitProvider.raw(['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`]);
            return result.trim();
        } catch {
            return undefined;
        }
    }

    private async getBranchStatus(localBranch: string, upstreamBranch: string): Promise<{ahead: number, behind: number}> {
        try {
            const aheadResult = await this.gitProvider.raw(['rev-list', '--count', `${upstreamBranch}..${localBranch}`]);
            const behindResult = await this.gitProvider.raw(['rev-list', '--count', `${localBranch}..${upstreamBranch}`]);
            
            return {
                ahead: parseInt(aheadResult.trim()) || 0,
                behind: parseInt(behindResult.trim()) || 0
            };
        } catch {
            return { ahead: 0, behind: 0 };
        }
    }

    private async getLastCommit(branchName: string): Promise<GitBranch['lastCommit']> {
        try {
            const result = await this.gitProvider.raw([
                'log', '-1', '--pretty=format:%H|%s|%an|%ai', branchName
            ]);
            
            const [hash, message, author, dateStr] = result.trim().split('|');
            
            return {
                hash: hash.substring(0, 8),
                message: message || 'No commit message',
                author: author || 'Unknown',
                date: new Date(dateStr)
            };
        } catch {
            return undefined;
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // Return all branches grouped
            const items: vscode.TreeItem[] = [];
            
            // Add section headers
            const localBranches = this.branches.filter(b => !b.remote);
            const remoteBranches = this.branches.filter(b => b.remote);
            
            if (localBranches.length > 0) {
                items.push(new vscode.TreeItem('Local Branches', vscode.TreeItemCollapsibleState.Expanded));
                items.push(...localBranches.map(b => new BranchTreeItem(b, vscode.TreeItemCollapsibleState.None)));
            }
            
            if (remoteBranches.length > 0) {
                items.push(new vscode.TreeItem('Remote Branches', vscode.TreeItemCollapsibleState.Collapsed));
                items.push(...remoteBranches.map(b => new BranchTreeItem(b, vscode.TreeItemCollapsibleState.None)));
            }
            
            return items;
        }
        
        return [];
    }

    // Branch management methods
    async createBranch(branchName: string, baseBranch?: string): Promise<void> {
        try {
            if (baseBranch) {
                await this.gitProvider.checkoutBranch(branchName, baseBranch);
            } else {
                await this.gitProvider.checkoutBranch(branchName);
            }
            
            vscode.window.showInformationMessage(`Branch '${branchName}' created successfully`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
        }
    }

    async switchToBranch(branchName: string): Promise<void> {
        try {
            // Check for dirty working tree
            const status = await this.gitProvider.getStatus();
            const hasDirtyFiles = status.modified.length > 0 || status.created.length > 0 || status.deleted.length > 0;
            
            if (hasDirtyFiles) {
                const choice = await vscode.window.showWarningMessage(
                    'You have uncommitted changes. What would you like to do?',
                    'Stash Changes',
                    'Discard Changes',
                    'Cancel'
                );
                
                if (choice === 'Stash Changes') {
                    await this.gitProvider.stash('Auto-stash before branch switch');
                } else if (choice === 'Discard Changes') {
                    await this.gitProvider.reset(['--hard']);
                } else {
                    return; // Cancel
                }
            }
            
            await this.gitProvider.checkout(branchName);
            vscode.window.showInformationMessage(`Switched to branch '${branchName}'`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to switch branch: ${error}`);
        }
    }

    async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
        try {
            const currentBranch = await this.gitProvider.getCurrentBranch();
            if (currentBranch === branchName) {
                vscode.window.showErrorMessage('Cannot delete the current branch');
                return;
            }
            
            const choice = await vscode.window.showWarningMessage(
                `Are you sure you want to delete branch '${branchName}'?`,
                'Delete',
                'Cancel'
            );
            
            if (choice === 'Delete') {
                await this.gitProvider.deleteLocalBranch(branchName, force);
                vscode.window.showInformationMessage(`Branch '${branchName}' deleted successfully`);
                this.refresh();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete branch: ${error}`);
        }
    }

    async mergeBranch(branchName: string): Promise<void> {
        try {
            await this.gitProvider.merge([branchName]);
            vscode.window.showInformationMessage(`Branch '${branchName}' merged successfully`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Merge failed: ${error}`);
        }
    }

    async pushBranch(branchName: string): Promise<void> {
        try {
            await this.gitProvider.push('origin', branchName);
            vscode.window.showInformationMessage(`Branch '${branchName}' pushed successfully`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to push branch: ${error}`);
        }
    }

    async pullBranch(): Promise<void> {
        try {
            await this.gitProvider.pull();
            vscode.window.showInformationMessage('Pull completed successfully');
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Pull failed: ${error}`);
        }
    }

    dispose(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}