# User Story: Multiple Completion Modes

## Story Description
As a developer with varying coding needs, I want different completion modes optimized for specific scenarios so that I can get the most appropriate suggestions for my current task.

## Action Items

### 1. Implement Line Completion Mode
- [ ] Create single-line completion logic
- [ ] Optimize for finishing current line
- [ ] Add expression completion
- [ ] Support statement completion
- [ ] Implement smart semicolon insertion

### 2. Create Block Completion Mode
- [ ] Design multi-line block completions
- [ ] Support if/else block completion
- [ ] Add loop structure completion
- [ ] Implement try/catch blocks
- [ ] Handle nested block structures

### 3. Build Function Completion Mode
- [ ] Generate entire function bodies
- [ ] Infer function purpose from name
- [ ] Use parameter types for logic
- [ ] Add return statement completion
- [ ] Support async function patterns

### 4. Add Documentation Mode
- [ ] Create comment block completions
- [ ] Generate JSDoc/docstrings
- [ ] Add inline comment suggestions
- [ ] Support markdown in comments
- [ ] Generate example usage

### 5. Implement Mode Selection
- [ ] Create automatic mode detection
- [ ] Add manual mode switching
- [ ] Show current mode in status
- [ ] Configure mode preferences
- [ ] Add mode-specific keybindings

## Acceptance Criteria
- [ ] Each mode provides appropriate completions
- [ ] Mode switching is seamless
- [ ] Auto-detection works accurately
- [ ] Performance consistent across modes
- [ ] Users can override mode selection
- [ ] Mode indicator is always visible

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
  AUTO = 'auto'
}

interface ModeDetector {
  detectFromContext(context: CodeContext): CompletionMode
  detectFromTrigger(trigger: string): CompletionMode
  detectFromPosition(position: Position): CompletionMode
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
- **Documentation**: After /**, """

## Estimated Effort
- 10-12 hours for basic modes
- 16-18 hours including auto-detection and UI