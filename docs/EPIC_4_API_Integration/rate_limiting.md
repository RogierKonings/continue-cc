# User Story: Rate Limiting Implementation

## Story Description

As a user with a Claude Code Max subscription, I want the extension to respect API rate limits and provide feedback about my usage so that I never exceed my quota unexpectedly.

## Action Items

### 1. Implement Client-Side Rate Tracking

- [x] Create `RateLimitManager` class
- [x] Track requests per minute/hour/day
- [x] Implement sliding window algorithm
- [x] Store counts in workspace state
- [x] Add real-time usage calculation

### 2. Track Subscription Limits

- [x] Parse rate limit headers from responses
- [x] Store user's subscription tier limits
- [x] Implement quota tracking for Max plan
- [x] Track token usage per request
- [x] Monitor approaching limit warnings

### 3. Implement Request Throttling

- [x] Create request queue with priority
- [x] Implement token bucket algorithm
- [x] Add request spacing logic
- [x] Create priority system for requests
- [x] Handle burst allowances

### 4. Show Usage Warnings

- [x] Display usage percentage in status bar
- [x] Show warning at 80% usage
- [x] Create detailed usage view
- [x] Add daily/monthly usage graphs
- [x] Implement usage reset notifications

### 5. Graceful Degradation

- [x] Disable non-essential requests at 90%
- [x] Implement completion caching increase
- [x] Reduce context size automatically
- [x] Queue low-priority requests
- [x] Provide manual override options

## Acceptance Criteria

- [x] Rate limits are never exceeded
- [x] Users see usage before hitting limits
- [x] Graceful degradation at high usage
- [x] Usage resets handled correctly
- [x] Priority requests still work near limits
- [x] Clear feedback about rate limit status

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

- Use X-RateLimit-\* headers
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
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  tokens: {
    perDay: number;
    perMonth: number;
  };
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
