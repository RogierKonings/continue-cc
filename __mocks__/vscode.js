const vscode = {
  Position: jest.fn(),
  Range: jest.fn(),
  Uri: {
    file: jest.fn((path) => ({ fsPath: path })),
  },
  window: {
    withProgress: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    setStatusBarMessage: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  ThemeColor: jest.fn(),
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1,
  },
  ExtensionContext: jest.fn(),
  SecretStorage: jest.fn(),
  Memento: jest.fn(),
};

module.exports = vscode;