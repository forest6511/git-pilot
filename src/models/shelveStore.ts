import * as vscode from 'vscode';
import { Shelf } from './shelf';
import { ShelvedFile } from './shelvedFile';
import { FileChange } from './fileChange';
import { Changelist } from './changelist';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface UnshelveOptions {
    keepShelf?: boolean;
    forceMerge?: boolean;
    selectedFiles?: string[];
}

export interface ConflictReport {
    hasConflicts: boolean;
    conflictingFiles: string[];
    canAutoMerge: boolean;
    details: ConflictDetails[];
}

export interface ConflictDetails {
    filePath: string;
    conflicts: string[];
    canResolve: boolean;
}

export interface ShelveOptions {
    removeFromWorkspace?: boolean;
    includeUntracked?: boolean;
    description?: string;
}

export class ShelveStore {
    private shelves: Map<string, Shelf> = new Map();
    private readonly STORAGE_KEY = 'gitpilot.shelves';
    private _onDidChangeShelves = new vscode.EventEmitter<void>();
    readonly onDidChangeShelves = this._onDidChangeShelves.event;

    constructor(private context: vscode.ExtensionContext) {
        this.load();
    }

    // CRUD Operations
    async createShelf(
        name: string, 
        files: FileChange[], 
        options: ShelveOptions = {}
    ): Promise<Shelf> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        if (files.length === 0) {
            throw new Error('No files selected for shelving');
        }

        const shelvedFiles = await Promise.all(
            files.map(async file => this.createShelvedFile(file))
        );

        const shelf = new Shelf(
            Shelf.generateId(),
            name,
            shelvedFiles,
            new Date(),
            await this.getCurrentBranch(),
            await this.getCurrentCommit(),
            undefined, // changelistId would be provided if shelving from specific changelist
            options.description
        );

        this.shelves.set(shelf.id, shelf);
        await this.save();

        // Optionally remove files from workspace
        if (options.removeFromWorkspace) {
            await this.removeFilesFromWorkspace(files);
        }

