# User Story: Authentication UI

## Story Description
As a user, I want clear visual feedback about my authentication status and easy ways to login/logout so that I can manage my connection to Claude Code effectively.

## Action Items

### 1. Create Login Command and Flow
- [x] Register "Claude Code: Sign In" command in package.json
- [x] Create login flow coordinator class
- [x] Implement progress notification during auth
- [x] Show success message with user info after login
- [x] Add "Sign In" button to welcome views

### 2. Implement Status Bar Integration
- [x] Create status bar item showing auth status
- [x] Show username when authenticated
- [x] Display warning icon when token expires soon
- [x] Add click handler to show auth menu
- [x] Implement tooltip with session details

### 3. Build Authentication Webview
- [x] Create webview for manual token entry
- [x] Design responsive authentication UI
- [x] Implement form validation for credentials
- [x] Add loading states during authentication
- [x] Create error display for failed attempts

### 4. Handle Authentication Errors
- [x] Create error notification system
- [x] Implement user-friendly error messages
- [x] Add "Try Again" actions to error notifications
- [x] Create detailed error logs for debugging
- [x] Implement error recovery suggestions

### 5. Implement Deep Link Handling
- [x] Register VSCode URI handler for OAuth callback
- [x] Create deep link parser for auth codes
- [x] Handle app focus on deep link activation
- [x] Implement security validation for deep links
- [x] Add fallback for when deep links fail

## Acceptance Criteria
- [x] Login command appears in command palette
- [x] Status bar shows current auth state
- [x] Authentication errors show clear messages
- [x] Deep links work on all platforms
- [x] UI is responsive and accessible
- [x] All auth states have visual representation

## Test Cases

### Command Tests
1. **Login Command**: Executes and starts auth flow
2. **Logout Command**: Available when authenticated
3. **Command Availability**: Commands enable/disable correctly
4. **Progress Display**: Shows during authentication

### Status Bar Tests
1. **Unauthenticated**: Shows "Sign In" with icon
2. **Authenticated**: Shows username or email
3. **Expiring Soon**: Shows warning indicator
4. **Click Action**: Opens authentication menu

### Webview Tests
1. **Manual Entry**: Form accepts valid tokens
2. **Validation**: Shows errors for invalid input
3. **Submit Action**: Processes authentication
4. **Responsive**: Works on different window sizes

### Error Handling Tests
1. **Network Error**: Shows "Check connection" message
2. **Auth Failure**: Shows specific error reason
3. **Timeout**: Shows timeout message with retry
4. **Recovery**: Suggested actions work correctly

### Deep Link Tests
1. **Valid Link**: Processes auth code correctly
2. **Invalid Link**: Shows appropriate error
3. **Focus**: Brings VSCode to foreground
4. **Security**: Rejects tampered links

## Edge Cases
- VSCode running in browser (vscode.dev)
- Multiple VSCode windows handling deep links
- Authentication during extension update
- Rate-limited authentication attempts
- Accessibility with screen readers
- High contrast theme compatibility

## Technical Notes
- Use vscode.window.showInformationMessage for notifications
- Implement vscode.window.withProgress for long operations
- Status bar priority should be high (100+)
- Use vscode.env.openExternal for browser launch
- Webview should use vscode-webview-ui-toolkit

## Dependencies
- Depends on: OAuth Implementation, Session Management
- Blocks: User-friendly authentication experience

## UI/UX Guidelines
- Follow VSCode's UI guidelines
- Use consistent iconography
- Provide keyboard shortcuts
- Support light and dark themes
- Ensure color contrast compliance
- Add hover states for interactive elements

## Estimated Effort
- 6-8 hours for basic UI implementation
- 10-12 hours including polished UX and edge cases