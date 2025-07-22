import * as vscode from 'vscode';
import { activate, deactivate } from '../../extension';

describe('Extension', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      subscriptions: [],
      extensionPath: '',
      extensionUri: vscode.Uri.file(''),
      asAbsolutePath: jest.fn(),
      storagePath: undefined,
      globalStoragePath: '',
      logPath: '',
      extensionMode: vscode.ExtensionMode.Test,
      extension: {} as any,
      globalState: {} as any,
      workspaceState: {} as any,
      secrets: {} as any,
      environmentVariableCollection: {} as any,
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file(''),
      logUri: vscode.Uri.file(''),
    };
  });

  describe('activate', () => {
    it('should register hello world command', () => {
      const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');
      
      activate(context);
      
      expect(registerCommandSpy).toHaveBeenCalledWith(
        'claude-code-continue.helloWorld',
        expect.any(Function)
      );
      expect(context.subscriptions).toHaveLength(1);
    });
  });

  describe('deactivate', () => {
    it('should log deactivation message', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      deactivate();
      
      expect(consoleSpy).toHaveBeenCalledWith('Claude Code Continue extension is now deactivated');
      consoleSpy.mockRestore();
    });
  });
});