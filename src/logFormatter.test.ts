import { isJSONLog, parseJSONLog } from './logFormatter';

describe('logFormatter', () => {
  describe('isJSONLog', () => {
    it('should detect valid JSON logs', () => {
      expect(isJSONLog('{"time":"2024-01-01","level":"info","msg":"hello"}')).toBe(true);
    });

    it('should detect valid logfmt logs', () => {
      expect(isJSONLog('time=2024-01-01 level=info msg=hello')).toBe(true);
    });

    it('should reject non-structured logs', () => {
      expect(isJSONLog('just a plain log message')).toBe(false);
    });
  });

  describe('parseJSONLog - JSON format', () => {
    it('should parse basic JSON log', () => {
      const result = parseJSONLog('{"time":"2024-01-01","level":"info","msg":"hello"}');
      expect(result).not.toBeNull();
      expect(result?.message).toBe('hello');
      expect(result?.level).toBe('INFO');
    });

    it('should parse JSON with escaped quotes in message', () => {
      const input = '{"time":"2024-01-01","level":"info","msg":"Hello \\"World\\""}';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Hello "World"');
    });

    it('should parse JSON with escaped quotes in other fields', () => {
      const input = '{"time":"2024-01-01","level":"info","msg":"test","user":"John \\"Doe\\""}';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.otherFields.user).toBe('John "Doe"');
    });

    it('should parse JSON with multiple escaped quotes', () => {
      const input = '{"time":"2024-01-01","level":"info","msg":"Say \\"Hello\\" and \\"Goodbye\\""}';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Say "Hello" and "Goodbye"');
    });
  });

  describe('parseJSONLog - logfmt format', () => {
    it('should parse basic logfmt log', () => {
      const result = parseJSONLog('time=2024-01-01 level=info msg=hello');
      expect(result).not.toBeNull();
      expect(result?.message).toBe('hello');
      expect(result?.level).toBe('INFO');
    });

    it('should parse logfmt with quoted string', () => {
      const result = parseJSONLog('time=2024-01-01 level=info msg="hello world"');
      expect(result).not.toBeNull();
      expect(result?.message).toBe('hello world');
    });

    it('should parse logfmt with escaped quotes in message', () => {
      const input = 'time=2024-01-01 level=info msg="Hello \\"World\\""';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Hello "World"');
    });

    it('should parse logfmt with multiple fields containing escaped quotes', () => {
      const input = 'time=2024-01-01 level=info msg="Say \\"Hi\\"" user="John \\"Doe\\""';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Say "Hi"');
      expect(result?.otherFields.user).toBe('John "Doe"');
    });

    it('should parse logfmt with escaped backslash', () => {
      const input = 'time=2024-01-01 level=info msg=test path="C:\\\\Users\\\\test"';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.otherFields.path).toBe('C:\\Users\\test');
    });

    it('should handle logfmt with complex escaped content', () => {
      const input = 'time=2024-01-01 level=info msg="Error: \\"file not found\\" at line 42"';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Error: "file not found" at line 42');
    });
  });
});
