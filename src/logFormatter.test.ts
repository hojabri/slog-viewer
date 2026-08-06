import { isJSONLog, parseJSONLog, FieldAliases } from './logFormatter';

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

  describe('parseJSONLog - ECS format', () => {
    it('should parse ECS log with log.level field', () => {
      const input = '{"@timestamp":"2024-01-01T12:00:00.000Z","log.level":"DEBUG","message":"Processing request"}';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.level).toBe('DEBUG');
      expect(result?.message).toBe('Processing request');
      expect(result?.timestamp).toBe('2024-01-01T12:00:00.000Z');
    });

    it('should exclude log.level from otherFields', () => {
      const input = '{"@timestamp":"2024-01-01T12:00:00.000Z","log.level":"INFO","message":"test"}';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.otherFields['log.level']).toBeUndefined();
    });

    it('should parse ECS log with all common ECS fields', () => {
      const input = JSON.stringify({
        "@timestamp": "2024-01-01T12:00:00.000Z",
        "log.level": "DEBUG",
        "message": "Stopping beans in phase 2147483647",
        "process.pid": 23633,
        "process.thread.name": "SpringApplicationShutdownHook",
        "log.logger": "org.springframework.context.support.DefaultLifecycleProcessor",
        "ecs.version": "8.11"
      });
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2024-01-01T12:00:00.000Z');
      expect(result?.level).toBe('DEBUG');
      expect(result?.message).toBe('Stopping beans in phase 2147483647');
      expect(result?.otherFields['process.pid']).toBe(23633);
      expect(result?.otherFields['process.thread.name']).toBe('SpringApplicationShutdownHook');
      expect(result?.otherFields['log.logger']).toBe('org.springframework.context.support.DefaultLifecycleProcessor');
      expect(result?.otherFields['ecs.version']).toBe('8.11');
    });

    it('should parse ECS log without message field', () => {
      const input = JSON.stringify({
        "log.level": "DEBUG",
        "process.pid": 23633,
        "process.thread.name": "SpringApplicationShutdownHook",
        "log.logger": "org.springframework.context.support.DefaultLifecycleProcessor",
        "ecs.version": "8.11"
      });
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.level).toBe('DEBUG');
      expect(result?.message).toBeUndefined();
    });

    it('should detect ECS JSON log with isJSONLog', () => {
      const input = '{"log.level":"DEBUG","message":"test","@timestamp":"2024-01-01T12:00:00.000Z"}';
      expect(isJSONLog(input)).toBe(true);
    });

    it('should prefer standard level field over log.level', () => {
      const input = '{"level":"ERROR","log.level":"DEBUG","message":"test"}';
      const result = parseJSONLog(input);
      expect(result).not.toBeNull();
      expect(result?.level).toBe('ERROR');
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

  describe('field aliases', () => {
    const pythonAliases: FieldAliases = {
      time: ['asctime'],
      level: ['levelname'],
      message: ['desc'],
    };

    it('should extract aliased JSON fields into timestamp/level/message', () => {
      const input = '{"asctime":"2026-04-17 12:10:02","levelname":"INFO","desc":"title 1"}';
      const result = parseJSONLog(input, pythonAliases);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2026-04-17 12:10:02');
      expect(result?.level).toBe('INFO');
      expect(result?.message).toBe('title 1');
    });

    it('should keep aliased fields out of otherFields', () => {
      const input = '{"asctime":"2026-04-17 12:10:02","levelname":"INFO","desc":"title 1"}';
      const result = parseJSONLog(input, pythonAliases);
      expect(result?.otherFields.asctime).toBeUndefined();
      expect(result?.otherFields.levelname).toBeUndefined();
      expect(result?.otherFields.desc).toBeUndefined();
    });

    it('should leave aliased JSON fields in otherFields when no aliases supplied', () => {
      const input = '{"asctime":"2026-04-17 12:10:02","levelname":"INFO","desc":"title 1"}';
      const result = parseJSONLog(input);
      expect(result?.timestamp).toBeUndefined();
      expect(result?.level).toBeUndefined();
      expect(result?.message).toBeUndefined();
      expect(result?.otherFields.asctime).toBe('2026-04-17 12:10:02');
      expect(result?.otherFields.desc).toBe('title 1');
    });

    it('should prefer a built-in field over an alias', () => {
      const input = '{"time":"t1","asctime":"t2","levelname":"INFO","desc":"hello"}';
      const result = parseJSONLog(input, pythonAliases);
      expect(result?.timestamp).toBe('t1');
    });

    it('should match field names case-insensitively', () => {
      const input = '{"AscTime":"2026-04-17","LevelName":"warn","Desc":"hi"}';
      const result = parseJSONLog(input, pythonAliases);
      expect(result?.timestamp).toBe('2026-04-17');
      expect(result?.level).toBe('WARN');
      expect(result?.message).toBe('hi');
      expect(result?.otherFields.AscTime).toBeUndefined();
    });

    it('should detect aliased logfmt logs only when aliases are supplied', () => {
      const line = 'asctime=2026-04-17 levelname=info desc=hello';
      expect(isJSONLog(line)).toBe(false);
      expect(isJSONLog(line, pythonAliases)).toBe(true);
    });

    it('should parse aliased logfmt logs', () => {
      const result = parseJSONLog('asctime=2026-04-17 levelname=info desc="a message"', pythonAliases);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2026-04-17');
      expect(result?.level).toBe('INFO');
      expect(result?.message).toBe('a message');
    });

    it('should not affect detection of standard logs when aliases are supplied', () => {
      expect(isJSONLog('time=2024-01-01 level=info msg=hello', pythonAliases)).toBe(true);
    });
  });
});
