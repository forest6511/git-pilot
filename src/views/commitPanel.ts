import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { LocalChangesProvider } from './localChangesProvider';

export class ProfessionalCommitPanelProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly gitProvider: GitProvider,
        private readonly localChangesProvider: LocalChangesProvider
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getProfessionalHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'commit':
                    await this.commitChanges(data.message, data.commitAndPush);
                    break;
                case 'commitAndPush':
                    await this.commitAndPush(data.message);
                    break;
                case 'loadChanges':
                    await this.loadChanges(webviewView.webview);
                    break;
            }
        });

        // Load initial changes
        this.loadChanges(webviewView.webview);
    }

    private async loadChanges(webview: vscode.Webview) {
        try {
            const status = await this.gitProvider.getStatus();
            const checkedFiles = this.localChangesProvider.getSelectedFiles();

            webview.postMessage({
                type: 'updateCheckedFiles',
                checkedFiles: checkedFiles,
                totalFiles: [
                    ...status.modified,
                    ...status.created,
                    ...status.deleted,
                    ...status.renamed,
                    ...status.conflicted
                ].length
            });
        } catch (error) {
            console.error('Error loading changes:', error);
            webview.postMessage({
                type: 'updateCheckedFiles',
                checkedFiles: [],
                totalFiles: 0
            });
        }
    }

    private async commitChanges(message: string, commitAndPush: boolean = false) {
        if (!message.trim()) {
            vscode.window.showErrorMessage('Commit message is required');
            return;
        }

        const checkedFiles = this.localChangesProvider.getSelectedFiles();
        if (checkedFiles.length === 0) {
            vscode.window.showErrorMessage('No files selected for commit');
            return;
        }

        try {
            await this.gitProvider.commit({
                message: message,
                files: checkedFiles
            });

            vscode.window.showInformationMessage(`Successfully committed ${checkedFiles.length} files`);

            if (commitAndPush) {
                await this.gitProvider.push();
                vscode.window.showInformationMessage('Changes pushed to remote');
            }

            // Refresh the local changes view
            this.localChangesProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to commit: ${error}`);
        }
    }

    private async commitAndPush(message: string) {
        await this.commitChanges(message, true);
    }

    private _getProfessionalHtmlForWebview(webview: vscode.Webview): string {
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
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                .commit-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                .commit-header {
                    padding: 8px 12px;
                    background: var(--vscode-sideBar-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-weight: 500;
                    font-size: 13px;
                }
                .commit-files-info {
                    padding: 4px 12px;
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    background: var(--vscode-sideBar-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .commit-message-container {
                    flex: 1;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                }
                .commit-message {
                    width: 100%;
                    flex: 1;
                    min-height: 100px;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    resize: none;
                    outline: none;
                }
                .commit-message:focus {
                    border-color: var(--vscode-focusBorder);
                }
                .commit-options {
                    margin: 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                }
                .commit-options input[type="checkbox"] {
                    margin-right: 4px;
                }
                .commit-buttons {
                    display: flex;
                    gap: 8px;
                    margin-top: 8px;
                }
                .commit-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    min-width: 80px;
                }
                .commit-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .commit-btn:disabled {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    cursor: not-allowed;
                }
                .commit-btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .commit-btn-secondary:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .shortcut-hint {
                    color: var(--vscode-descriptionForeground);
                    font-size: 10px;
                    margin-left: 4px;
                }
                .no-files {
                    color: var(--vscode-descriptionForeground);
                    text-align: center;
                    font-style: italic;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="commit-container">
                <div class="commit-header">Commit</div>
                <div class="commit-files-info" id="filesInfo">
                    No files selected
                </div>
                
                <div class="commit-message-container">
                    <textarea 
                        class="commit-message" 
                        id="commitMessage" 
                        placeholder="Commit message"
                        autocomplete="off"
                        spellcheck="false">
                    </textarea>
                    
                    <div class="commit-options">
                        <label>
                            <input type="checkbox" id="amendCommit"> Amend previous commit
                        </label>
                    </div>
                    
                    <div class="commit-buttons">
                        <button class="commit-btn" id="commitBtn" disabled>
                            Commit
                            <span class="shortcut-hint">(⌘+Enter)</span>
                        </button>
                        <button class="commit-btn commit-btn-secondary" id="commitAndPushBtn" disabled>
                            Commit and Push...
                            <span class="shortcut-hint">(⌘+Shift+Enter)</span>
                        </button>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let checkedFilesCount = 0;
                
                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateCheckedFiles':
                            updateFilesInfo(message.checkedFiles, message.totalFiles);
                            break;
                    }
                });

                function updateFilesInfo(checkedFiles, totalFiles) {
                    checkedFilesCount = checkedFiles.length;
                    const filesInfo = document.getElementById('filesInfo');
                    
                    if (checkedFilesCount === 0) {
                        filesInfo.textContent = 'No files selected';
                    } else {
                        filesInfo.textContent = checkedFilesCount === 1 
                            ? '1 file selected'
                            : \`\${checkedFilesCount} files selected\`;
                    }
                    
                    updateCommitButtons();
                }
                
                function updateCommitButtons() {
                    const message = document.getElementById('commitMessage').value.trim();
                    const commitBtn = document.getElementById('commitBtn');
                    const commitAndPushBtn = document.getElementById('commitAndPushBtn');
                    
                    const canCommit = checkedFilesCount > 0 && message;
                    commitBtn.disabled = !canCommit;
                    commitAndPushBtn.disabled = !canCommit;
                }

                // Commit message input
                document.getElementById('commitMessage').addEventListener('input', updateCommitButtons);
                
                // Keyboard shortcuts
                document.getElementById('commitMessage').addEventListener('keydown', (e) => {
                    if (e.metaKey || e.ctrlKey) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.shiftKey) {
                                // Ctrl+Shift+Enter = Commit and Push
                                commitAndPush();
                            } else {
                                // Ctrl+Enter = Commit
                                commit();
                            }
                        }
                    }
                });
                
                // Commit button
                document.getElementById('commitBtn').onclick = commit;
                document.getElementById('commitAndPushBtn').onclick = commitAndPush;
                
                function commit() {
                    const message = document.getElementById('commitMessage').value.trim();
                    
                    if (checkedFilesCount > 0 && message) {
                        vscode.postMessage({ 
                            type: 'commit', 
                            message: message 
                        });
                        
                        // Clear form after commit
                        document.getElementById('commitMessage').value = '';
                        updateCommitButtons();
                    }
                }
                
                function commitAndPush() {
                    const message = document.getElementById('commitMessage').value.trim();
                    
                    if (checkedFilesCount > 0 && message) {
                        vscode.postMessage({ 
                            type: 'commitAndPush', 
                            message: message 
                        });
                        
                        // Clear form after commit
                        document.getElementById('commitMessage').value = '';
                        updateCommitButtons();
                    }
                }

                // Load initial changes
                vscode.postMessage({ type: 'loadChanges' });
            </script>
        </body>
        </html>`;
    }
}