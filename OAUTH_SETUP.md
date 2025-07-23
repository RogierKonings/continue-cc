# OAuth Authentication Setup

This document describes the OAuth 2.0 implementation for Claude Code Continue extension.

## Features Implemented

### 1. OAuth 2.0 Authorization Code Flow with PKCE

- Secure authorization code flow with Proof Key for Code Exchange (PKCE)
- State parameter for CSRF protection
- Secure random generation for state and code verifier

### 2. Token Management

- Secure token storage using VSCode SecretStorage API
- Automatic token refresh before expiration
- Token validation on each authentication check
- Token revocation on logout

### 3. Error Handling

- Network error handling with retry logic
- User-friendly error messages
- Timeout handling for authentication flow
- Proper error categorization (client vs server errors)

### 4. Browser Integration

- External browser launch for OAuth flow
- Local callback server for handling redirects
- Progress notifications during authentication
- Manual token entry fallback option

## Configuration

### OAuth Client Configuration

The OAuth configuration is set in the extension settings:

```json
{
  "claude-code.clientId": "your-client-id"
}
```

### OAuth Endpoints

- Authorization URL: `https://auth.anthropic.com/oauth/authorize`
- Token URL: `https://auth.anthropic.com/oauth/token`
- User Info URL: `https://api.anthropic.com/v1/me`
- Redirect URI: `http://127.0.0.1:54321/callback`

## Security Features

1. **PKCE Implementation**
   - Code verifier: 43-128 character random string
   - Code challenge: SHA256 hash of verifier (base64url encoded)
   - Prevents authorization code interception attacks

2. **State Parameter**
   - Random 32-byte value for CSRF protection
   - Validated on callback to ensure request integrity

3. **Token Storage**
   - Access tokens stored in VSCode SecretStorage
   - Refresh tokens stored separately
   - Token expiry tracked in global state

4. **Auto-refresh**
   - Tokens refreshed 5 minutes before expiration
   - Failed refresh triggers re-authentication prompt
   - Background refresh with user notification

## Usage

### Sign In

1. Run command: `Claude Code: Sign In`
2. Choose authentication method:
   - Browser Authentication (recommended)
   - Manual Token Entry
3. Complete OAuth flow in browser
4. Return to VSCode when prompted

### Sign Out

1. Run command: `Claude Code: Sign Out`
2. Confirm logout
3. Token revocation request sent to server
4. Local tokens cleared

### Session Management

- Check authentication status in status bar
- Refresh session from auth menu
- View session details and expiry time

## Error Scenarios

1. **Network Errors**
   - Automatic retry with exponential backoff
   - Clear error messages for offline state
   - 30-second timeout for token exchange

2. **Authentication Errors**
   - Invalid client: Contact support message
   - Access denied: Permission grant prompt
   - Invalid scope: Retry with correct permissions

3. **Token Refresh Failures**
   - Automatic fallback to re-authentication
   - User notification with sign-in prompt
   - No silent failures

## Development Notes

### File Structure

```
src/auth/
├── authenticationService.ts    # Base authentication interface
├── claudeAuthService.ts        # Claude-specific implementation
├── oauthService.ts            # OAuth 2.0 flow implementation
├── tokenManager.ts            # Token validation and refresh
├── authenticationError.ts     # Custom error class
└── authFlowCoordinator.ts     # UI flow coordination
```

### Testing Considerations

- Mock OAuth server for development
- Test token expiry scenarios
- Verify PKCE implementation
- Test network error handling

## Future Enhancements

1. **Token Encryption** (pending)
   - Additional encryption layer for stored tokens
   - Key derivation from system entropy

2. **Deep Linking** (pending)
   - VSCode URI handler for direct callbacks
   - Eliminates need for local server

3. **Device Flow** (consideration)
   - Support for headless environments
   - Better remote/SSH support

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   - Default port 54321 might be occupied
   - Extension will show clear error message
   - Retry after closing conflicting application

2. **Browser Not Opening**
   - Manual token entry available as fallback
   - Check default browser settings
   - Firewall might block OAuth redirects

3. **Token Refresh Fails**
   - Check network connectivity
   - Verify refresh token hasn't expired
   - Re-authenticate if persistent failures

### Debug Information

- Check VSCode Developer Console for detailed logs
- OAuth state stored in global state
- Token expiry visible in auth menu
