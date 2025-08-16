import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';
import { ProfessionalInteractions } from '../ui/professionalInteractions';

/**
 * Represents a Git stash entry with metadata
 */
export interface StashEntry {
    index: number;
    message: string;
    branch: string;
    hash: string;
    author: string;
    date: Date;
    files: string[];
}

/**
 * Enhanced Git stash operations (Native Git stash vs IDE-style Shelve)
 * 
 * Key Differences:
 * - Stash: Native Git feature, temporary storage, stack-based
 * - Shelve: IDE-style feature, permanent storage, named storage
 * 
 * This provides native Git stash operations to complement GitPilot's shelve system
 */
export class StashCommands {
    constructor(private gitProvider: GitProvider) {}

    /**
     * Quick stash with auto-generated message
     */
    async quickStash(): Promise<void> {
        try {
            const currentBranch = await this.gitProvider.getCurrentBranch();
            const timestamp = new Date().toLocaleString();
            const message = `WIP on ${currentBranch}: ${timestamp}`;

            await ProfessionalInteractions.withProgress(
                'Stashing changes...',
                async () => {
                    await this.gitProvider.stash(message);
                }
            );

            vscode.window.showInformationMessage(`✓ Changes stashed: ${message}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stash changes: ${error}`);
        }
    }

    /**
     * Stash with custom message
     */
    async stashWithMessage(): Promise<void> {
        try {
            const message = await vscode.window.showInputBox({
                prompt: 'Enter stash message',
                placeHolder: 'WIP: feature description...',
                validateInput: (value) => {
                    if (!value?.trim()) {
                        return 'Stash message cannot be empty';
                    }
                    return undefined;
                }
            });

            if (!message) return;

            await ProfessionalInteractions.withProgress(
                'Stashing changes...',
                async () => {
                    await this.gitProvider.stash(message);
                }
            );

            vscode.window.showInformationMessage(`✓ Changes stashed: ${message}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stash changes: ${error}`);
        }
    }

    /**
     * Stash including untracked files
     */
    async stashIncludeUntracked(): Promise<void> {
        try {
            const message = await vscode.window.showInputBox({
                prompt: 'Enter stash message (including untracked files)',
                placeHolder: 'WIP: feature with new files...'
            });

            if (!message) return;

            await ProfessionalInteractions.withProgress(
                'Stashing all changes...',
                async () => {
                    // Use raw git command for include-untracked
                    await this.gitProvider.raw(['stash', 'push', '-u', '-m', message]);
                }
            );

            vscode.window.showInformationMessage(`✓ All changes stashed: ${message}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stash changes: ${error}`);
        }
    }

    /**
     * List all stashes with interactive selection
     */
    async listStashes(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes found');
                return;
            }

