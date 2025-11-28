import * as vscode from 'vscode';
import { SlogDebugAdapterTrackerFactory } from './debugAdapterWrapper';
import { SlogViewerWebviewProvider } from './webviewPanel';

let webviewProvider: SlogViewerWebviewProvider;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Slog Viewer extension is now active');

  // Create webview provider
  webviewProvider = new SlogViewerWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SlogViewerWebviewProvider.viewType,
      webviewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true // Keep webview alive when tab is hidden
        }
      }
    )
  );

  // Register Debug Adapter Tracker Factory for all debug types
  const trackerFactory = new SlogDebugAdapterTrackerFactory(webviewProvider);
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory)
  );

  // Show Slog Viewer when debug session starts
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(() => {
      webviewProvider.show();
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.clearLogs', () => {
      webviewProvider.clearLogs();
      vscode.window.showInformationMessage('Slog Viewer: Logs cleared');
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('slogViewer')) {
        webviewProvider.updateConfig();
      }
    })
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Cleanup handled by subscriptions
}
