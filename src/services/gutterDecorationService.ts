import * as vscode from 'vscode';
import { GitProvider } from '../providers/gitProvider';

export interface LineChange {
    type: 'added' | 'modified' | 'deleted';
    startLine: number;
    endLine: number;
}

/**
 * Service for managing Git gutter decorations in the editor
 */
export class GutterDecorationService {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType>;
    private activeDecorations: Map<string, vscode.DecorationOptions[]>;
    private disposables: vscode.Disposable[] = [];
    private updateTimeout: NodeJS.Timeout | undefined;

    constructor(private gitProvider: GitProvider) {
        this.decorationTypes = new Map();
        this.activeDecorations = new Map();
        this.initializeDecorations();
        this.setupEventListeners();
    }

    /**
     * Initialize decoration types
     */
    private initializeDecorations(): void {
        // Added lines decoration
        this.decorationTypes.set('added', vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' + this.getAddedIcon()),
            gutterIconSize: 'contain',
            overviewRulerColor: 'rgba(88, 166, 255, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            light: {
                before: {
                    border: '3px solid #48BB78'
                }
            },
            dark: {
                before: {
                    border: '3px solid #48BB78'
                }
            }
        }));

        // Modified lines decoration
        this.decorationTypes.set('modified', vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' + this.getModifiedIcon()),
            gutterIconSize: 'contain',
            overviewRulerColor: 'rgba(255, 184, 108, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            light: {
                before: {
                    border: '3px solid #ECC94B'
                }
            },
            dark: {
                before: {
                    border: '3px solid #ECC94B'
                }
            }
        }));

        // Deleted lines decoration (shown as a thin line)
        this.decorationTypes.set('deleted', vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' + this.getDeletedIcon()),
            gutterIconSize: 'contain',
            overviewRulerColor: 'rgba(255, 99, 72, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            light: {
                after: {
                    contentText: ' ',
                    border: '1px solid #F56565',
                    width: '100%'
                }
            },
            dark: {
                after: {
                    contentText: ' ',
                    border: '1px solid #F56565',
                    width: '100%'
                }
            }
        }));

        // Blame annotation decoration
        this.decorationTypes.set('blame', vscode.window.createTextEditorDecorationType({
            after: {
                color: 'rgba(153, 153, 153, 0.5)',
                fontStyle: 'italic',
                margin: '0 0 0 3em'
            }
        }));
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Update decorations when active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Update decorations when document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document === event.document) {
                    this.scheduleUpdate(editor);
                }
            })
        );

        // Update decorations when document is saved
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document === document) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Update decorations for visible editors
        this.disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(editors => {
                editors.forEach(editor => this.updateDecorations(editor));
            })
        );
    }

    /**
     * Schedule decoration update with debouncing
     */
    private scheduleUpdate(editor: vscode.TextEditor): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        this.updateTimeout = setTimeout(() => {
            this.updateDecorations(editor);
        }, 500); // Debounce for 500ms
    }

    /**
     * Update decorations for an editor
     */
    public async updateDecorations(editor: vscode.TextEditor): Promise<void> {
        if (!this.isGitTracked(editor.document.uri)) {
            this.clearDecorations(editor);
            return;
        }

        try {
            const changes = await this.getLineChanges(editor.document);
            this.applyDecorations(editor, changes);
        } catch (error) {
            console.error('Error updating gutter decorations:', error);
        }
    }

    /**
     * Get line changes for a document
     */
    private async getLineChanges(document: vscode.TextDocument): Promise<LineChange[]> {
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        const diffOutput = await this.gitProvider.getDiff(relativePath);
        
        if (!diffOutput) {
            return [];
        }

        return this.parseDiff(diffOutput);
    }

    /**
     * Parse diff output to get line changes
     */
    private parseDiff(diff: string): LineChange[] {
        const changes: LineChange[] = [];
        const lines = diff.split('\n');
        
        let currentLine = 0;
        let inHunk = false;
        
        for (const line of lines) {
            // Parse hunk header
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
                if (match) {
                    currentLine = parseInt(match[1]) - 1;
                    inHunk = true;
                }
            } else if (inHunk) {
                if (line.startsWith('+')) {
                    // Added line
                    this.addOrExtendChange(changes, 'added', currentLine);
                    currentLine++;
                } else if (line.startsWith('-')) {
                    // Deleted line - show at the line above
                    this.addOrExtendChange(changes, 'deleted', currentLine - 1);
                } else if (!line.startsWith('\\')) {
                    // Context line
                    currentLine++;
                }
            }
        }
        
        return changes;
    }

    /**
     * Add or extend a change in the changes array
     */
    private addOrExtendChange(changes: LineChange[], type: string, line: number): void {
        const lastChange = changes[changes.length - 1];
        
        if (lastChange && 
            lastChange.type === type && 
            lastChange.endLine === line - 1) {
            // Extend the previous change
            lastChange.endLine = line;
        } else {
            // Add new change
            changes.push({
                type: type as 'added' | 'modified' | 'deleted',
                startLine: line,
                endLine: line
            });
        }
    }

    /**
     * Apply decorations to the editor
     */
    private applyDecorations(editor: vscode.TextEditor, changes: LineChange[]): void {
        const addedDecorations: vscode.DecorationOptions[] = [];
        const modifiedDecorations: vscode.DecorationOptions[] = [];
        const deletedDecorations: vscode.DecorationOptions[] = [];
        
        for (const change of changes) {
            const range = new vscode.Range(
                change.startLine, 0,
                change.endLine, Number.MAX_VALUE
            );
            
            const decoration: vscode.DecorationOptions = {
                range,
                hoverMessage: this.getHoverMessage(change.type)
            };
            
            switch (change.type) {
                case 'added':
                    addedDecorations.push(decoration);
                    break;
                case 'modified':
                    modifiedDecorations.push(decoration);
                    break;
                case 'deleted':
                    deletedDecorations.push(decoration);
                    break;
            }
        }
        
        // Apply decorations
        editor.setDecorations(this.decorationTypes.get('added')!, addedDecorations);
        editor.setDecorations(this.decorationTypes.get('modified')!, modifiedDecorations);
        editor.setDecorations(this.decorationTypes.get('deleted')!, deletedDecorations);
        
        // Store active decorations
        const key = editor.document.uri.toString();
        this.activeDecorations.set(key, [
            ...addedDecorations,
            ...modifiedDecorations,
            ...deletedDecorations
        ]);
    }

    /**
     * Clear decorations for an editor
     */
    private clearDecorations(editor: vscode.TextEditor): void {
        this.decorationTypes.forEach(decorationType => {
            editor.setDecorations(decorationType, []);
        });
        
        const key = editor.document.uri.toString();
        this.activeDecorations.delete(key);
    }

    /**
     * Check if a file is tracked by Git
     */
    private async isGitTracked(uri: vscode.Uri): Promise<boolean> {
        try {
            const relativePath = vscode.workspace.asRelativePath(uri);
            return await this.gitProvider.isTracked(relativePath);
        } catch {
            return false;
        }
    }

    /**
     * Get hover message for a change type
     */
    private getHoverMessage(type: string): vscode.MarkdownString {
        const message = new vscode.MarkdownString();
        
        switch (type) {
            case 'added':
                message.appendMarkdown('**Added line**\n\n');
                message.appendMarkdown('• [Stage Line](command:gitpilot.editor.stageSelectedLines)\n');
                message.appendMarkdown('• [Revert Line](command:gitpilot.editor.revertSelectedLines)');
                break;
            case 'modified':
                message.appendMarkdown('**Modified line**\n\n');
                message.appendMarkdown('• [Show Diff](command:gitpilot.editor.compareWithBase)\n');
                message.appendMarkdown('• [Stage Line](command:gitpilot.editor.stageSelectedLines)\n');
                message.appendMarkdown('• [Revert Line](command:gitpilot.editor.revertSelectedLines)');
                break;
            case 'deleted':
                message.appendMarkdown('**Deleted line(s)**\n\n');
                message.appendMarkdown('• [Revert Deletion](command:gitpilot.editor.revertSelectedLines)');
                break;
        }
        
        message.isTrusted = true;
        return message;
    }

    /**
     * Show inline blame annotations
     */
    public async showInlineBlame(editor: vscode.TextEditor): Promise<void> {
        if (!this.isGitTracked(editor.document.uri)) {
            return;
        }

        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
        const blameData = await this.gitProvider.getBlame(relativePath);
        
        if (!blameData) {
            return;
        }

        const blameDecorations: vscode.DecorationOptions[] = [];
        
        for (let i = 0; i < editor.document.lineCount; i++) {
            const lineBlame = blameData[i];
            if (lineBlame && lineBlame.commit !== '00000000') {
                const decoration: vscode.DecorationOptions = {
                    range: new vscode.Range(i, Number.MAX_VALUE, i, Number.MAX_VALUE),
                    renderOptions: {
                        after: {
                            contentText: ` ${lineBlame.author}, ${lineBlame.date} • ${lineBlame.summary}`,
                            color: 'rgba(153, 153, 153, 0.5)',
                            fontStyle: 'italic'
                        }
                    }
                };
                blameDecorations.push(decoration);
            }
        }
        
        editor.setDecorations(this.decorationTypes.get('blame')!, blameDecorations);
    }

    /**
     * Hide inline blame annotations
     */
    public hideInlineBlame(editor: vscode.TextEditor): void {
        editor.setDecorations(this.decorationTypes.get('blame')!, []);
    }

    /**
     * Toggle inline blame annotations
     */
    public async toggleInlineBlame(editor: vscode.TextEditor): Promise<void> {
        const key = editor.document.uri.toString();
        const hasBlame = this.activeDecorations.has(key + '_blame');
        
        if (hasBlame) {
            this.hideInlineBlame(editor);
            this.activeDecorations.delete(key + '_blame');
        } else {
            await this.showInlineBlame(editor);
            this.activeDecorations.set(key + '_blame', []);
        }
    }

    // SVG Icons as base64 strings
    private getAddedIcon(): string {
        const svg = '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="3" width="2" height="10" fill="#48BB78"/><rect x="3" y="7" width="10" height="2" fill="#48BB78"/></svg>';
        return Buffer.from(svg).toString('base64');
    }

    private getModifiedIcon(): string {
        const svg = '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7" width="10" height="2" fill="#ECC94B"/></svg>';
        return Buffer.from(svg).toString('base64');
    }

    private getDeletedIcon(): string {
        const svg = '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7" width="10" height="2" fill="#F56565"/></svg>';
        return Buffer.from(svg).toString('base64');
    }

    /**
     * Dispose of the service
     */
    public dispose(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        this.decorationTypes.forEach(decoration => decoration.dispose());
        this.disposables.forEach(d => d.dispose());
        
        this.decorationTypes.clear();
        this.activeDecorations.clear();
    }
}