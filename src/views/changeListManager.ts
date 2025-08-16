import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { Changelist } from '../models/changelist';
import { FileChange, FileChangeStatus } from '../models/fileChange';

export class ChangeListManager {
    private _changeLists: Map<string, Changelist> = new Map();
    private _onDidChangeChangeList: vscode.EventEmitter<Changelist | undefined> = new vscode.EventEmitter();
    readonly onDidChangeChangeList: vscode.Event<Changelist | undefined> = this._onDidChangeChangeList.event;

    constructor(private gitProvider: GitProvider) {
        this.initializeDefaultChangeList();
    }

    private initializeDefaultChangeList(): void {
        const defaultChangeList = new Changelist('default', 'Default Changelist', [], true, true);
        this._changeLists.set('default', defaultChangeList);
    }

    async refresh(): Promise<void> {
        try {
            const status = await this.gitProvider.getStatus();
            const defaultChangeList = this._changeLists.get('default')!;
            
            // Convert Git status to FileChange objects
            const fileChanges: FileChange[] = [];
            
            // Process modified files
            status.modified.forEach(filePath => {
                const change = this.createFileChange(filePath, FileChangeStatus.Modified, false);
                fileChanges.push(change);
            });
            
            // Process added files (staged)
            status.created.forEach(filePath => {
                const change = this.createFileChange(filePath, FileChangeStatus.Added, true);
                fileChanges.push(change);
            });
            
            // Process deleted files
            status.deleted.forEach(filePath => {
                const change = this.createFileChange(filePath, FileChangeStatus.Deleted, false);
                fileChanges.push(change);
            });
            
            // Process renamed files
            status.renamed.forEach(filePath => {
                const change = this.createFileChange(filePath, FileChangeStatus.Renamed, false);
                fileChanges.push(change);
            });
            
            // Process conflicted files
            status.conflicted.forEach(filePath => {
                const change = this.createFileChange(filePath, FileChangeStatus.Conflicted, false);
                fileChanges.push(change);
            });
            
            // Process untracked files
            status.files
                .filter(f => f.workingDir === '?')
                .forEach(fileStatus => {
                    const change = this.createFileChange(fileStatus.path, FileChangeStatus.Untracked, false);
                    fileChanges.push(change);
                });
            
            // Update default changelist with new files
            const updatedChangeList = new Changelist(
                defaultChangeList.id,
                defaultChangeList.name,
                fileChanges,
                defaultChangeList.isDefault,
                defaultChangeList.isActive
            );

            this._changeLists.set('default', updatedChangeList);
            this._onDidChangeChangeList.fire(updatedChangeList);
            
        } catch (error) {
            console.error('Failed to refresh change lists:', error);
        }
    }

    private createFileChange(filePath: string, status: FileChangeStatus, isStaged: boolean): FileChange {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relativePath = workspaceFolder 
            ? vscode.workspace.asRelativePath(filePath, false)
            : filePath;
            
        return new FileChange(filePath, relativePath, status, isStaged);
    }

    getChangeList(id: string): Changelist | undefined {
        return this._changeLists.get(id);
    }

    getDefaultChangeList(): Changelist {
        return this._changeLists.get('default')!;
    }

    getAllChangeLists(): Changelist[] {
        return Array.from(this._changeLists.values());
    }

    toggleFileSelection(changeListId: string, filePath: string): void {
        const changeList = this._changeLists.get(changeListId);
        if (!changeList) return;

        const updatedChangeList = changeList.updateFile(filePath, (file: FileChange) => file.toggleSelection());
        this._changeLists.set(changeListId, updatedChangeList);
        this._onDidChangeChangeList.fire(updatedChangeList);
    }

    selectAllFiles(changeListId: string): void {
        const changeList = this._changeLists.get(changeListId);
        if (!changeList) return;

        const updatedChangeList = changeList.selectAllFiles();
        this._changeLists.set(changeListId, updatedChangeList);
        this._onDidChangeChangeList.fire(updatedChangeList);
    }

    deselectAllFiles(changeListId: string): void {
        const changeList = this._changeLists.get(changeListId);
        if (!changeList) return;

        const updatedChangeList = changeList.deselectAllFiles();
        this._changeLists.set(changeListId, updatedChangeList);
        this._onDidChangeChangeList.fire(updatedChangeList);
    }

    async stageSelectedFiles(changeListId: string): Promise<void> {
        const changeList = this._changeLists.get(changeListId);
        if (!changeList) return;

        const selectedFiles = changeList.getSelectedFiles();
        if (selectedFiles.length === 0) return;

        try {
            const filePaths = selectedFiles.map((f: FileChange) => f.path);
            await this.gitProvider.add(filePaths);
            
            // Refresh to get updated staging status
            await this.refresh();
        } catch (error) {
            console.error('Failed to stage files:', error);
            vscode.window.showErrorMessage(`Failed to stage files: ${error}`);
        }
    }

    async unstageSelectedFiles(changeListId: string): Promise<void> {
        const changeList = this._changeLists.get(changeListId);
        if (!changeList) return;

        const selectedFiles = changeList.getSelectedFiles().filter((f: FileChange) => f.isStaged);
        if (selectedFiles.length === 0) return;

        try {
            // Note: This would need a GitProvider.unstage method
            // const filePaths = selectedFiles.map(f => f.path);
            // await this.gitProvider.unstage(filePaths);
            
            // For now, refresh to get current status
            await this.refresh();
        } catch (error) {
            console.error('Failed to unstage files:', error);
            vscode.window.showErrorMessage(`Failed to unstage files: ${error}`);
        }
    }

    getSelectedFilePaths(changeListId: string): string[] {
        const changeList = this._changeLists.get(changeListId);
        if (!changeList) return [];

        return changeList.getSelectedFiles().map((f: FileChange) => f.path);
    }

    hasSelectedFiles(changeListId: string): boolean {
        const changeList = this._changeLists.get(changeListId);
        return changeList ? changeList.hasSelectedFiles : false;
    }

    dispose(): void {
        this._onDidChangeChangeList.dispose();
    }
}