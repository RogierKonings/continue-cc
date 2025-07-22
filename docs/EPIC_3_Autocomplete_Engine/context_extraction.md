# User Story: Context Extraction System

## Story Description
As a developer, I want the AI to understand my current coding context so that completions are relevant and aware of my project structure, imports, and current scope.

## Action Items

### 1. Extract Current File Context
- [ ] Implement `ContextExtractor` class
- [ ] Get current cursor position and surrounding code
- [ ] Extract current function/method scope
- [ ] Identify current class context if applicable
- [ ] Determine file type and language

### 2. Parse Imports and Dependencies
- [ ] Implement import statement parser for each language
- [ ] Extract imported modules and their aliases
- [ ] Identify used external libraries
- [ ] Parse package.json/requirements.txt for dependencies
- [ ] Cache parsed imports for performance

### 3. Analyze Symbol Information
- [ ] Use VSCode's symbol provider API
- [ ] Extract available variables in scope
- [ ] Identify function parameters and types
- [ ] Get class properties and methods
- [ ] Parse JSDoc/docstring information

### 4. Include Project Context
- [ ] Find related files (tests, implementations)
- [ ] Extract project structure information
- [ ] Include README content for project context
- [ ] Parse configuration files
- [ ] Identify project type and frameworks

### 5. Implement Smart Context Window
- [ ] Create context prioritization algorithm
- [ ] Implement token counting for context size
- [ ] Add context truncation strategies
- [ ] Prioritize recently edited code
- [ ] Include relevant type definitions

## Acceptance Criteria
- [ ] Context includes all relevant code for accurate completions
- [ ] Context extraction completes in <50ms
- [ ] Token count stays within model limits
- [ ] Import information is accurately parsed
- [ ] Context updates incrementally with edits
- [ ] Framework-specific context is included

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