import * as vscode from 'vscode';
import { ContextExtractor, CodeContext } from '../../../autocomplete/context/contextExtractor';

// Mock vscode module
jest.mock('vscode');

describe('ContextExtractor', () => {
  let contextExtractor: ContextExtractor;
  let mockDocument: vscode.TextDocument;
  let mockPosition: vscode.Position;

  beforeEach(() => {
    contextExtractor = new ContextExtractor();

    // Create mock document
    mockDocument = {
      languageId: 'typescript',
      lineCount: 100,
      lineAt: jest.fn((line: number) => ({
        text: '    const example = "test";',
        range: new vscode.Range(line, 0, line, 27),
        firstNonWhitespaceCharacterIndex: 4,
        isEmptyOrWhitespace: false,
      })),
      getText: jest.fn((range?: vscode.Range) => {
        if (!range) {
          return 'full document content';
        }
        return 'partial content';
      }),
      offsetAt: jest.fn(() => 500),
      uri: vscode.Uri.file('/test/file.ts'),
      fileName: '/test/file.ts',
      version: 1,
    } as any;

    mockPosition = new vscode.Position(10, 15);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractContext', () => {
    it('should extract basic context information', async () => {
      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.language).toBe('typescript');
      expect(context.currentLine).toBe('    const example = "test";');
      expect(context.cursorPosition).toBe(mockPosition);
      expect(context.indentation).toBe('    ');
    });

    it('should extract prefix and suffix correctly', async () => {
      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.prefix).toBeDefined();
      expect(context.suffix).toBeDefined();
      expect(mockDocument.getText).toHaveBeenCalledWith(expect.any(vscode.Range));
    });

    it('should generate context hash', async () => {
      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.hash).toBeDefined();
      expect(typeof context.hash).toBe('string');
    });

    it('should cache import extraction', async () => {
      // First call
      await contextExtractor.extractContext(mockDocument, mockPosition);

      // Second call with same document
      await contextExtractor.extractContext(mockDocument, mockPosition);

      // getText should be called twice for prefix/suffix but only once for full document
      expect(mockDocument.getText).toHaveBeenCalledTimes(4);
    });
  });

  describe('import extraction', () => {
    it('should extract TypeScript imports', async () => {
      mockDocument.getText = jest.fn(
        () => `
                import { Component } from '@angular/core';
                import * as fs from 'fs';
                import React from 'react';
                const dynamicImport = import('./dynamic');
                require('legacy-module');
            `
      );

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.imports).toContain('@angular/core');
      expect(context.imports).toContain('fs');
      expect(context.imports).toContain('react');
      expect(context.imports).toContain('./dynamic');
      expect(context.imports).toContain('legacy-module');
    });

    it('should extract Python imports', async () => {
      (mockDocument as any).languageId = 'python';
      mockDocument.getText = jest.fn(
        () => `
                import os
                import sys
                from datetime import datetime
                from collections import defaultdict
            `
      );

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.imports).toContain('os');
      expect(context.imports).toContain('sys');
      expect(context.imports).toContain('datetime');
      expect(context.imports).toContain('collections');
    });

    it('should extract Java imports', async () => {
      (mockDocument as any).languageId = 'java';
      mockDocument.getText = jest.fn(
        () => `
                import java.util.List;
                import java.util.ArrayList;
                import com.example.MyClass;
            `
      );

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.imports).toContain('java.util.List');
      expect(context.imports).toContain('java.util.ArrayList');
      expect(context.imports).toContain('com.example.MyClass');
    });
  });

  describe('symbol extraction', () => {
    it('should handle document symbols', async () => {
      const mockSymbols: vscode.DocumentSymbol[] = [
        {
          name: 'MyClass',
          detail: 'class detail',
          kind: vscode.SymbolKind.Class,
          range: new vscode.Range(0, 0, 50, 0),
          selectionRange: new vscode.Range(0, 0, 0, 10),
          children: [
            {
              name: 'myMethod',
              detail: 'method detail',
              kind: vscode.SymbolKind.Method,
              range: new vscode.Range(5, 0, 15, 0),
              selectionRange: new vscode.Range(5, 0, 5, 10),
              children: [],
            },
          ],
        },
      ];

      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockSymbols);

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.symbols).toHaveLength(2);
      expect(context.symbols[0].name).toBe('MyClass');
      expect(context.symbols[1].name).toBe('myMethod');
    });

    it('should handle missing document symbols', async () => {
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(null);

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.symbols).toEqual([]);
    });
  });

  describe('project context extraction', () => {
    it('should detect Node.js project with frameworks', async () => {
      const mockPackageJson = {
        dependencies: {
          react: '^18.0.0',
          express: '^4.18.0',
          lodash: '^4.17.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      };

      (vscode.workspace.findFiles as jest.Mock).mockImplementation((pattern: string) => {
        if (pattern.includes('package.json')) {
          return Promise.resolve([vscode.Uri.file('/test/package.json')]);
        }
        return Promise.resolve([]);
      });

      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
        Buffer.from(JSON.stringify(mockPackageJson))
      );

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.projectContext?.projectType).toBe('node');
      expect(context.projectContext?.frameworks).toContain('React');
      expect(context.projectContext?.frameworks).toContain('Express');
      expect(context.projectContext?.dependencies).toContain('react');
      expect(context.projectContext?.dependencies).toContain('express');
      expect(context.projectContext?.dependencies).toContain('lodash');
    });

    it('should find related files', async () => {
      (mockDocument as any).fileName = '/test/components/Button.tsx';

      (vscode.workspace.findFiles as jest.Mock).mockImplementation((pattern: string) => {
        if (pattern.includes('Button.test')) {
          return Promise.resolve([vscode.Uri.file('/test/components/Button.test.tsx')]);
        }
        if (pattern.includes('Button.spec')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.projectContext?.relatedFiles).toContain('/test/components/Button.test.tsx');
    });
  });

  describe('indentation extraction', () => {
    it('should extract space indentation', async () => {
      mockDocument.lineAt = jest.fn(() => ({
        text: '    const value = 42;',
      })) as any;

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.indentation).toBe('    ');
    });

    it('should extract tab indentation', async () => {
      mockDocument.lineAt = jest.fn(() => ({
        text: '\t\tconst value = 42;',
      })) as any;

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.indentation).toBe('\t\t');
    });

    it('should handle no indentation', async () => {
      mockDocument.lineAt = jest.fn(() => ({
        text: 'const value = 42;',
      })) as any;

      const context = await contextExtractor.extractContext(mockDocument, mockPosition);

      expect(context.indentation).toBe('');
    });
  });

  describe('cache management', () => {
    it('should clear all caches', () => {
      // Populate caches
      contextExtractor['symbolCache'].set('key1', []);
      contextExtractor['importCache'].set('key2', []);

      expect(contextExtractor['symbolCache'].size).toBe(1);
      expect(contextExtractor['importCache'].size).toBe(1);

      contextExtractor.clearCache();

      expect(contextExtractor['symbolCache'].size).toBe(0);
      expect(contextExtractor['importCache'].size).toBe(0);
    });
  });
});
