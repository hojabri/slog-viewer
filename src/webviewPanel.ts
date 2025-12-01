/**
 * Webview panel manager for displaying logs in an interactive UI
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ParsedLog } from './logFormatter';
import { ExtensionMessage, WebviewConfig, SessionInfo } from './messageTypes';

// Maximum number of logs to buffer before webview is ready
const MAX_PENDING_LOGS = 500;

// Internal session data including logs
interface SessionData extends SessionInfo {
  logs: ParsedLog[];
}

export class SlogViewerWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'slog-viewer.logView';
  private view?: vscode.WebviewView;
  private pendingLogs: Array<{ sessionId: string; log: ParsedLog }> = [];
  private isWebviewReady = false;

  // Session management
  private sessions: Map<string, SessionData> = new Map();
  private currentSessionId: string | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case 'ready':
          // Webview is ready, send initial config
          this.isWebviewReady = true;
          this.updateConfig();
          // Send session info
          this.sendSessionsToWebview();
          // Send any pending logs that arrived before webview was ready
          this.flushPendingLogs();
          break;
        case 'openFile':
          await this.openFile(message.filePath, message.line);
          break;
        case 'selectSession':
          this.setCurrentSession(message.sessionId);
          break;
      }
    });

    // Reset ready state when webview is disposed
    webviewView.onDidDispose(() => {
      this.isWebviewReady = false;
    });
  }

  /**
   * Flush any logs that were buffered before webview was ready
   */
  private flushPendingLogs(): void {
    if (!this.view || !this.isWebviewReady) {
      return;
    }

    for (const { sessionId, log } of this.pendingLogs) {
      const message: ExtensionMessage = {
        type: 'addLog',
        log: log,
        sessionId: sessionId
      };
      this.view.webview.postMessage(message);
    }
    this.pendingLogs = [];
  }

  /**
   * Add a log entry to the webview for a specific session
   */
  public addLog(sessionId: string, log: ParsedLog): void {
    // Store log in the session data
    const session = this.sessions.get(sessionId);
    if (session) {
      session.logs.push(log);
    }

    // Buffer logs if webview isn't ready yet
    if (!this.view || !this.isWebviewReady) {
      this.pendingLogs.push({ sessionId, log });
      // Evict oldest logs if buffer is full
      while (this.pendingLogs.length > MAX_PENDING_LOGS) {
        this.pendingLogs.shift();
      }
      return;
    }

    const message: ExtensionMessage = {
      type: 'addLog',
      log: log,
      sessionId: sessionId
    };

    this.view.webview.postMessage(message);
  }

  /**
   * Clear logs for the current session in the webview
   */
  public clearLogs(): void {
    // Clear pending logs for current session
    if (this.currentSessionId) {
      this.pendingLogs = this.pendingLogs.filter(p => p.sessionId !== this.currentSessionId);
      // Clear logs in session data
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.logs = [];
      }
    } else {
      this.pendingLogs = [];
    }

    if (!this.view) {
      return;
    }

    const message: ExtensionMessage = {
      type: 'clearLogs'
    };

    this.view.webview.postMessage(message);
  }

  /**
   * Add a new debug session
   */
  public addSession(session: vscode.DebugSession): void {
    const sessionData: SessionData = {
      id: session.id,
      name: session.name,
      isActive: true,
      logs: []
    };
    this.sessions.set(session.id, sessionData);

    // Auto-select the new session
    this.currentSessionId = session.id;

    this.sendSessionsToWebview();
  }

  /**
   * Mark a session as ended (keep logs for viewing)
   */
  public endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.sendSessionsToWebview();
    }
  }

  /**
   * Set the current session being viewed
   */
  public setCurrentSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      this.sendSessionsToWebview();
    }
  }

  /**
   * Get the current session ID
   */
  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Send session list to webview
   */
  private sendSessionsToWebview(): void {
    if (!this.view || !this.isWebviewReady) {
      return;
    }

    const sessionInfos: SessionInfo[] = Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      name: s.name,
      isActive: s.isActive
    }));

    const message: ExtensionMessage = {
      type: 'setSessions',
      sessions: sessionInfos,
      currentSessionId: this.currentSessionId
    };

    this.view.webview.postMessage(message);
  }

  /**
   * Update webview configuration
   */
  public updateConfig(): void {
    if (!this.view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('slogViewer');

    const webviewConfig: WebviewConfig = {
      collapseJSON: config.get<boolean>('collapseJSON', true),
      showRawJSON: config.get<boolean>('showRawJSON', false),
      autoScroll: config.get<boolean>('autoScroll', true),
      theme: config.get<'light' | 'dark' | 'auto'>('theme', 'auto')
    };

    const message: ExtensionMessage = {
      type: 'updateConfig',
      config: webviewConfig
    };

    this.view.webview.postMessage(message);
  }

  /**
   * Show the webview panel by focusing it
   */
  public show(): void {
    // Use VSCode command to focus the view - this works even if view isn't resolved yet
    vscode.commands.executeCommand(`${SlogViewerWebviewProvider.viewType}.focus`);
  }

  /**
   * Open a file in the editor, optionally at a specific line
   */
  private async openFile(filePath: string, line?: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      if (line !== undefined && line > 0) {
        // Move cursor to the specified line (lines are 1-indexed in logs, 0-indexed in VSCode)
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
    }
  }

  /**
   * Generate HTML for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Read HTML template
    const htmlPath = path.join(
      this.extensionUri.fsPath,
      'dist',
      'webview',
      'index.html'
    );
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Read CSS
    const cssPath = path.join(
      this.extensionUri.fsPath,
      'dist',
      'webview',
      'styles.css'
    );
    const css = fs.readFileSync(cssPath, 'utf8');

    // Read JavaScript
    const jsPath = path.join(
      this.extensionUri.fsPath,
      'dist',
      'webview',
      'webview.js'
    );
    const js = fs.readFileSync(jsPath, 'utf8');

    // Generate nonce for security
    const nonce = this.getNonce();

    // Replace placeholders
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace('{{cspSource}}', webview.cspSource);
    html = html.replace('{{scriptContent}}', js);

    // Inject CSS as inline styles (for simplicity)
    html = html.replace('</head>', `<style nonce="${nonce}">${css}</style></head>`);

    return html;
  }

  /**
   * Generate a nonce for Content Security Policy
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
