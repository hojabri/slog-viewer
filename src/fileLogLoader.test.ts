import { EventEmitter } from 'events';

// Mock vscode module
jest.mock('vscode');

// Mock fs module
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    createReadStream: jest.fn(),
    realpathSync: jest.fn((p: string) => p),
    watch: jest.fn(),
    statSync: jest.fn(),
    promises: {
      stat: jest.fn()
    }
  };
});

import * as fs from 'fs';
import { FileLogLoader } from './fileLogLoader';

// Helper: create a mock readable stream that emits data synchronously
// once all event listeners are attached (via a microtask).
function createMockReadStream(data: string): EventEmitter {
  const stream = new EventEmitter();
  (stream as any).destroy = jest.fn();
  const origOn = stream.on.bind(stream);
  let endScheduled = false;
  stream.on = function(event: string, listener: (...args: any[]) => void) {
    origOn(event, listener);
    if (event === 'end' && !endScheduled) {
      endScheduled = true;
      // Use a microtask so the promise chain in readFile can resolve
      Promise.resolve().then(() => {
        stream.emit('data', data);
        stream.emit('end');
      });
    }
    return stream;
  } as any;
  return stream;
}

// Helper: create a mock watcher
function createMockWatcher(): EventEmitter {
  const watcher = new EventEmitter();
  (watcher as any).close = jest.fn();
  return watcher;
}

function createMockWebviewProvider() {
  return {
    addTaskSession: jest.fn(),
    addLog: jest.fn(),
    endSession: jest.fn(),
    show: jest.fn(),
    setCurrentSession: jest.fn(),
    isSessionActive: jest.fn().mockReturnValue(false),
    clearSessionLogs: jest.fn(),
    clearLogs: jest.fn()
  } as any;
}

// Helper to set up a watched file session by directly populating internal state.
// This avoids async mock stream timing issues between tests.
function setupWatchedSession(
  loaderInst: FileLogLoader,
  sessionId: string,
  filePath: string,
  options?: { withErrorHandler?: boolean; byteOffset?: number }
): EventEmitter {
  const mockWatcher = createMockWatcher();
  const activeWatchers = (loaderInst as any).activeWatchers as Map<string, any>;
  const fileSessionMap = (loaderInst as any).fileSessionMap as Map<string, string>;

  if (options?.withErrorHandler) {
    const vscode = require('vscode');
    mockWatcher.on('error', (err: Error) => {
      vscode.window.showErrorMessage(`File watcher error: ${err.message}`);
      loaderInst.stopWatching(sessionId);
    });
  }

  activeWatchers.set(sessionId, {
    watcher: mockWatcher,
    byteOffset: options?.byteOffset ?? 0,
    lineBuffer: '',
    filePath
  });
  fileSessionMap.set(filePath, sessionId);

  return mockWatcher;
}

// Need to mock vscode.window.showOpenDialog and showErrorMessage
const vscode = require('vscode');
vscode.window = {
  ...vscode.window,
  showOpenDialog: jest.fn(),
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn()
};

