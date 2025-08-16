import { FileChangeStatus } from './fileChange';

export class ShelvedFile {
    constructor(
        public readonly path: string,
        public readonly relativePath: string,
        public readonly originalContent: string,
        public readonly shelvedContent: string,
        public readonly status: FileChangeStatus,
        public readonly encoding: string = 'utf8'
    ) {}

    generateDiff(): string {
        // Generate unified diff between original and shelved content
        return `--- a/${this.relativePath}
+++ b/${this.relativePath}
${this.getDiffContent()}`;
    }

    private getDiffContent(): string {
        // Simplified diff generation - real implementation would use proper diff algorithm
        const originalLines = this.originalContent.split('\n');
        const shelvedLines = this.shelvedContent.split('\n');
        
        // Basic line-by-line comparison
        const maxLines = Math.max(originalLines.length, shelvedLines.length);
        const diffLines: string[] = [];
        
        diffLines.push(`@@ -1,${originalLines.length} +1,${shelvedLines.length} @@`);
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = originalLines[i] || '';
            const shelvedLine = shelvedLines[i] || '';
            
            if (originalLine !== shelvedLine) {
                if (originalLines[i] !== undefined) {
                    diffLines.push(`-${originalLine}`);
                }
                if (shelvedLines[i] !== undefined) {
                    diffLines.push(`+${shelvedLine}`);
                }
            } else {
                diffLines.push(` ${originalLine}`);
            }
        }
        
        return diffLines.join('\n');
    }

    canRestore(currentContent: string): boolean {
        // Check if file can be restored without conflicts
        return this.originalContent === currentContent;
    }

    detectConflicts(currentContent: string): string[] {
        if (this.canRestore(currentContent)) {
            return [];
        }
        
        // Detect specific conflict lines
        const originalLines = this.originalContent.split('\n');
        const currentLines = currentContent.split('\n');
        const shelvedLines = this.shelvedContent.split('\n');
        const conflicts: string[] = [];
        
        const maxLines = Math.max(originalLines.length, currentLines.length, shelvedLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = originalLines[i] || '';
            const currentLine = currentLines[i] || '';
            const shelvedLine = shelvedLines[i] || '';
            
            // Conflict if current differs from original AND shelved differs from original
            if (originalLine !== currentLine && originalLine !== shelvedLine) {
                conflicts.push(`Line ${i + 1}: conflicting changes`);
            }
        }
        
        if (conflicts.length === 0 && originalLines.length !== currentLines.length) {
            conflicts.push('File length changed since shelving');
        }
        
        return conflicts;
    }

    getPreviewContent(): string {
        // Return a preview of what the file would look like after unshelving
        return this.shelvedContent;
    }

    getSizeInfo(): { originalSize: number; shelvedSize: number; sizeDelta: number } {
        const originalSize = new TextEncoder().encode(this.originalContent).length;
        const shelvedSize = new TextEncoder().encode(this.shelvedContent).length;
        
        return {
            originalSize,
            shelvedSize,
            sizeDelta: shelvedSize - originalSize
        };
    }

    getStatusIcon(): string {
        switch (this.status) {
            case FileChangeStatus.Modified:
                return '📝';
            case FileChangeStatus.Added:
                return '➕';
            case FileChangeStatus.Deleted:
                return '❌';
            case FileChangeStatus.Renamed:
                return '📝';
            case FileChangeStatus.Copied:
                return '📋';
            case FileChangeStatus.Untracked:
                return '❓';
            case FileChangeStatus.Conflicted:
                return '⚠️';
            default:
                return '📄';
        }
    }

    getStatusLabel(): string {
        const statusLabels = {
            [FileChangeStatus.Modified]: 'Modified',
            [FileChangeStatus.Added]: 'Added',
            [FileChangeStatus.Deleted]: 'Deleted',
            [FileChangeStatus.Renamed]: 'Renamed',
            [FileChangeStatus.Copied]: 'Copied',
            [FileChangeStatus.Untracked]: 'Untracked',
            [FileChangeStatus.Conflicted]: 'Conflicted'
        };
        
        return statusLabels[this.status] || 'Unknown';
    }

    toJSON(): object {
        return {
            path: this.path,
            relativePath: this.relativePath,
            originalContent: this.originalContent,
            shelvedContent: this.shelvedContent,
            status: this.status,
            encoding: this.encoding
        };
    }

    static fromJSON(json: any): ShelvedFile {
        return new ShelvedFile(
            json.path,
            json.relativePath,
            json.originalContent,
            json.shelvedContent,
            json.status,
            json.encoding
        );
    }

    static createFromFileChange(
        path: string,
        relativePath: string,
        originalContent: string,
        currentContent: string,
        status: FileChangeStatus
    ): ShelvedFile {
        return new ShelvedFile(
            path,
            relativePath,
            originalContent,
            currentContent,
            status,
            'utf8'
        );
    }
}