import * as vscode from 'vscode';
import { ChangelistStore } from '../../models/changelistStore';
import { Changelist } from '../../models/changelist';
import { FileChange } from '../../models/fileChange';

/**
 * Professional modal commit dialog matching enterprise IDE standards
 */
export class ModalCommitDialog {
    private panel: vscode.WebviewPanel | undefined;
    private changelistStore: ChangelistStore;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        changelistStore: ChangelistStore
    ) {
        this.changelistStore = changelistStore;
    }

    /**
     * Show the modal commit dialog
     */
    async show(preselectedChangelist?: string): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'gitpilotCommitDialog',
            'Commit Changes',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: false,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        // Configure panel properties for modal behavior
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'icons', 'commit-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'icons', 'commit-dark.svg')
        };

        // Set up the HTML content
        this.panel.webview.html = await this.getWebviewContent();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'commit':
                        await this.handleCommit(message.data);
                        break;
                    case 'commitAndPush':
                        await this.handleCommitAndPush(message.data);
                        break;
                    case 'cancel':
                        this.close();
                        break;
                    case 'updateProject':
                        await this.handleUpdateProject();
                        break;
                    case 'showDiff':
                        await this.handleShowDiff(message.filePath);
                        break;
                    case 'toggleFile':
                        await this.handleToggleFile(message.changelistId, message.filePath);
                        break;
                    case 'changeChangelist':
                        await this.handleChangeChangelist(message.changelistId);
                        break;
                    case 'ready':
                        await this.sendInitialData(preselectedChangelist);
                        break;
                }
            },
            undefined,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);

        // Focus the panel for modal behavior
        this.panel.reveal(vscode.ViewColumn.One, false);
    }

    /**
     * Get the HTML content for the webview
     */
    private async getWebviewContent(): Promise<string> {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Commit Changes</title>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --button-hover-bg: var(--vscode-button-hoverBackground);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
            --list-hover-bg: var(--vscode-list-hoverBackground);
            --list-active-bg: var(--vscode-list-activeSelectionBackground);
            --focus-border: var(--vscode-focusBorder);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--bg-color);
            color: var(--text-color);
            height: 100vh;
            overflow: hidden;
        }

        .dialog-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            max-width: 900px;
            margin: 0 auto;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background-color: var(--bg-color);
        }

        .dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
            background-color: var(--vscode-titleBar-activeBackground);
        }

        .dialog-title {
            font-weight: 600;
            font-size: 14px;
        }

        .header-buttons {
            display: flex;
            gap: 8px;
        }

        .header-button {
            padding: 4px 8px;
            background: var(--button-bg);
            color: var(--button-fg);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.1s;
        }

        .header-button:hover {
            background: var(--button-hover-bg);
        }

        .header-button:focus {
            outline: 1px solid var(--focus-border);
        }

        .dialog-content {
            display: flex;
            flex: 1;
            min-height: 0;
        }

        .left-panel {
            width: 40%;
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
        }

        .right-panel {
            width: 60%;
            display: flex;
            flex-direction: column;
        }

        .changelist-selector {
            padding: 12px;
            border-bottom: 1px solid var(--border-color);
        }

        .changelist-dropdown {
            width: 100%;
            padding: 6px 8px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 3px;
            color: var(--text-color);
            font-size: 13px;
        }

        .changelist-dropdown:focus {
            outline: 1px solid var(--focus-border);
        }

        .file-tree {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .file-item {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            cursor: pointer;
            border-radius: 3px;
            margin: 1px 0;
            transition: background-color 0.1s;
        }

        .file-item:hover {
            background-color: var(--list-hover-bg);
        }

        .file-item.selected {
            background-color: var(--list-active-bg);
        }

        .file-checkbox {
            margin-right: 8px;
        }

        .file-icon {
            margin-right: 6px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            border-radius: 50%;
            font-weight: bold;
        }

        .file-icon.modified { background-color: #007acc; color: white; }
        .file-icon.added { background-color: #28a745; color: white; }
        .file-icon.deleted { background-color: #dc3545; color: white; }
        .file-icon.renamed { background-color: #ffc107; color: black; }

        .file-path {
            flex: 1;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
        }

        .commit-section {
            height: 30%;
            padding: 12px;
            border-bottom: 1px solid var(--border-color);
        }

        .commit-message-label {
            display: block;
            font-weight: 600;
            margin-bottom: 6px;
            font-size: 13px;
        }

        .commit-message-textarea {
            width: 100%;
            height: calc(100% - 24px);
            padding: 8px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 3px;
            color: var(--text-color);
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            resize: none;
            line-height: 1.4;
        }

        .commit-message-textarea:focus {
            outline: 1px solid var(--focus-border);
        }

        .commit-message-textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .diff-preview {
            flex: 1;
            padding: 12px;
            overflow-y: auto;
        }

        .diff-content {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 3px;
            border: 1px solid var(--border-color);
        }

        .diff-line-added {
            background-color: var(--vscode-diffEditor-insertedTextBackground);
            color: var(--vscode-diffEditor-insertedTextForeground);
        }

        .diff-line-removed {
            background-color: var(--vscode-diffEditor-removedTextBackground);
            color: var(--vscode-diffEditor-removedTextForeground);
        }

        .dialog-footer {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            padding: 12px 16px;
            border-top: 1px solid var(--border-color);
            gap: 8px;
        }

        .footer-button {
            padding: 6px 16px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            transition: background-color 0.1s;
        }

        .footer-button.primary {
            background: var(--button-bg);
            color: var(--button-fg);
        }

        .footer-button.primary:hover {
            background: var(--button-hover-bg);
        }

        .footer-button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .footer-button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .footer-button:focus {
            outline: 1px solid var(--focus-border);
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="dialog-container">
        <div class="dialog-header">
            <div class="dialog-title">Commit Changes</div>
            <div class="header-buttons">
                <button class="header-button" onclick="updateProject()">Update Project</button>
                <button class="header-button" onclick="showSelectedDiff()">Show Diff</button>
                <button class="header-button" onclick="showSettings()">Settings</button>
            </div>
        </div>
        
        <div class="dialog-content">
            <div class="left-panel">
                <div class="changelist-selector">
                    <select class="changelist-dropdown" id="changelistSelector" onchange="onChangelistChange()">
                        <option value="">Loading changelists...</option>
                    </select>
                </div>
                
                <div class="file-tree" id="fileTree">
                    <div class="loading">Loading files...</div>
                </div>
            </div>
            
            <div class="right-panel">
                <div class="commit-section">
                    <label class="commit-message-label" for="commitMessage">Commit message:</label>
                    <textarea 
                        class="commit-message-textarea" 
                        id="commitMessage" 
                        placeholder="Enter commit message..."
                        onkeydown="handleCommitMessageKeydown(event)"
                    ></textarea>
                </div>
                
                <div class="diff-preview">
                    <div class="diff-content" id="diffContent">
                        Select files to see diff preview
                    </div>
                </div>
            </div>
        </div>
        
        <div class="dialog-footer">
            <button class="footer-button secondary" onclick="cancel()">Cancel</button>
            <button class="footer-button primary" onclick="commit()" id="commitButton">Commit</button>
            <button class="footer-button primary" onclick="commitAndPush()" id="commitPushButton">Commit and Push</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentData = null;
        let selectedFiles = new Set();

        // Initialize the dialog
        window.addEventListener('load', () => {
            vscode.postMessage({ command: 'ready' });
            
            // Focus commit message textarea
            const textarea = document.getElementById('commitMessage');
            if (textarea) {
                textarea.focus();
            }
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'initialData':
                    currentData = message.data;
                    renderChangelists();
                    break;
                case 'diffContent':
                    renderDiffContent(message.content);
                    break;
                case 'error':
                    showError(message.message);
                    break;
            }
        });

        function renderChangelists() {
            const selector = document.getElementById('changelistSelector');
            selector.innerHTML = '';
            
            currentData.changelists.forEach(changelist => {
                const option = document.createElement('option');
                option.value = changelist.id;
                option.textContent = \`\${changelist.name} (\${changelist.files.length} files)\`;
                if (changelist.isActive) {
                    option.selected = true;
                }
                selector.appendChild(option);
            });
            
            renderFiles();
        }

        function renderFiles() {
            const selector = document.getElementById('changelistSelector');
            const changelistId = selector.value;
            const changelist = currentData.changelists.find(cl => cl.id === changelistId);
            
            const fileTree = document.getElementById('fileTree');
            
            if (!changelist || !changelist.files.length) {
                fileTree.innerHTML = '<div class="empty-state">No files in selected changelist</div>';
                return;
            }
            
            fileTree.innerHTML = '';
            
            changelist.files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                if (selectedFiles.has(file.path)) {
                    fileItem.classList.add('selected');
                }
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'file-checkbox';
                checkbox.checked = file.isSelected;
                checkbox.onchange = () => toggleFile(file.path);
                
                const icon = document.createElement('div');
                icon.className = \`file-icon \${file.status.toLowerCase()}\`;
                icon.textContent = getStatusIcon(file.status);
                
                const path = document.createElement('div');
                path.className = 'file-path';
                path.textContent = file.relativePath;
                
                fileItem.appendChild(checkbox);
                fileItem.appendChild(icon);
                fileItem.appendChild(path);
                
                fileItem.onclick = (e) => {
                    if (e.target === checkbox) return;
                    selectFile(file.path);
                };
                
                fileTree.appendChild(fileItem);
            });
            
            updateDiffPreview();
        }

        function getStatusIcon(status) {
            switch (status.toUpperCase()) {
                case 'MODIFIED': return 'M';
                case 'ADDED': return 'A';
                case 'DELETED': return 'D';
                case 'RENAMED': return 'R';
                default: return '?';
            }
        }

        function selectFile(filePath) {
            selectedFiles.clear();
            selectedFiles.add(filePath);
            
            document.querySelectorAll('.file-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            const fileItems = Array.from(document.querySelectorAll('.file-item'));
            const fileItem = fileItems.find(item => 
                item.querySelector('.file-path').textContent === filePath
            );
            
            if (fileItem) {
                fileItem.classList.add('selected');
            }
            
            updateDiffPreview();
        }

        function toggleFile(filePath) {
            const changelistId = document.getElementById('changelistSelector').value;
            vscode.postMessage({
                command: 'toggleFile',
                changelistId: changelistId,
                filePath: filePath
            });
        }

        function onChangelistChange() {
            const changelistId = document.getElementById('changelistSelector').value;
            vscode.postMessage({
                command: 'changeChangelist',
                changelistId: changelistId
            });
            renderFiles();
        }

        function updateDiffPreview() {
            if (selectedFiles.size === 1) {
                const filePath = Array.from(selectedFiles)[0];
                vscode.postMessage({
                    command: 'showDiff',
                    filePath: filePath
                });
            } else {
                document.getElementById('diffContent').textContent = 
                    selectedFiles.size === 0 ? 'Select a file to see diff preview' : 
                    'Select a single file to see diff preview';
            }
        }

        function renderDiffContent(content) {
            const diffContainer = document.getElementById('diffContent');
            diffContainer.innerHTML = '';
            
            if (!content) {
                diffContainer.textContent = 'No changes to display';
                return;
            }
            
            const lines = content.split('\\n');
            lines.forEach(line => {
                const lineElement = document.createElement('div');
                
                if (line.startsWith('+')) {
                    lineElement.className = 'diff-line-added';
                } else if (line.startsWith('-')) {
                    lineElement.className = 'diff-line-removed';
                }
                
                lineElement.textContent = line;
                diffContainer.appendChild(lineElement);
            });
        }

        function updateProject() {
            vscode.postMessage({ command: 'updateProject' });
        }

        function showSelectedDiff() {
            if (selectedFiles.size === 1) {
                updateDiffPreview();
            } else {
                showError('Please select a single file to show diff');
            }
        }

        function showSettings() {
            // Open VS Code settings for Git Pilot
            vscode.postMessage({ command: 'openSettings' });
        }

        function commit() {
            const message = document.getElementById('commitMessage').value.trim();
            if (!message) {
                showError('Please enter a commit message');
                return;
            }
            
            const changelistId = document.getElementById('changelistSelector').value;
            vscode.postMessage({
                command: 'commit',
                data: {
                    message: message,
                    changelistId: changelistId
                }
            });
        }

        function commitAndPush() {
            const message = document.getElementById('commitMessage').value.trim();
            if (!message) {
                showError('Please enter a commit message');
                return;
            }
            
            const changelistId = document.getElementById('changelistSelector').value;
            vscode.postMessage({
                command: 'commitAndPush',
                data: {
                    message: message,
                    changelistId: changelistId
                }
            });
        }

        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }

        function showError(message) {
            // Show error in VS Code
            vscode.postMessage({
                command: 'error',
                message: message
            });
        }

        function handleCommitMessageKeydown(event) {
            // Ctrl+Enter or Cmd+Enter to commit
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                commit();
            }
            // Escape to cancel
            else if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
            }
        }

        // Keyboard navigation
        document.addEventListener('keydown', (event) => {
            // Escape to close dialog
            if (event.key === 'Escape' && event.target.tagName !== 'TEXTAREA') {
                cancel();
            }
            // Ctrl+K or Cmd+K to focus commit message
            else if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                document.getElementById('commitMessage').focus();
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Send initial data to the webview
     */
    private async sendInitialData(preselectedChangelist?: string): Promise<void> {
        const changelists = this.changelistStore.getAllChangelists();
        
        this.panel?.webview.postMessage({
            type: 'initialData',
            data: {
                changelists: changelists.map(cl => ({
                    id: cl.id,
                    name: cl.name,
                    files: cl.files,
                    isActive: cl.isActive
                })),
                preselectedChangelist
            }
        });
    }

    /**
     * Handle commit operation
     */
    private async handleCommit(data: { message: string; changelistId: string }): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Committing changes...',
                cancellable: false
            }, async () => {
                const changelist = this.changelistStore.getChangelist(data.changelistId);
                if (!changelist) {
                    throw new Error('Changelist not found');
                }

                const selectedFiles = changelist.getSelectedFiles();
                if (selectedFiles.length === 0) {
                    throw new Error('No files selected for commit');
                }

                // Execute git commit command
                await vscode.commands.executeCommand('gitpilot.commit', data.message, selectedFiles);
            });

            vscode.window.showInformationMessage('Changes committed successfully');
            this.close();
        } catch (error) {
            vscode.window.showErrorMessage(`Commit failed: ${error}`);
            this.panel?.webview.postMessage({
                type: 'error',
                message: `Commit failed: ${error}`
            });
        }
    }

    /**
     * Handle commit and push operation
     */
    private async handleCommitAndPush(data: { message: string; changelistId: string }): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Committing and pushing changes...',
                cancellable: false
            }, async () => {
                const changelist = this.changelistStore.getChangelist(data.changelistId);
                if (!changelist) {
                    throw new Error('Changelist not found');
                }

                const selectedFiles = changelist.getSelectedFiles();
                if (selectedFiles.length === 0) {
                    throw new Error('No files selected for commit');
                }

                // Execute git commit and push commands
                await vscode.commands.executeCommand('gitpilot.commit', data.message, selectedFiles);
                await vscode.commands.executeCommand('gitpilot.push');
            });

            vscode.window.showInformationMessage('Changes committed and pushed successfully');
            this.close();
        } catch (error) {
            vscode.window.showErrorMessage(`Commit and push failed: ${error}`);
            this.panel?.webview.postMessage({
                type: 'error',
                message: `Commit and push failed: ${error}`
            });
        }
    }

    /**
     * Handle update project operation
     */
    private async handleUpdateProject(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Updating project...',
                cancellable: false
            }, async () => {
                await vscode.commands.executeCommand('gitpilot.pull');
            });

            vscode.window.showInformationMessage('Project updated successfully');
            // Refresh the dialog data
            await this.sendInitialData();
        } catch (error) {
            vscode.window.showErrorMessage(`Update failed: ${error}`);
        }
    }

    /**
     * Handle show diff operation
     */
    private async handleShowDiff(filePath: string): Promise<void> {
        try {
            // Get diff content for the file
            const diffContent = await vscode.commands.executeCommand('gitpilot.getDiff', filePath) as string;
            
            this.panel?.webview.postMessage({
                type: 'diffContent',
                content: diffContent
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'diffContent',
                content: `Error loading diff: ${error}`
            });
        }
    }

    /**
     * Handle file toggle operation
     */
    private async handleToggleFile(changelistId: string, filePath: string): Promise<void> {
        const changelist = this.changelistStore.getChangelist(changelistId);
        if (!changelist) {
            return;
        }

        // Toggle file selection
        const updatedChangelist = changelist.updateFile(filePath, (file) => {
            return file.isSelected ? file.deselect() : file.select();
        });

        this.changelistStore.updateChangelist(changelistId, () => updatedChangelist);
        
        // Refresh the dialog data
        await this.sendInitialData();
    }

    /**
     * Handle changelist change operation
     */
    private async handleChangeChangelist(changelistId: string): Promise<void> {
        // Set the selected changelist as active
        await this.changelistStore.setActiveChangelist(changelistId);
        
        // Refresh the dialog data
        await this.sendInitialData();
    }

    /**
     * Close the dialog
     */
    close(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.panel = undefined;
        
        // Dispose of all disposables
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Generate a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}