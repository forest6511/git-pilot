/**
 * VSCode API mock for testing
 */

export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  createTreeView: jest.fn(),
  registerTreeDataProvider: jest.fn(),
  showQuickPick: jest.fn(),
  showInputBox: jest.fn(),
  activeTextEditor: undefined,
  onDidChangeActiveTextEditor: jest.fn(),
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn(),
  })),
  workspaceFolders: undefined,
  onDidChangeWorkspaceFolders: jest.fn(),
  findFiles: jest.fn(),
  onDidChangeTextDocument: jest.fn(),
  onDidSaveTextDocument: jest.fn(),
};

export const languages = {
  createDiagnosticCollection: jest.fn(),
};

export const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path, path })),
  parse: jest.fn(),
};

export const Range = jest.fn();
export const Position = jest.fn();
export const Selection = jest.fn();
export const TextEdit = jest.fn();

export const TreeItem = jest.fn();
export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const ExtensionContext = jest.fn();

export const EventEmitter = jest.fn(() => ({
  fire: jest.fn(),
  event: jest.fn(),
  dispose: jest.fn(),
}));

export default {
  window,
  commands,
  workspace,
  languages,
  Uri,
  Range,
  Position,
  Selection,
  TextEdit,
  TreeItem,
  TreeItemCollapsibleState,
  StatusBarAlignment,
  ExtensionContext,
  EventEmitter,
};