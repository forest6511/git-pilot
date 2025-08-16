import * as vscode from 'vscode';
import { GitProvider } from './gitProvider';
import { BlameInfo } from '../models/blameInfo';

/**
 * Code lens provider for Git information
 */
export class GitCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    
    private cache = new Map<string, vscode.CodeLens[]>();
    private disposables: vscode.Disposable[] = [];

    constructor(private gitProvider: GitProvider) {
        // Refresh code lenses when active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this._onDidChangeCodeLenses.fire();
            })
        );

        // Refresh when document is saved
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(() => {
                this.cache.clear();
                this._onDidChangeCodeLenses.fire();
            })
        );
    }

    /**
     * Provide code lenses for a document
     */
    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const cacheKey = document.uri.toString();
        
        // Return cached result if available
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            const codeLenses = await this.generateCodeLenses(document, token);
            this.cache.set(cacheKey, codeLenses);
            return codeLenses;
        } catch (error) {
            console.error('Error generating code lenses:', error);
            return [];
        }
    }

    /**
     * Resolve code lens with additional information
     */
    async resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens> {
        return codeLens;
    }

    /**
     * Generate code lenses for a document
     */
    private async generateCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (!await this.isGitTracked(document)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const relativePath = vscode.workspace.asRelativePath(document.uri);

        // Add file-level code lenses at the top
        codeLenses.push(...await this.createFileCodeLenses(document));

        // Add function/class level code lenses
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (symbols) {
            for (const symbol of symbols) {
                if (token.isCancellationRequested) {
                    break;
                }
                
                codeLenses.push(...await this.createSymbolCodeLenses(
                    document,
                    symbol,
                    relativePath
                ));
            }
        }

        return codeLenses;
    }

    /**
     * Create file-level code lenses
     */
    private async createFileCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        
        // File blame toggle
        const range = new vscode.Range(0, 0, 0, 0);
        
        codeLenses.push(new vscode.CodeLens(range, {
            title: '$(eye) Toggle Blame',
            command: 'gitpilot.editor.toggleBlame',
            arguments: [document.uri]
        }));

        // File history
        codeLenses.push(new vscode.CodeLens(range, {
            title: '$(history) File History',
            command: 'gitpilot.editor.showFileHistory',
            arguments: [document.uri]
        }));

        // Recent changes
        try {
            const recentCommits = await this.gitProvider.getLog(5);
            if (recentCommits.latest) {
                const lastCommit = recentCommits.latest;
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `$(git-commit) Last: ${lastCommit.message.substring(0, 50)}...`,
                    command: 'gitpilot.editor.showCommitForLine',
                    arguments: [lastCommit.hash]
                }));
            }
        } catch (error) {
            console.error('Error getting recent commits:', error);
        }

        return codeLenses;
    }

    /**
     * Create symbol-level code lenses
     */
    private async createSymbolCodeLenses(
        document: vscode.TextDocument,
        symbol: vscode.DocumentSymbol,
        relativePath: string
    ): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        
        // Only add code lenses for functions and classes
        if (symbol.kind !== vscode.SymbolKind.Function &&
            symbol.kind !== vscode.SymbolKind.Method &&
            symbol.kind !== vscode.SymbolKind.Class) {
            return codeLenses;
        }

        const line = symbol.range.start.line + 1; // Git uses 1-based line numbers
        
        try {
            // Get blame info for the symbol's first line
            const blameInfo = await this.gitProvider.getLineBlame(relativePath, line);
            
            if (blameInfo && blameInfo.commit !== '00000000') {
                const range = new vscode.Range(
                    symbol.range.start.line,
                    symbol.range.start.character,
                    symbol.range.start.line,
                    symbol.range.start.character
                );

                // Show last modified info
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `$(person) ${blameInfo.author} • $(calendar) ${blameInfo.date}`,
                    command: 'gitpilot.editor.showCommitForLine',
                    arguments: [blameInfo.commit]
                }));

                // Show commit message
                if (blameInfo.summary) {
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: `$(quote) ${blameInfo.summary.substring(0, 60)}...`,
                        command: 'gitpilot.editor.showCommitForLine',
                        arguments: [blameInfo.commit]
                    }));
                }
            }

            // Get history for this symbol
            const history = await this.gitProvider.getLineHistory(
                relativePath,
                line,
                symbol.range.end.line + 1
            );

            if (history.length > 1) {
                codeLenses.push(new vscode.CodeLens(symbol.range, {
                    title: `$(history) ${history.length} changes`,
                    command: 'gitpilot.editor.showLineHistory',
                    arguments: [document.uri, line]
                }));
            }

        } catch (error) {
            console.error('Error creating symbol code lens:', error);
        }

        // Recursively process child symbols
        for (const child of symbol.children) {
            codeLenses.push(...await this.createSymbolCodeLenses(document, child, relativePath));
        }

        return codeLenses;
    }

    /**
     * Check if file is tracked by Git
     */
    private async isGitTracked(document: vscode.TextDocument): Promise<boolean> {
        try {
            const relativePath = vscode.workspace.asRelativePath(document.uri);
            return await this.gitProvider.isTracked(relativePath);
        } catch {
            return false;
        }
    }

    /**
     * Refresh code lenses
     */
    public refresh(): void {
        this.cache.clear();
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * Dispose of the provider
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.cache.clear();
    }
}

