import * as vscode from 'vscode';
import { ShelveStore } from '../models/shelveStore';
import { ChangelistStore } from '../models/changelistStore';
import { ShelveTreeProvider } from '../views/shelveTreeProvider';
import { LocalChangesProvider } from '../views/localChangesProvider';
import { FileChange } from '../models/fileChange';

export function registerShelveCommands(
    context: vscode.ExtensionContext,
    shelveStore: ShelveStore,
    changelistStore: ChangelistStore,
    shelveTreeProvider: ShelveTreeProvider,
    localChangesProvider: LocalChangesProvider
): void {
    // Create shelf from selected files
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.create', async () => {
            await createShelfCommand(localChangesProvider, shelveStore);
        })
    );

    // Create shelf from changelist
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.createFromChangelist', async (changelistId?: string) => {
            await createShelfFromChangelistCommand(changelistStore, shelveStore, changelistId);
        })
    );

    // Unshelve
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.unshelve', async (item: any) => {
            await unshelveCommand(shelveStore, localChangesProvider, item);
        })
    );

    // Unshelve and keep shelf
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.unshelveKeep', async (item: any) => {
            await unshelveCommand(shelveStore, localChangesProvider, item, { keepShelf: true });
        })
    );

    // Delete shelf
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.delete', async (item: any) => {
            await deleteShelfCommand(shelveStore, item);
        })
    );

    // Rename shelf
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.rename', async (item: any) => {
            await renameShelfCommand(shelveStore, item);
        })
    );

    // Preview shelf conflicts
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.preview', async (item: any) => {
            await previewShelfCommand(shelveStore, item);
        })
    );

    // Preview shelved file
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.previewFile', async (shelfId: string, filePath: string) => {
            await previewFileCommand(shelveStore, shelfId, filePath);
        })
    );

    // Export shelf as patch
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.export', async (item: any) => {
            await exportShelfCommand(shelveStore, item);
        })
    );

    // Import shelf from patch
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.import', async () => {
            await importShelfCommand(shelveStore);
        })
    );

    // Show shelf details
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.showDetails', async (item: any) => {
            await showShelfDetailsCommand(item);
        })
    );

    // Partial unshelve (selected files only)
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.partialUnshelve', async (item: any) => {
            await partialUnshelveCommand(shelveStore, localChangesProvider, item);
        })
    );

    // Refresh shelves view
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.shelf.refresh', async () => {
            shelveTreeProvider.refresh();
        })
    );
}

async function createShelfCommand(localChangesProvider: LocalChangesProvider, shelveStore: ShelveStore): Promise<void> {
    try {
        const selectedFiles = localChangesProvider.getSelectedFiles();
        
        if (selectedFiles.length === 0) {
            vscode.window.showWarningMessage('No files selected for shelving');
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter shelf name',
            placeHolder: 'My Shelf',
            validateInput: (value) => {
                if (!value || !value.trim()) {
                    return 'Shelf name is required';
                }
                if (value.length > 100) {
                    return 'Shelf name must be less than 100 characters';
                }
                return null;
            }
        });

        if (!name) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Enter shelf description (optional)',
            placeHolder: 'Description of changes...'
        });

        // Get file changes from selected files
        const fileChanges: FileChange[] = []; // Would get actual FileChange objects
        
        await shelveStore.createShelf(name, fileChanges, {
            removeFromWorkspace: false,
            description
        });

        vscode.window.showInformationMessage(`Created shelf: ${name}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create shelf: ${error}`);
    }
}

async function createShelfFromChangelistCommand(changelistStore: ChangelistStore, shelveStore: ShelveStore, changelistId?: string): Promise<void> {
    try {
        const changelist = changelistId 
            ? changelistStore.getChangelist(changelistId)
            : changelistStore.getActiveChangelist();

        if (!changelist || changelist.files.length === 0) {
            vscode.window.showWarningMessage('No files in changelist to shelf');
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter shelf name',
            placeHolder: `Shelf from ${changelist.name}`,
            value: `Shelf from ${changelist.name}`
        });

        if (!name) return;

        await shelveStore.createShelfFromChangelist(name, changelist, {
            removeFromWorkspace: false
        });

        vscode.window.showInformationMessage(`Created shelf: ${name}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create shelf from changelist: ${error}`);
    }
}

