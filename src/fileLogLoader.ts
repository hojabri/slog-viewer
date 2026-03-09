import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import { processLogLine, ParsedLog } from './logFormatter';
import { processChunk } from './lineUtils';
import { SlogViewerWebviewProvider } from './webviewPanel';

// Batch size for addLog calls during bulk file reads
const LOG_BATCH_SIZE = 100;

// Debounce delay for file watch events (ms)
const WATCH_DEBOUNCE_MS = 200;

interface WatcherState {
  watcher: fs.FSWatcher;
  byteOffset: number;
  lineBuffer: string;
  debounceTimer?: ReturnType<typeof setTimeout>;
  isProcessing?: boolean;
  filePath: string;
}

/**
 * Loads and optionally watches log files, displaying parsed structured logs
 * in the slog-viewer webview panel.
 */
export class FileLogLoader implements vscode.Disposable {
  private fileSessionMap: Map<string, string> = new Map(); // normalized filePath → sessionId
  private activeWatchers: Map<string, WatcherState> = new Map(); // sessionId → watcher state

  constructor(private webviewProvider: SlogViewerWebviewProvider) {}

  /**
   * Open a log file and display its structured logs in the webview.
   * If watch is true, continue monitoring the file for new content.
   */
  public async openFile(fileUri?: vscode.Uri, options?: { watch?: boolean }): Promise<void> {
    // Show file picker if no URI provided
    if (!fileUri) {
      const result = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'Log Files': ['log', 'json', 'jsonl', 'txt'],
          'All Files': ['*']
        }
      });
      if (!result || result.length === 0) {
        return;
      }
      fileUri = result[0];
    }

    const filePath = fileUri.fsPath;

    // Normalize path for dedup (resolve symlinks and canonical path)
    let normalizedPath: string;
    try {
      normalizedPath = fs.realpathSync(filePath);
    } catch {
      vscode.window.showErrorMessage(`Cannot access file: ${filePath}`);
      return;
    }

    // Check if file is already open
    const existingSessionId = this.fileSessionMap.get(normalizedPath);
    if (existingSessionId) {
      if (this.webviewProvider.isSessionActive(existingSessionId)) {
        // Switch to existing active session
        this.webviewProvider.setCurrentSession(existingSessionId);
        this.webviewProvider.show();
        return;
      }
      // Stale session — remove and proceed to create new one
      this.fileSessionMap.delete(normalizedPath);
    }

    const watch = options?.watch === true;
    const sessionId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const basename = path.basename(filePath);
    const sessionName = watch ? `Watch: ${basename}` : `File: ${basename}`;

    // Register session
    this.fileSessionMap.set(normalizedPath, sessionId);
    this.webviewProvider.addTaskSession(sessionId, sessionName);
    this.webviewProvider.show();

    // Read and parse the file
    try {
      const byteOffset = await this.readFile(filePath, sessionId);

      if (watch) {
        this.startWatching(sessionId, normalizedPath, filePath, byteOffset);
      } else {
        this.webviewProvider.endSession(sessionId);
        // Remove from map so file can be reopened
        this.fileSessionMap.delete(normalizedPath);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.webviewProvider.endSession(sessionId);
      this.fileSessionMap.delete(normalizedPath);
      vscode.window.showErrorMessage(`Error reading log file: ${msg}`);
    }
  }

  /**
   * Parse a line and add to batch, flushing when batch is full.
   */
  private addToBatch(line: string, batch: ParsedLog[], sessionId: string): boolean {
    const parsed = processLogLine(line);
    if (parsed) {
      batch.push(parsed);
      if (batch.length >= LOG_BATCH_SIZE) {
        this.flushBatch(batch, sessionId);
      }
      return true;
    }
    return false;
  }

  /**
   * Read a file from start, parsing structured logs.
   * Returns the total bytes read.
   */
  private readFile(filePath: string, sessionId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let lineBuffer = '';
      let logCount = 0;
      let totalBytes = 0;
      const batch: ParsedLog[] = [];

      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      stream.on('data', (data: string | Buffer) => {
        const str = data.toString();
        totalBytes += Buffer.byteLength(str, 'utf8');

        lineBuffer = processChunk(str, lineBuffer, (line) => {
          if (this.addToBatch(line, batch, sessionId)) {
            logCount++;
          }
        });
      });

      stream.on('end', () => {
        // Flush remaining line buffer
        if (lineBuffer.trim()) {
          if (this.addToBatch(lineBuffer, batch, sessionId)) {
            logCount++;
          }
        }

        // Flush remaining batch
        this.flushBatch(batch, sessionId);

        if (logCount === 0) {
          vscode.window.showInformationMessage('No structured logs found in file.');
        }

        resolve(totalBytes);
      });

      stream.on('error', (err) => {
        // Flush any logs we did parse before the error
        this.flushBatch(batch, sessionId);
        stream.destroy();
        reject(err);
      });
    });
  }

  /**
   * Read new bytes appended to a watched file.
   * Uses StringDecoder to safely handle UTF-8 multi-byte characters at byte boundaries.
   */
  private readAppendedBytes(filePath: string, sessionId: string, watcherState: WatcherState): Promise<number> {
    return new Promise((resolve, reject) => {
      let newBytes = 0;
      const decoder = new StringDecoder('utf8');
      const batch: ParsedLog[] = [];

      const stream = fs.createReadStream(filePath, { start: watcherState.byteOffset });

      stream.on('data', (chunk: string | Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        newBytes += buf.length;
        const data = decoder.write(buf);

        watcherState.lineBuffer = processChunk(data, watcherState.lineBuffer, (line) => {
          this.addToBatch(line, batch, sessionId);
        });
      });

      stream.on('end', () => {
        // Flush any remaining bytes from the decoder
        const remaining = decoder.end();
        if (remaining) {
          watcherState.lineBuffer = processChunk(remaining, watcherState.lineBuffer, (line) => {
            this.addToBatch(line, batch, sessionId);
          });
        }

        this.flushBatch(batch, sessionId);
        resolve(newBytes);
      });

      stream.on('error', (err) => {
        this.flushBatch(batch, sessionId);
        stream.destroy();
        reject(err);
      });
    });
  }

  /**
   * Flush a batch of parsed logs to the webview.
   * Clears the batch array in-place for reuse by the caller.
   */
  private flushBatch(batch: ParsedLog[], sessionId: string): void {
    for (const log of batch) {
      this.webviewProvider.addLog(sessionId, log);
    }
    batch.length = 0;
  }

  /**
   * Start watching a file for changes
   */
  private startWatching(sessionId: string, normalizedPath: string, filePath: string, byteOffset: number): void {
    const watcherState: WatcherState = {
      watcher: null!,
      byteOffset,
      lineBuffer: '',
      filePath
    };

    try {
      const watcher = fs.watch(filePath);

      watcher.on('change', () => {
        // Debounce rapid change events
        if (watcherState.debounceTimer) {
          clearTimeout(watcherState.debounceTimer);
        }
        watcherState.debounceTimer = setTimeout(() => {
          this.onFileChanged(sessionId, watcherState, normalizedPath);
        }, WATCH_DEBOUNCE_MS);
      });

      watcher.on('error', (err) => {
        vscode.window.showErrorMessage(`File watcher error: ${err.message}`);
        this.stopWatching(sessionId);
      });

      watcherState.watcher = watcher;
      this.activeWatchers.set(sessionId, watcherState);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Could not watch file: ${msg}`);
      this.webviewProvider.endSession(sessionId);
      this.fileSessionMap.delete(normalizedPath);
    }
  }

  /**
   * Handle a debounced file change event.
   * Uses isProcessing guard to prevent concurrent reads from overlapping.
   */
  private async onFileChanged(sessionId: string, watcherState: WatcherState, normalizedPath: string): Promise<void> {
    if (watcherState.isProcessing) {
      return;
    }
    watcherState.isProcessing = true;

    try {
      const stat = await fs.promises.stat(watcherState.filePath);
      const newSize = stat.size;

      if (newSize < watcherState.byteOffset) {
        // Log rotation — file was truncated. Clear and re-read.
        this.webviewProvider.clearSessionLogs(sessionId);
        watcherState.byteOffset = 0;
        watcherState.lineBuffer = '';
        const totalBytes = await this.readFile(watcherState.filePath, sessionId);
        watcherState.byteOffset = totalBytes;
      } else if (newSize > watcherState.byteOffset) {
        // New data appended — read only new bytes
        const newBytes = await this.readAppendedBytes(watcherState.filePath, sessionId, watcherState);
        watcherState.byteOffset += newBytes;
      }
      // If newSize === byteOffset, nothing changed (e.g., metadata change)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Error reading watched file: ${msg}`);
      this.stopWatching(sessionId);
    } finally {
      watcherState.isProcessing = false;
    }
  }

  /**
   * Stop watching a file and end its session
   */
  public stopWatching(sessionId: string): void {
    const state = this.activeWatchers.get(sessionId);
    if (state) {
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
      }
      state.watcher.close();
      this.activeWatchers.delete(sessionId);

      // Remove from file-session map
      for (const [path, sid] of this.fileSessionMap) {
        if (sid === sessionId) {
          this.fileSessionMap.delete(path);
          break;
        }
      }
    }

    this.webviewProvider.endSession(sessionId);
  }

  /**
   * Dispose all watchers and clean up
   */
  public dispose(): void {
    const sessionIds = Array.from(this.activeWatchers.keys());
    for (const sessionId of sessionIds) {
      this.stopWatching(sessionId);
    }
    this.fileSessionMap.clear();
  }
}
