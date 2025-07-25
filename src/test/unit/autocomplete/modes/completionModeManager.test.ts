import * as vscode from 'vscode';
import { CompletionModeManager } from '../../../../autocomplete/modes/completionModeManager';
import { CompletionMode } from '../../../../autocomplete/modes/completionModes';

// Mock vscode modules
jest.mock('vscode', () => ({
  window: {
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      show: jest.fn(),
      dispose: jest.fn(),
    })),
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  StatusBarAlignment: {
    Right: 2,
  },
  CompletionItemKind: {
    Snippet: 0,
    Text: 1,
    Method: 2,
  },
  SnippetString: jest.fn((value: string) => ({ value })),
}));

describe('CompletionModeManager', () => {
  let manager: CompletionModeManager;
  let mockDocument: any;
  let mockPosition: any;
  let mockContext: any;
  let mockToken: any;

  beforeEach(() => {
    manager = new CompletionModeManager();

    mockDocument = {
      getText: jest.fn(() => 'const test = '),
      lineAt: jest.fn(() => ({ text: 'const test = ' })),
      languageId: 'typescript',
    };

    mockPosition = {
      line: 0,
      character: 13,
    };

    mockContext = {};
    mockToken = {
      isCancellationRequested: false,
    };
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('Mode Management', () => {
    it('should initialize with AUTO mode', () => {
      expect(manager.getCurrentMode()).toBe(CompletionMode.AUTO);
    });

    it('should set manual mode override', () => {
      manager.setMode(CompletionMode.FUNCTION);
      expect(manager.getCurrentMode()).toBe(CompletionMode.FUNCTION);
    });

    it('should clear override when set to AUTO', () => {
      manager.setMode(CompletionMode.FUNCTION);
      manager.setMode(CompletionMode.AUTO);
      expect(manager.getCurrentMode()).toBe(CompletionMode.AUTO);
    });
  });

  describe('Status Bar', () => {
    it('should create status bar item on initialization', () => {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
        vscode.StatusBarAlignment.Right,
        100
      );
    });

    it('should update status bar when mode changes', () => {
      const statusBarItem = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;

      manager.setMode(CompletionMode.FUNCTION);

      expect(statusBarItem.text).toContain('Function');
      expect(statusBarItem.tooltip).toContain('Function completion mode');
    });
  });

  describe('Mode Quick Pick', () => {
    it('should show mode selection quick pick', async () => {
      const mockSelection = { label: '$(symbol-method) Function' };
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(mockSelection);

      await manager.showModeQuickPick();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: '$(symbol-misc) Auto' }),
          expect.objectContaining({ label: '$(dash) Line' }),
          expect.objectContaining({ label: '$(symbol-namespace) Block' }),
          expect.objectContaining({ label: '$(symbol-method) Function' }),
          expect.objectContaining({ label: '$(comment) Documentation' }),
        ]),
        expect.any(Object)
      );
    });

    it('should change mode when selection is made', async () => {
      const mockSelection = { label: '$(symbol-method) Function' };
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(mockSelection);

      await manager.showModeQuickPick();

      expect(manager.getCurrentMode()).toBe(CompletionMode.FUNCTION);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Switched to Function completion mode'
      );
    });

    it('should not change mode when cancelled', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const originalMode = manager.getCurrentMode();
      await manager.showModeQuickPick();

      expect(manager.getCurrentMode()).toBe(originalMode);
    });
  });

  describe('Configuration', () => {
    it('should get configuration for specific mode', () => {
      const config = manager.getConfiguration(CompletionMode.LINE);

      expect(config).toBeDefined();
      expect(config?.maxTokens).toBe(50);
      expect(config?.temperature).toBe(0.2);
      expect(config?.stopSequences).toContain('\n');
    });

    it('should return undefined for AUTO mode', () => {
      const config = manager.getConfiguration(CompletionMode.AUTO);

      expect(config).toBeDefined();
      expect(config?.maxTokens).toBe(200);
    });
  });

  describe('Completions', () => {
    it('should provide completions based on detected mode', async () => {
      // Mock document for line mode detection
      mockDocument.getText.mockReturnValue('const result = ');
      mockDocument.lineAt.mockReturnValue({
        text: 'const result = ',
        substring: (start: number, end: number) => 'const result = '.substring(start, end),
      });

      const completions = await manager.provideCompletions(
        mockDocument,
        mockPosition,
        mockContext,
        mockToken,
        {} as any
      );

      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(0);
    });

    it('should use manual mode override when set', async () => {
      manager.setMode(CompletionMode.DOCUMENTATION);

      // Even though context suggests line mode
      mockDocument.getText.mockReturnValue('const result = ');

      const completions = await manager.provideCompletions(
        mockDocument,
        mockPosition,
        mockContext,
        mockToken,
        {} as any
      );

      // Should use documentation mode provider
      expect(manager.getCurrentMode()).toBe(CompletionMode.DOCUMENTATION);
    });
  });

  describe('Dispose', () => {
    it('should dispose status bar item', () => {
      const statusBarItem = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;

      manager.dispose();

      expect(statusBarItem.dispose).toHaveBeenCalled();
    });
  });
});
