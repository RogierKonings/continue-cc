# User Story: Multiple Completion Modes

## Story Description

As a developer with varying coding needs, I want different completion modes optimized for specific scenarios so that I can get the most appropriate suggestions for my current task.

## Action Items

### 1. Implement Line Completion Mode

- [x] Create single-line completion logic
- [x] Optimize for finishing current line
- [x] Add expression completion
- [x] Support statement completion
- [x] Implement smart semicolon insertion

### 2. Create Block Completion Mode

- [x] Design multi-line block completions
- [x] Support if/else block completion
- [x] Add loop structure completion
- [x] Implement try/catch blocks
- [x] Handle nested block structures

### 3. Build Function Completion Mode

- [x] Generate entire function bodies
- [x] Infer function purpose from name
- [x] Use parameter types for logic
- [x] Add return statement completion
- [x] Support async function patterns

### 4. Add Documentation Mode

- [x] Create comment block completions
- [x] Generate JSDoc/docstrings
- [x] Add inline comment suggestions
- [x] Support markdown in comments
- [x] Generate example usage

### 5. Implement Mode Selection

- [x] Create automatic mode detection
- [x] Add manual mode switching
- [x] Show current mode in status
- [x] Configure mode preferences
- [x] Add mode-specific keybindings

## Acceptance Criteria

- [x] Each mode provides appropriate completions
- [x] Mode switching is seamless
- [x] Auto-detection works accurately
- [x] Performance consistent across modes
- [x] Users can override mode selection
- [x] Mode indicator is always visible

## Test Cases

### Line Mode Tests

1. **Expression**: Completes arithmetic
2. **Statement**: Finishes declarations
3. **Method Calls**: Completes chains
4. **Properties**: Object property access
5. **Semicolon**: Adds when appropriate

### Block Mode Tests

1. **If Statement**: Complete condition
2. **For Loop**: Full loop structure
3. **Try/Catch**: Exception handling
4. **Switch**: Case statements
5. **Nesting**: Handles deep nesting

### Function Mode Tests

1. **Body Generation**: Logical implementation
2. **Parameter Use**: Uses all params
3. **Return Type**: Matches signature
4. **Async**: Handles promises
5. **Recursion**: Detects recursive patterns

### Documentation Mode Tests

1. **JSDoc**: Proper format and tags
2. **Docstring**: Python format
3. **Parameters**: Documents all params
4. **Examples**: Generates usage
5. **Markdown**: Supports formatting

### Mode Selection Tests

1. **Auto Detect**: Correct mode chosen
2. **Manual Switch**: Override works
3. **Status Display**: Shows current mode
4. **Persistence**: Mode remembered
5. **Keybindings**: Shortcuts work

## Edge Cases

- Mode detection ambiguity
- Mixed content requiring multiple modes
- Mode switching mid-completion
- Language-specific mode requirements
- Nested contexts (function in class)
- Template literals
- Regex patterns

## Technical Notes

- Use cursor position analysis
- Implement AST-based detection
- Cache mode per file region
- Use different prompts per mode
- Consider ML for mode detection

## Dependencies

- Depends on: Completion provider
- Blocks: Optimized completions

## Mode Detection Rules

```typescript
enum CompletionMode {
  LINE = 'line',
  BLOCK = 'block',
  FUNCTION = 'function',
  DOCUMENTATION = 'documentation',
  AUTO = 'auto',
}

interface ModeDetector {
  detectFromContext(context: CodeContext): CompletionMode;
  detectFromTrigger(trigger: string): CompletionMode;
  detectFromPosition(position: Position): CompletionMode;
}
```

## Mode Configurations

```json
{
  "line": {
    "maxTokens": 50,
    "temperature": 0.2,
    "stopSequences": ["\n"]
  },
  "block": {
    "maxTokens": 200,
    "temperature": 0.3,
    "stopSequences": ["\n\n"]
  },
  "function": {
    "maxTokens": 500,
    "temperature": 0.4,
    "stopSequences": ["\n\nfunction", "\n\nclass"]
  }
}
```

## Mode Triggers

- **Line**: After operators, mid-expression
- **Block**: After {, if/for/while
- **Function**: After function declaration
- **Documentation**: After /\*\*, """

## Estimated Effort

- 10-12 hours for basic modes
- 16-18 hours including auto-detection and UI
