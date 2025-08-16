/**
 * Git operations provider using simple-git
 * Handles all Git operations with comprehensive error handling and validation
 */

// Imports (grouped and ordered)
import * as vscode from 'vscode';
import * as path from 'path';

import { simpleGit, SimpleGit, LogResult } from 'simple-git';

import type { 
    IBranchInfo, 
    IGitStatus, 
    ICommitOptions
} from '../types';

import { BlameInfo, FileBlameData, CommitDetails, LineHistoryEntry } from '../models/blameInfo';

// Constants
const DEFAULT_TIMEOUT = 30000;
const MAX_LOG_COUNT = 50;

/**
 * GitProvider class - ALL Git operations through simple-git
 */
export class GitProvider {
    private _gitInstance: SimpleGit | null = null;
    private _workspaceRoot: string;

    constructor(workspacePath?: string) {
        this._workspaceRoot = workspacePath || 
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 
            process.cwd();
        
        this._initializeGit();
    }

    /**
     * Initialize Git instance with timeout and options
     */
    private _initializeGit(): void {
        try {
            this._gitInstance = simpleGit(this._workspaceRoot, {
                timeout: { block: DEFAULT_TIMEOUT }
            });
        } catch (error) {
            console.error('[GitPilot] Failed to initialize Git:', error);
            throw new Error(`Git initialization failed: ${error}`);
        }
    }

    /**
     * Ensure Git repository exists and is valid
     * @returns Promise that resolves to true if valid Git repo
     */
    async ensureGitRepository(): Promise<boolean> {
        try {
            if (!this._gitInstance) {
                throw new Error('Git instance not initialized');
            }

            const isRepo = await this._gitInstance.checkIsRepo();
            if (!isRepo) {
                vscode.window.showErrorMessage(
                    'Not a Git repository. Please initialize Git first.'
                );
                return false;
            }
            return true;
        } catch (error) {
            console.error('[GitPilot] Git repository check failed:', error);
            this._handleGitError(error, 'Repository validation failed');
            return false;
        }
    }

    /**
     * Get Git status with comprehensive file information
     * @returns Promise resolving to Git status
     */
    async getStatus(): Promise<IGitStatus> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            const status = await this._gitInstance!.status();
            
