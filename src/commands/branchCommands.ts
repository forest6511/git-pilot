import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

export class BranchCommands {
    constructor(private gitProvider: GitProvider) {}
    
    async showBranches(): Promise<void> {
        try {
            const branches = await this.gitProvider.getBranches();
            const currentBranch = branches.current;
            
            const items = branches.all.map((branch: string) => ({
                label: branch === currentBranch ? `$(check) ${branch}` : branch,
                description: branch === currentBranch ? 'current' : '',
                branch: branch
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select branch to checkout'
            });
            
            if (selected && 'branch' in selected && typeof selected.branch === 'string' && selected.branch !== currentBranch) {
                await this.gitProvider.checkout(selected.branch);
                vscode.window.showInformationMessage(`✓ Switched to ${selected.branch}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Branch operation failed: ${error}`);
        }
    }
}