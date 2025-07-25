# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Continue is a VSCode extension that provides AI-powered code autocomplete functionality using Claude Code Max subscription. It integrates with Claude's API through OAuth authentication to provide intelligent code completions without requiring API keys.

## Common Development Commands

### Build Commands

- `npm run compile` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode for TypeScript compilation
- `npm run build:dev` - Development build with esbuild
- `npm run build:prod` - Production build with esbuild (used for publishing)

### Testing Commands

- `npm test` - Run all tests with Jest
- `npm run test:unit` - Run unit tests specifically (if needed, use `npm test`)
- `npm run test-compile` - Compile test files
- To run a single test file: `npm test -- src/test/unit/path/to/test.test.ts`
- To run tests in watch mode: `npm test -- --watch`

### Development Workflow

- `npm run dev` - Start development mode with hot reload
- `npm run watch:extension` - Watch and recompile extension on changes
- `npm run lint` - Run ESLint on TypeScript files
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting without changes

### Debugging in VSCode

1. Open the project in VSCode
2. Press F5 to launch a new Extension Development Host window
3. The extension will be loaded in the new window for testing

## High-Level Architecture

### Core Components

1. **Authentication System** (`src/auth/`)
   - `AuthFlowCoordinator` - Manages the OAuth flow and coordinates authentication
   - `ClaudeAuthService` - Core authentication service handling VSCode auth provider
   - `OAuthService` - Handles OAuth token exchange and validation
   - `TokenManager` - Manages secure token storage using VSCode SecretStorage

2. **API Layer** (`src/api/`)
   - `ClaudeCodeAPIClient` - HTTP client for Claude Code API with retry logic
   - `RateLimitManager` - Tracks and enforces API rate limits
   - `CircuitBreaker` - Prevents cascading failures with circuit breaker pattern
   - `OfflineCache` - Caches completions for offline/degraded operation

3. **Autocomplete Engine** (`src/autocomplete/`)
   - `CompletionProviderRegistry` - Registers and manages completion providers
   - `ClaudeCompletionProvider` - Main provider implementing VSCode's CompletionItemProvider
   - `ContextExtractor` - Extracts relevant code context for completion requests
   - `DebouncedCompletionManager` - Manages debouncing and request cancellation

4. **UI Components** (`src/views/`, `src/webviews/`)
   - `AuthStatusBar` - Shows authentication status in status bar
   - `AuthWebviewProvider` - Handles OAuth callback in webview
   - `SettingsWebviewProvider` - Settings UI in webview

### Key Architectural Patterns

1. **Service Pattern**: Core functionality is organized into services (auth, notifications, status bar)
2. **Provider Pattern**: VSCode API integrations use provider interfaces
3. **Dependency Injection**: Services are initialized in `extension.ts` and passed to components
4. **Circuit Breaker**: API calls are protected with circuit breaker for resilience
5. **Caching Strategy**: LRU cache for completions with configurable TTL

### Authentication Flow

1. User triggers sign-in command
2. `AuthFlowCoordinator` initiates OAuth flow
3. Browser opens for Claude Code authentication
4. Callback captured by webview provider
5. Tokens stored securely in VSCode SecretStorage
6. Authentication status updated in UI

### Completion Request Flow

1. Text change detected in editor
2. `DebouncedCompletionManager` debounces request
3. `ContextExtractor` gathers relevant context
4. Request sent to Claude API via `ClaudeCodeAPIClient`
5. Response cached and formatted as VSCode completion items
6. Completions shown in editor

## Configuration

The extension uses VSCode's configuration API with the following namespaces:

- `continue-cc.*` - General extension settings
- `continue-cc.autocomplete.*` - Autocomplete behavior settings
- `continue-cc.languages.*` - Language-specific settings
- `continue-cc.performance.*` - Performance tuning settings
- `continue-cc.advanced.*` - Advanced configuration options

## Testing Strategy

- Unit tests use Jest with TypeScript support
- Test files are co-located with source files as `*.test.ts`
- Mock VSCode API using `@types/vscode` stubs
- Integration tests run in VSCode Extension Test Runner
- Coverage reports generated in `coverage/` directory

## Important Implementation Details

1. **Token Security**: Never log authentication tokens. Use VSCode's SecretStorage API exclusively.
2. **Error Handling**: All API calls wrapped in try-catch with user-friendly error messages.
3. **Performance**: Context extraction limited to 4000 tokens by default to prevent latency.
4. **Rate Limiting**: Client-side rate limiting prevents hitting API limits.
5. **Offline Support**: Cached completions available when API is unreachable.
