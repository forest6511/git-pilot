import * as vscode from 'vscode';

export enum FileChangeStatus {
    Modified = 'M',
    Added = 'A',
    Deleted = 'D',
    Renamed = 'R',
    Copied = 'C',
    Untracked = 'U',
    Conflicted = 'X'
}

export interface IFileChange {
    readonly path: string;
    readonly relativePath: string;
    readonly status: FileChangeStatus;
    readonly isStaged: boolean;
    readonly isSelected: boolean;
    readonly originalPath?: string; // For renames
}

export class FileChange implements IFileChange {
    private _isSelected = false;

    constructor(
        public readonly path: string,
        public readonly relativePath: string,
        public readonly status: FileChangeStatus,
        public readonly isStaged = false,
        public readonly originalPath?: string
    ) {}

    get isSelected(): boolean {
        return this._isSelected;
    }

    toggleSelection(): FileChange {
        return new FileChange(
            this.path,
            this.relativePath,
            this.status,
            this.isStaged,
            this.originalPath
        ).setSelected(!this._isSelected);
    }

    select(): FileChange {
        return new FileChange(
            this.path,
            this.relativePath,
            this.status,
            this.isStaged,
            this.originalPath
        ).setSelected(true);
    }

    deselect(): FileChange {
        return new FileChange(
            this.path,
            this.relativePath,
            this.status,
            this.isStaged,
            this.originalPath
        ).setSelected(false);
    }

    private setSelected(selected: boolean): FileChange {
        this._isSelected = selected;
        return this;
    }

    stage(): FileChange {
        return new FileChange(
            this.path,
            this.relativePath,
            this.status,
            true,
            this.originalPath
        ).setSelected(this._isSelected);
    }

    unstage(): FileChange {
        return new FileChange(
            this.path,
            this.relativePath,
            this.status,
            false,
            this.originalPath
        ).setSelected(this._isSelected);
    }

    getStatusIcon(): vscode.ThemeIcon {
        switch (this.status) {
            case FileChangeStatus.Modified:
                return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
            case FileChangeStatus.Added:
                return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
            case FileChangeStatus.Deleted:
                return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
            case FileChangeStatus.Renamed:
                return new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground'));
            case FileChangeStatus.Copied:
                return new vscode.ThemeIcon('files', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
            case FileChangeStatus.Untracked:
                return new vscode.ThemeIcon('question', new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'));
            case FileChangeStatus.Conflicted:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }

    getStatusLabel(): string {
        return this.status.toString();
    }

    getTooltip(): string {
        const statusNames = {
            [FileChangeStatus.Modified]: 'Modified',
            [FileChangeStatus.Added]: 'Added',
            [FileChangeStatus.Deleted]: 'Deleted',
            [FileChangeStatus.Renamed]: 'Renamed',
            [FileChangeStatus.Copied]: 'Copied',
            [FileChangeStatus.Untracked]: 'Untracked',
            [FileChangeStatus.Conflicted]: 'Conflicted'
        };
        
        const statusName = statusNames[this.status] || 'Unknown';
        const stagingStatus = this.isStaged ? ' (Staged)' : '';
        
        return `${statusName}: ${this.relativePath}${stagingStatus}`;
    }

    getContextValue(): string {
        if (this.status === FileChangeStatus.Untracked) {
            return 'untrackedFile';
        }
        if (this.status === FileChangeStatus.Conflicted) {
            return 'conflictedFile';
        }
        return this.isStaged ? 'stagedFile' : 'modifiedFile';
    }
}