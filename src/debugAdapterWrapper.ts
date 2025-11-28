import * as vscode from 'vscode';
import { parseJSONLog, isJSONLog } from './logFormatter';
import { SlogViewerWebviewProvider } from './webviewPanel';

// Maximum number of recent lines to track for deduplication
const MAX_PROCESSED_LINES = 1000;

/**
 * Debug Adapter Tracker that intercepts log output and sends to webview
 */
export class SlogDebugAdapterTracker implements vscode.DebugAdapterTracker {
  private config: vscode.WorkspaceConfiguration;
  private webviewProvider: SlogViewerWebviewProvider;
  private processedLines: Set<string> = new Set();
  private processedLinesQueue: string[] = []; // Track insertion order for eviction
  private hasShownWebview = false;

  constructor(session: vscode.DebugSession, webviewProvider: SlogViewerWebviewProvider) {
    this.config = vscode.workspace.getConfiguration('slogViewer');
    this.webviewProvider = webviewProvider;
  }

  onDidSendMessage(message: any): void {
    if (message.type !== 'event' || message.event !== 'output') {
      return;
    }

    const category = message.body?.category;
    const output = message.body?.output;

    if (!output || (category !== 'stdout' && category !== 'stderr' && category !== 'console')) {
      return;
    }

    // Refresh config to get latest settings
    this.config = vscode.workspace.getConfiguration('slogViewer');

    // Process lines
    const lines = output.split('\n').filter((line: string) => line.trim());

    for (const line of lines) {
      // Avoid duplicate processing
      if (this.processedLines.has(line)) {
        continue;
      }

      // Add to processed lines with bounded size
      this.processedLines.add(line);
      this.processedLinesQueue.push(line);

      // Evict oldest entries if we exceed the limit
      while (this.processedLinesQueue.length > MAX_PROCESSED_LINES) {
        const oldest = this.processedLinesQueue.shift();
        if (oldest) {
          this.processedLines.delete(oldest);
        }
      }

      // Check if line is JSON/logfmt
      if (isJSONLog(line)) {
        const parsed = parseJSONLog(line);
        if (parsed) {
          // Send parsed log to webview
          this.webviewProvider.addLog(parsed);

          // Auto-show the webview on first log
          if (!this.hasShownWebview) {
            this.webviewProvider.show();
            this.hasShownWebview = true;
          }
        }
      }
      // Note: We only display structured logs in the webview.
      // Plain text logs remain in the Debug Console.
    }
  }

  onWillStartSession(): void {
    this.config = vscode.workspace.getConfiguration('slogViewer');
    this.processedLines.clear();
    this.processedLinesQueue = [];
    this.hasShownWebview = false;
    this.webviewProvider.clearLogs();
  }

  onWillStopSession(): void {
    // Keep the logs visible after session ends
  }
}

/**
 * Tracker factory that provides webview provider
 */
export class SlogDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  private webviewProvider: SlogViewerWebviewProvider;

  constructor(webviewProvider: SlogViewerWebviewProvider) {
    this.webviewProvider = webviewProvider;
  }

  createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    return new SlogDebugAdapterTracker(session, this.webviewProvider);
  }
}