async function unshelveCommand(shelveStore: ShelveStore, localChangesProvider: LocalChangesProvider, item: any, options: { keepShelf?: boolean } = {}): Promise<void> {
    if (!item?.shelf?.id) {
        vscode.window.showErrorMessage('No shelf selected');
        return;
    }

    try {
        const conflicts = await shelveStore.previewUnshelve(item.shelf.id);
        
        if (conflicts.hasConflicts) {
            const choice = await vscode.window.showWarningMessage(
                `Conflicts detected in: ${conflicts.conflictingFiles.join(', ')}\\n\\nWhat would you like to do?`,
                'Force Unshelve',
                'Show Details',
                'Cancel'
            );

            if (choice === 'Show Details') {
                await showConflictDetails(conflicts);
                return;
            } else if (choice !== 'Force Unshelve') {
                return;
            }

            await shelveStore.unshelve(item.shelf.id, { 
                forceMerge: true,
                keepShelf: options.keepShelf 
            });
        } else {
            await shelveStore.unshelve(item.shelf.id, options);
        }

        const message = options.keepShelf 
            ? 'Successfully unshelved changes (shelf kept)'
            : 'Successfully unshelved changes';
        vscode.window.showInformationMessage(message);
        
        // Refresh related views
        localChangesProvider.refresh();
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to unshelve: ${error}`);
    }
}

async function deleteShelfCommand(shelveStore: ShelveStore, item: any): Promise<void> {
    if (!item?.shelf?.id) {
        vscode.window.showErrorMessage('No shelf selected');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Delete shelf "${item.shelf.name}"?\\n\\nThis action cannot be undone.`,
        { modal: true },
        'Delete',
        'Cancel'
    );

    if (confirm !== 'Delete') return;

    try {
        await shelveStore.deleteShelf(item.shelf.id);
        vscode.window.showInformationMessage('Shelf deleted');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete shelf: ${error}`);
    }
}

async function renameShelfCommand(shelveStore: ShelveStore, item: any): Promise<void> {
    if (!item?.shelf?.id) {
        vscode.window.showErrorMessage('No shelf selected');
        return;
    }

    const newName = await vscode.window.showInputBox({
        prompt: 'Enter new shelf name',
        value: item.shelf.name,
        validateInput: (value) => {
            if (!value || !value.trim()) {
                return 'Shelf name is required';
            }
            return null;
        }
    });

    if (!newName || newName === item.shelf.name) return;

    try {
        await shelveStore.renameShelf(item.shelf.id, newName);
        vscode.window.showInformationMessage(`Shelf renamed to: ${newName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to rename shelf: ${error}`);
    }
}

async function previewShelfCommand(shelveStore: ShelveStore, item: any): Promise<void> {
    if (!item?.shelf?.id) return;

    try {
        const conflicts = await shelveStore.previewUnshelve(item.shelf.id);
        
        if (conflicts.hasConflicts) {
            await showConflictDetails(conflicts);
        } else {
            vscode.window.showInformationMessage(
                `Shelf "${item.shelf.name}" can be unshelved without conflicts`
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to preview shelf: ${error}`);
    }
}

async function previewFileCommand(shelveStore: ShelveStore, shelfId: string, filePath: string): Promise<void> {
    try {
        const shelf = shelveStore.getShelf(shelfId);
        if (!shelf) {
            vscode.window.showErrorMessage('Shelf not found');
            return;
        }

        const file = shelf.files.find(f => f.path === filePath);
        if (!file) {
            vscode.window.showErrorMessage('File not found in shelf');
            return;
        }

        // Create temporary document to show shelved content
        const doc = await vscode.workspace.openTextDocument({
            content: file.shelvedContent,
            language: getLanguageFromPath(file.relativePath)
        });

        await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to preview file: ${error}`);
    }
}

async function exportShelfCommand(shelveStore: ShelveStore, item: any): Promise<void> {
    if (!item?.shelf?.id) return;

    try {
        const patch = await shelveStore.exportShelf(item.shelf.id);
        
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${item.shelf.name}.patch`),
            filters: { 'Patch files': ['patch'], 'All files': ['*'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(patch));
            vscode.window.showInformationMessage('Shelf exported successfully');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to export shelf: ${error}`);
    }
}

async function importShelfCommand(shelveStore: ShelveStore): Promise<void> {
    try {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Patch files': ['patch'], 'All files': ['*'] }
        });

        if (!uris || uris.length === 0) return;

        const content = await vscode.workspace.fs.readFile(uris[0]);
        const patchContent = content.toString();

        const name = await vscode.window.showInputBox({
            prompt: 'Enter name for imported shelf',
            placeHolder: 'Imported Shelf'
        });

        if (!name) return;

        await shelveStore.importShelf(patchContent, name);
        vscode.window.showInformationMessage(`Imported shelf: ${name}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to import shelf: ${error}`);
    }
}

async function showShelfDetailsCommand(item: any): Promise<void> {
    if (!item?.shelf) return;

    const shelf = item.shelf;
    const details = [
        `Name: ${shelf.name}`,
        `Files: ${shelf.fileCount}`,
        `Created: ${shelf.timestamp.toLocaleString()}`,
        `Branch: ${shelf.branch}`,
        `Commit: ${shelf.parentCommit}`
    ];

    if (shelf.description) {
        details.push(`Description: ${shelf.description}`);
    }

    if (shelf.changelistId) {
        details.push(`From changelist: ${shelf.changelistId}`);
    }

    await vscode.window.showInformationMessage(details.join('\\n'));
}

async function partialUnshelveCommand(shelveStore: ShelveStore, localChangesProvider: LocalChangesProvider, item: any): Promise<void> {
    if (!item?.shelf?.id) return;

    const shelf = shelveStore.getShelf(item.shelf.id);
    if (!shelf) return;

    const fileItems = shelf.files.map(f => ({
        label: f.relativePath,
        description: f.getStatusLabel(),
        picked: false
    }));

    const selectedFiles = await vscode.window.showQuickPick(fileItems, {
        canPickMany: true,
        placeHolder: 'Select files to unshelve'
    });

    if (!selectedFiles || selectedFiles.length === 0) return;

    try {
        const filePaths = selectedFiles.map(item => {
            const file = shelf.files.find(f => f.relativePath === item.label);
            return file?.path || '';
        }).filter(path => path);

        await shelveStore.partialUnshelve(item.shelf.id, filePaths);
        vscode.window.showInformationMessage(`Unshelved ${selectedFiles.length} files`);
        
        localChangesProvider.refresh();
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to partially unshelve: ${error}`);
    }
}

async function showConflictDetails(conflicts: any): Promise<void> {
    const details = [
        'Conflicts detected:',
        ...conflicts.details.map((d: any) => `• ${d.filePath}: ${d.conflicts.join(', ')}`)
    ];

    await vscode.window.showWarningMessage(details.join('\\n'));
}

function getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
        'ts': 'typescript',
        'js': 'javascript',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'xml': 'xml',
        'md': 'markdown'
    };
    return languageMap[ext || ''] || 'plaintext';
}