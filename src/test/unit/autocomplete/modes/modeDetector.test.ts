import { ModeDetector } from '../../../../autocomplete/modes/modeDetector';
import {
  CompletionMode,
  ModeDetectionContext,
} from '../../../../autocomplete/modes/completionModes';

describe('ModeDetector', () => {
  const createContext = (
    currentLine: string,
    previousLine: string = '',
    languageId: string = 'typescript'
  ): ModeDetectionContext => ({
    currentLine,
    previousLine,
    nextLine: '',
    cursorPosition: currentLine.length,
    languageId,
    fileContent: '',
    lineNumber: 0,
  });

  describe('detectMode', () => {
    describe('Documentation Mode', () => {
      it('should detect JSDoc start', () => {
        const context = createContext('  /**');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.DOCUMENTATION);
      });

      it('should detect Python docstring', () => {
        const context = createContext('  """', '', 'python');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.DOCUMENTATION);
      });

      it('should detect triple slash comment', () => {
        const context = createContext('  ///');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.DOCUMENTATION);
      });
    });

    describe('Function Mode', () => {
      it('should detect function declaration', () => {
        const context = createContext('', 'function calculateTotal(items) {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.FUNCTION);
      });

      it('should detect async function', () => {
        const context = createContext('', 'async function fetchData() {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.FUNCTION);
      });

      it('should detect class method', () => {
        const context = createContext('', '  public getData(): string {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.FUNCTION);
      });

      it('should detect arrow function', () => {
        const context = createContext('', '  handleClick: async (event) => {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.FUNCTION);
      });

      it('should detect constructor', () => {
        const context = createContext('', '  constructor(name: string) {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.FUNCTION);
      });
    });

    describe('Block Mode', () => {
      it('should detect if statement', () => {
        const context = createContext('', 'if (condition) {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.BLOCK);
      });

      it('should detect for loop', () => {
        const context = createContext('', 'for (let i = 0; i < 10; i++) {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.BLOCK);
      });

      it('should detect try block', () => {
        const context = createContext('', 'try {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.BLOCK);
      });

      it('should detect switch statement', () => {
        const context = createContext('', 'switch (value) {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.BLOCK);
      });

      it('should detect arrow function block', () => {
        const context = createContext('items.map(item => {');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.BLOCK);
      });
    });

    describe('Line Mode', () => {
      it('should detect after operators', () => {
        const context = createContext('const result = ');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.LINE);
      });

      it('should detect property access', () => {
        const context = createContext('object.');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.LINE);
      });

      it('should detect function call', () => {
        const context = createContext('doSomething(');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.LINE);
      });

      it('should detect return statement', () => {
        const context = createContext('return ');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.LINE);
      });

      it('should detect variable assignment', () => {
        const context = createContext('const name = ');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.LINE);
      });
    });

    describe('Auto Mode', () => {
      it('should default to auto for ambiguous context', () => {
        const context = createContext('// regular comment');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.AUTO);
      });

      it('should default to auto for empty line', () => {
        const context = createContext('');
        expect(ModeDetector.detectMode(context)).toBe(CompletionMode.AUTO);
      });
    });
  });

  describe('detectFromPosition', () => {
    it('should detect mode from document position', () => {
      const document = `function test() {
  const result = 
}`;
      const position = { line: 1, character: 17 };

      const mode = ModeDetector.detectFromPosition(document, position, 'javascript');
      expect(mode).toBe(CompletionMode.LINE);
    });

    it('should handle edge cases', () => {
      const document = '';
      const position = { line: 0, character: 0 };

      const mode = ModeDetector.detectFromPosition(document, position, 'javascript');
      expect(mode).toBe(CompletionMode.AUTO);
    });
  });
});