/**
 * Register additional editor commands for code lens integration
 */
export function registerCodeLensCommands(
    context: vscode.ExtensionContext,
    gitProvider: GitProvider,
    gutterDecorationService: any // Import type from gutterDecorationService
): void {
    // Toggle blame annotations
    const toggleBlameCommand = vscode.commands.registerCommand(
        'gitpilot.editor.toggleBlame',
        async (uri: vscode.Uri) => {
            const editor = vscode.window.visibleTextEditors.find(e => 
                e.document.uri.toString() === uri.toString()
            );
            
            if (editor && gutterDecorationService) {
                await gutterDecorationService.toggleInlineBlame(editor);
            }
        }
    );

    // Show Git status in status bar for active file
    const updateStatusBarCommand = vscode.commands.registerCommand(
        'gitpilot.editor.updateStatusBar',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            try {
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                const isTracked = await gitProvider.isTracked(relativePath);
                
                if (isTracked) {
                    const currentBranch = await gitProvider.getCurrentBranch();
                    const status = await gitProvider.getStatus();
                    
                    const fileStatus = status.files.find(f => f.path === relativePath);
                    let statusText = currentBranch || 'Git';
                    
                    if (fileStatus) {
                        if (fileStatus.workingDir === 'M') {
                            statusText += ' $(circle-filled)'; // Modified
                        } else if (fileStatus.index === 'A') {
                            statusText += ' $(plus)'; // Added
                        } else if (fileStatus.workingDir === 'D') {
                            statusText += ' $(trash)'; // Deleted
                        }
                    }
                    
                    vscode.window.setStatusBarMessage(`$(git-branch) ${statusText}`, 3000);
                }
            } catch (error) {
                console.error('Error updating status bar:', error);
            }
        }
    );

    // Register Git decorations toggle
    const toggleGutterDecorationsCommand = vscode.commands.registerCommand(
        'gitpilot.editor.toggleGutterDecorations',
        async () => {
            const config = vscode.workspace.getConfiguration('gitpilot');
            const current = config.get('editor.showGutterDecorations', true);
            await config.update('editor.showGutterDecorations', !current, true);
            
            vscode.window.showInformationMessage(
                `Git gutter decorations ${!current ? 'enabled' : 'disabled'}`
            );
        }
    );

    context.subscriptions.push(
        toggleBlameCommand,
        updateStatusBarCommand,
        toggleGutterDecorationsCommand
    );
}