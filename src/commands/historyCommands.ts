import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

export class HistoryCommands {
    constructor(private gitProvider: GitProvider) {}
    
    async showHistory(): Promise<void> {
        try {
            const log = await this.gitProvider.getLog(20);
            
            const items = log.all.map((commit) => ({
                label: `$(git-commit) ${commit.message.split('\n')[0]}`,
                description: commit.author_name,
                detail: `${commit.hash.substring(0, 7)} - ${commit.date}`
            }));
            
            await vscode.window.showQuickPick(items, {
                placeHolder: 'Git History (last 20 commits)',
                matchOnDescription: true,
                matchOnDetail: true
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show history: ${error}`);
        }
    }
    
    async stashManager(): Promise<void> {
        try {
            const action = await vscode.window.showQuickPick([
                '$(save) Stash changes',
                '$(fold-up) Pop latest stash',
                '$(list-unordered) Show stash list'
            ], {
                placeHolder: 'Select stash action'
            });
            
            if (!action) return;
            
            if (action.includes('Stash changes')) {
                const message = await vscode.window.showInputBox({
                    prompt: 'Stash message (optional)',
                    placeHolder: 'WIP: work in progress'
                });
                await this.gitProvider.stash(message);
                vscode.window.showInformationMessage('✓ Changes stashed');
                
            } else if (action.includes('Pop')) {
                await this.gitProvider.stashPop();
                vscode.window.showInformationMessage('✓ Stash applied');
                
            } else if (action.includes('Show')) {
                const stashList = await this.gitProvider.stashList();
                if (stashList.all.length === 0) {
                    vscode.window.showInformationMessage('No stashes found');
                } else {
                    const items = stashList.all.map((s) => ({
                        label: s.message,
                        detail: s.hash
                    }));
                    await vscode.window.showQuickPick(items);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Stash operation failed: ${error}`);
        }
    }
}