import { BracketMatcher } from '../../../../autocomplete/utils/bracketMatcher';

describe('BracketMatcher', () => {
  describe('getMatchingBracket', () => {
    it('should return matching bracket for opening brackets', () => {
      expect(BracketMatcher.getMatchingBracket('(')).toBe(')');
      expect(BracketMatcher.getMatchingBracket('[')).toBe(']');
      expect(BracketMatcher.getMatchingBracket('{')).toBe('}');
      expect(BracketMatcher.getMatchingBracket('<')).toBe('>');
      expect(BracketMatcher.getMatchingBracket('"')).toBe('"');
      expect(BracketMatcher.getMatchingBracket("'")).toBe("'");
      expect(BracketMatcher.getMatchingBracket('`')).toBe('`');
    });

    it('should return undefined for non-bracket characters', () => {
      expect(BracketMatcher.getMatchingBracket('a')).toBeUndefined();
      expect(BracketMatcher.getMatchingBracket('1')).toBeUndefined();
      expect(BracketMatcher.getMatchingBracket(' ')).toBeUndefined();
    });
  });

  describe('isOpenBracket', () => {
    it('should identify opening brackets correctly', () => {
      expect(BracketMatcher.isOpenBracket('(')).toBe(true);
      expect(BracketMatcher.isOpenBracket('[')).toBe(true);
      expect(BracketMatcher.isOpenBracket('{')).toBe(true);
      expect(BracketMatcher.isOpenBracket('<')).toBe(true);
      expect(BracketMatcher.isOpenBracket('"')).toBe(true);
      expect(BracketMatcher.isOpenBracket("'")).toBe(true);
      expect(BracketMatcher.isOpenBracket('`')).toBe(true);
    });

    it('should return false for non-opening brackets', () => {
      expect(BracketMatcher.isOpenBracket(')')).toBe(false);
      expect(BracketMatcher.isOpenBracket(']')).toBe(false);
      expect(BracketMatcher.isOpenBracket('}')).toBe(false);
      expect(BracketMatcher.isOpenBracket('a')).toBe(false);
    });
  });

  describe('isCloseBracket', () => {
    it('should identify closing brackets correctly', () => {
      expect(BracketMatcher.isCloseBracket(')')).toBe(true);
      expect(BracketMatcher.isCloseBracket(']')).toBe(true);
      expect(BracketMatcher.isCloseBracket('}')).toBe(true);
      expect(BracketMatcher.isCloseBracket('>')).toBe(true);
      expect(BracketMatcher.isCloseBracket('"')).toBe(true);
      expect(BracketMatcher.isCloseBracket("'")).toBe(true);
      expect(BracketMatcher.isCloseBracket('`')).toBe(true);
    });

    it('should return false for non-closing brackets', () => {
      expect(BracketMatcher.isCloseBracket('(')).toBe(false);
      expect(BracketMatcher.isCloseBracket('[')).toBe(false);
      expect(BracketMatcher.isCloseBracket('{')).toBe(false);
      expect(BracketMatcher.isCloseBracket('a')).toBe(false);
    });
  });

  // Note: shouldAutoClose, isGenericContext, and getSmartBracketCompletion require VSCode dependencies
  // These would need integration tests or proper VSCode mocking

  describe('countUnmatchedBrackets', () => {
    it('should count unmatched opening brackets', () => {
      const text = 'function test() { if (condition) { console.log("hello"); }';
      const counts = BracketMatcher.countUnmatchedBrackets(text);

      // Based on the algorithm: ) closing paren without matching open, } closing brace without match
      // { two unmatched opening braces, ( one unmatched opening paren, " two unmatched quotes
      expect(counts.get(')')).toBe(1); // One unmatched closing paren
      expect(counts.get('}')).toBe(1); // One unmatched closing brace
      expect(counts.get('{')).toBe(2); // Two unmatched opening braces
      expect(counts.get('(')).toBe(1); // One unmatched opening paren
      expect(counts.get('"')).toBe(2); // Two unmatched quotes
    });

    it('should count unmatched closing brackets', () => {
      const text = 'function test() } return value; }';
      const counts = BracketMatcher.countUnmatchedBrackets(text);

      expect(counts.get('}')).toBe(2); // Two unmatched closing braces
    });

    it('should handle perfectly matched brackets', () => {
      const text = 'function test() { return value; }'; // No quotes to avoid quote matching complexity
      const counts = BracketMatcher.countUnmatchedBrackets(text);

      // All brackets should be matched, so map should be empty
      expect(counts.size).toBe(0);
    });

    it('should handle complex bracket combinations', () => {
      const text = 'const arr = [1, 2, { key: "value" }, function() { return []; }';
      const counts = BracketMatcher.countUnmatchedBrackets(text);

      expect(counts.get('[')).toBe(1); // One unmatched opening bracket
    });

    it('should handle empty text', () => {
      const counts = BracketMatcher.countUnmatchedBrackets('');
      expect(counts.size).toBe(0);
    });

    it('should handle text with no brackets', () => {
      const counts = BracketMatcher.countUnmatchedBrackets('const x = 42;');
      expect(counts.size).toBe(0);
    });
  });
});
