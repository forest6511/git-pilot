import * as vscode from 'vscode';

/**
 * GitPilot configuration interface with type safety
 */
export interface GitPilotConfiguration {
    // General settings
    general: {
        autoFetchInterval: number; // minutes, 0 to disable
        defaultCommitOptions: {
            signOff: boolean;
            gpgSign: boolean;
            amendPrevious: boolean;
        };
        enableStatusBar: boolean;
        enableFileDecorations: boolean;
    };

    // Editor integrations
    editor: {
        showGutterDecorations: boolean;
        showInlineBlame: boolean;
        showCodeLens: boolean;
        showHoverInfo: boolean;
        blameFormat: string;
        decorationStyle: 'subtle' | 'prominent' | 'minimal';
        enableQuickFixes: boolean;
    };

    // Changelist settings
    changelists: {
        autoCreateDefault: boolean;
        defaultChangelistName: string;
        autoSelectNewFiles: boolean;
        showChangelistInStatusBar: boolean;
        enableDragAndDrop: boolean;
    };

    // Shelve/Stash settings
    shelve: {
        autoCleanupDays: number; // 0 to disable
        includeUntrackedByDefault: boolean;
        showPreviewBeforeUnshelve: boolean;
        enableConflictDetection: boolean;
    };

    // Performance tuning
    performance: {
        gitCacheTimeoutMs: number;
        decorationDebounceMs: number;
        maxHistoryEntries: number;
        enableLargeRepoOptimizations: boolean;
        asyncOperationTimeout: number;
    };

    // UI customization
    ui: {
        theme: 'auto' | 'light' | 'dark';
        compactMode: boolean;
        showDetailedTooltips: boolean;
        enableAnimations: boolean;
        iconSet: 'default' | 'minimal' | 'colorful';
    };

    // Keyboard shortcuts
    shortcuts: {
        quickCommit: string;
        switchBranch: string;
        createChangelist: string;
        stashChanges: string;
        showHistory: string;
    };

    // Feature toggles
    features: {
        enableBranchManagement: boolean;
        enableStashOperations: boolean;
        enableHistoryViewer: boolean;
        enableRemoteOperations: boolean;
        enableGitFlow: boolean;
        enableSubmodules: boolean;
        enableWorktrees: boolean;
    };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: GitPilotConfiguration = {
    general: {
        autoFetchInterval: 15,
        defaultCommitOptions: {
            signOff: false,
            gpgSign: false,
            amendPrevious: false
        },
        enableStatusBar: true,
        enableFileDecorations: true
    },
    editor: {
        showGutterDecorations: true,
        showInlineBlame: false,
        showCodeLens: true,
        showHoverInfo: true,
        blameFormat: '${author}, ${timeAgo} • ${message}',
        decorationStyle: 'subtle',
        enableQuickFixes: true
    },
    changelists: {
        autoCreateDefault: true,
        defaultChangelistName: 'Default',
        autoSelectNewFiles: true,
        showChangelistInStatusBar: true,
        enableDragAndDrop: true
    },
    shelve: {
        autoCleanupDays: 30,
        includeUntrackedByDefault: false,
        showPreviewBeforeUnshelve: true,
        enableConflictDetection: true
    },
    performance: {
        gitCacheTimeoutMs: 5000,
        decorationDebounceMs: 500,
        maxHistoryEntries: 1000,
        enableLargeRepoOptimizations: true,
        asyncOperationTimeout: 30000
    },
    ui: {
        theme: 'auto',
        compactMode: false,
        showDetailedTooltips: true,
        enableAnimations: true,
        iconSet: 'default'
    },
    shortcuts: {
        quickCommit: 'ctrl+k',
        switchBranch: 'ctrl+b',
        createChangelist: 'alt+shift+c',
        stashChanges: 'ctrl+alt+s',
        showHistory: 'ctrl+h'
    },
    features: {
        enableBranchManagement: true,
        enableStashOperations: true,
        enableHistoryViewer: true,
        enableRemoteOperations: true,
        enableGitFlow: false,
        enableSubmodules: false,
        enableWorktrees: false
    }
};

/**
 * Configuration change event
 */
export interface ConfigurationChangeEvent {
    section: keyof GitPilotConfiguration;
    key: string;
    oldValue: any;
    newValue: any;
}

/**
 * GitPilot configuration manager with type safety and validation
 */
export class ConfigManager {
    private static instance: ConfigManager;
    private _onDidChangeConfiguration = new vscode.EventEmitter<ConfigurationChangeEvent>();
    private disposables: vscode.Disposable[] = [];
    
    readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

    private constructor() {
        this.setupConfigurationListener();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * Setup VSCode configuration change listener
     */
    private setupConfigurationListener(): void {
        const listener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('gitpilot')) {
                this.handleConfigurationChange(event);
            }
        });
        