describe('FileLogLoader', () => {
  let loader: FileLogLoader;
  let mockProvider: ReturnType<typeof createMockWebviewProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = createMockWebviewProvider();
    loader = new FileLogLoader(mockProvider);
  });

  afterEach(async () => {
    loader.dispose();
    // Allow any pending async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('openFile', () => {
    it('should show file dialog when no URI provided', async () => {
      vscode.window.showOpenDialog.mockResolvedValue(undefined);
      await loader.openFile();
      expect(vscode.window.showOpenDialog).toHaveBeenCalled();
    });

    it('should return early when dialog is cancelled', async () => {
      vscode.window.showOpenDialog.mockResolvedValue(undefined);
      await loader.openFile();
      expect(mockProvider.addTaskSession).not.toHaveBeenCalled();
    });

    it('should return early when dialog returns empty array', async () => {
      vscode.window.showOpenDialog.mockResolvedValue([]);
      await loader.openFile();
      expect(mockProvider.addTaskSession).not.toHaveBeenCalled();
    });

    it('should parse JSON log file correctly', async () => {
      const logData = '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"hello","port":8080}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri);

      expect(mockProvider.addTaskSession).toHaveBeenCalledWith(
        expect.stringMatching(/^file-/),
        'File: test.log'
      );
      expect(mockProvider.addLog).toHaveBeenCalledTimes(1);
      expect(mockProvider.addLog).toHaveBeenCalledWith(
        expect.stringMatching(/^file-/),
        expect.objectContaining({
          level: 'INFO',
          message: 'hello'
        })
      );
      expect(mockProvider.endSession).toHaveBeenCalled();
    });

    it('should parse logfmt log file correctly', async () => {
      const logData = 'time=2025-01-01T00:00:00Z level=info msg="server started" port=8080\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri);

      expect(mockProvider.addLog).toHaveBeenCalledTimes(1);
      expect(mockProvider.addLog).toHaveBeenCalledWith(
        expect.stringMatching(/^file-/),
        expect.objectContaining({
          level: 'INFO',
          message: 'server started'
        })
      );
    });

    it('should skip non-structured lines', async () => {
      const logData = [
        'Starting server...',
        '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"ready"}',
        'Some plain text',
        '{"time":"2025-01-01T00:00:01Z","level":"error","msg":"failed"}',
        ''
      ].join('\n');
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));

      const uri = { fsPath: '/tmp/mixed.log' } as any;
      await loader.openFile(uri);

      expect(mockProvider.addLog).toHaveBeenCalledTimes(2);
    });

    it('should flush incomplete last line on EOF', async () => {
      // No trailing newline
      const logData = '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"no newline"}';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri);

      expect(mockProvider.addLog).toHaveBeenCalledTimes(1);
      expect(mockProvider.addLog).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'no newline' })
      );
    });

    it('should show info message for empty file', async () => {
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(''));

      const uri = { fsPath: '/tmp/empty.log' } as any;
      await loader.openFile(uri);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No structured logs found in file.');
      expect(mockProvider.endSession).toHaveBeenCalled();
    });

    it('should show info message for file with no structured logs', async () => {
      const logData = 'just plain text\nno json here\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));

      const uri = { fsPath: '/tmp/plain.log' } as any;
      await loader.openFile(uri);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No structured logs found in file.');
    });

    it('should handle file read error', async () => {
      const stream = new EventEmitter();
      (stream as any).destroy = jest.fn();
      (fs.createReadStream as jest.Mock).mockReturnValue(stream);
      process.nextTick(() => stream.emit('error', new Error('ENOENT')));

      const uri = { fsPath: '/tmp/missing.log' } as any;
      await loader.openFile(uri);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
      expect(mockProvider.endSession).toHaveBeenCalled();
    });

    it('should switch to existing active session for duplicate watched file', async () => {
      // First open with watch (keeps fileSessionMap entry)
      const logData = '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"test"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));
      (fs.watch as jest.Mock).mockReturnValue(createMockWatcher());

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri, { watch: true });

      // Mark session as active for second open
      mockProvider.isSessionActive.mockReturnValue(true);

      // Second open of same file
      await loader.openFile(uri);

      // Should not create a second session
      expect(mockProvider.addTaskSession).toHaveBeenCalledTimes(1);
      expect(mockProvider.setCurrentSession).toHaveBeenCalled();
    });

    it('should create new session for stale (ended) watched file', async () => {
      // First open with watch
      const logData = '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"test"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));
      (fs.watch as jest.Mock).mockReturnValue(createMockWatcher());

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri, { watch: true });

      // Session is not active (ended externally)
      mockProvider.isSessionActive.mockReturnValue(false);

      // Second open — should detect stale and create new session
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));
      await loader.openFile(uri);

      // Should create a second session
      expect(mockProvider.addTaskSession).toHaveBeenCalledTimes(2);
    });

    it('should generate session IDs with file- prefix', async () => {
      const logData = '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"test"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri);

      const sessionId = mockProvider.addTaskSession.mock.calls[0][0];
      expect(sessionId).toMatch(/^file-\d+-[a-z0-9]+$/);
    });

    it('should use Watch: prefix for session name when watching', async () => {
      const logData = '{"time":"2025-01-01T00:00:00Z","level":"info","msg":"test"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(logData));
      (fs.watch as jest.Mock).mockReturnValue(createMockWatcher());

      const uri = { fsPath: '/tmp/test.log' } as any;
      await loader.openFile(uri, { watch: true });

      expect(mockProvider.addTaskSession).toHaveBeenCalledWith(
        expect.any(String),
        'Watch: test.log'
      );
      // Session should NOT be ended when watching
      expect(mockProvider.endSession).not.toHaveBeenCalled();
    });

    it('should show error when realpathSync fails', async () => {
      (fs.realpathSync as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const uri = { fsPath: '/tmp/nonexistent.log' } as any;
      await loader.openFile(uri);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Cannot access file'));
      expect(mockProvider.addTaskSession).not.toHaveBeenCalled();
    });
  });

  describe('watching', () => {
    it('should handle watcher error event', () => {
      const sessionId = 'file-test-error';
      const mockWatcher = setupWatchedSession(loader, sessionId, '/tmp/test.log', { withErrorHandler: true });

      mockWatcher.emit('error', new Error('File deleted'));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('File deleted'));
      expect(mockProvider.endSession).toHaveBeenCalledWith(sessionId);
    });

    it('should read appended bytes when file grows', async () => {
      const sessionId = 'file-test-append';
      setupWatchedSession(loader, sessionId, '/tmp/test.log', { byteOffset: 100 });

      // Mock stat returning larger file
      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 200 });

      // Mock stream for appended bytes
      const appendData = '{"time":"2025-01-01T00:00:01Z","level":"info","msg":"appended"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(appendData));

      // Trigger onFileChanged directly
      const state = (loader as any).activeWatchers.get(sessionId);
      await (loader as any).onFileChanged(sessionId, state, '/tmp/test.log');

      expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/test.log', { start: 100 });
      expect(mockProvider.addLog).toHaveBeenCalled();
    });

    it('should clear and re-read on file truncation (log rotation)', async () => {
      const sessionId = 'file-test-rotation';
      setupWatchedSession(loader, sessionId, '/tmp/test.log', { byteOffset: 500 });

      // Mock stat returning smaller file (truncated)
      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 50 });

      // Mock stream for re-read
      const newData = '{"time":"2025-01-01T00:00:02Z","level":"info","msg":"after rotation"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(newData));

      const state = (loader as any).activeWatchers.get(sessionId);
      await (loader as any).onFileChanged(sessionId, state, '/tmp/test.log');

      expect(mockProvider.clearSessionLogs).toHaveBeenCalledWith(sessionId);
      // Re-reads entire file (no start offset)
      expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/test.log', { encoding: 'utf8' });
      expect(mockProvider.addLog).toHaveBeenCalled();
    });

    it('should skip when file size equals byte offset (metadata-only change)', async () => {
      const sessionId = 'file-test-metadata';
      setupWatchedSession(loader, sessionId, '/tmp/test.log', { byteOffset: 200 });

      // Mock stat returning same size
      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 200 });

      const state = (loader as any).activeWatchers.get(sessionId);
      await (loader as any).onFileChanged(sessionId, state, '/tmp/test.log');

      expect(fs.createReadStream).not.toHaveBeenCalled();
      expect(mockProvider.addLog).not.toHaveBeenCalled();
    });

    it('should guard against concurrent onFileChanged calls', async () => {
      const sessionId = 'file-test-concurrent';
      setupWatchedSession(loader, sessionId, '/tmp/test.log', { byteOffset: 100 });

      // Mock stat and slow stream
      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 200 });
      const appendData = '{"time":"2025-01-01T00:00:01Z","level":"info","msg":"data"}\n';
      (fs.createReadStream as jest.Mock).mockReturnValue(createMockReadStream(appendData));

      const state = (loader as any).activeWatchers.get(sessionId);

      // Fire two calls concurrently
      const p1 = (loader as any).onFileChanged(sessionId, state, '/tmp/test.log');
      const p2 = (loader as any).onFileChanged(sessionId, state, '/tmp/test.log');
      await Promise.all([p1, p2]);

      // Only one call should have created a stream (second was guarded)
      expect(fs.createReadStream).toHaveBeenCalledTimes(1);
    });

    it('should stop watching on stat error', async () => {
      const sessionId = 'file-test-stat-error';
      setupWatchedSession(loader, sessionId, '/tmp/test.log', { byteOffset: 100 });

      (fs.promises.stat as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const state = (loader as any).activeWatchers.get(sessionId);
      await (loader as any).onFileChanged(sessionId, state, '/tmp/test.log');

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
      expect(mockProvider.endSession).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('dispose', () => {
    it('should close all active watchers on dispose', () => {
      const sessionId = 'file-test-dispose';
      const mockWatcher = setupWatchedSession(loader, sessionId, '/tmp/test.log');

      loader.dispose();

      expect((mockWatcher as any).close).toHaveBeenCalled();
      expect(mockProvider.endSession).toHaveBeenCalledWith(sessionId);
    });

    it('should clear debounce timers on dispose', () => {
      const sessionId = 'file-test-debounce';
      const mockWatcher = setupWatchedSession(loader, sessionId, '/tmp/test.log');

      // Simulate a pending debounce timer
      const state = (loader as any).activeWatchers.get(sessionId);
      state.debounceTimer = setTimeout(() => {
        throw new Error('Debounce timer should have been cleared');
      }, 50);

      loader.dispose();

      expect((mockWatcher as any).close).toHaveBeenCalled();
    });
  });
});