        this._onDidChangeShelves.fire();
        return shelf;
    }

    async createShelfFromChangelist(
        name: string,
        changelist: Changelist,
        options: ShelveOptions = {}
    ): Promise<Shelf> {
        const files = Array.from(changelist.files);
        const shelf = await this.createShelf(name, files, {
            ...options,
            description: options.description || `Shelved from changelist: ${changelist.name}`
        });

        // Update shelf with changelist ID
        const updatedShelf = new Shelf(
            shelf.id,
            shelf.name,
            shelf.files,
            shelf.timestamp,
            shelf.branch,
            shelf.parentCommit,
            changelist.id,
            shelf.description
        );

        this.shelves.set(shelf.id, updatedShelf);
        await this.save();
        this._onDidChangeShelves.fire();

        return updatedShelf;
    }

    async unshelve(
        shelfId: string, 
        options: UnshelveOptions = {}
    ): Promise<void> {
        const shelf = this.shelves.get(shelfId);
        if (!shelf) {
            throw new Error('Shelf not found');
        }

        // Check for conflicts
        const conflicts = await this.previewUnshelve(shelfId);
        if (conflicts.hasConflicts && !options.forceMerge) {
            const conflictFiles = conflicts.conflictingFiles.join(', ');
            throw new Error(`Cannot unshelve: conflicts in ${conflictFiles}`);
        }

        // Restore files
        const filesToRestore = options.selectedFiles 
            ? shelf.files.filter(f => options.selectedFiles!.includes(f.path))
            : shelf.files;

        for (const file of filesToRestore) {
            await this.restoreFile(file, options.forceMerge || false);
        }

        // Remove shelf unless keeping
        if (!options.keepShelf) {
            this.shelves.delete(shelfId);
            await this.save();
        }

        this._onDidChangeShelves.fire();
    }

    async deleteShelf(shelfId: string): Promise<void> {
        if (!this.shelves.has(shelfId)) {
            throw new Error('Shelf not found');
        }

        this.shelves.delete(shelfId);
        await this.save();
        this._onDidChangeShelves.fire();
    }

    async renameShelf(shelfId: string, newName: string): Promise<void> {
        const shelf = this.shelves.get(shelfId);
        if (!shelf) {
            throw new Error('Shelf not found');
        }

        const renamedShelf = shelf.rename(newName);
        this.shelves.set(shelfId, renamedShelf);
        await this.save();
        this._onDidChangeShelves.fire();
    }

    async updateShelfDescription(shelfId: string, description: string): Promise<void> {
        const shelf = this.shelves.get(shelfId);
        if (!shelf) {
            throw new Error('Shelf not found');
        }

        const updatedShelf = shelf.updateDescription(description);
        this.shelves.set(shelfId, updatedShelf);
        await this.save();
        this._onDidChangeShelves.fire();
    }

    getAllShelves(): Shelf[] {
        return Array.from(this.shelves.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    getShelf(shelfId: string): Shelf | undefined {
        return this.shelves.get(shelfId);
    }

    getShelvesByChangelist(changelistId: string): Shelf[] {
        return this.getAllShelves()
            .filter(shelf => shelf.changelistId === changelistId);
    }

    async previewUnshelve(shelfId: string): Promise<ConflictReport> {
        const shelf = this.shelves.get(shelfId);
        if (!shelf) {
            throw new Error('Shelf not found');
        }

        const conflictingFiles: string[] = [];
        const details: ConflictDetails[] = [];
        
        for (const file of shelf.files) {
            try {
                const currentContent = await fs.readFile(file.path, 'utf8');
                const conflicts = file.detectConflicts(currentContent);
                
                if (conflicts.length > 0) {
                    conflictingFiles.push(file.relativePath);
                    details.push({
                        filePath: file.relativePath,
                        conflicts,
                        canResolve: conflicts.length === 1 // Simplified resolution logic
                    });
                }
            } catch (error) {
                // File doesn't exist, no conflict but note this
                details.push({
                    filePath: file.relativePath,
                    conflicts: ['File does not exist in workspace'],
                    canResolve: true
                });
            }
        }

        return {
            hasConflicts: conflictingFiles.length > 0,
            conflictingFiles,
            canAutoMerge: details.every(d => d.canResolve),
            details
        };
    }

    async partialUnshelve(
        shelfId: string, 
        filePaths: string[]
    ): Promise<void> {
        await this.unshelve(shelfId, {
            keepShelf: true,
            selectedFiles: filePaths
        });
    }

    // Export/Import
    async exportShelf(shelfId: string): Promise<string> {
        const shelf = this.shelves.get(shelfId);
        if (!shelf) {
            throw new Error('Shelf not found');
        }
        return shelf.generatePatch();
    }

    async importShelf(patchContent: string, name: string): Promise<Shelf> {
        // Parse patch and create shelf - simplified implementation
        const shelf = new Shelf(
            Shelf.generateId(),
            name,
            [], // Would parse patch content to create ShelvedFiles
            new Date(),
            'imported',
            'unknown',
            undefined,
            'Imported from patch'
        );

        this.shelves.set(shelf.id, shelf);
        await this.save();
        this._onDidChangeShelves.fire();

        return shelf;
    }

    // Helper methods
    private async createShelvedFile(file: FileChange): Promise<ShelvedFile> {
        const currentContent = await fs.readFile(file.path, 'utf8');
        const originalContent = await this.getOriginalContent(file.path); // Would get from git
        
        return new ShelvedFile(
            file.path,
            file.relativePath,
            originalContent,
            currentContent,
            file.status,
            'utf8'
        );
    }

    private async getOriginalContent(filePath: string): Promise<string> {
        // Simplified - would use git to get original content
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch {
            return '';
        }
    }

    private async getCurrentBranch(): Promise<string> {
        // Simplified - would use git to get current branch
        return 'main';
    }

    private async getCurrentCommit(): Promise<string> {
        // Simplified - would use git to get current commit
        return 'HEAD';
    }

    private async removeFilesFromWorkspace(files: FileChange[]): Promise<void> {
        for (const file of files) {
            try {
                // Reset file to original state or remove if untracked
                await fs.writeFile(file.path, '', 'utf8');
            } catch (error) {
                console.error(`Failed to remove file ${file.path}:`, error);
            }
        }
    }

    private async restoreFile(file: ShelvedFile, forceMerge: boolean): Promise<void> {
        try {
            if (forceMerge) {
                // Force write the shelved content
                await fs.writeFile(file.path, file.shelvedContent, 'utf8');
            } else {
                // Check for conflicts first
                const currentContent = await fs.readFile(file.path, 'utf8');
                if (file.canRestore(currentContent)) {
                    await fs.writeFile(file.path, file.shelvedContent, 'utf8');
                } else {
                    throw new Error(`Cannot restore ${file.relativePath}: file has conflicts`);
                }
            }
        } catch (error) {
            // File doesn't exist, create it
            await fs.mkdir(path.dirname(file.path), { recursive: true });
            await fs.writeFile(file.path, file.shelvedContent, 'utf8');
        }
    }

    // Persistence
    private async save(): Promise<void> {
        const data = Array.from(this.shelves.values()).map(s => s.toJSON());
        await this.context.workspaceState.update(this.STORAGE_KEY, data);
    }

    private async load(): Promise<void> {
        const data = this.context.workspaceState.get<any[]>(this.STORAGE_KEY, []);
        this.shelves.clear();
        
        for (const item of data) {
            try {
                const shelf = Shelf.fromJSON(item);
                this.shelves.set(shelf.id, shelf);
            } catch (error) {
                console.error('Failed to load shelf:', error);
            }
        }
    }

    dispose(): void {
        this._onDidChangeShelves.dispose();
    }
}