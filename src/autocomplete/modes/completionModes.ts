export enum CompletionMode {
  LINE = 'line',
  BLOCK = 'block',
  FUNCTION = 'function',
  DOCUMENTATION = 'documentation',
  AUTO = 'auto',
}

export interface ModeConfiguration {
  maxTokens: number;
  temperature: number;
  stopSequences: string[];
  promptPrefix?: string;
  promptSuffix?: string;
}

export interface ModeDetectionContext {
  currentLine: string;
  previousLine: string;
  nextLine: string;
  cursorPosition: number;
  languageId: string;
  fileContent: string;
  lineNumber: number;
}

export const MODE_CONFIGURATIONS: Record<CompletionMode, ModeConfiguration> = {
  [CompletionMode.LINE]: {
    maxTokens: 50,
    temperature: 0.2,
    stopSequences: ['\n'],
    promptPrefix: 'Complete the following line of code:',
    promptSuffix: '',
  },
  [CompletionMode.BLOCK]: {
    maxTokens: 200,
    temperature: 0.3,
    stopSequences: ['\n\n'],
    promptPrefix: 'Complete the following code block:',
    promptSuffix: '',
  },
  [CompletionMode.FUNCTION]: {
    maxTokens: 500,
    temperature: 0.4,
    stopSequences: ['\n\nfunction', '\n\nclass', '\n\nexport', '\n\nconst'],
    promptPrefix: 'Complete the following function implementation:',
    promptSuffix: '',
  },
  [CompletionMode.DOCUMENTATION]: {
    maxTokens: 150,
    temperature: 0.3,
    stopSequences: ['*/', '"""', '\n\n'],
    promptPrefix: 'Generate documentation for the following code:',
    promptSuffix: '',
  },
  [CompletionMode.AUTO]: {
    maxTokens: 200,
    temperature: 0.3,
    stopSequences: ['\n\n'],
    promptPrefix: '',
    promptSuffix: '',
  },
};
