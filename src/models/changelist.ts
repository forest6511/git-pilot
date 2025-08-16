import { FileChange } from './fileChange';

/**
 * Custom changelist interface for organizing file changes
 */
export interface IChangelist {
    id: string;
    name: string;
    description?: string;
    files: ReadonlyArray<FileChange>;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    modifiedAt: Date;
}

/**
 * Immutable custom changelist model for organizing file changes
 */
export class Changelist implements IChangelist {
    public readonly id: string;
    public readonly name: string;
    public readonly description?: string;
    public readonly files: ReadonlyArray<FileChange>;
    public readonly isDefault: boolean;
    public readonly isActive: boolean;
    public readonly createdAt: Date;
    public readonly modifiedAt: Date;

    constructor(
        id: string,
        name: string,
        files: ReadonlyArray<FileChange> = [],
        isDefault = false,
        isActive = false,
        description?: string,
        createdAt?: Date,
        modifiedAt?: Date
    ) {
        this.id = id;
        this.name = name;
        this.files = files;
        this.isDefault = isDefault;
        this.isActive = isActive;
        this.description = description;
        this.createdAt = createdAt || new Date();
        this.modifiedAt = modifiedAt || new Date();
    }

    /**
     * Add a file to this changelist (immutable)
     */
    addFile(file: FileChange): Changelist {
        if (this.files.some(f => f.path === file.path)) {
            return this; // File already exists
        }

        return new Changelist(
            this.id,
            this.name,
            [...this.files, file],
            this.isDefault,
            this.isActive,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Remove a file from this changelist (immutable)
     */
    removeFile(filePath: string): Changelist {
        const filteredFiles = this.files.filter(f => f.path !== filePath);
        
        if (filteredFiles.length === this.files.length) {
            return this; // File not found
        }

        return new Changelist(
            this.id,
            this.name,
            filteredFiles,
            this.isDefault,
            this.isActive,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Update changelist name (immutable)
     */
    rename(newName: string): Changelist {
        if (this.name === newName) {
            return this;
        }

        return new Changelist(
            this.id,
            newName,
            this.files,
            this.isDefault,
            this.isActive,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Update changelist description (immutable)
     */
    updateDescription(newDescription?: string): Changelist {
        if (this.description === newDescription) {
            return this;
        }

        return new Changelist(
            this.id,
            this.name,
            this.files,
            this.isDefault,
            this.isActive,
            newDescription,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Set active state (immutable)
     */
    setActive(active: boolean): Changelist {
        if (this.isActive === active) {
            return this;
        }

        return new Changelist(
            this.id,
            this.name,
            this.files,
            this.isDefault,
            active,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Update a specific file in the changelist (immutable)
     */
    updateFile(filePath: string, updateFn: (file: FileChange) => FileChange): Changelist {
        const fileIndex = this.files.findIndex(f => f.path === filePath);
        if (fileIndex === -1) {
            return this; // File not found
        }

        const updatedFiles = [...this.files];
        updatedFiles[fileIndex] = updateFn(updatedFiles[fileIndex]);

        return new Changelist(
            this.id,
            this.name,
            updatedFiles,
            this.isDefault,
            this.isActive,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Select all files in this changelist (immutable)
     */
    selectAllFiles(): Changelist {
        const updatedFiles = this.files.map(file => file.select());

        return new Changelist(
            this.id,
            this.name,
            updatedFiles,
            this.isDefault,
            this.isActive,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Deselect all files in this changelist (immutable)
     */
    deselectAllFiles(): Changelist {
        const updatedFiles = this.files.map(file => file.deselect());

        return new Changelist(
            this.id,
            this.name,
            updatedFiles,
            this.isDefault,
            this.isActive,
            this.description,
            this.createdAt,
            new Date()
        );
    }

    /**
     * Get file count
     */
    get fileCount(): number {
        return this.files.length;
    }

    /**
     * Check if changelist has files
     */
    get hasFiles(): boolean {
        return this.files.length > 0;
    }

    /**
     * Get selected files
     */
    get selectedFiles(): ReadonlyArray<FileChange> {
        return this.files.filter(f => f.isSelected);
    }

    /**
     * Get selected files (method version for compatibility)
     */
    getSelectedFiles(): ReadonlyArray<FileChange> {
        return this.selectedFiles;
    }

    /**
     * Get selected file count
     */
    get selectedFileCount(): number {
        return this.selectedFiles.length;
    }

    /**
     * Check if changelist has selected files
     */
    get hasSelectedFiles(): boolean {
        return this.selectedFileCount > 0;
    }

    /**
     * Get display name with file count
     */
    getDisplayName(): string {
        const count = this.fileCount;
        const fileText = count === 1 ? 'file' : 'files';
        return `${this.name} (${count} ${fileText})`;
    }

    /**
     * Get tooltip text
     */
    getTooltip(): string {
        const lines = [
            `Changelist: ${this.name}`,
            `Files: ${this.fileCount}`,
            `Selected: ${this.selectedFileCount}`
        ];

        if (this.description) {
            lines.push(`Description: ${this.description}`);
        }

        if (this.isDefault) {
            lines.push('Default changelist');
        }

        if (this.isActive) {
            lines.push('Active changelist');
        }

        return lines.join('\n');
    }

    /**
     * Convert to JSON for persistence
     */
    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            files: this.files.map(f => (f as any).toJSON ? (f as any).toJSON() : f),
            isDefault: this.isDefault,
            isActive: this.isActive,
            createdAt: this.createdAt.toISOString(),
            modifiedAt: this.modifiedAt.toISOString()
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(json: any, fileChangeFactory: (data: any) => FileChange): Changelist {
        return new Changelist(
            json.id,
            json.name,
            json.files.map((f: any) => fileChangeFactory(f)),
            json.isDefault,
            json.isActive,
            json.description,
            new Date(json.createdAt),
            new Date(json.modifiedAt)
        );
    }

    /**
     * Create default changelist
     */
    static createDefault(): Changelist {
        return new Changelist(
            'default',
            'Default Changelist',
            [],
            true,
            true,
            'Default changelist for organizing changes'
        );
    }

    /**
     * Generate unique ID
     */
    static generateId(): string {
        return `changelist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}