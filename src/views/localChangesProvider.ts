import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { ChangeListManager } from './changeListManager';
import { Changelist } from '../models/changelist';
import { FileChange } from '../models/fileChange';

export class ChangeListTreeItem extends vscode.TreeItem {
    constructor(
        public readonly changeList: Changelist
    ) {
        super(changeList.getDisplayName(), vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'changelist';
        this.iconPath = new vscode.ThemeIcon('git-commit');
        this.tooltip = changeList.getTooltip();
        this.id = `changelist-${changeList.id}`;
    }
}

export class FileChangeTreeItem extends vscode.TreeItem {
    constructor(
        public readonly fileChange: FileChange,
        public readonly changeListId: string
    ) {
        super(fileChange.relativePath, vscode.TreeItemCollapsibleState.None);
        this.contextValue = fileChange.getContextValue();
        this.iconPath = fileChange.getStatusIcon();
        this.tooltip = fileChange.getTooltip();
        this.description = fileChange.getStatusLabel();
        this.id = `file-${changeListId}-${fileChange.path}`;
        
        // Enable checkbox functionality
        this.checkboxState = fileChange.isSelected 
            ? vscode.TreeItemCheckboxState.Checked 
            : vscode.TreeItemCheckboxState.Unchecked;
            
        // Double-click to show diff
        this.command = {
            command: 'git-pilot.showFileDiff',
            title: 'Show Diff',
            arguments: [fileChange.path]
        };
        
        // Set staging context for menus
        vscode.commands.executeCommand('setContext', 'gitFileStaged', fileChange.isStaged);
    }
}

export class LocalChangesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private changeListManager: ChangeListManager;
    
    constructor(private gitProvider: GitProvider) {
        this.changeListManager = new ChangeListManager(gitProvider);
        this.setupEventListeners();
        this.setupFileWatcher();
        
        // Initial refresh
        this.refresh();
    }
    
    private setupEventListeners(): void {
        this.changeListManager.onDidChangeChangeList(() => {
            this._onDidChangeTreeData.fire();
        });
    }
    
    private setupFileWatcher(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
    }
    
    async refresh(): Promise<void> {
        await this.changeListManager.refresh();
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // Return top-level changelists
            const changeLists = this.changeListManager.getAllChangeLists();
            return changeLists
                .filter(cl => cl.hasFiles)
                .map(cl => new ChangeListTreeItem(cl));
        }
        
        if (element instanceof ChangeListTreeItem) {
            // Return files in this changelist
            const changeList = element.changeList;
            return changeList.files.map((file: FileChange) => 
                new FileChangeTreeItem(file, changeList.id)
            );
        }
        
        return [];
    }
    
    // Checkbox state change handler
    async onDidChangeCheckboxState(items: readonly vscode.TreeItem[]): Promise<void> {
        for (const item of items) {
            if (item instanceof FileChangeTreeItem) {
                this.changeListManager.toggleFileSelection(item.changeListId, item.fileChange.path);
            }
        }
    }
    
    // Public API for external commands
    getChangeListManager(): ChangeListManager {
        return this.changeListManager;
    }
    
    toggleFileSelection(filePath: string): void {
        this.changeListManager.toggleFileSelection('default', filePath);
    }
    
    selectAllFiles(): void {
        this.changeListManager.selectAllFiles('default');
    }
    
    deselectAllFiles(): void {
        this.changeListManager.deselectAllFiles('default');
    }
    
    async stageSelectedFiles(): Promise<void> {
        await this.changeListManager.stageSelectedFiles('default');
    }
    
    async unstageSelectedFiles(): Promise<void> {
        await this.changeListManager.unstageSelectedFiles('default');
    }
    
    getSelectedFiles(): string[] {
        return this.changeListManager.getSelectedFilePaths('default');
    }
    
    hasSelectedFiles(): boolean {
        return this.changeListManager.hasSelectedFiles('default');
    }
    
    dispose(): void {
        this.changeListManager.dispose();
        this._onDidChangeTreeData.dispose();
    }
}