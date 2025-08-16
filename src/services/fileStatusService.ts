import * as vscode from 'vscode';
import * as path from 'path';
import { GitProvider } from '../providers/gitProvider';

/**
 * File status types for Git operations
 */
export enum FileStatus {
    Untracked = 'untracked',
    Modified = 'modified',
    Staged = 'staged',
    Deleted = 'deleted',
    Added = 'added',
    Ignored = 'ignored',
    Clean = 'clean',
    Conflicted = 'conflicted'
}

/**
 * Service for detecting and managing file Git status
 */
export class FileStatusService implements vscode.Disposable {
    private _onDidChangeFileStatus = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChangeFileStatus = this._onDidChangeFileStatus.event;
    
    private statusCache = new Map<string, { status: FileStatus; timestamp: number }>();
    private readonly CACHE_TTL = 5000; // 5 seconds
    private disposables: vscode.Disposable[] = [];
    private gitProvider: GitProvider;
    
    constructor(gitProvider: GitProvider) {
        this.gitProvider = gitProvider;
        this.setupFileWatcher();
    }
    
    private setupFileWatcher(): void {
        // Watch for file system changes to invalidate cache
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        watcher.onDidChange(uri => {
            this.invalidateCache(uri);
            this._onDidChangeFileStatus.fire(uri);
        });
        
        watcher.onDidCreate(uri => {
            this.invalidateCache(uri);
            this._onDidChangeFileStatus.fire(uri);
        });
        
        watcher.onDidDelete(uri => {
            this.invalidateCache(uri);
            this._onDidChangeFileStatus.fire(uri);
        });
        
        this.disposables.push(watcher);
    }
    
    /**
     * Get the Git status of a single file
     */
    async getFileStatus(uri: vscode.Uri): Promise<FileStatus> {
        const cacheKey = uri.fsPath;
        const cached = this.statusCache.get(cacheKey);
        
        // Return cached result if still valid
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.status;
        }
        
