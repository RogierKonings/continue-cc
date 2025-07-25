# How to Set Up and Use Claude Code Continue VSCode Extension

This guide will walk you through setting up the Claude Code Continue extension for Visual Studio Code, from development to installation and usage.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or later) and npm installed
- **Visual Studio Code** installed
- **Git** installed
- A **Claude Code Max** subscription (required for autocomplete functionality)

## Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd continue-cc
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Extension

For development:

```bash
npm run build:dev
```

For production:

```bash
npm run build:prod
```

## Running the Extension in Development

### Method 1: Using VSCode Debugger (Recommended)

1. Open the project in VSCode
2. Press `F5` or go to Run → Start Debugging
3. A new VSCode window (Extension Development Host) will open with the extension loaded
4. The extension will be active in this new window

### Method 2: Watch Mode

For continuous development with auto-reload:

```bash
npm run watch
```

This will recompile TypeScript files automatically when you make changes.

## Installing the Extension

### Option 1: Install from VSIX (Local Build)

1. Build the extension package:

   ```bash
   npm run package
   ```

   This creates a `.vsix` file in the project root

2. Install in VSCode:
   - Open VSCode
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Type "Install from VSIX"
   - Select the generated `.vsix` file

### Option 2: Install from Marketplace (When Published)

Once published to the VSCode Marketplace:

1. Open VSCode
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Search for "Claude Code Continue"
4. Click Install

## Initial Setup and Authentication

### 1. Sign In to Claude Code

After installation:

1. Look for the Claude Code icon in the status bar (bottom right)
2. Click on it and select "Sign In"
3. Your browser will open for authentication
4. Log in with your Claude Code Max account
5. The extension will automatically receive the authentication token

### 2. Verify Authentication

- The status bar should show "Claude Code: Connected"
- If authentication fails, check the Output panel (View → Output → Claude Code Continue)

## Using the Extension

### Autocomplete Features

The extension provides intelligent code completions:

1. **Automatic Suggestions**: Start typing in any supported file, and suggestions will appear automatically
2. **Manual Trigger**: Press `Ctrl+Space` to manually trigger completions
3. **Accept Suggestions**: Use `Tab` or `Enter` to accept a suggestion

### Supported Languages

The extension supports multiple programming languages including:

- TypeScript/JavaScript
- Python
- Java
- C/C++
- Go
- Rust
- And many more...

### Commands

Access commands via Command Palette (`Ctrl+Shift+P`):

- `Claude Code: Sign In` - Authenticate with Claude Code
- `Claude Code: Sign Out` - Sign out of your account
- `Claude Code: Show Settings` - Open extension settings
- `Claude Code: Toggle Autocomplete` - Enable/disable autocomplete
- `Claude Code: Clear Cache` - Clear completion cache

### Configuration

Access settings through:

1. File → Preferences → Settings
2. Search for "continue-cc"

Key settings include:

- **Enable/Disable Autocomplete**: `continue-cc.autocomplete.enabled`
- **Debounce Delay**: `continue-cc.autocomplete.debounceDelay`
- **Max Tokens**: `continue-cc.autocomplete.maxTokens`
- **Temperature**: `continue-cc.autocomplete.temperature`

## Troubleshooting

### Extension Not Working

1. **Check Authentication**:
   - Ensure you're signed in (check status bar)
   - Try signing out and back in

2. **Check Output Logs**:
   - View → Output → Select "Claude Code Continue"
   - Look for error messages

3. **Verify Subscription**:
   - Ensure you have an active Claude Code Max subscription

### Completions Not Appearing

1. **Check if autocomplete is enabled**:
   - Run command: `Claude Code: Toggle Autocomplete`

2. **Check language support**:
   - Ensure you're working in a supported file type

3. **Clear cache**:
   - Run command: `Claude Code: Clear Cache`

### Performance Issues

1. **Adjust debounce delay**:
   - Increase `continue-cc.autocomplete.debounceDelay` in settings

2. **Reduce context size**:
   - Lower `continue-cc.autocomplete.maxTokens` in settings

## Development Commands Reference

### Building

- `npm run compile` - Compile TypeScript
- `npm run watch` - Watch mode
- `npm run build:dev` - Development build
- `npm run build:prod` - Production build

### Testing

- `npm test` - Run all tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Debugging

- Press `F5` in VSCode to launch debugger
- Set breakpoints in TypeScript files
- Use Debug Console for runtime inspection

## Advanced Configuration

### Offline Mode

The extension includes offline caching:

- Completions are cached locally
- Works with limited connectivity
- Cache expires based on TTL settings

### Rate Limiting

Built-in rate limiting prevents API overuse:

- Automatic request throttling
- Circuit breaker for API failures
- Graceful degradation

## Contributing

To contribute to the extension:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## Support

For issues or questions:

- Check the [GitHub Issues](https://github.com/your-repo/issues)
- Review logs in Output panel
- Contact support through Claude Code website

## Privacy and Security

- Authentication tokens are stored securely in VSCode's SecretStorage
- No code is stored on servers beyond request processing
- All API communications use HTTPS
- Tokens are never logged or exposed

---

For more detailed technical documentation, see the `/docs` directory in the repository.
