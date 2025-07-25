/* eslint-disable */
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import '../setup';
import { activate, deactivate } from '../../extension';

describe('Extension', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      subscriptions: [],
      extensionPath: '',
      extensionUri: vscode.Uri.file(''),
      asAbsolutePath: sinon.stub(),
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
      languageModelAccessInformation: {} as any,
    };
  });

  describe('activate', () => {
    it('should register commands', () => {
      const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');

      activate(context);

      expect(registerCommandStub).to.have.been.called;
      expect(context.subscriptions).to.have.length.greaterThan(0);

      registerCommandStub.restore();
    });
  });

  describe('deactivate', () => {
    it('should log deactivation message', () => {
      const consoleStub = sinon.stub(console, 'log');

      deactivate();

      expect(consoleStub).to.have.been.calledWith(
        'Claude Code Continue extension is now deactivated'
      );
      consoleStub.restore();
    });
  });
});
