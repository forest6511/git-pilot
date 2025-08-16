import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

export class GitFileItem extends vscode.TreeItem {
    constructor(
        public readonly file: string,
        public readonly status: string
    ) {
        super(file, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'gitFile';
        this.command = {
            command: 'git-pilot.showFileDiff',
            title: 'Show Diff',
            arguments: [file]
        };
        
        // Set icon based on status
        this.iconPath = this.getStatusIcon(status);
        this.tooltip = `${status === 'M' ? 'Modified' : status === 'A' ? 'Added' : status === 'D' ? 'Deleted' : 'Untracked'}: ${file}`;
    }
    
    private getStatusIcon(status: string): vscode.ThemeIcon {
        switch(status) {
            case 'M': return new vscode.ThemeIcon('diff-modified');
            case 'A': return new vscode.ThemeIcon('diff-added');
            case 'D': return new vscode.ThemeIcon('diff-removed');
            case 'U': return new vscode.ThemeIcon('question');
            default: return new vscode.ThemeIcon('file');
        }
    }
}

export class GitMenuItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandId?: string,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
        public readonly children?: GitMenuItem[]
    ) {
        super(label, collapsibleState || vscode.TreeItemCollapsibleState.None);
        
        if (commandId) {
            this.command = {
                command: `git-pilot.${commandId}`,
                title: label,
                arguments: []
            };
        }
        
        // Add icons based on operation type
        this.iconPath = this.getIcon(commandId || label);
    }
    
    private getIcon(type: string): vscode.ThemeIcon {
        const iconMap: { [key: string]: string } = {
            'commit': 'git-commit',
            'commitDirectory': 'git-commit',
            'add': 'add',
            'gitignore': 'exclude',
            'push': 'arrow-up',
            'pull': 'arrow-down',
            'fetch': 'cloud-download',
            'branches': 'git-branch',
            'newTag': 'tag',
            'merge': 'git-merge',
            'rebase': 'references',
            'resetHead': 'discard',
            'stash': 'archive',
            'stashChanges': 'archive',
            'unstashChanges': 'package',
            'showHistory': 'history',
            'showDiff': 'diff',
            'compareRevision': 'diff-single',
            'compareBranch': 'git-compare',
            'showCurrentRevision': 'eye',
            'rollback': 'undo',
            'manageRemotes': 'remote',
            'clone': 'repo-clone',
            'Commit': 'git-commit',
            'Compare': 'diff',
            'History': 'history',
            'Remote': 'cloud',
            'Branches': 'git-branch',
            'Stash': 'archive',
            'GitHub': 'github'
        };
        
        return new vscode.ThemeIcon(iconMap[type] || 'circle-outline');
    }
}

export class GitPilotTreeProvider implements vscode.TreeDataProvider<GitMenuItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<GitMenuItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private gitProvider: GitProvider) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitMenuItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GitMenuItem): Thenable<GitMenuItem[]> {
        if (!element) {
            // Root menu structure for professional Git operations
            return Promise.resolve([
                // Commit section
                new GitMenuItem('Commit', undefined, vscode.TreeItemCollapsibleState.Expanded, [
                    new GitMenuItem('Commit Directory...', 'commit'),
                    new GitMenuItem('Add', 'add'),
                    new GitMenuItem('.gitignore/exclude', 'gitignore')
                ]),
                
                // Diff section
                new GitMenuItem('Compare', undefined, vscode.TreeItemCollapsibleState.Collapsed, [
                    new GitMenuItem('Show Diff', 'showDiff'),
                    new GitMenuItem('Compare with Revision...', 'compareRevision'),
                    new GitMenuItem('Compare with Branch...', 'compareBranch')
                ]),
                
                // History section
                new GitMenuItem('History', undefined, vscode.TreeItemCollapsibleState.Collapsed, [
                    new GitMenuItem('Show History', 'showHistory'),
                    new GitMenuItem('Show Current Revision', 'showCurrentRevision'),
                    new GitMenuItem('Rollback...', 'rollback')
                ]),
                
                // Remote operations
                new GitMenuItem('Remote', undefined, vscode.TreeItemCollapsibleState.Expanded, [
                    new GitMenuItem('Push...', 'push'),
                    new GitMenuItem('Pull...', 'pull'),
                    new GitMenuItem('Fetch', 'fetch')
                ]),
                
                // Branch operations
                new GitMenuItem('Branches', undefined, vscode.TreeItemCollapsibleState.Collapsed, [
                    new GitMenuItem('Branches...', 'branches'),
                    new GitMenuItem('New Tag...', 'newTag'),
                    new GitMenuItem('Merge...', 'merge'),
                    new GitMenuItem('Rebase...', 'rebase'),
                    new GitMenuItem('Reset HEAD...', 'resetHead')
                ]),
                
                // Stash operations
                new GitMenuItem('Stash', undefined, vscode.TreeItemCollapsibleState.Collapsed, [
                    new GitMenuItem('Stash Changes...', 'stash'),
                    new GitMenuItem('Unstash Changes...', 'unstashChanges')
                ]),
                
                // GitHub section
                new GitMenuItem('GitHub', undefined, vscode.TreeItemCollapsibleState.Collapsed, [
                    new GitMenuItem('Manage Remotes...', 'manageRemotes'),
                    new GitMenuItem('Clone...', 'clone')
                ])
            ]);
        }
        
        return Promise.resolve(element.children || []);
    }
}