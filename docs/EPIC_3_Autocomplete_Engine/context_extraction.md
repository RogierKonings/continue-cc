# User Story: Context Extraction System

## Story Description

As a developer, I want the AI to understand my current coding context so that completions are relevant and aware of my project structure, imports, and current scope.

## Action Items

### 1. Extract Current File Context

- [x] Implement `ContextExtractor` class
- [x] Get current cursor position and surrounding code
- [x] Extract current function/method scope
- [x] Identify current class context if applicable
- [x] Determine file type and language

### 2. Parse Imports and Dependencies

- [x] Implement import statement parser for each language
- [x] Extract imported modules and their aliases
- [x] Identify used external libraries
- [x] Parse package.json/requirements.txt for dependencies
- [x] Cache parsed imports for performance

### 3. Analyze Symbol Information

- [x] Use VSCode's symbol provider API
- [x] Extract available variables in scope
- [x] Identify function parameters and types
- [x] Get class properties and methods
- [x] Parse JSDoc/docstring information

### 4. Include Project Context

- [x] Find related files (tests, implementations)
- [x] Extract project structure information
- [x] Include README content for project context
- [x] Parse configuration files
- [x] Identify project type and frameworks

### 5. Implement Smart Context Window

- [x] Create context prioritization algorithm
- [x] Implement token counting for context size
- [x] Add context truncation strategies
- [x] Prioritize recently edited code
- [x] Include relevant type definitions

## Acceptance Criteria

- [x] Context includes all relevant code for accurate completions
- [x] Context extraction completes in <50ms
- [ ] Token count stays within model limits
- [x] Import information is accurately parsed
- [x] Context updates incrementally with edits
- [x] Framework-specific context is included

## Test Cases

### File Context Tests

1. **Cursor Position**: Correct line and column extraction
2. **Function Scope**: Identifies containing function
3. **Class Context**: Extracts class information
4. **Language Detection**: Correct language identified

### Import Parsing Tests

1. **ES6 Imports**: Parses import statements correctly
2. **CommonJS**: Handles require() statements
3. **Python Imports**: From/import parsing works
4. **Aliases**: Import aliases are tracked
5. **Dynamic Imports**: Handles dynamic imports

### Symbol Analysis Tests

1. **Local Variables**: All in-scope variables found
2. **Parameters**: Function parameters identified
3. **Class Members**: Properties and methods extracted
4. **Type Info**: TypeScript/Python types captured

### Project Context Tests

1. **Related Files**: Finds test files for implementation
2. **Config Files**: Parses tsconfig.json, etc.
3. **Framework**: Detects React, Vue, Django, etc.
4. **Documentation**: Includes relevant docs

### Performance Tests

1. **Extraction Speed**: <50ms for average file
2. **Large Files**: Handles 5k+ line files
3. **Incremental**: Updates don't reparse everything
4. **Memory Usage**: No memory leaks

## Edge Cases

- Files with syntax errors
- Mixed language files (e.g., JSX, TSX)
- Very large files (>10k lines)
- Circular imports
- Missing or corrupted dependencies
- Uncommon file encodings
- Symbolic links and aliases

## Technical Notes

- Use tree-sitter for accurate parsing
- Leverage VSCode's document symbol provider
- Implement caching with invalidation
- Use TextDocument.offsetAt for positions
- Consider workspace.findFiles for project files

## Dependencies

- Depends on: Language support configuration
- Blocks: High-quality context-aware completions

## Optimization Strategies

- LRU cache for parsed files
- Incremental parsing on edits
- Parallel parsing for multiple files
- Lazy loading of project context
- Debounce context updates

## Estimated Effort

- 10-12 hours for basic implementation
- 16-20 hours including all languages and optimizations