        this.disposables.push(listener);
    }

    /**
     * Handle configuration changes and emit events
     */
    private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
        const config = vscode.workspace.getConfiguration('gitpilot');
        
        // Detect which sections changed and emit specific events
        for (const section of Object.keys(DEFAULT_CONFIG) as Array<keyof GitPilotConfiguration>) {
            if (event.affectsConfiguration(`gitpilot.${section}`)) {
                const sectionConfig = config.get(section);
                // Emit change event for this section
                this._onDidChangeConfiguration.fire({
                    section,
                    key: section,
                    oldValue: undefined, // Would need to track previous values
                    newValue: sectionConfig
                });
            }
        }
    }

    /**
     * Get complete configuration with defaults
     */
    public getConfiguration(): GitPilotConfiguration {
        const config = vscode.workspace.getConfiguration('gitpilot');
        
        return {
            general: { ...DEFAULT_CONFIG.general, ...config.get('general', {}) },
            editor: { ...DEFAULT_CONFIG.editor, ...config.get('editor', {}) },
            changelists: { ...DEFAULT_CONFIG.changelists, ...config.get('changelists', {}) },
            shelve: { ...DEFAULT_CONFIG.shelve, ...config.get('shelve', {}) },
            performance: { ...DEFAULT_CONFIG.performance, ...config.get('performance', {}) },
            ui: { ...DEFAULT_CONFIG.ui, ...config.get('ui', {}) },
            shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...config.get('shortcuts', {}) },
            features: { ...DEFAULT_CONFIG.features, ...config.get('features', {}) }
        };
    }

    /**
     * Get specific configuration section
     */
    public getSection<T extends keyof GitPilotConfiguration>(section: T): GitPilotConfiguration[T] {
        const config = vscode.workspace.getConfiguration('gitpilot');
        return { ...DEFAULT_CONFIG[section], ...config.get(section, {}) };
    }

    /**
     * Get specific configuration value
     */
    public getValue<T extends keyof GitPilotConfiguration, K extends keyof GitPilotConfiguration[T]>(
        section: T,
        key: K
    ): GitPilotConfiguration[T][K] {
        const sectionConfig = this.getSection(section);
        return sectionConfig[key];
    }

    /**
     * Update configuration value
     */
    public async updateValue<T extends keyof GitPilotConfiguration, K extends keyof GitPilotConfiguration[T]>(
        section: T,
        key: K,
        value: GitPilotConfiguration[T][K],
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('gitpilot');
        const sectionConfig = config.get(section, {}) as any;
        
        sectionConfig[key] = value;
        await config.update(section, sectionConfig, target);
    }

    /**
     * Reset configuration to defaults
     */
    public async resetToDefaults(target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
        const config = vscode.workspace.getConfiguration('gitpilot');
        
        for (const section of Object.keys(DEFAULT_CONFIG) as Array<keyof GitPilotConfiguration>) {
            await config.update(section, DEFAULT_CONFIG[section], target);
        }
        
        vscode.window.showInformationMessage('GitPilot configuration reset to defaults');
    }

    /**
     * Export configuration to JSON
     */
    public exportConfiguration(): string {
        const config = this.getConfiguration();
        return JSON.stringify(config, null, 2);
    }

    /**
     * Import configuration from JSON
     */
    public async importConfiguration(
        configJson: string,
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        try {
            const importedConfig = JSON.parse(configJson) as Partial<GitPilotConfiguration>;
            const config = vscode.workspace.getConfiguration('gitpilot');
            
            // Validate and merge with defaults
            for (const section of Object.keys(DEFAULT_CONFIG) as Array<keyof GitPilotConfiguration>) {
                if (importedConfig[section]) {
                    const mergedSection = { ...DEFAULT_CONFIG[section], ...importedConfig[section] };
                    await config.update(section, mergedSection, target);
                }
            }
            
            vscode.window.showInformationMessage('GitPilot configuration imported successfully');
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
        }
    }

    /**
     * Validate configuration values
     */
    public validateConfiguration(config: Partial<GitPilotConfiguration>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validate general settings
        if (config.general?.autoFetchInterval !== undefined) {
            if (config.general.autoFetchInterval < 0 || config.general.autoFetchInterval > 1440) {
                errors.push('Auto fetch interval must be between 0 and 1440 minutes');
            }
        }

        // Validate performance settings
        if (config.performance?.decorationDebounceMs !== undefined) {
            if (config.performance.decorationDebounceMs < 100 || config.performance.decorationDebounceMs > 5000) {
                errors.push('Decoration debounce must be between 100 and 5000 milliseconds');
            }
        }

        if (config.performance?.maxHistoryEntries !== undefined) {
            if (config.performance.maxHistoryEntries < 10 || config.performance.maxHistoryEntries > 10000) {
                errors.push('Max history entries must be between 10 and 10000');
            }
        }

        // Validate UI settings
        if (config.ui?.theme !== undefined) {
            if (!['auto', 'light', 'dark'].includes(config.ui.theme)) {
                errors.push('Theme must be one of: auto, light, dark');
            }
        }

        if (config.ui?.iconSet !== undefined) {
            if (!['default', 'minimal', 'colorful'].includes(config.ui.iconSet)) {
                errors.push('Icon set must be one of: default, minimal, colorful');
            }
        }

        // Validate editor settings
        if (config.editor?.decorationStyle !== undefined) {
            if (!['subtle', 'prominent', 'minimal'].includes(config.editor.decorationStyle)) {
                errors.push('Decoration style must be one of: subtle, prominent, minimal');
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Get configuration schema for VSCode settings
     */
    public static getConfigurationSchema(): any {
        return {
            type: 'object',
            title: 'GitPilot Configuration',
            properties: {
                'gitpilot.general': {
                    type: 'object',
                    description: 'General GitPilot settings',
                    properties: {
                        autoFetchInterval: {
                            type: 'number',
                            default: 15,
                            minimum: 0,
                            maximum: 1440,
                            description: 'Auto fetch interval in minutes (0 to disable)'
                        },
                        enableStatusBar: {
                            type: 'boolean',
                            default: true,
                            description: 'Show GitPilot information in status bar'
                        },
                        enableFileDecorations: {
                            type: 'boolean',
                            default: true,
                            description: 'Show Git status decorations in file explorer'
                        }
                    }
                },
                'gitpilot.editor': {
                    type: 'object',
                    description: 'Editor integration settings',
                    properties: {
                        showGutterDecorations: {
                            type: 'boolean',
                            default: true,
                            description: 'Show Git change decorations in editor gutter'
                        },
                        showInlineBlame: {
                            type: 'boolean',
                            default: false,
                            description: 'Show inline blame annotations'
                        },
                        showCodeLens: {
                            type: 'boolean',
                            default: true,
                            description: 'Show Git CodeLens above functions'
                        },
                        decorationStyle: {
                            type: 'string',
                            enum: ['subtle', 'prominent', 'minimal'],
                            default: 'subtle',
                            description: 'Style for Git decorations'
                        },
                        blameFormat: {
                            type: 'string',
                            default: '${author}, ${timeAgo} • ${message}',
                            description: 'Format string for blame annotations'
                        }
                    }
                },
                'gitpilot.performance': {
                    type: 'object',
                    description: 'Performance optimization settings',
                    properties: {
                        decorationDebounceMs: {
                            type: 'number',
                            default: 500,
                            minimum: 100,
                            maximum: 5000,
                            description: 'Debounce delay for decoration updates (ms)'
                        },
                        maxHistoryEntries: {
                            type: 'number',
                            default: 1000,
                            minimum: 10,
                            maximum: 10000,
                            description: 'Maximum number of history entries to load'
                        },
                        enableLargeRepoOptimizations: {
                            type: 'boolean',
                            default: true,
                            description: 'Enable optimizations for large repositories'
                        }
                    }
                },
                'gitpilot.features': {
                    type: 'object',
                    description: 'Feature toggle settings',
                    properties: {
                        enableBranchManagement: {
                            type: 'boolean',
                            default: true,
                            description: 'Enable branch management features'
                        },
                        enableStashOperations: {
                            type: 'boolean',
                            default: true,
                            description: 'Enable stash operations'
                        },
                        enableHistoryViewer: {
                            type: 'boolean',
                            default: true,
                            description: 'Enable commit history viewer'
                        }
                    }
                }
            }
        };
    }

    /**
     * Show configuration UI
     */
    public async showConfigurationUI(): Promise<void> {
        const actions = await vscode.window.showQuickPick([
            { label: '$(gear) Open Settings', action: 'open' },
            { label: '$(download) Export Configuration', action: 'export' },
            { label: '$(upload) Import Configuration', action: 'import' },
            { label: '$(refresh) Reset to Defaults', action: 'reset' }
        ], {
            placeHolder: 'GitPilot Configuration Actions'
        });

        if (!actions) return;

        switch (actions.action) {
            case 'open':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'gitpilot');
                break;
            case 'export':
                await this.exportConfigurationToFile();
                break;
            case 'import':
                await this.importConfigurationFromFile();
                break;
            case 'reset':
                await this.confirmAndResetConfiguration();
                break;
        }
    }

    /**
     * Export configuration to file
     */
    private async exportConfigurationToFile(): Promise<void> {
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('gitpilot-config.json'),
            filters: {
                'JSON files': ['json'],
                'All files': ['*']
            }
        });

        if (saveUri) {
            const configJson = this.exportConfiguration();
            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(configJson, 'utf8'));
            vscode.window.showInformationMessage(`Configuration exported to ${saveUri.fsPath}`);
        }
    }

    /**
     * Import configuration from file
     */
    private async importConfigurationFromFile(): Promise<void> {
        const openUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON files': ['json'],
                'All files': ['*']
            }
        });

        if (openUri && openUri[0]) {
            const configBytes = await vscode.workspace.fs.readFile(openUri[0]);
            const configJson = Buffer.from(configBytes).toString('utf8');
            await this.importConfiguration(configJson);
        }
    }

    /**
     * Confirm and reset configuration
     */
    private async confirmAndResetConfiguration(): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            'Are you sure you want to reset GitPilot configuration to defaults?',
            'Reset',
            'Cancel'
        );

        if (confirmation === 'Reset') {
            await this.resetToDefaults();
        }
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this._onDidChangeConfiguration.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}