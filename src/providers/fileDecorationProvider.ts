import * as vscode from 'vscode';
import { GitProvider } from './gitProvider';

/**
 * Git file status types with corresponding decorations
 */
export enum GitFileStatus {
    Modified = 'M',
    Added = 'A',
    Deleted = 'D',
    Untracked = 'U',
    Conflicted = 'C',
    Ignored = 'I',
    Clean = 'CLEAN'
}

/**
 * File decoration colors and badges for Git status
 */
export interface GitFileDecoration {
    color: vscode.ThemeColor;
    badge: string;
    tooltip: string;
    propagate: boolean;
}

/**
 * Git file decoration provider that shows file status in Explorer
 * Implements real-time Git status visualization with professional color scheme
 */
export class GitFileDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private fileStatusCache = new Map<string, GitFileStatus>();
    private folderStatusCache = new Map<string, Set<GitFileStatus>>();
    private updateTimer: NodeJS.Timeout | undefined;

    // Git status color scheme - professional IDE colors
    private readonly decorations: Map<GitFileStatus, GitFileDecoration> = new Map([
        [GitFileStatus.Modified, {
            color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
            badge: 'M',
            tooltip: 'Modified in working tree',
            propagate: true
        }],
        [GitFileStatus.Added, {
            color: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
            badge: 'A',
            tooltip: 'Added to index',
            propagate: true
        }],
        [GitFileStatus.Deleted, {
            color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
            badge: 'D',
            tooltip: 'Deleted from working tree',
            propagate: true
        }],
        [GitFileStatus.Untracked, {
            color: new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
            badge: 'U',
            tooltip: 'Untracked file',
            propagate: true
        }],
        [GitFileStatus.Conflicted, {
            color: new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'),
            badge: 'C',
            tooltip: 'Merge conflict',
            propagate: true
        }],
        [GitFileStatus.Ignored, {
            color: new vscode.ThemeColor('gitDecoration.ignoredResourceForeground'),
            badge: '!',
            tooltip: 'Ignored by Git',
            propagate: false
        }]
    ]);

    constructor(private gitProvider: GitProvider) {
        this.setupEventListeners();
        this.scheduleUpdate();
    }

    /**
     * Setup event listeners for Git changes
     */
    private setupEventListeners(): void {
        // Listen to file system changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        watcher.onDidChange(() => this.scheduleUpdate());
        watcher.onDidCreate(() => this.scheduleUpdate());
        watcher.onDidDelete(() => this.scheduleUpdate());

        // Listen to Git operations (if available)
        if (this.gitProvider.onDidChangeStatus) {
            this.gitProvider.onDidChangeStatus(() => this.scheduleUpdate());
        }
    }

    /**
     * Schedule decoration update with debouncing
     */
    private scheduleUpdate(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.updateTimer = setTimeout(() => {
            this.updateFileStatus();
        }, 300); // Debounce for 300ms
    }

    /**
     * Update file status cache and notify VSCode of changes
     */
    private async updateFileStatus(): Promise<void> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return;

            // Clear previous cache
            this.fileStatusCache.clear();
            this.folderStatusCache.clear();

            // Get Git status
            const status = await this.gitProvider.getStatus();

            // Process all file changes
            const allFiles = [
                ...status.modified,
                ...status.created,
                ...status.deleted,
                ...status.renamed,
                ...status.conflicted,
                ...status.untracked
            ];

            for (const filePath of allFiles) {
                const gitStatus = this.determineGitStatus(filePath, status);
                this.fileStatusCache.set(filePath, gitStatus);
                this.propagateToParentFolders(filePath, gitStatus);
            }

            // Notify VSCode of decoration changes
            this._onDidChangeFileDecorations.fire(undefined);

        } catch (error) {
            console.error('Failed to update file decorations:', error);
        }
    }

    /**
     * Determine Git status for a specific file
     */
    private determineGitStatus(filePath: string, status: any): GitFileStatus {
        if (status.conflicted.includes(filePath)) {
            return GitFileStatus.Conflicted;
        }
        if (status.created.includes(filePath)) {
            return GitFileStatus.Added;
        }
        if (status.deleted.includes(filePath)) {
            return GitFileStatus.Deleted;
        }
        if (status.modified.includes(filePath)) {
            return GitFileStatus.Modified;
        }
        if (status.untracked.includes(filePath)) {
            return GitFileStatus.Untracked;
        }
        return GitFileStatus.Clean;
    }

    /**
     * Propagate file status to parent folders
     */
    private propagateToParentFolders(filePath: string, status: GitFileStatus): void {
        const decoration = this.decorations.get(status);
        if (!decoration?.propagate) return;

        const pathParts = filePath.split('/');
        let currentPath = '';

        for (let i = 0; i < pathParts.length - 1; i++) {
            currentPath += pathParts[i];
            
            if (!this.folderStatusCache.has(currentPath)) {
                this.folderStatusCache.set(currentPath, new Set());
            }
            
            this.folderStatusCache.get(currentPath)!.add(status);
            currentPath += '/';
        }
    }

    /**
     * Provide file decoration for VSCode Explorer
     */
    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return undefined;

        const relativePath = vscode.workspace.asRelativePath(uri);
        
        // Check if it's a file with Git status
        const fileStatus = this.fileStatusCache.get(relativePath);
        if (fileStatus && fileStatus !== GitFileStatus.Clean) {
            return this.createFileDecoration(fileStatus);
        }

        // Check if it's a folder with Git changes
        const folderStatuses = this.folderStatusCache.get(relativePath);
        if (folderStatuses && folderStatuses.size > 0) {
            return this.createFolderDecoration(folderStatuses);
        }

        return undefined;
    }

    /**
     * Create file decoration for Git status
     */
    private createFileDecoration(status: GitFileStatus): vscode.FileDecoration {
        const decoration = this.decorations.get(status);
        if (!decoration) return {};

        return {
            badge: decoration.badge,
            color: decoration.color,
            tooltip: decoration.tooltip,
            propagate: decoration.propagate
        };
    }

    /**
     * Create folder decoration showing aggregated status
     */
    private createFolderDecoration(statuses: Set<GitFileStatus>): vscode.FileDecoration {
        // Priority order for folder decoration
        const priority = [
            GitFileStatus.Conflicted,
            GitFileStatus.Modified,
            GitFileStatus.Added,
            GitFileStatus.Deleted,
            GitFileStatus.Untracked
        ];

        for (const status of priority) {
            if (statuses.has(status)) {
                const decoration = this.decorations.get(status);
                if (decoration) {
                    return {
                        badge: decoration.badge,
                        color: decoration.color,
                        tooltip: this.createFolderTooltip(statuses),
                        propagate: false // Don't propagate folder decorations further
                    };
                }
            }
        }

        return {};
    }

    /**
     * Create tooltip for folder showing all contained statuses
     */
    private createFolderTooltip(statuses: Set<GitFileStatus>): string {
        const statusDescriptions: string[] = [];

        for (const status of statuses) {
            const decoration = this.decorations.get(status);
            if (decoration) {
                statusDescriptions.push(decoration.tooltip);
            }
        }

        return `Git changes: ${statusDescriptions.join(', ')}`;
    }

    /**
     * Force refresh of all decorations
     */
    public refresh(): void {
        this.scheduleUpdate();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this._onDidChangeFileDecorations.dispose();
    }
}