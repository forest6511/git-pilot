import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { GitProvider } from './providers/gitProvider';
import { StatusBar } from './ui/statusBar';
import { GitPilotTreeProvider } from './views/gitPilotTreeProvider';
import { LocalChangesProvider } from './views/localChangesProvider';
import { ProfessionalCommitPanelProvider } from './views/commitPanel';
import { ShelveTreeProvider } from './views/shelveTreeProvider';
import { ShelveStore } from './models/shelveStore';
import { ChangelistStore } from './models/changelistStore';
import { registerShelveCommands } from './commands/shelveCommands';
import { ModalCommitDialog } from './ui/dialogs/modalCommitDialog';
import { registerProfessionalCommands } from './commands/professionalCommands';
import { registerExplorerCommands } from './commands/explorerCommands';
import { registerEditorCommands } from './commands/editorCommands';
import { FileStatusService } from './services/fileStatusService';
import { GutterDecorationService } from './services/gutterDecorationService';
import { GitCodeLensProvider, registerCodeLensCommands } from './providers/gitCodeLensProvider';
import { GitFileDecorationProvider } from './providers/fileDecorationProvider';
import { BranchTreeProvider } from './views/branchTreeProvider';
import { HistoryPanel } from './views/historyPanel';
import { registerStashCommands } from './commands/stashCommands';
import { ConfigManager } from './configuration/configManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('[GitPilot] Extension activating...');
    console.log('Extension context:', context.extensionPath);
    
    // Initialize Git Provider
    console.log('Initializing Git Provider...');
    const gitProvider = new GitProvider();
    console.log('Git Provider initialized successfully');
    
    // Register Local Changes tree data provider (Professional IDE style)
    const localChangesProvider = new LocalChangesProvider(gitProvider);
    vscode.window.registerTreeDataProvider('gitpilot.localChanges', localChangesProvider);
    console.log('Local Changes provider registered');
    
    // Register Professional IDE-style commit panel webview provider
    const professionalCommitPanelProvider = new ProfessionalCommitPanelProvider(context.extensionUri, gitProvider, localChangesProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gitpilot.commit', professionalCommitPanelProvider)
    );
    console.log('Professional IDE Commit panel registered');
    
    // Initialize Shelve Store and Tree Provider
    console.log('Initializing Shelve Store...');
    const shelveStore = new ShelveStore(context);
    const shelveTreeProvider = new ShelveTreeProvider(shelveStore);
    vscode.window.registerTreeDataProvider('gitpilot.shelves', shelveTreeProvider);
    console.log('Shelve tree provider registered');
    
    // Initialize Changelist Store for shelve commands
    console.log('Initializing Changelist Store...');
    const changelistStore = new ChangelistStore(context);
    
    // Initialize Modal Commit Dialog
    console.log('Initializing Modal Commit Dialog...');
    const modalCommitDialog = new ModalCommitDialog(context, changelistStore);
    
    // Initialize File Status Service
    console.log('Initializing File Status Service...');
    const fileStatusService = new FileStatusService(gitProvider);
    
    // Initialize Gutter Decoration Service
    console.log('Initializing Gutter Decoration Service...');
    const gutterDecorationService = new GutterDecorationService(gitProvider);
    
    // Initialize and register Git CodeLens Provider
    console.log('Initializing Git CodeLens Provider...');
    const gitCodeLensProvider = new GitCodeLensProvider(gitProvider);
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { scheme: 'file' },
        gitCodeLensProvider
    );
    context.subscriptions.push(codeLensDisposable);
    
    // Initialize and register File Decoration Provider for Git status in Explorer
    console.log('Initializing Git File Decoration Provider...');
    const fileDecorationProvider = new GitFileDecorationProvider(gitProvider);
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(fileDecorationProvider)
    );
    console.log('Git File Decoration provider registered');
    
    // Initialize and register Branch Tree Provider
    console.log('Initializing Branch Tree Provider...');
    const branchTreeProvider = new BranchTreeProvider(gitProvider);
    vscode.window.registerTreeDataProvider('gitpilot.branches', branchTreeProvider);
    
    // Initialize and register History Panel
    console.log('Initializing History Panel...');
    const historyPanel = new HistoryPanel(context.extensionUri, gitProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(HistoryPanel.viewType, historyPanel)
    );
    
    // Initialize Configuration Manager
    console.log('Initializing Configuration Manager...');
    const configManager = ConfigManager.getInstance();
    
    // Register Stash Commands
    console.log('Registering Stash Commands...');
    registerStashCommands(context, gitProvider);
    
    // Register Configuration Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('gitpilot.config.show', () => configManager.showConfigurationUI())
    );
    
    // Register Modal Commit Dialog command
    const openCommitDialogCommand = vscode.commands.registerCommand('gitpilot.openCommitDialog', () => {
        modalCommitDialog.show();
    });
    context.subscriptions.push(openCommitDialogCommand);
    console.log('Modal commit dialog command registered');
    
    // Register Shelve Commands
    console.log('Registering Shelve Commands...');
    registerShelveCommands(context, shelveStore, changelistStore, shelveTreeProvider, localChangesProvider);
    console.log('Shelve commands registered');
    
    // Register tree data provider for sidebar (Git Operations)
    const treeProvider = new GitPilotTreeProvider(gitProvider);
    vscode.window.registerTreeDataProvider('gitpilot.actions', treeProvider);
    console.log('GitPilot tree provider registered');
    
    // Add refresh command
    const refreshCommand = vscode.commands.registerCommand('git-pilot.refresh', () => {
        console.log('Refreshing GitPilot tree view');
        treeProvider.refresh();
        localChangesProvider.refresh();
        shelveTreeProvider.refresh();
    });
    context.subscriptions.push(refreshCommand);
    
    // Register all existing commands
    console.log('Registering commands...');
    registerCommands(context, gitProvider, localChangesProvider);
    
    // Register professional commands
    console.log('Registering professional commands...');
    registerProfessionalCommands(context, gitProvider, changelistStore, modalCommitDialog);
    
    // Register explorer commands
    console.log('Registering explorer commands...');
    registerExplorerCommands(context, gitProvider, changelistStore, shelveStore, fileStatusService);
    
    // Register editor commands
    console.log('Registering editor commands...');
    registerEditorCommands(context, gitProvider, changelistStore);
    
    // Register code lens commands
    console.log('Registering code lens commands...');
    registerCodeLensCommands(context, gitProvider, gutterDecorationService);
    
    console.log(`Commands registered. Total subscriptions: ${context.subscriptions.length}`);
    
    // Initialize status bar
    console.log('Initializing status bar...');
    const statusBar = new StatusBar();
    context.subscriptions.push(statusBar);
    
    // Update status bar when active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            statusBar.update(gitProvider, changelistStore);
        })
    );
    
    // Update gutter decorations for active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        gutterDecorationService.updateDecorations(activeEditor);
    }
    
    // Update decorations when active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                gutterDecorationService.updateDecorations(editor);
            }
        })
    );
    
    // Add disposal for new components
    context.subscriptions.push(shelveStore);
    context.subscriptions.push(shelveTreeProvider);
    context.subscriptions.push(changelistStore);
    context.subscriptions.push(fileStatusService);
    context.subscriptions.push(gutterDecorationService);
    context.subscriptions.push(gitCodeLensProvider);
    context.subscriptions.push(fileDecorationProvider);
    context.subscriptions.push(branchTreeProvider);
    context.subscriptions.push(historyPanel);
    context.subscriptions.push(configManager);
    context.subscriptions.push({
        dispose: () => modalCommitDialog.dispose()
    });
    
    console.log('GitPilot extension activated successfully!');
    console.log(`Final subscription count: ${context.subscriptions.length}`);
    
    // Show notification that sidebar is ready
    vscode.window.showInformationMessage('GitPilot: Professional IDE-style Git UI with Shelve support is ready!');
}

export function deactivate() {}