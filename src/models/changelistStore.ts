import * as vscode from 'vscode';
import { Changelist } from './changelist';
import { FileChange } from './fileChange';

/**
 * Persistence and management layer for custom changelists
 */
export class ChangelistStore {
    private static readonly STORAGE_KEY = 'gitpilot.changelists';
    private static readonly ACTIVE_CHANGELIST_KEY = 'gitpilot.activeChangelist';
    
    private changelists: Map<string, Changelist>;
    private activeChangelistId: string;
    private _onDidChangeChangelists: vscode.EventEmitter<void>;
    
    constructor(private context: vscode.ExtensionContext) {
        this.changelists = new Map();
        this.activeChangelistId = 'default';
        this._onDidChangeChangelists = new vscode.EventEmitter<void>();
        
        // Initialize with default changelist
        this.changelists.set('default', Changelist.createDefault());
    }

    /**
     * Event fired when changelists change
     */
    get onDidChangeChangelists(): vscode.Event<void> {
        return this._onDidChangeChangelists.event;
    }

    /**
     * Save changelists to workspace state
     */
    async save(): Promise<void> {
        try {
            const changelistsData = Array.from(this.changelists.values())
                .map(cl => cl.toJSON());
            
            await this.context.workspaceState.update(ChangelistStore.STORAGE_KEY, changelistsData);
            await this.context.workspaceState.update(ChangelistStore.ACTIVE_CHANGELIST_KEY, this.activeChangelistId);
            
            console.log(`[ChangelistStore] Saved ${changelistsData.length} changelists`);
        } catch (error) {
            console.error('[ChangelistStore] Failed to save changelists:', error);
            throw new Error(`Failed to save changelists: ${error}`);
        }
    }

    /**
     * Load changelists from workspace state
     */
    async load(): Promise<void> {
        try {
            const changelistsData = this.context.workspaceState.get<unknown[]>(ChangelistStore.STORAGE_KEY, []);
            const savedActiveId = this.context.workspaceState.get<string>(ChangelistStore.ACTIVE_CHANGELIST_KEY, 'default');
            
            this.changelists.clear();
            
            // Load saved changelists
            for (const data of changelistsData) {
                try {
                    const changelist = Changelist.fromJSON(data, this.fileChangeFromJSON);
                    this.changelists.set(changelist.id, changelist);
                } catch (error) {
                    console.warn('[ChangelistStore] Failed to load changelist:', data, error);
                }
            }
            
            // Ensure default changelist exists
            if (!this.changelists.has('default')) {
                this.changelists.set('default', Changelist.createDefault());
            }
            
            // Set active changelist
            this.activeChangelistId = this.changelists.has(savedActiveId) ? savedActiveId : 'default';
            
            console.log(`[ChangelistStore] Loaded ${this.changelists.size} changelists`);
        } catch (error) {
            console.error('[ChangelistStore] Failed to load changelists:', error);
            // Fallback to default
            this.changelists.clear();
            this.changelists.set('default', Changelist.createDefault());
            this.activeChangelistId = 'default';
        }
    }

    /**
     * Create a new changelist
     */
    createChangelist(name: string, description?: string): Changelist {
        if (!name.trim()) {
            throw new Error('Changelist name cannot be empty');
        }

        // Check for duplicate names
        for (const changelist of this.changelists.values()) {
            if (changelist.name === name.trim()) {
                throw new Error(`Changelist with name "${name}" already exists`);
            }
        }

        const id = Changelist.generateId();
        const changelist = new Changelist(
            id,
            name.trim(),
            [],
            false,
            false,
            description?.trim()
        );

        this.changelists.set(id, changelist);
        this._onDidChangeChangelists.fire();
        
        console.log(`[ChangelistStore] Created changelist: ${name} (${id})`);
        return changelist;
    }

    /**
     * Delete a changelist and move its files to default
     */
    deleteChangelist(id: string): void {
        if (id === 'default') {
            throw new Error('Cannot delete default changelist');
        }

        const changelist = this.changelists.get(id);
        if (!changelist) {
            throw new Error(`Changelist not found: ${id}`);
        }

        // Move files to default changelist
        if (changelist.hasFiles) {
            const defaultChangelist = this.changelists.get('default')!;
            const updatedDefault = changelist.files.reduce(
                (cl, file) => cl.addFile(file),
                defaultChangelist
            );
            this.changelists.set('default', updatedDefault);
        }

        // If deleting active changelist, set default as active
        if (this.activeChangelistId === id) {
            this.activeChangelistId = 'default';
        }

        this.changelists.delete(id);
        this._onDidChangeChangelists.fire();
        
        console.log(`[ChangelistStore] Deleted changelist: ${changelist.name} (${id})`);
    }

