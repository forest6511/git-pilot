import * as vscode from 'vscode';
import { ShelveStore } from '../models/shelveStore';
import { Shelf } from '../models/shelf';
import { ShelvedFile } from '../models/shelvedFile';

export class ShelfTreeItem extends vscode.TreeItem {
    constructor(
        public readonly shelf: Shelf
    ) {
        super(shelf.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'shelf';
        this.tooltip = shelf.getTooltip();
        this.iconPath = new vscode.ThemeIcon('archive', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        this.description = shelf.timestamp.toLocaleDateString();
        this.id = `shelf-${shelf.id}`;
        
        // Add status indicators
        if (shelf.changelistId) {
            this.description += ` • From changelist`;
        }
        
        if (shelf.fileCount === 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description += ` • Empty`;
        }
    }
}

export class ShelvedFileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly file: ShelvedFile,
        public readonly shelfId: string
    ) {
        super(file.relativePath, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'shelvedFile';
        this.tooltip = this.getDetailedTooltip();
        this.iconPath = this.getStatusIcon();
        this.description = file.getStatusLabel();
        this.id = `shelvedfile-${shelfId}-${file.path}`;
        
        // Double-click to preview file
        this.command = {
            command: 'gitpilot.shelf.previewFile',
            title: 'Preview Shelved File',
            arguments: [this.shelfId, this.file.path]
        };
    }

    private getDetailedTooltip(): string {
        const sizeInfo = this.file.getSizeInfo();
        const lines = [
            `File: ${this.file.relativePath}`,
            `Status: ${this.file.getStatusLabel()}`,
            `Size: ${sizeInfo.shelvedSize} bytes`,
            `Path: ${this.file.path}`
        ];

        if (sizeInfo.sizeDelta !== 0) {
            const delta = sizeInfo.sizeDelta > 0 ? `+${sizeInfo.sizeDelta}` : `${sizeInfo.sizeDelta}`;
            lines.push(`Size change: ${delta} bytes`);
        }

        return lines.join('\n');
    }

    private getStatusIcon(): vscode.ThemeIcon {
        switch (this.file.status) {
            case 'M':
                return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
            case 'A':
                return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
            case 'D':
                return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
            case 'R':
                return new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground'));
            case 'C':
                return new vscode.ThemeIcon('files', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
            case 'U':
                return new vscode.ThemeIcon('question', new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'));
            case 'X':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

export class ShelveTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private shelveStore: ShelveStore) {
        this.shelveStore.onDidChangeShelves(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // Return all shelves
            const shelves = this.shelveStore.getAllShelves();
            
            if (shelves.length === 0) {
                // Show placeholder when no shelves exist
                const placeholder = new vscode.TreeItem('No shelves found', vscode.TreeItemCollapsibleState.None);
                placeholder.description = 'Create a shelf to get started';
                placeholder.iconPath = new vscode.ThemeIcon('info');
                placeholder.contextValue = 'noShelves';
                return [placeholder];
            }
            
            return shelves.map(shelf => new ShelfTreeItem(shelf));
        }

        if (element instanceof ShelfTreeItem) {
            // Return files in shelf
            const files = element.shelf.files;
            
            if (files.length === 0) {
                const placeholder = new vscode.TreeItem('No files in shelf', vscode.TreeItemCollapsibleState.None);
                placeholder.description = 'This shelf is empty';
                placeholder.iconPath = new vscode.ThemeIcon('circle-slash');
                placeholder.contextValue = 'emptyShelf';
                return [placeholder];
            }
            
            return files.map(file => 
                new ShelvedFileTreeItem(file, element.shelf.id)
            );
        }

        return [];
    }

    // Public API for commands
    async createShelf(name: string, files: any[], changelistId?: string): Promise<void> {
        try {
            await this.shelveStore.createShelf(name, files, { 
                removeFromWorkspace: false,
                description: `Created from GitPilot at ${new Date().toLocaleString()}`
            });
            this.refresh();
            vscode.window.showInformationMessage(`Created shelf: ${name}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create shelf: ${error}`);
            throw error;
        }
    }

    async deleteShelf(shelfId: string): Promise<void> {
        try {
            await this.shelveStore.deleteShelf(shelfId);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete shelf: ${error}`);
            throw error;
        }
    }

    async unshelveShelf(shelfId: string, options: { keepShelf?: boolean; forceMerge?: boolean } = {}): Promise<void> {
        try {
            await this.shelveStore.unshelve(shelfId, options);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to unshelve: ${error}`);
            throw error;
        }
    }

    async previewUnshelve(shelfId: string): Promise<any> {
        try {
            return await this.shelveStore.previewUnshelve(shelfId);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to preview unshelve: ${error}`);
            throw error;
        }
    }

    getShelf(shelfId: string): Shelf | undefined {
        return this.shelveStore.getShelf(shelfId);
    }

    getAllShelves(): Shelf[] {
        return this.shelveStore.getAllShelves();
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}