import * as vscode from 'vscode';
import { MultipleChangelistProvider } from '../views/changelistTreeProvider';
import { Changelist } from '../models/changelist';

/**
 * Commands for managing multiple changelists
 */
export class ChangelistCommands {
    constructor(private changelistProvider: MultipleChangelistProvider) {}

    /**
     * Create a new changelist
     */
    async createChangelist(): Promise<void> {
        try {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter changelist name',
                placeHolder: 'My Changelist',
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Changelist name cannot be empty';
                    }
                    
                    // Check for duplicate names
                    const existing = this.changelistProvider.getChangelistStore()
                        .getAllChangelists()
                        .find(cl => cl.name === value.trim());
                    
                    if (existing) {
                        return `Changelist with name "${value}" already exists`;
                    }
                    
                    return null;
                }
            });

            if (!name) return;

            const description = await vscode.window.showInputBox({
                prompt: 'Enter description (optional)',
                placeHolder: 'Description for this changelist'
            });

            await this.changelistProvider.createChangelist(name, description);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create changelist: ${error}`);
        }
    }

    /**
     * Delete a changelist
     */
    async deleteChangelist(changelistId?: string): Promise<void> {
        try {
            let targetId = changelistId;

            if (!targetId) {
                // Show quick pick to select changelist to delete
                const changelists = this.changelistProvider.getChangelistStore()
                    .getAllChangelists()
                    .filter(cl => !cl.isDefault); // Can't delete default

                if (changelists.length === 0) {
                    vscode.window.showInformationMessage('No custom changelists to delete');
                    return;
                }

                const items = changelists.map(cl => ({
                    label: cl.name,
                    description: cl.description,
                    detail: `${cl.fileCount} files`,
                    id: cl.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select changelist to delete'
                });

                if (!selected) return;
                targetId = selected.id;
            }

            const changelist = this.changelistProvider.getChangelistStore().getChangelist(targetId);
            if (!changelist) {
                vscode.window.showErrorMessage('Changelist not found');
                return;
            }

            if (changelist.isDefault) {
                vscode.window.showErrorMessage('Cannot delete default changelist');
                return;
            }

            // Confirm deletion
            let message = `Delete changelist "${changelist.name}"?`;
            if (changelist.hasFiles) {
                message += ` (${changelist.fileCount} files will be moved to Default Changelist)`;
            }

            const confirm = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                'Delete'
            );

            if (confirm === 'Delete') {
                await this.changelistProvider.deleteChangelist(targetId);
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete changelist: ${error}`);
        }
    }

    /**
     * Rename a changelist
     */
    async renameChangelist(changelistId?: string): Promise<void> {
        try {
            let targetId = changelistId;

            if (!targetId) {
                // Show quick pick to select changelist to rename
                const changelists = this.changelistProvider.getChangelistStore().getAllChangelists();

                const items = changelists.map(cl => ({
                    label: cl.name,
                    description: cl.description,
                    detail: `${cl.fileCount} files`,
                    id: cl.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select changelist to rename'
                });

                if (!selected) return;
                targetId = selected.id;
            }

            const changelist = this.changelistProvider.getChangelistStore().getChangelist(targetId);
            if (!changelist) {
                vscode.window.showErrorMessage('Changelist not found');
                return;
            }

            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new name',
                value: changelist.name,
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Changelist name cannot be empty';
                    }

                    if (value.trim() === changelist.name) {
                        return null; // No change
                    }

                    // Check for duplicate names
                    const existing = this.changelistProvider.getChangelistStore()
                        .getAllChangelists()
                        .find(cl => cl.id !== targetId && cl.name === value.trim());

                    if (existing) {
                        return `Changelist with name "${value}" already exists`;
                    }

                    return null;
                }
            });

            if (!newName || newName.trim() === changelist.name) return;

            await this.changelistProvider.renameChangelist(targetId, newName);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename changelist: ${error}`);
        }
    }

    /**
     * Set active changelist
     */
    async setActiveChangelist(changelistId?: string): Promise<void> {
        try {
            let targetId = changelistId;

            if (!targetId) {
                // Show quick pick to select changelist to set as active
                const changelists = this.changelistProvider.getChangelistStore().getAllChangelists();

                const items = changelists.map(cl => ({
                    label: cl.name,
                    description: cl.isActive ? '$(check) Active' : cl.description,
                    detail: `${cl.fileCount} files`,
                    id: cl.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select changelist to set as active'
                });

                if (!selected) return;
                targetId = selected.id;
            }

            await this.changelistProvider.setActiveChangelist(targetId);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to set active changelist: ${error}`);
        }
    }

    /**
     * Move selected files to another changelist
     */
    async moveFilesToChangelist(sourceChangelistId?: string, filePaths?: string[]): Promise<void> {
        try {
            const sourceId = sourceChangelistId;
            const files = filePaths;

            // If no source specified, try to get from current selection
            if (!sourceId || !files) {
                vscode.window.showInformationMessage('Move files: Please select files from a changelist');
                return;
            }

            const sourceChangelist = this.changelistProvider.getChangelistStore().getChangelist(sourceId);
            if (!sourceChangelist) {
                vscode.window.showErrorMessage('Source changelist not found');
                return;
            }

            // Show quick pick to select target changelist
            const allChangelists = this.changelistProvider.getChangelistStore().getAllChangelists();
            const targetChangelists = allChangelists.filter(cl => cl.id !== sourceId);

            const items = targetChangelists.map(cl => ({
                label: cl.name,
                description: cl.description,
                detail: `${cl.fileCount} files`,
                id: cl.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Move ${files.length} file(s) from "${sourceChangelist.name}" to:`
            });

            if (!selected) return;

            // Move the files
            this.changelistProvider.getChangelistStore().moveFiles(files, sourceId, selected.id);
            await this.changelistProvider.refresh();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move files: ${error}`);
        }
    }

    /**
     * Show changelist information
     */
    async showChangelistInfo(changelistId?: string): Promise<void> {
        try {
            let targetId = changelistId;

            if (!targetId) {
                // Show quick pick to select changelist
                const changelists = this.changelistProvider.getChangelistStore().getAllChangelists();

                const items = changelists.map(cl => ({
                    label: cl.name,
                    description: cl.description,
                    detail: `${cl.fileCount} files`,
                    id: cl.id
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select changelist to view info'
                });

                if (!selected) return;
                targetId = selected.id;
            }

            const changelist = this.changelistProvider.getChangelistStore().getChangelist(targetId);
            if (!changelist) {
                vscode.window.showErrorMessage('Changelist not found');
                return;
            }

            // Create info panel
            const panel = vscode.window.createWebviewPanel(
                'changelistInfo',
                `Changelist: ${changelist.name}`,
                vscode.ViewColumn.Two,
                { enableScripts: false }
            );

            panel.webview.html = this.generateChangelistInfoHtml(changelist);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show changelist info: ${error}`);
        }
    }

    /**
     * Stage selected files in a changelist
     */
    async stageSelectedFiles(changelistId?: string): Promise<void> {
        try {
            let targetId = changelistId;

            if (!targetId) {
                // Use active changelist
                targetId = this.changelistProvider.getChangelistStore().getActiveChangelist().id;
            }

            await this.changelistProvider.stageSelectedFiles(targetId);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stage selected files: ${error}`);
        }
    }

    /**
     * Unstage selected files in a changelist
     */
    async unstageSelectedFiles(changelistId?: string): Promise<void> {
        try {
            let targetId = changelistId;

            if (!targetId) {
                // Use active changelist
                targetId = this.changelistProvider.getChangelistStore().getActiveChangelist().id;
            }

            await this.changelistProvider.unstageSelectedFiles(targetId);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to unstage selected files: ${error}`);
        }
    }

    /**
     * Select all files in a changelist
     */
    async selectAllFiles(changelistId?: string): Promise<void> {
        let targetId = changelistId;

        if (!targetId) {
            // Use active changelist
            targetId = this.changelistProvider.getChangelistStore().getActiveChangelist().id;
        }

        this.changelistProvider.selectAllFiles(targetId);
    }

    /**
     * Deselect all files in a changelist
     */
    async deselectAllFiles(changelistId?: string): Promise<void> {
        let targetId = changelistId;

        if (!targetId) {
            // Use active changelist
            targetId = this.changelistProvider.getChangelistStore().getActiveChangelist().id;
        }

        this.changelistProvider.deselectAllFiles(targetId);
    }

    /**
     * Generate HTML for changelist info webview
     */
    private generateChangelistInfoHtml(changelist: Changelist): string {
        const statusBadge = changelist.isActive ? 
            '<span style="background: #0078d4; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">ACTIVE</span>' :
            '';

        const defaultBadge = changelist.isDefault ? 
            '<span style="background: #6f6f6f; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">DEFAULT</span>' :
            '';

        const filesList = changelist.files.map(file => {
            const selectedIcon = file.isSelected ? '☑️' : '☐';
            return `<li>${selectedIcon} ${file.relativePath} <em>(${file.status})</em></li>`;
        }).join('');

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Changelist: ${changelist.name}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    padding: 20px;
                    line-height: 1.6;
                }
                .header {
                    border-bottom: 1px solid #e0e0e0;
                    padding-bottom: 16px;
                    margin-bottom: 20px;
                }
                .badges {
                    margin-top: 8px;
                }
                .badges span {
                    margin-right: 8px;
                }
                .info-row {
                    margin: 12px 0;
                }
                .label {
                    font-weight: 600;
                    display: inline-block;
                    width: 120px;
                }
                ul {
                    list-style-type: none;
                    padding-left: 0;
                }
                li {
                    margin: 4px 0;
                    font-family: monospace;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${changelist.name}</h1>
                <div class="badges">
                    ${statusBadge}
                    ${defaultBadge}
                </div>
            </div>
            
            <div class="info-row">
                <span class="label">ID:</span>
                <code>${changelist.id}</code>
            </div>
            
            ${changelist.description ? `
            <div class="info-row">
                <span class="label">Description:</span>
                ${changelist.description}
            </div>
            ` : ''}
            
            <div class="info-row">
                <span class="label">Total Files:</span>
                ${changelist.fileCount}
            </div>
            
            <div class="info-row">
                <span class="label">Selected Files:</span>
                ${changelist.selectedFileCount}
            </div>
            
            <div class="info-row">
                <span class="label">Created:</span>
                ${changelist.createdAt.toLocaleString()}
            </div>
            
            <div class="info-row">
                <span class="label">Modified:</span>
                ${changelist.modifiedAt.toLocaleString()}
            </div>
            
            ${changelist.hasFiles ? `
            <h3>Files (${changelist.fileCount})</h3>
            <ul>
                ${filesList}
            </ul>
            ` : '<p><em>No files in this changelist</em></p>'}
        </body>
        </html>`;
    }
}