        try {
            const status = await this.detectFileStatus(uri);
            
            // Cache the result
            this.statusCache.set(cacheKey, {
                status,
                timestamp: Date.now()
            });
            
            return status;
        } catch (error) {
            console.error('Failed to get file status:', error);
            return FileStatus.Clean;
        }
    }
    
    /**
     * Get status for multiple files efficiently
     */
    async getMultipleFileStatus(uris: vscode.Uri[]): Promise<Map<string, FileStatus>> {
        const result = new Map<string, FileStatus>();
        const uncachedUris: vscode.Uri[] = [];
        
        // Check cache first
        for (const uri of uris) {
            const cacheKey = uri.fsPath;
            const cached = this.statusCache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                result.set(uri.fsPath, cached.status);
            } else {
                uncachedUris.push(uri);
            }
        }
        
        // Batch check uncached files
        if (uncachedUris.length > 0) {
            const batchResults = await this.batchDetectFileStatus(uncachedUris);
            
            for (const [filePath, status] of batchResults) {
                result.set(filePath, status);
                
                // Update cache
                this.statusCache.set(filePath, {
                    status,
                    timestamp: Date.now()
                });
            }
        }
        
        return result;
    }
    
    /**
     * Detect file status using Git
     */
    private async detectFileStatus(uri: vscode.Uri): Promise<FileStatus> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return FileStatus.Clean;
        }
        
        try {
            // Get relative path from workspace root
            const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            
            // Use VSCode's built-in Git API if available
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension?.isActive) {
                const gitApi = gitExtension.exports.getAPI(1);
                const repository = gitApi.getRepository(uri);
                
                if (repository) {
                    // Check different status collections
                    const workingTreeChanges = repository.state.workingTreeChanges;
                    const indexChanges = repository.state.indexChanges;
                    const untrackedChanges = repository.state.untrackedChanges;
                    const mergeChanges = repository.state.mergeChanges;
                    
                    // Check if file is in conflict
                    if (mergeChanges.some((change: any) => change.uri.fsPath === uri.fsPath)) {
                        return FileStatus.Conflicted;
                    }
                    
                    // Check if file is staged
                    if (indexChanges.some((change: any) => change.uri.fsPath === uri.fsPath)) {
                        return FileStatus.Staged;
                    }
                    
                    // Check if file is untracked
                    if (untrackedChanges.some((change: any) => change.uri.fsPath === uri.fsPath)) {
                        return FileStatus.Untracked;
                    }
                    
                    // Check if file is modified
                    const workingChange = workingTreeChanges.find((change: any) => change.uri.fsPath === uri.fsPath);
                    if (workingChange) {
                        switch (workingChange.status) {
                            case 5: // Modified
                                return FileStatus.Modified;
                            case 6: // Deleted
                                return FileStatus.Deleted;
                            case 7: // Added
                                return FileStatus.Added;
                            default:
                                return FileStatus.Modified;
                        }
                    }
                }
            }
            
            // Fallback: use our GitProvider
            return await this.detectStatusWithGitProvider(uri);
            
        } catch (error) {
            console.error('Error detecting file status:', error);
            return FileStatus.Clean;
        }
    }
    
    /**
     * Fallback method using GitProvider
     */
    private async detectStatusWithGitProvider(uri: vscode.Uri): Promise<FileStatus> {
        try {
            const status = await this.gitProvider.getStatus();
            const relativePath = vscode.workspace.asRelativePath(uri);
            
            if (status.untracked.includes(relativePath)) {
                return FileStatus.Untracked;
            }
            
            if (status.modified.includes(relativePath)) {
                return FileStatus.Modified;
            }
            
            if (status.staged.includes(relativePath)) {
                return FileStatus.Staged;
            }
            
            if (status.deleted.includes(relativePath)) {
                return FileStatus.Deleted;
            }
            
            if (status.added.includes(relativePath)) {
                return FileStatus.Added;
            }
            
            if (status.conflicted.includes(relativePath)) {
                return FileStatus.Conflicted;
            }
            
            return FileStatus.Clean;
        } catch (error) {
            console.error('GitProvider status check failed:', error);
            return FileStatus.Clean;
        }
    }
    
    /**
     * Efficiently detect status for multiple files
     */
    private async batchDetectFileStatus(uris: vscode.Uri[]): Promise<Map<string, FileStatus>> {
        const result = new Map<string, FileStatus>();
        
        try {
            // Use VSCode Git API for batch operations
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension?.isActive) {
                const gitApi = gitExtension.exports.getAPI(1);
                
                for (const uri of uris) {
                    const repository = gitApi.getRepository(uri);
                    if (repository) {
                        const status = await this.detectFileStatus(uri);
                        result.set(uri.fsPath, status);
                    } else {
                        result.set(uri.fsPath, FileStatus.Clean);
                    }
                }
            } else {
                // Fallback: individual checks
                for (const uri of uris) {
                    const status = await this.detectFileStatus(uri);
                    result.set(uri.fsPath, status);
                }
            }
        } catch (error) {
            console.error('Batch status detection failed:', error);
            // Set all to clean as fallback
            uris.forEach(uri => result.set(uri.fsPath, FileStatus.Clean));
        }
        
        return result;
    }
    
    /**
     * Check if a file is tracked by Git
     */
    async isTracked(uri: vscode.Uri): Promise<boolean> {
        const status = await this.getFileStatus(uri);
        return status !== FileStatus.Untracked && status !== FileStatus.Ignored;
    }
    
    /**
     * Check if a file has uncommitted changes
     */
    async hasChanges(uri: vscode.Uri): Promise<boolean> {
        const status = await this.getFileStatus(uri);
        return [
            FileStatus.Modified,
            FileStatus.Staged,
            FileStatus.Added,
            FileStatus.Deleted,
            FileStatus.Conflicted
        ].includes(status);
    }
    
    /**
     * Check if a file can be staged
     */
    async canStage(uri: vscode.Uri): Promise<boolean> {
        const status = await this.getFileStatus(uri);
        return [
            FileStatus.Modified,
            FileStatus.Untracked,
            FileStatus.Deleted
        ].includes(status);
    }
    
    /**
     * Check if a file can be unstaged
     */
    async canUnstage(uri: vscode.Uri): Promise<boolean> {
        const status = await this.getFileStatus(uri);
        return status === FileStatus.Staged;
    }
    
    /**
     * Check if a file can be reverted
     */
    async canRevert(uri: vscode.Uri): Promise<boolean> {
        const status = await this.getFileStatus(uri);
        return [
            FileStatus.Modified,
            FileStatus.Deleted
        ].includes(status);
    }
    
    /**
     * Invalidate cache for a specific file
     */
    private invalidateCache(uri: vscode.Uri): void {
        this.statusCache.delete(uri.fsPath);
    }
    
    /**
     * Clear all cached status
     */
    clearCache(): void {
        this.statusCache.clear();
    }
    
    /**
     * Get cached status without refresh
     */
    getCachedStatus(uri: vscode.Uri): FileStatus | undefined {
        const cached = this.statusCache.get(uri.fsPath);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.status;
        }
        return undefined;
    }
    
    dispose(): void {
        this._onDidChangeFileStatus.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.statusCache.clear();
    }
}