            const items = stashes.map(stash => ({
                label: `$(archive) ${stash.message}`,
                description: `${stash.branch} • ${stash.date.toLocaleDateString()}`,
                detail: `stash@{${stash.index}} • ${stash.files.length} files • ${stash.author}`,
                stash
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select stash to view details',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                await this.showStashDetails(selected.stash);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to list stashes: ${error}`);
        }
    }

    /**
     * Apply stash (keep stash in stack)
     */
    async applyStash(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes found');
                return;
            }

            const selected = await this.selectStash(stashes, 'Select stash to apply');
            if (!selected) return;

            const applyIndex = await vscode.window.showQuickPick([
                { label: 'Apply without index', value: 'no-index' },
                { label: 'Apply with index (restore staged state)', value: 'index' }
            ], {
                placeHolder: 'Choose apply method'
            });

            if (!applyIndex) return;

            await ProfessionalInteractions.withProgress(
                'Applying stash...',
                async () => {
                    if (applyIndex.value === 'index') {
                        await this.gitProvider.raw(['stash', 'apply', '--index', `stash@{${selected.index}}`]);
                    } else {
                        await this.gitProvider.raw(['stash', 'apply', `stash@{${selected.index}}`]);
                    }
                }
            );

            vscode.window.showInformationMessage(`✓ Stash applied: ${selected.message}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply stash: ${error}`);
        }
    }

    /**
     * Pop stash (apply and remove from stack)
     */
    async popStash(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes found');
                return;
            }

            const selected = await this.selectStash(stashes, 'Select stash to pop');
            if (!selected) return;

            await ProfessionalInteractions.withProgress(
                'Popping stash...',
                async () => {
                    await this.gitProvider.raw(['stash', 'pop', `stash@{${selected.index}}`]);
                }
            );

            vscode.window.showInformationMessage(`✓ Stash popped: ${selected.message}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to pop stash: ${error}`);
        }
    }

    /**
     * Drop stash (remove without applying)
     */
    async dropStash(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes found');
                return;
            }

            const selected = await this.selectStash(stashes, 'Select stash to drop');
            if (!selected) return;

            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to drop stash "${selected.message}"?`,
                'Drop',
                'Cancel'
            );

            if (confirmation === 'Drop') {
                await this.gitProvider.raw(['stash', 'drop', `stash@{${selected.index}}`]);
                vscode.window.showInformationMessage(`✓ Stash dropped: ${selected.message}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to drop stash: ${error}`);
        }
    }

    /**
     * Clear all stashes
     */
    async clearStashes(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes to clear');
                return;
            }

            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to clear all ${stashes.length} stashes? This cannot be undone.`,
                'Clear All',
                'Cancel'
            );

            if (confirmation === 'Clear All') {
                await this.gitProvider.raw(['stash', 'clear']);
                vscode.window.showInformationMessage(`✓ All stashes cleared`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to clear stashes: ${error}`);
        }
    }

    /**
     * Create branch from stash
     */
    async createBranchFromStash(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes found');
                return;
            }

            const selected = await this.selectStash(stashes, 'Select stash to create branch from');
            if (!selected) return;

            const branchName = await vscode.window.showInputBox({
                prompt: 'Enter branch name',
                placeHolder: 'feature/stash-branch',
                validateInput: (value) => {
                    if (!value?.trim()) {
                        return 'Branch name cannot be empty';
                    }
                    if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
                        return 'Invalid branch name';
                    }
                    return undefined;
                }
            });

            if (!branchName) return;

            await ProfessionalInteractions.withProgress(
                'Creating branch from stash...',
                async () => {
                    await this.gitProvider.raw(['stash', 'branch', branchName, `stash@{${selected.index}}`]);
                }
            );

            vscode.window.showInformationMessage(`✓ Branch '${branchName}' created from stash`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create branch from stash: ${error}`);
        }
    }

    /**
     * Show stash differences
     */
    async showStashDiff(): Promise<void> {
        try {
            const stashes = await this.getStashList();
            
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes found');
                return;
            }

            const selected = await this.selectStash(stashes, 'Select stash to view diff');
            if (!selected) return;

            const diff = await this.gitProvider.raw(['stash', 'show', '-p', `stash@{${selected.index}}`]);
            
            // Create a temporary document to show the diff
            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });
            
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show stash diff: ${error}`);
        }
    }

    /**
     * Get list of all stashes
     */
    private async getStashList(): Promise<StashEntry[]> {
        try {
            const stashListResult = await this.gitProvider.stashList();
            const stashes: StashEntry[] = [];

            for (let i = 0; i < stashListResult.all.length; i++) {
                const stash = stashListResult.all[i];
                
                // Get detailed stash information
                const stashInfo = await this.getStashInfo(i);
                stashes.push({
                    index: i,
                    message: stash.message || `Stash@{${i}}`,
                    branch: stashInfo.branch,
                    hash: stash.hash,
                    author: stashInfo.author,
                    date: new Date(stash.date),
                    files: stashInfo.files
                });
            }

            return stashes;
        } catch (error) {
            console.error('Failed to get stash list:', error);
            return [];
        }
    }

    /**
     * Get detailed information about a specific stash
     */
    private async getStashInfo(index: number): Promise<{branch: string, author: string, files: string[]}> {
        try {
            // Get stash details
            const showResult = await this.gitProvider.raw(['stash', 'show', '--name-only', `stash@{${index}}`]);
            const files = showResult.trim().split('\n').filter(f => f.trim());

            // Get stash commit info
            const logResult = await this.gitProvider.raw([
                'log', '-1', '--pretty=format:%an|%s', `stash@{${index}}`
            ]);
            
            const [author, message] = logResult.split('|');
            const branchMatch = message.match(/WIP on (.+?):/);
            const branch = branchMatch ? branchMatch[1] : 'unknown';

            return {
                branch,
                author: author || 'Unknown',
                files
            };
        } catch {
            return {
                branch: 'unknown',
                author: 'Unknown', 
                files: []
            };
        }
    }

    /**
     * Helper to select a stash from list
     */
    private async selectStash(stashes: StashEntry[], placeHolder: string): Promise<StashEntry | undefined> {
        const items = stashes.map(stash => ({
            label: `$(archive) ${stash.message}`,
            description: `${stash.branch} • ${stash.date.toLocaleDateString()}`,
            detail: `stash@{${stash.index}} • ${stash.files.length} files • ${stash.author}`,
            stash
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder,
            matchOnDescription: true,
            matchOnDetail: true
        });

        return selected?.stash;
    }

    /**
     * Show detailed stash information
     */
    private async showStashDetails(stash: StashEntry): Promise<void> {
        const actions = await vscode.window.showQuickPick([
            { label: '$(eye) Show Diff', action: 'diff' },
            { label: '$(check) Apply', action: 'apply' },
            { label: '$(arrow-up) Pop', action: 'pop' },
            { label: '$(git-branch) Create Branch', action: 'branch' },
            { label: '$(trash) Drop', action: 'drop' }
        ], {
            placeHolder: `Actions for: ${stash.message}`
        });

        if (!actions) return;

        switch (actions.action) {
            case 'diff':
                await this.showStashDiff();
                break;
            case 'apply':
                await this.applyStash();
                break;
            case 'pop':
                await this.popStash();
                break;
            case 'branch':
                await this.createBranchFromStash();
                break;
            case 'drop':
                await this.dropStash();
                break;
        }
    }
}

/**
 * Register stash commands
 */
export function registerStashCommands(
    context: vscode.ExtensionContext,
    gitProvider: GitProvider
): void {
    const stashCommands = new StashCommands(gitProvider);

    // Register all stash commands
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.stash.quick', () => stashCommands.quickStash()),
        vscode.commands.registerCommand('gitpilot.stash.withMessage', () => stashCommands.stashWithMessage()),
        vscode.commands.registerCommand('gitpilot.stash.includeUntracked', () => stashCommands.stashIncludeUntracked()),
        vscode.commands.registerCommand('gitpilot.stash.list', () => stashCommands.listStashes()),
        vscode.commands.registerCommand('gitpilot.stash.apply', () => stashCommands.applyStash()),
        vscode.commands.registerCommand('gitpilot.stash.pop', () => stashCommands.popStash()),
        vscode.commands.registerCommand('gitpilot.stash.drop', () => stashCommands.dropStash()),
        vscode.commands.registerCommand('gitpilot.stash.clear', () => stashCommands.clearStashes()),
        vscode.commands.registerCommand('gitpilot.stash.createBranch', () => stashCommands.createBranchFromStash()),
        vscode.commands.registerCommand('gitpilot.stash.showDiff', () => stashCommands.showStashDiff())
    );
}