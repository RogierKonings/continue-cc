# User Story: Multi-Language Support

## Story Description
As a polyglot developer, I want the extension to provide intelligent completions for all major programming languages so that I can use it across my entire tech stack.

## Action Items

### 1. Implement Language Detection
- [ ] Create language identifier from file extensions
- [ ] Add shebang line detection
- [ ] Implement VSCode language ID mapping
- [ ] Support embedded languages (JSX, TSX)
- [ ] Handle multi-language files

### 2. Add Language-Specific Parsers
- [ ] Integrate tree-sitter for each language
- [ ] Configure JavaScript/TypeScript parser
- [ ] Add Python parser with type stubs
- [ ] Implement Java/C++ parsers
- [ ] Support Go, Rust, Ruby parsers

### 3. Create Language Prompt Templates
- [ ] Design base completion prompt
- [ ] Add language-specific context
- [ ] Include language idioms
- [ ] Configure syntax preferences
- [ ] Handle language versions

### 4. Implement Syntax-Aware Completions
- [ ] Respect language syntax rules
- [ ] Handle language-specific keywords
- [ ] Support language conventions
- [ ] Add import/include completion
- [ ] Implement type-aware suggestions

### 5. Support Framework Detection
- [ ] Detect React/Vue/Angular
- [ ] Identify Django/Flask
- [ ] Recognize Spring/Express
- [ ] Support testing frameworks
- [ ] Add framework-specific completions

## Acceptance Criteria
- [ ] All major languages supported
- [ ] Completions follow language conventions
- [ ] Framework-specific patterns recognized
- [ ] Embedded languages work correctly
- [ ] Performance consistent across languages
- [ ] Language switching is seamless

## Test Cases

### Language Detection Tests
1. **File Extension**: .js identified as JavaScript
2. **Shebang**: #!/usr/bin/python detected
3. **VSCode ID**: Language mode recognized
4. **Embedded**: JSX in .js files works
5. **Unknown**: Graceful fallback

### Parser Tests
1. **Parse Success**: All languages parse
2. **Syntax Errors**: Handle gracefully
3. **Large Files**: Performance acceptable
4. **Unicode**: International code works
5. **Versions**: Different language versions

### Prompt Template Tests
1. **Base Prompt**: Generic completion works
2. **Language Context**: Includes imports
3. **Idioms**: Language patterns used
4. **Formatting**: Follows conventions
5. **Versions**: Handles version differences

### Syntax Awareness Tests
1. **Keywords**: No keyword suggestions
2. **Types**: Type-appropriate completions
3. **Conventions**: snake_case vs camelCase
4. **Imports**: Suggests correct format
5. **Indentation**: Respects language style

### Framework Tests
1. **React**: JSX completions work
2. **Vue**: Template syntax supported
3. **Django**: Template tags completed
4. **Express**: Route patterns work
5. **Testing**: Test syntax recognized

## Edge Cases
- Mixed language files (HTML with JS)
- Language version conflicts
- Custom file extensions
- Template languages
- DSLs and custom languages
- Preprocessor languages
- Binary file detection

## Technical Notes
- Use tree-sitter bindings
- Cache parsed ASTs
- Implement language registry
- Use VSCode's language API
- Consider WebAssembly for parsers

## Dependencies
- Depends on: Context extraction system
- Blocks: True multi-language support

## Supported Languages (Priority Order)
1. JavaScript/TypeScript
2. Python
3. Java
4. C/C++
5. Go
6. Rust
7. Ruby
8. PHP
9. C#
10. Swift

## Language Configuration
```typescript
interface LanguageConfig {
  id: string,
  extensions: string[],
  parser: Parser,
  promptTemplate: string,
  syntaxRules: SyntaxRules,
  frameworks: Framework[]
}
```

## Framework Detection Patterns
- **React**: import.*from.*react
- **Vue**: <template>.*</template>
- **Django**: {% extends
- **Express**: app.get|post|put
- **Jest**: describe\(.*test\(

## Estimated Effort
- 12-16 hours for core languages
- 20-24 hours including all languages and frameworks