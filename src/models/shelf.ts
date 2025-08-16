import { ShelvedFile } from './shelvedFile';

interface IShelf {
    id: string;
    name: string;
    description?: string;
    timestamp: Date;
    files: readonly ShelvedFile[];
    changelistId?: string;
    branch: string;
    parentCommit: string;
}

export class Shelf implements IShelf {
    constructor(
        public readonly id: string,
        public readonly name: string,
        public readonly files: readonly ShelvedFile[],
        public readonly timestamp: Date,
        public readonly branch: string,
        public readonly parentCommit: string,
        public readonly changelistId?: string,
        public readonly description?: string
    ) {}

    // Immutable operations
    addFile(file: ShelvedFile): Shelf {
        return new Shelf(
            this.id,
            this.name,
            [...this.files, file],
            this.timestamp,
            this.branch,
            this.parentCommit,
            this.changelistId,
            this.description
        );
    }

    removeFile(filePath: string): Shelf {
        return new Shelf(
            this.id,
            this.name,
            this.files.filter(f => f.path !== filePath),
            this.timestamp,
            this.branch,
            this.parentCommit,
            this.changelistId,
            this.description
        );
    }

    rename(newName: string): Shelf {
        return new Shelf(
            this.id,
            newName,
            this.files,
            this.timestamp,
            this.branch,
            this.parentCommit,
            this.changelistId,
            this.description
        );
    }

    updateDescription(description: string): Shelf {
        return new Shelf(
            this.id,
            this.name,
            this.files,
            this.timestamp,
            this.branch,
            this.parentCommit,
            this.changelistId,
            description
        );
    }

    generatePatch(): string {
        // Generate unified diff patch
        return this.files.map(f => f.generateDiff()).join('\n');
    }

    get fileCount(): number {
        return this.files.length;
    }

    get hasFiles(): boolean {
        return this.files.length > 0;
    }

    getDisplayName(): string {
        const fileText = this.fileCount === 1 ? 'file' : 'files';
        return `${this.name} (${this.fileCount} ${fileText})`;
    }

    getTooltip(): string {
        const lines = [
            `Shelf: ${this.name}`,
            `Files: ${this.fileCount}`,
            `Branch: ${this.branch}`,
            `Created: ${this.timestamp.toLocaleString()}`
        ];

        if (this.description) {
            lines.push(`Description: ${this.description}`);
        }

        if (this.changelistId) {
            lines.push(`From changelist: ${this.changelistId}`);
        }

        return lines.join('\n');
    }

    toJSON(): object {
        return {
            id: this.id,
            name: this.name,
            files: this.files.map(f => f.toJSON()),
            timestamp: this.timestamp.toISOString(),
            branch: this.branch,
            parentCommit: this.parentCommit,
            changelistId: this.changelistId,
            description: this.description
        };
    }

    static fromJSON(json: any): Shelf {
        return new Shelf(
            json.id,
            json.name,
            json.files.map((f: any) => ShelvedFile.fromJSON(f)),
            new Date(json.timestamp),
            json.branch,
            json.parentCommit,
            json.changelistId,
            json.description
        );
    }

    static generateId(): string {
        return `shelf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    static createDefault(name: string): Shelf {
        return new Shelf(
            Shelf.generateId(),
            name,
            [],
            new Date(),
            'main',
            'HEAD',
            undefined,
            'Default shelf'
        );
    }
}