    /**
     * Rename a changelist
     */
    renameChangelist(id: string, newName: string): void {
        if (!newName.trim()) {
            throw new Error('Changelist name cannot be empty');
        }

        const changelist = this.changelists.get(id);
        if (!changelist) {
            throw new Error(`Changelist not found: ${id}`);
        }

        // Check for duplicate names
        for (const [otherId, otherChangelist] of this.changelists) {
            if (otherId !== id && otherChangelist.name === newName.trim()) {
                throw new Error(`Changelist with name "${newName}" already exists`);
            }
        }

        const renamedChangelist = changelist.rename(newName.trim());
        this.changelists.set(id, renamedChangelist);
        this._onDidChangeChangelists.fire();
        
        console.log(`[ChangelistStore] Renamed changelist: ${changelist.name} → ${newName} (${id})`);
    }

    /**
     * Move files between changelists
     */
    moveFiles(filePaths: string[], fromId: string, toId: string): void {
        if (fromId === toId) {
            return; // No-op
        }

        const fromChangelist = this.changelists.get(fromId);
        const toChangelist = this.changelists.get(toId);

        if (!fromChangelist) {
            throw new Error(`Source changelist not found: ${fromId}`);
        }
        if (!toChangelist) {
            throw new Error(`Target changelist not found: ${toId}`);
        }

        // Get files to move
        const filesToMove = fromChangelist.files.filter(f => filePaths.includes(f.path));
        if (filesToMove.length === 0) {
            return; // No files to move
        }

        // Remove files from source
        let updatedFrom = fromChangelist;
        for (const file of filesToMove) {
            updatedFrom = updatedFrom.removeFile(file.path);
        }

        // Add files to target
        let updatedTo = toChangelist;
        for (const file of filesToMove) {
            updatedTo = updatedTo.addFile(file);
        }

        // Update both changelists
        this.changelists.set(fromId, updatedFrom);
        this.changelists.set(toId, updatedTo);
        this._onDidChangeChangelists.fire();
        
        console.log(`[ChangelistStore] Moved ${filesToMove.length} files from ${fromChangelist.name} to ${toChangelist.name}`);
    }

    /**
     * Move a single file between changelists
     */
    moveFileBetweenChangelists(file: FileChange, fromId: string, toId: string): void {
        this.moveFiles([file.path], fromId, toId);
    }

    /**
     * Add a file to a specific changelist
     */
    addFileToChangelist(file: FileChange, changelistId: string): void {
        const changelist = this.changelists.get(changelistId);
        if (!changelist) {
            throw new Error(`Changelist not found: ${changelistId}`);
        }

        const updated = changelist.addFile(file);
        if (updated !== changelist) {
            this.changelists.set(changelistId, updated);
            this._onDidChangeChangelists.fire();
        }
    }

    /**
     * Remove a file from a specific changelist
     */
    removeFileFromChangelist(file: FileChange, changelistId: string): void {
        const changelist = this.changelists.get(changelistId);
        if (!changelist) {
            throw new Error(`Changelist not found: ${changelistId}`);
        }

        const updated = changelist.removeFile(file.path);
        if (updated !== changelist) {
            this.changelists.set(changelistId, updated);
            this._onDidChangeChangelists.fire();
        }
    }

    /**
     * Set active changelist for new changes
     */
    setActiveChangelist(id: string): void {
        if (!this.changelists.has(id)) {
            throw new Error(`Changelist not found: ${id}`);
        }

        // Update active state
        for (const [changelistId, changelist] of this.changelists) {
            const isActive = changelistId === id;
            if (changelist.isActive !== isActive) {
                this.changelists.set(changelistId, changelist.setActive(isActive));
            }
        }

        this.activeChangelistId = id;
        this._onDidChangeChangelists.fire();
        
        const changelist = this.changelists.get(id)!;
        console.log(`[ChangelistStore] Set active changelist: ${changelist.name} (${id})`);
    }

    /**
     * Get all changelists
     */
    getAllChangelists(): ReadonlyArray<Changelist> {
        return Array.from(this.changelists.values());
    }

    /**
     * Get changelist by ID
     */
    getChangelist(id: string): Changelist | undefined {
        return this.changelists.get(id);
    }

    /**
     * Get active changelist
     */
    getActiveChangelist(): Changelist {
        return this.changelists.get(this.activeChangelistId) || this.changelists.get('default')!;
    }

    /**
     * Get default changelist
     */
    getDefaultChangelist(): Changelist {
        return this.changelists.get('default')!;
    }

    /**
     * Check if changelist exists
     */
    hasChangelist(id: string): boolean {
        return this.changelists.has(id);
    }

    /**
     * Get changelist count
     */
    get changelistCount(): number {
        return this.changelists.size;
    }

    /**
     * Update changelist (immutable operation)
     */
    updateChangelist(id: string, updater: (changelist: Changelist) => Changelist): void {
        const changelist = this.changelists.get(id);
        if (!changelist) {
            throw new Error(`Changelist not found: ${id}`);
        }

        const updated = updater(changelist);
        if (updated !== changelist) {
            this.changelists.set(id, updated);
            this._onDidChangeChangelists.fire();
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this._onDidChangeChangelists.dispose();
    }

    /**
     * Helper to create FileChange from JSON
     */
    private fileChangeFromJSON(data: unknown): FileChange {
        // This would need to match FileChange.fromJSON implementation
        // For now, assume FileChange has a fromJSON method
        return data as FileChange;
    }
}