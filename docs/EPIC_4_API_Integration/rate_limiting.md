# User Story: Rate Limiting Implementation

## Story Description
As a user with a Claude Code Max subscription, I want the extension to respect API rate limits and provide feedback about my usage so that I never exceed my quota unexpectedly.

## Action Items

### 1. Implement Client-Side Rate Tracking
- [ ] Create `RateLimitManager` class
- [ ] Track requests per minute/hour/day
- [ ] Implement sliding window algorithm
- [ ] Store counts in workspace state
- [ ] Add real-time usage calculation

### 2. Track Subscription Limits
- [ ] Parse rate limit headers from responses
- [ ] Store user's subscription tier limits
- [ ] Implement quota tracking for Max plan
- [ ] Track token usage per request
- [ ] Monitor approaching limit warnings

### 3. Implement Request Throttling
- [ ] Create request queue with priority
- [ ] Implement token bucket algorithm
- [ ] Add request spacing logic
- [ ] Create priority system for requests
- [ ] Handle burst allowances

### 4. Show Usage Warnings
- [ ] Display usage percentage in status bar
- [ ] Show warning at 80% usage
- [ ] Create detailed usage view
- [ ] Add daily/monthly usage graphs
- [ ] Implement usage reset notifications

### 5. Graceful Degradation
- [ ] Disable non-essential requests at 90%
- [ ] Implement completion caching increase
- [ ] Reduce context size automatically
- [ ] Queue low-priority requests
- [ ] Provide manual override options

## Acceptance Criteria
- [ ] Rate limits are never exceeded
- [ ] Users see usage before hitting limits
- [ ] Graceful degradation at high usage
- [ ] Usage resets handled correctly
- [ ] Priority requests still work near limits
- [ ] Clear feedback about rate limit status

## Test Cases

### Rate Tracking Tests
1. **Request Counting**: Accurate count per window
2. **Sliding Window**: Old requests expire correctly
3. **Persistence**: Counts survive restart
4. **Reset Timing**: Counters reset on schedule

### Limit Detection Tests
1. **Header Parsing**: Rate limit headers parsed
2. **Tier Detection**: Correct limits for Max plan
3. **Token Counting**: Accurate token usage
4. **Warning Threshold**: 80% warning triggers

### Throttling Tests
1. **Queue Order**: Priority requests first
2. **Spacing**: Minimum time between requests
3. **Burst Handling**: Allows configured burst
4. **Backpressure**: Queue fills appropriately

### Warning Display Tests
1. **Status Bar**: Shows current usage percentage
2. **Notifications**: Warning at thresholds
3. **Usage View**: Detailed breakdown available
4. **Reset Notice**: Shows when limits reset

### Degradation Tests
1. **Feature Disable**: Non-essential stops at 90%
2. **Cache Increase**: More aggressive caching
3. **Context Reduction**: Smaller contexts sent
4. **Manual Override**: User can force request

## Edge Cases
- Clock skew affecting reset times
- API limit changes mid-session
- Offline mode quota tracking
- Multiple VSCode instances
- Subscription tier changes
- Rate limit header missing
- Daylight saving time changes

## Technical Notes
- Use X-RateLimit-* headers
- Implement with Map for O(1) lookups
- Store in globalState for persistence
- Use setInterval for reset timers
- Consider Redis-like data structures

## Dependencies
- Depends on: API Client Implementation
- Blocks: Reliable service under load

## Rate Limit Structure
```typescript
interface RateLimits {
  requests: {
    perMinute: number,
    perHour: number,
    perDay: number
  },
  tokens: {
    perDay: number,
    perMonth: number
  }
}
```

## Max Subscription Limits (Example)
- 100 requests per minute
- 2000 requests per hour  
- 10000 requests per day
- 1M tokens per day
- 20M tokens per month

## Estimated Effort
- 8-10 hours for basic rate limiting
- 12-14 hours including UI and degradation