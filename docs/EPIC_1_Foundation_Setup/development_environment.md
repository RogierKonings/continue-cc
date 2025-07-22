# User Story: Development Environment Setup

## Story Description
As a developer, I want a properly configured development environment with hot reload, debugging, and development documentation so that I can efficiently develop and debug the extension.

## Action Items

### 1. Create Development Launch Configuration
- [ ] Create `.vscode/launch.json` with extension debugging configuration
- [ ] Add configuration for running extension tests
- [ ] Configure source map resolution for TypeScript debugging
- [ ] Set up environment variables for development mode
- [ ] Add launch configuration for webview debugging

### 2. Implement Hot Reload System
- [ ] Install and configure webpack-dev-server for webview hot reload
- [ ] Set up file watchers for extension source code
- [ ] Implement automatic extension reload on code changes
- [ ] Configure VSCode tasks for continuous compilation
- [ ] Create development server for mock API responses

### 3. Configure Debugging Setup
- [ ] Set up breakpoint support in TypeScript files
- [ ] Configure console output redirection
- [ ] Enable Chrome DevTools for webview debugging
- [ ] Set up remote debugging port for webviews
- [ ] Create debug output channel for extension logs

### 4. Create Development Scripts
- [ ] Create `scripts/dev.js` for unified development startup
- [ ] Implement automatic dependency installation check
- [ ] Add environment validation script
- [ ] Create script for generating test data
- [ ] Implement mock Claude Code API server for offline development

### 5. Write Development Documentation
- [ ] Create `docs/development.md` with setup instructions
- [ ] Document debugging procedures and common issues
- [ ] Add architecture diagrams using Mermaid
- [ ] Create troubleshooting guide for common problems
- [ ] Document development workflow and best practices

## Acceptance Criteria
- [ ] F5 launches extension with working breakpoints
- [ ] Code changes reflect without manual restart (hot reload)
- [ ] Webview updates instantly on source changes
- [ ] All debug configurations work correctly
- [ ] Development documentation is clear and complete
- [ ] Mock API server provides realistic responses

## Test Cases

### Launch Configuration Tests
1. **Extension Debug**: F5 should launch Extension Development Host
2. **Test Debug**: Launch test configuration should run tests with debugging
3. **Attach Debug**: Should be able to attach to running extension

### Hot Reload Tests
1. **Extension Code**: Change in .ts file triggers automatic reload
2. **Webview Code**: Change in webview source updates without restart
3. **Configuration**: Change in package.json triggers full reload

### Debugging Tests
1. **Breakpoints**: Set breakpoint in activation function - should hit on F5
2. **Console Logs**: console.log should appear in Debug Console
3. **Webview Debug**: Right-click → Inspect should open DevTools

### Development Scripts Tests
1. **Dev Script**: `npm run dev` starts all watchers and servers
2. **Mock API**: Mock server responds to authentication requests
3. **Environment Check**: Script detects missing dependencies

## Edge Cases
- Handle port conflicts for development servers
- Support debugging on remote development environments
- Handle multiple VSCode windows during debugging
- Gracefully handle mock server crashes
- Support WSL and Docker development environments

## Technical Notes
- Use `--inspect-brk` for Node.js debugging
- Configure `resolveSourceMapLocations` for proper source map resolution
- Use `preLaunchTask` for automatic compilation
- Consider using `nodemon` for extension host auto-restart

## Dependencies
- Depends on: Project Initialization story
- Blocks: Efficient development of all features

## Estimated Effort
- 3-4 hours for basic setup
- 6-8 hours including documentation and mock server