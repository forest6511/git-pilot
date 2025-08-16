import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

/**
 * Represents a Git commit with complete metadata
 */
export interface GitCommit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    authorEmail: string;
    date: Date;
    parents: string[];
    refs?: string[];
    files: {
        name: string;
        status: 'A' | 'M' | 'D' | 'R' | 'C';
        insertions?: number;
        deletions?: number;
    }[];
}

/**
 * Search criteria for Git history
 */
export interface HistorySearchCriteria {
    author?: string;
    message?: string;
    since?: Date;
    until?: Date;
    filePath?: string;
    maxCount?: number;
}

/**
 * Comprehensive Git history and log viewer with search and visualization
 */
export class HistoryPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitpilot.history';
    
    private _view?: vscode.WebviewView;
    private commits: GitCommit[] = [];
    private isLoading = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private gitProvider: GitProvider
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'loadHistory':
                    await this.loadHistory(data.criteria);
                    break;
                case 'showCommitDetails':
                    await this.showCommitDetails(data.hash);
                    break;
                case 'compareCommits':
                    await this.compareCommits(data.hash1, data.hash2);
                    break;
                case 'cherryPick':
                    await this.cherryPickCommit(data.hash);
                    break;
                case 'revertCommit':
                    await this.revertCommit(data.hash);
                    break;
                case 'createPatch':
                    await this.createPatch(data.hash);
                    break;
                case 'exportHistory':
                    await this.exportHistory();
                    break;
                case 'search':
                    await this.searchHistory(data.criteria);
                    break;
            }
        });

        // Load initial history
        this.loadHistory();
    }

    /**
     * Load Git commit history
     */
    private async loadHistory(criteria?: HistorySearchCriteria): Promise<void> {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            this._view?.webview.postMessage({ type: 'loading', isLoading: true });

            this.commits = await this.getCommitHistory(criteria);
            
            this._view?.webview.postMessage({
                type: 'historyLoaded',
                commits: this.commits.map(c => this.serializeCommit(c))
            });

        } catch (error) {
            console.error('Failed to load history:', error);
            this._view?.webview.postMessage({
                type: 'error',
                message: `Failed to load history: ${error}`
            });
        } finally {
            this.isLoading = false;
            this._view?.webview.postMessage({ type: 'loading', isLoading: false });
        }
    }

    /**
     * Get commit history with optional search criteria
     */
    private async getCommitHistory(criteria?: HistorySearchCriteria): Promise<GitCommit[]> {
        try {
            const args = ['log', '--pretty=format:%H|%h|%s|%an|%ae|%ai|%P|%D', '--name-status'];
            
            // Apply search criteria
            if (criteria?.maxCount) {
                args.push(`-${criteria.maxCount}`);
            } else {
                args.push('-100'); // Default limit
            }
            
            if (criteria?.author) {
                args.push(`--author=${criteria.author}`);
            }
            
            if (criteria?.message) {
                args.push(`--grep=${criteria.message}`);
            }
            
            if (criteria?.since) {
                args.push(`--since=${criteria.since.toISOString()}`);
            }
            
            if (criteria?.until) {
                args.push(`--until=${criteria.until.toISOString()}`);
            }
            
            if (criteria?.filePath) {
                args.push('--', criteria.filePath);
            }

            const result = await this.gitProvider.raw(args);
            return this.parseCommitHistory(result);

        } catch (error) {
            console.error('Failed to get commit history:', error);
            return [];
        }
    }

    /**
     * Parse Git log output into commit objects
     */
    private parseCommitHistory(logOutput: string): GitCommit[] {
        const commits: GitCommit[] = [];
        const entries = logOutput.split('\n\n');

        for (const entry of entries) {
            if (!entry.trim()) continue;

            const lines = entry.trim().split('\n');
            const commitLine = lines[0];
            
            if (!commitLine.includes('|')) continue;

            const [hash, shortHash, message, author, authorEmail, dateStr, parents, refs] = commitLine.split('|');

            const files = lines.slice(1)
                .filter(line => line.match(/^[AMDRC]\s+/))
                .map(line => {
                    const [status, name] = line.split('\t');
                    return {
                        name: name || '',
                        status: status as 'A' | 'M' | 'D' | 'R' | 'C'
                    };
                });

            commits.push({
                hash: hash.trim(),
                shortHash: shortHash.trim(),
                message: message.trim(),
                author: author.trim(),
                authorEmail: authorEmail.trim(),
                date: new Date(dateStr.trim()),
                parents: parents ? parents.trim().split(' ').filter(p => p) : [],
                refs: refs ? refs.trim().split(', ').filter(r => r) : [],
                files
            });
        }

        return commits;
    }

    /**
     * Search commit history
     */
    private async searchHistory(criteria: HistorySearchCriteria): Promise<void> {
        await this.loadHistory(criteria);
    }

    /**
     * Show detailed commit information
     */
    private async showCommitDetails(hash: string): Promise<void> {
        try {
            const commit = this.commits.find(c => c.hash === hash || c.shortHash === hash);
            if (!commit) return;

            // Get detailed commit information
            const showResult = await this.gitProvider.raw(['show', '--stat', hash]);
            
            // Create a document to show commit details
            const doc = await vscode.workspace.openTextDocument({
                content: showResult,
                language: 'git-commit'
            });
            
            await vscode.window.showTextDocument(doc);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show commit details: ${error}`);
        }
    }

    /**
     * Compare two commits
     */
    private async compareCommits(hash1: string, hash2: string): Promise<void> {
        try {
            const diff = await this.gitProvider.raw(['diff', hash1, hash2]);
            
            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });
            
            await vscode.window.showTextDocument(doc);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to compare commits: ${error}`);
        }
    }

    /**
     * Cherry-pick a commit
     */
    private async cherryPickCommit(hash: string): Promise<void> {
        try {
            const commit = this.commits.find(c => c.hash === hash || c.shortHash === hash);
            if (!commit) return;

            const confirmation = await vscode.window.showInformationMessage(
                `Cherry-pick commit "${commit.message}"?`,
                'Cherry-pick',
                'Cancel'
            );

            if (confirmation === 'Cherry-pick') {
                await this.gitProvider.raw(['cherry-pick', hash]);
                vscode.window.showInformationMessage(`✓ Commit cherry-picked: ${commit.shortHash}`);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to cherry-pick commit: ${error}`);
        }
    }

    /**
     * Revert a commit
     */
    private async revertCommit(hash: string): Promise<void> {
        try {
            const commit = this.commits.find(c => c.hash === hash || c.shortHash === hash);
            if (!commit) return;

            const confirmation = await vscode.window.showWarningMessage(
                `Revert commit "${commit.message}"?`,
                'Revert',
                'Cancel'
            );

            if (confirmation === 'Revert') {
                await this.gitProvider.raw(['revert', '--no-edit', hash]);
                vscode.window.showInformationMessage(`✓ Commit reverted: ${commit.shortHash}`);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to revert commit: ${error}`);
        }
    }

    /**
     * Create patch from commit
     */
    private async createPatch(hash: string): Promise<void> {
        try {
            const commit = this.commits.find(c => c.hash === hash || c.shortHash === hash);
            if (!commit) return;

            const patch = await this.gitProvider.raw(['format-patch', '-1', '--stdout', hash]);
            
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${commit.shortHash}.patch`),
                filters: {
                    'Patch files': ['patch'],
                    'All files': ['*']
                }
            });

            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(patch, 'utf8'));
                vscode.window.showInformationMessage(`✓ Patch saved: ${saveUri.fsPath}`);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create patch: ${error}`);
        }
    }

    /**
     * Export history to file
     */
    private async exportHistory(): Promise<void> {
        try {
            const format = await vscode.window.showQuickPick([
                { label: 'JSON', value: 'json' },
                { label: 'CSV', value: 'csv' },
                { label: 'Text', value: 'txt' }
            ], {
                placeHolder: 'Select export format'
            });

            if (!format) return;

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`git-history.${format.value}`),
                filters: {
                    'Export files': [format.value],
                    'All files': ['*']
                }
            });

            if (saveUri) {
                const content = this.formatHistoryExport(format.value as 'json' | 'csv' | 'txt');
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`✓ History exported: ${saveUri.fsPath}`);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export history: ${error}`);
        }
    }

    /**
     * Format history for export
     */
    private formatHistoryExport(format: 'json' | 'csv' | 'txt'): string {
        switch (format) {
            case 'json':
                return JSON.stringify(this.commits, null, 2);
            
            case 'csv':
                const headers = 'Hash,Short Hash,Message,Author,Email,Date,Files\n';
                const rows = this.commits.map(c => 
                    `"${c.hash}","${c.shortHash}","${c.message}","${c.author}","${c.authorEmail}","${c.date.toISOString()}","${c.files.length}"`
                ).join('\n');
                return headers + rows;
            
            case 'txt':
                return this.commits.map(c => 
                    `${c.shortHash} ${c.message}\n` +
                    `Author: ${c.author} <${c.authorEmail}>\n` +
                    `Date: ${c.date.toISOString()}\n` +
                    `Files: ${c.files.length}\n\n`
                ).join('');
            
            default:
                return '';
        }
    }

    /**
     * Serialize commit for webview
     */
    private serializeCommit(commit: GitCommit) {
        return {
            ...commit,
            date: commit.date.toISOString()
        };
    }

    /**
     * Get HTML content for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                }
                .container {
                    padding: 16px;
                }
                .search-section {
                    margin-bottom: 16px;
                    padding: 12px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .search-row {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;
                    align-items: center;
                }
                .search-input {
                    flex: 1;
                    padding: 4px 8px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                }
                .btn {
                    padding: 4px 12px;
                    border: none;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    cursor: pointer;
                    border-radius: 2px;
                }
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .commit-list {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .commit-item {
                    padding: 12px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                }
                .commit-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .commit-item:last-child {
                    border-bottom: none;
                }
                .commit-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                }
                .commit-hash {
                    font-family: monospace;
                    color: var(--vscode-textLink-foreground);
                    font-size: 12px;
                }
                .commit-date {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }
                .commit-message {
                    font-weight: 500;
                    margin-bottom: 4px;
                }
                .commit-author {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                }
                .commit-files {
                    margin-top: 8px;
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
                .actions {
                    margin-top: 8px;
                    display: flex;
                    gap: 4px;
                }
                .action-btn {
                    padding: 2px 6px;
                    font-size: 10px;
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    cursor: pointer;
                    border-radius: 2px;
                }
                .action-btn:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="search-section">
                    <div class="search-row">
                        <input type="text" id="authorSearch" class="search-input" placeholder="Filter by author...">
                        <input type="text" id="messageSearch" class="search-input" placeholder="Filter by message...">
                    </div>
                    <div class="search-row">
                        <input type="date" id="sinceDate" class="search-input">
                        <input type="date" id="untilDate" class="search-input">
                        <input type="number" id="maxCount" class="search-input" placeholder="Max commits" value="100">
                    </div>
                    <div class="search-row">
                        <button class="btn" onclick="searchHistory()">Search</button>
                        <button class="btn btn-secondary" onclick="clearSearch()">Clear</button>
                        <button class="btn btn-secondary" onclick="exportHistory()">Export</button>
                    </div>
                </div>
                
                <div id="loading" class="loading" style="display: none;">Loading history...</div>
                <div id="commitList" class="commit-list"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let commits = [];

                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'historyLoaded':
                            commits = message.commits;
                            renderCommits();
                            break;
                        case 'loading':
                            document.getElementById('loading').style.display = message.isLoading ? 'block' : 'none';
                            break;
                        case 'error':
                            document.getElementById('commitList').innerHTML = 
                                '<div class="loading">Error: ' + message.message + '</div>';
                            break;
                    }
                });

                function renderCommits() {
                    const container = document.getElementById('commitList');
                    if (commits.length === 0) {
                        container.innerHTML = '<div class="loading">No commits found</div>';
                        return;
                    }

                    container.innerHTML = commits.map(commit => 
                        '<div class="commit-item" onclick="showCommitDetails(\'' + commit.hash + '\')">' +
                            '<div class="commit-header">' +
                                '<span class="commit-hash">' + commit.shortHash + '</span>' +
                                '<span class="commit-date">' + new Date(commit.date).toLocaleDateString() + '</span>' +
                            '</div>' +
                            '<div class="commit-message">' + commit.message + '</div>' +
                            '<div class="commit-author">' + commit.author + '</div>' +
                            '<div class="commit-files">' + commit.files.length + ' files changed</div>' +
                            '<div class="actions">' +
                                '<button class="action-btn" onclick="event.stopPropagation(); cherryPick(\'' + commit.hash + '\')">Cherry-pick</button>' +
                                '<button class="action-btn" onclick="event.stopPropagation(); revertCommit(\'' + commit.hash + '\')">Revert</button>' +
                                '<button class="action-btn" onclick="event.stopPropagation(); createPatch(\'' + commit.hash + '\')">Patch</button>' +
                            '</div>' +
                        '</div>'
                    ).join('');
                }

                function searchHistory() {
                    const criteria = {
                        author: document.getElementById('authorSearch').value,
                        message: document.getElementById('messageSearch').value,
                        since: document.getElementById('sinceDate').value ? new Date(document.getElementById('sinceDate').value) : null,
                        until: document.getElementById('untilDate').value ? new Date(document.getElementById('untilDate').value) : null,
                        maxCount: parseInt(document.getElementById('maxCount').value) || 100
                    };
                    
                    vscode.postMessage({ type: 'search', criteria });
                }

                function clearSearch() {
                    document.getElementById('authorSearch').value = '';
                    document.getElementById('messageSearch').value = '';
                    document.getElementById('sinceDate').value = '';
                    document.getElementById('untilDate').value = '';
                    document.getElementById('maxCount').value = '100';
                    vscode.postMessage({ type: 'loadHistory' });
                }

                function showCommitDetails(hash) {
                    vscode.postMessage({ type: 'showCommitDetails', hash });
                }

                function cherryPick(hash) {
                    vscode.postMessage({ type: 'cherryPick', hash });
                }

                function revertCommit(hash) {
                    vscode.postMessage({ type: 'revertCommit', hash });
                }

                function createPatch(hash) {
                    vscode.postMessage({ type: 'createPatch', hash });
                }

                function exportHistory() {
                    vscode.postMessage({ type: 'exportHistory' });
                }

                // Load initial history
                vscode.postMessage({ type: 'loadHistory' });
            </script>
        </body>
        </html>`;
    }

    public refresh(): void {
        this.loadHistory();
    }

    public dispose(): void {
        // Cleanup any resources if needed
    }
}