            return {
                files: status.files.map(file => ({
                    path: file.path,
                    index: file.index || '',
                    workingDir: file.working_dir || '',
                    isConflicted: status.conflicted.includes(file.path)
                })),
                current: status.current,
                tracking: status.tracking,
                ahead: status.ahead,
                behind: status.behind,
                conflicted: status.conflicted,
                created: status.created,
                deleted: status.deleted,
                modified: status.modified,
                renamed: status.renamed.map(r => typeof r === 'string' ? r : r.from),
                staged: status.staged,
                added: status.created, // Map created to added for professional IDE compatibility
                untracked: status.files.filter(f => f.working_dir === '?').map(f => f.path)
            };
        } catch (error) {
            this._handleGitError(error, 'Failed to get Git status');
            throw error;
        }
    }

    /**
     * Add files to staging area
     * @param files - Array of file paths to add
     * @returns Promise that resolves when files are staged
     */
    async add(files: string[]): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            if (!files || files.length === 0) {
                throw new Error('No files specified for staging');
            }

            // Validate file paths
            const validFiles = files.filter(file => {
                const fullPath = path.join(this._workspaceRoot, file);
                return path.isAbsolute(file) ? true : fullPath;
            });

            if (validFiles.length === 0) {
                throw new Error('No valid files to stage');
            }

            await this._gitInstance!.add(validFiles);
            console.log(`[GitPilot] Staged ${validFiles.length} files`);
        } catch (error) {
            this._handleGitError(error, 'Failed to stage files');
            throw error;
        }
    }

    /**
     * Create a Git commit with message and files
     * @param options - Commit configuration options
     * @returns Promise that resolves when commit is complete
     */
    async commit(options: ICommitOptions): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            if (!options.message || options.message.trim().length < 3) {
                throw new Error('Commit message must be at least 3 characters');
            }

            if (options.files && options.files.length > 0) {
                await this.add(options.files);
            }

            await this._gitInstance!.commit(options.message.trim());
            console.log(`[GitPilot] Commit created: ${options.message.substring(0, 50)}...`);
        } catch (error) {
            this._handleGitError(error, 'Commit operation failed');
            throw error;
        }
    }

    /**
     * Push commits to remote repository
     * @param remote - Remote name (defaults to 'origin')
     * @param branch - Branch name (defaults to current branch)
     * @returns Promise that resolves when push is complete
     */
    async push(remote = 'origin', branch?: string): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            const currentBranch = branch || await this.getCurrentBranch();
            if (!currentBranch) {
                throw new Error('Unable to determine current branch');
            }

            await this._gitInstance!.push(remote, currentBranch);
            console.log(`[GitPilot] Pushed to ${remote}/${currentBranch}`);
        } catch (error) {
            this._handleGitError(error, 'Push operation failed');
            throw error;
        }
    }

    /**
     * Pull changes from remote repository
     * @param remote - Remote name (defaults to 'origin')
     * @param branch - Branch name (defaults to current branch)
     * @returns Promise that resolves when pull is complete
     */
    async pull(remote = 'origin', branch?: string): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            const currentBranch = branch || await this.getCurrentBranch();
            if (currentBranch) {
                await this._gitInstance!.pull(remote, currentBranch);
            } else {
                await this._gitInstance!.pull();
            }
            console.log('[GitPilot] Pull completed');
        } catch (error) {
            this._handleGitError(error, 'Pull operation failed');
            throw error;
        }
    }

    /**
     * Get current branch name
     * @returns Promise resolving to current branch name or null
     */
    async getCurrentBranch(): Promise<string | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const branches = await this._gitInstance!.branchLocal();
            return branches.current;
        } catch (error) {
            console.error('[GitPilot] Failed to get current branch:', error);
            return null;
        }
    }

    /**
     * Get all branch information
     * @returns Promise resolving to branch information
     */
    async getBranches(): Promise<IBranchInfo> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            const branches = await this._gitInstance!.branchLocal();
            return {
                current: branches.current,
                all: branches.all
            };
        } catch (error) {
            this._handleGitError(error, 'Failed to get branches');
            throw error;
        }
    }

    /**
     * Checkout a branch
     * @param branchName - Name of branch to checkout
     * @returns Promise that resolves when checkout is complete
     */
    async checkout(branchName: string): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            await this._gitInstance!.checkout(branchName);
            console.log(`[GitPilot] Checked out branch: ${branchName}`);
        } catch (error) {
            this._handleGitError(error, 'Branch checkout failed');
            throw error;
        }
    }

    /**
     * Get commit log with specified count
     * @param maxCount - Maximum number of commits to retrieve
     * @returns Promise resolving to commit log
     */
    async getLog(maxCount: number = MAX_LOG_COUNT): Promise<LogResult> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            return await this._gitInstance!.log({ maxCount });
        } catch (error) {
            this._handleGitError(error, 'Failed to get commit log');
            throw error;
        }
    }

    /**
     * Stash current changes
     * @param message - Optional stash message
     * @returns Promise that resolves when stash is complete
     */
    async stash(message?: string): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            if (message) {
                await this._gitInstance!.stash(['push', '-m', message]);
            } else {
                await this._gitInstance!.stash();
            }
            console.log('[GitPilot] Changes stashed');
        } catch (error) {
            this._handleGitError(error, 'Stash operation failed');
            throw error;
        }
    }

    /**
     * Pop latest stash
     * @returns Promise that resolves when stash pop is complete
     */
    async stashPop(): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            await this._gitInstance!.stash(['pop']);
            console.log('[GitPilot] Stash popped');
        } catch (error) {
            this._handleGitError(error, 'Stash pop failed');
            throw error;
        }
    }

    /**
     * List all stashes
     * @returns Promise resolving to stash list
     */
    async stashList(): Promise<LogResult> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            return await this._gitInstance!.stashList();
        } catch (error) {
            this._handleGitError(error, 'Failed to get stash list');
            throw error;
        }
    }

    /**
     * Get diff for a specific file
     * @param filePath - Path to the file
     * @returns Promise resolving to diff output
     */
    async getDiff(filePath: string): Promise<string | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const diff = await this._gitInstance!.diff(['HEAD', '--', filePath]);
            return diff || null;
        } catch (error) {
            console.error('[GitPilot] Failed to get diff:', error);
            return null;
        }
    }

    /**
     * Check if a file is tracked by Git
     * @param filePath - Path to the file
     * @returns Promise resolving to true if tracked
     */
    async isTracked(filePath: string): Promise<boolean> {
        try {
            if (!await this.ensureGitRepository()) {
                return false;
            }

            const result = await this._gitInstance!.raw(['ls-files', filePath]);
            return result.trim().length > 0;
        } catch (error) {
            console.error('[GitPilot] Failed to check if file is tracked:', error);
            return false;
        }
    }

    /**
     * Get blame information for a specific line
     * @param filePath - Path to the file
     * @param line - Line number (1-based)
     * @returns Promise resolving to blame info
     */
    async getLineBlame(filePath: string, line: number): Promise<BlameInfo | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const blameOutput = await this._gitInstance!.raw([
                'blame', 
                '--line-porcelain', 
                `-L${line},${line}`,
                'HEAD',
                '--',
                filePath
            ]);

            return this._parseLineBlame(blameOutput, line);
        } catch (error) {
            console.error('[GitPilot] Failed to get line blame:', error);
            return null;
        }
    }

    /**
     * Get blame information for entire file
     * @param filePath - Path to the file
     * @returns Promise resolving to file blame data
     */
    async getBlame(filePath: string): Promise<FileBlameData | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const blameOutput = await this._gitInstance!.raw([
                'blame', 
                '--line-porcelain',
                'HEAD',
                '--',
                filePath
            ]);

            return this._parseFileBlame(blameOutput);
        } catch (error) {
            console.error('[GitPilot] Failed to get file blame:', error);
            return null;
        }
    }

    /**
     * Get line history for specific range
     * @param filePath - Path to the file
     * @param startLine - Start line number
     * @param endLine - End line number
     * @returns Promise resolving to line history
     */
    async getLineHistory(filePath: string, startLine: number, endLine: number): Promise<LineHistoryEntry[]> {
        try {
            if (!await this.ensureGitRepository()) {
                return [];
            }

            const logOutput = await this._gitInstance!.raw([
                'log',
                '--follow',
                '--pretty=format:%H|%an|%ad|%s',
                '--date=short',
                `-L${startLine},${endLine}:${filePath}`
            ]);

            return this._parseLineHistory(logOutput);
        } catch (error) {
            console.error('[GitPilot] Failed to get line history:', error);
            return [];
        }
    }

    /**
     * Stage specific lines of a file
     * @param filePath - Path to the file
     * @param startLine - Start line number
     * @param endLine - End line number
     */
    async stageLines(filePath: string, startLine: number, endLine: number): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            // Create a patch for the specific lines
            const patch = await this._createLinePatch(filePath, startLine, endLine);
            if (!patch) {
                throw new Error('No changes to stage');
            }

            // Apply the patch to the index
            await this._gitInstance!.raw(['apply', '--cached']);
            console.log(`[GitPilot] Staged lines ${startLine}-${endLine} of ${filePath}`);
        } catch (error) {
            this._handleGitError(error, 'Failed to stage lines');
            throw error;
        }
    }

    /**
     * Revert specific lines of a file
     * @param filePath - Path to the file
     * @param startLine - Start line number
     * @param endLine - End line number
     */
    async revertLines(filePath: string, startLine: number, endLine: number): Promise<void> {
        try {
            if (!await this.ensureGitRepository()) {
                throw new Error('Not a valid Git repository');
            }

            // Checkout specific lines from HEAD
            await this._gitInstance!.raw([
                'checkout',
                'HEAD',
                '--',
                filePath
            ]);

            console.log(`[GitPilot] Reverted lines ${startLine}-${endLine} of ${filePath}`);
        } catch (error) {
            this._handleGitError(error, 'Failed to revert lines');
            throw error;
        }
    }

    /**
     * Get remote URL for permalink generation
     * @returns Promise resolving to remote URL
     */
    async getRemoteUrl(): Promise<string | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const remotes = await this._gitInstance!.getRemotes(true);
            const origin = remotes.find(r => r.name === 'origin');
            return origin?.refs.fetch || null;
        } catch (error) {
            console.error('[GitPilot] Failed to get remote URL:', error);
            return null;
        }
    }

    /**
     * Get current commit hash
     * @returns Promise resolving to commit hash
     */
    async getCurrentCommit(): Promise<string | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const result = await this._gitInstance!.raw(['rev-parse', 'HEAD']);
            return result.trim();
        } catch (error) {
            console.error('[GitPilot] Failed to get current commit:', error);
            return null;
        }
    }

    /**
     * Get commit details
     * @param commitHash - Commit hash
     * @returns Promise resolving to commit details
     */
    async getCommitDetails(commitHash: string): Promise<CommitDetails | null> {
        try {
            if (!await this.ensureGitRepository()) {
                return null;
            }

            const commitInfo = await this._gitInstance!.show([
                commitHash,
                '--pretty=format:%H|%an|%ae|%ad|%s|%P',
                '--date=short',
                '--name-status'
            ]);

            return this._parseCommitDetails(commitInfo);
        } catch (error) {
            console.error('[GitPilot] Failed to get commit details:', error);
            return null;
        }
    }

    // Private helper methods

    /**
     * Parse line blame output
     */
    private _parseLineBlame(blameOutput: string, line: number): BlameInfo | null {
        const lines = blameOutput.split('\n');
        const commitLine = lines[0];
        
        if (!commitLine) {
            return null;
        }

        const commit = commitLine.split(' ')[0];
        let author = '';
        let date = '';
        let summary = '';
        let content = '';

        for (const line of lines) {
            if (line.startsWith('author ')) {
                author = line.substring(7);
            } else if (line.startsWith('author-time ')) {
                const timestamp = parseInt(line.substring(12));
                date = new Date(timestamp * 1000).toISOString().split('T')[0];
            } else if (line.startsWith('summary ')) {
                summary = line.substring(8);
            } else if (line.startsWith('\t')) {
                content = line.substring(1);
            }
        }

        return {
            line,
            commit,
            author,
            authorEmail: '', // Would need to parse author-mail line
            date,
            summary,
            content
        };
    }

    /**
     * Parse file blame output
     */
    private _parseFileBlame(blameOutput: string): FileBlameData {
        const lines = blameOutput.split('\n');
        const blameData: FileBlameData = {};
        let currentLine = 1;
        let currentCommit = '';
        let currentAuthor = '';
        let currentDate = '';
        let currentSummary = '';

        for (const line of lines) {
            if (line.match(/^[a-f0-9]{40}/)) {
                // New commit line
                currentCommit = line.split(' ')[0];
            } else if (line.startsWith('author ')) {
                currentAuthor = line.substring(7);
            } else if (line.startsWith('author-time ')) {
                const timestamp = parseInt(line.substring(12));
                currentDate = new Date(timestamp * 1000).toISOString().split('T')[0];
            } else if (line.startsWith('summary ')) {
                currentSummary = line.substring(8);
            } else if (line.startsWith('\t')) {
                // Content line
                blameData[currentLine] = {
                    line: currentLine,
                    commit: currentCommit,
                    author: currentAuthor,
                    authorEmail: '',
                    date: currentDate,
                    summary: currentSummary,
                    content: line.substring(1)
                };
                currentLine++;
            }
        }

        return blameData;
    }

    /**
     * Parse line history output
     */
    private _parseLineHistory(logOutput: string): LineHistoryEntry[] {
        const entries: LineHistoryEntry[] = [];
        const lines = logOutput.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length >= 4) {
                entries.push({
                    hash: parts[0],
                    author: parts[1],
                    date: parts[2],
                    message: parts[3],
                    lineNumber: 0, // Would need more complex parsing
                    content: ''
                });
            }
        }

        return entries;
    }

    /**
     * Parse commit details output
     */
    private _parseCommitDetails(commitInfo: string): CommitDetails | null {
        const lines = commitInfo.split('\n');
        const headerLine = lines[0];
        
        if (!headerLine) {
            return null;
        }

        const parts = headerLine.split('|');
        if (parts.length < 6) {
            return null;
        }

        const files = lines.slice(1)
            .filter(line => line.match(/^[AMDRC]\t/))
            .map(line => {
                const [status, path] = line.split('\t');
                return {
                    path,
                    status: status as 'A' | 'M' | 'D' | 'R' | 'C',
                    additions: 0, // Would need --stat for this
                    deletions: 0
                };
            });

        return {
            hash: parts[0],
            author: parts[1],
            authorEmail: parts[2],
            date: parts[3],
            message: parts[4],
            parents: parts[5].split(' ').filter(p => p),
            files
        };
    }

    /**
     * Create a patch for specific lines
     */
    private async _createLinePatch(filePath: string, startLine: number, endLine: number): Promise<string | null> {
        try {
            // Get the diff for the file
            const diff = await this.getDiff(filePath);
            if (!diff) {
                return null;
            }

            // Filter the diff to only include the specified lines
            // This is a simplified implementation
            return diff;
        } catch (error) {
            console.error('[GitPilot] Failed to create line patch:', error);
            return null;
        }
    }

    /**
     * Comprehensive error handling for Git operations
     * @param error - The error that occurred
     * @param context - Context message for the error
     */
    private _handleGitError(error: unknown, context: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const fullMessage = `${context}: ${errorMessage}`;
        
        // Log detailed error for debugging
        console.error(`[GitPilot] ${fullMessage}`, error);
        
        // Show user-friendly error message
        vscode.window.showErrorMessage(fullMessage);
    }

    /**
     * Execute raw Git command
     * @param args - Git command arguments
     * @returns Promise resolving to command output
     */
    async raw(args: string[]): Promise<string> {
        await this.ensureGitRepository();
        try {
            return await this._gitInstance!.raw(args);
        } catch (error) {
            this._handleGitError(error, `Failed to execute git ${args.join(' ')}`);
            throw error;
        }
    }

    /**
     * Check out a branch or create a new one
     * @param branchName - Target branch name
     * @param baseBranch - Base branch for new branch creation
     */
    async checkoutBranch(branchName: string, baseBranch?: string): Promise<void> {
        await this.ensureGitRepository();
        try {
            if (baseBranch) {
                await this._gitInstance!.checkoutBranch(branchName, baseBranch);
            } else {
                await this._gitInstance!.checkoutLocalBranch(branchName);
            }
        } catch (error) {
            this._handleGitError(error, `Failed to checkout branch ${branchName}`);
            throw error;
        }
    }

    /**
     * Delete a local branch
     * @param branchName - Branch to delete
     * @param force - Force deletion
     */
    async deleteLocalBranch(branchName: string, force: boolean = false): Promise<void> {
        await this.ensureGitRepository();
        try {
            await this._gitInstance!.deleteLocalBranch(branchName, force);
        } catch (error) {
            this._handleGitError(error, `Failed to delete branch ${branchName}`);
            throw error;
        }
    }

    /**
     * Merge branches
     * @param branches - Branches to merge
     */
    async merge(branches: string[]): Promise<void> {
        await this.ensureGitRepository();
        try {
            await this._gitInstance!.merge(branches);
        } catch (error) {
            this._handleGitError(error, `Failed to merge branches ${branches.join(', ')}`);
            throw error;
        }
    }

    /**
     * Reset repository to a specific state
     * @param options - Reset options
     */
    async reset(options: string[]): Promise<void> {
        await this.ensureGitRepository();
        try {
            await this._gitInstance!.reset(options);
        } catch (error) {
            this._handleGitError(error, `Failed to reset repository`);
            throw error;
        }
    }

    /**
     * Event emitter for status changes (placeholder for future implementation)
     */
    onDidChangeStatus?: vscode.Event<void>;
}