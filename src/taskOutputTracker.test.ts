import { resolveVariables, processChunk, normalizeLineEndings } from './taskOutputTracker';

// Mock vscode module
jest.mock('vscode');

describe('taskOutputTracker', () => {
  describe('processChunk', () => {
    it('should process complete lines and buffer incomplete ones', () => {
      const lines: string[] = [];
      const remaining = processChunk('line1\nline2\npartial', '', (line) => lines.push(line));

      expect(lines).toEqual(['line1', 'line2']);
      expect(remaining).toBe('partial');
    });

    it('should handle empty buffer with complete lines', () => {
      const lines: string[] = [];
      const remaining = processChunk('hello\nworld\n', '', (line) => lines.push(line));

      expect(lines).toEqual(['hello', 'world']);
      expect(remaining).toBe('');
    });

    it('should combine buffered data with new chunk', () => {
      const lines: string[] = [];
      const remaining = processChunk('orld\nnext\n', 'hello w', (line) => lines.push(line));

      expect(lines).toEqual(['hello world', 'next']);
      expect(remaining).toBe('');
    });

    it('should handle single line without newline', () => {
      const lines: string[] = [];
      const remaining = processChunk('partial', '', (line) => lines.push(line));

      expect(lines).toEqual([]);
      expect(remaining).toBe('partial');
    });

    it('should skip empty lines', () => {
      const lines: string[] = [];
      const remaining = processChunk('line1\n\n\nline2\n', '', (line) => lines.push(line));

      expect(lines).toEqual(['line1', 'line2']);
      expect(remaining).toBe('');
    });

    it('should strip trailing carriage return from Windows line endings', () => {
      const lines: string[] = [];
      const remaining = processChunk('line1\r\nline2\r\n', '', (line) => lines.push(line));

      expect(lines).toEqual(['line1', 'line2']);
      expect(remaining).toBe('');
    });

    it('should handle multiple chunks building up a line', () => {
      const lines: string[] = [];
      let buffer = '';

      buffer = processChunk('hel', buffer, (line) => lines.push(line));
      expect(lines).toEqual([]);
      expect(buffer).toBe('hel');

      buffer = processChunk('lo wo', buffer, (line) => lines.push(line));
      expect(lines).toEqual([]);
      expect(buffer).toBe('hello wo');

      buffer = processChunk('rld\n', buffer, (line) => lines.push(line));
      expect(lines).toEqual(['hello world']);
      expect(buffer).toBe('');
    });
  });

  describe('normalizeLineEndings', () => {
    it('should convert LF to CRLF', () => {
      expect(normalizeLineEndings('line1\nline2\n')).toBe('line1\r\nline2\r\n');
    });

    it('should keep existing CRLF as CRLF (not double)', () => {
      expect(normalizeLineEndings('line1\r\nline2\r\n')).toBe('line1\r\nline2\r\n');
    });

    it('should convert bare CR to CRLF', () => {
      expect(normalizeLineEndings('line1\rline2\r')).toBe('line1\r\nline2\r\n');
    });

    it('should handle mixed line endings', () => {
      expect(normalizeLineEndings('a\nb\r\nc\rd')).toBe('a\r\nb\r\nc\r\nd');
    });

    it('should handle empty string', () => {
      expect(normalizeLineEndings('')).toBe('');
    });

    it('should handle string with no line endings', () => {
      expect(normalizeLineEndings('no newlines here')).toBe('no newlines here');
    });
  });

  describe('resolveVariables', () => {
    it('should resolve ${workspaceFolder}', () => {
      const folder = {
        uri: { fsPath: '/home/user/project' },
        name: 'project',
        index: 0
      } as any;

      expect(resolveVariables('${workspaceFolder}/src/app.js', folder)).toBe('/home/user/project/src/app.js');
    });

    it('should resolve ${workspaceRoot} (legacy alias)', () => {
      const folder = {
        uri: { fsPath: '/home/user/project' },
        name: 'project',
        index: 0
      } as any;

      expect(resolveVariables('${workspaceRoot}/src', folder)).toBe('/home/user/project/src');
    });

    it('should resolve ${env:VAR_NAME}', () => {
      const original = process.env.TEST_SLOG_VAR;
      process.env.TEST_SLOG_VAR = 'hello123';

      expect(resolveVariables('prefix-${env:TEST_SLOG_VAR}-suffix')).toBe('prefix-hello123-suffix');

      if (original === undefined) {
        delete process.env.TEST_SLOG_VAR;
      } else {
        process.env.TEST_SLOG_VAR = original;
      }
    });

    it('should resolve missing env var to empty string', () => {
      delete process.env.__NONEXISTENT_SLOG_TEST_VAR__;
      expect(resolveVariables('${env:__NONEXISTENT_SLOG_TEST_VAR__}')).toBe('');
    });

    it('should resolve multiple variables in one string', () => {
      const folder = {
        uri: { fsPath: '/workspace' },
        name: 'ws',
        index: 0
      } as any;

      process.env.TEST_SLOG_PORT = '3000';
      const result = resolveVariables('${workspaceFolder}/run --port ${env:TEST_SLOG_PORT}', folder);
      expect(result).toBe('/workspace/run --port 3000');
      delete process.env.TEST_SLOG_PORT;
    });

    it('should return string unchanged when no variables present', () => {
      expect(resolveVariables('node server.js')).toBe('node server.js');
    });

    it('should handle no folder gracefully for workspaceFolder', () => {
      expect(resolveVariables('${workspaceFolder}/src')).toBe('${workspaceFolder}/src');
    });
  });

  describe('SlogViewerTaskProvider.resolveTask', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SlogViewerTaskProvider } = require('./taskOutputTracker');

    it('should return undefined for missing command', () => {
      const mockWebview = {} as any;
      const provider = new SlogViewerTaskProvider(mockWebview);

      const task = {
        definition: { type: 'slogViewer' },
        name: 'test',
        scope: undefined,
        source: 'slogViewer'
      } as any;

      const result = provider.resolveTask(task);
      expect(result).toBeUndefined();
    });

    it('should return undefined for wrong task type', () => {
      const mockWebview = {} as any;
      const provider = new SlogViewerTaskProvider(mockWebview);

      const task = {
        definition: { type: 'shell', command: 'echo hello' },
        name: 'test',
        scope: undefined,
        source: 'shell'
      } as any;

      const result = provider.resolveTask(task);
      expect(result).toBeUndefined();
    });

    it('should return a Task for valid definition', () => {
      const mockWebview = {
        addTaskSession: jest.fn(),
        show: jest.fn(),
        addLog: jest.fn(),
        endSession: jest.fn()
      } as any;
      const provider = new SlogViewerTaskProvider(mockWebview);

      const task = {
        definition: { type: 'slogViewer', command: 'node app.js' },
        name: 'Run App',
        scope: undefined,
        source: 'slogViewer'
      } as any;

      const result = provider.resolveTask(task);
      expect(result).toBeDefined();
      expect(result.name).toBe('Run App');
    });

    it('should provide empty array from provideTasks', () => {
      const mockWebview = {} as any;
      const provider = new SlogViewerTaskProvider(mockWebview);
      expect(provider.provideTasks()).toEqual([]);
    });
  });
});
