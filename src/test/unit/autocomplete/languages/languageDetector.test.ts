import { LanguageDetector } from '../../../../autocomplete/languages/languageDetector';

describe('LanguageDetector', () => {
  describe('detectFromExtension', () => {
    it('should detect JavaScript from .js extension', () => {
      const result = LanguageDetector.detectFromExtension('test.js');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('javascript');
    });

    it('should detect TypeScript from .ts extension', () => {
      const result = LanguageDetector.detectFromExtension('test.ts');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('typescript');
    });

    it('should detect Python from .py extension', () => {
      const result = LanguageDetector.detectFromExtension('test.py');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('python');
    });

    it('should return null for unknown extension', () => {
      const result = LanguageDetector.detectFromExtension('test.xyz');
      expect(result).toBeNull();
    });

    it('should be case insensitive', () => {
      const result = LanguageDetector.detectFromExtension('test.JS');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('javascript');
    });
  });

  describe('detectFromShebang', () => {
    it('should detect Python from shebang', () => {
      const result = LanguageDetector.detectFromShebang('#!/usr/bin/python3');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('python');
    });

    it('should detect Node.js from shebang', () => {
      const result = LanguageDetector.detectFromShebang('#!/usr/bin/env node');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('javascript');
    });

    it('should detect Ruby from shebang', () => {
      const result = LanguageDetector.detectFromShebang('#!/usr/bin/ruby');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('ruby');
    });

    it('should return null for non-shebang line', () => {
      const result = LanguageDetector.detectFromShebang('// This is a comment');
      expect(result).toBeNull();
    });
  });

  describe('detectFromLanguageId', () => {
    it('should detect language from VSCode language ID', () => {
      const result = LanguageDetector.detectFromLanguageId('typescript');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('typescript');
    });

    it('should return null for unknown language ID', () => {
      const result = LanguageDetector.detectFromLanguageId('unknown-lang');
      expect(result).toBeNull();
    });
  });

  describe('detectEmbeddedLanguages', () => {
    const mockDocument = (languageId: string, content: string) => ({
      languageId,
      getText: () => content,
    });

    it('should detect JSX in JavaScript', () => {
      const doc = mockDocument(
        'javascript',
        `
        const Component = () => {
          return <div>Hello</div>
        }
      `
      );

      const result = LanguageDetector.detectEmbeddedLanguages(doc as any);
      expect(result).not.toBeNull();
      expect(result?.primary.id).toBe('javascript');
      expect(result?.embedded).toHaveLength(1);
      expect(result?.embedded[0].id).toBe('javascriptreact');
    });

    it('should detect TSX in TypeScript', () => {
      const doc = mockDocument(
        'typescript',
        `
        const Component: React.FC = () => {
          return <Button>Click me</Button>
        }
      `
      );

      const result = LanguageDetector.detectEmbeddedLanguages(doc as any);
      expect(result).not.toBeNull();
      expect(result?.primary.id).toBe('typescript');
      expect(result?.embedded).toHaveLength(1);
      expect(result?.embedded[0].id).toBe('typescriptreact');
    });

    it('should detect SQL in string literals', () => {
      const doc = mockDocument(
        'javascript',
        `
        const query = "SELECT * FROM users WHERE id = ?"
      `
      );

      const result = LanguageDetector.detectEmbeddedLanguages(doc as any);
      expect(result).not.toBeNull();
      expect(result?.embedded.some((e) => e.id === 'sql')).toBe(true);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return all supported languages', () => {
      const languages = LanguageDetector.getSupportedLanguages();
      expect(languages.length).toBeGreaterThan(0);
      expect(languages.some((l) => l.id === 'javascript')).toBe(true);
      expect(languages.some((l) => l.id === 'python')).toBe(true);
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', () => {
      expect(LanguageDetector.isLanguageSupported('javascript')).toBe(true);
      expect(LanguageDetector.isLanguageSupported('typescript')).toBe(true);
      expect(LanguageDetector.isLanguageSupported('python')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(LanguageDetector.isLanguageSupported('cobol')).toBe(false);
      expect(LanguageDetector.isLanguageSupported('fortran')).toBe(false);
    });
  });
});
