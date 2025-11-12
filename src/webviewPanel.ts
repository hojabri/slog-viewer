/**
 * Webview panel manager for displaying logs in an interactive UI
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ParsedLog } from './logFormatter';
import { ExtensionMessage, WebviewConfig } from './messageTypes';

export class SlogViewerWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'slog-viewer.logView';
  private view?: vscode.WebviewView;

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
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.type) {
        case 'ready':
          // Webview is ready, send initial config
          this.updateConfig();
          break;
      }
    });
  }

  /**
   * Add a log entry to the webview
   */
  public addLog(log: ParsedLog): void {
    if (!this.view) {
      return;
    }

    const message: ExtensionMessage = {
      type: 'addLog',
      log: log
    };

    this.view.webview.postMessage(message);
  }

  /**
   * Clear all logs in the webview
   */
  public clearLogs(): void {
    if (!this.view) {
      return;
    }

    const message: ExtensionMessage = {
      type: 'clearLogs'
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
      showOriginal: config.get<boolean>('showOriginal', false),
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
   * Show the webview
   */
  public show(): void {
    if (this.view) {
      this.view.show(true);
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
