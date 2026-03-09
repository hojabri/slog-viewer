import * as vscode from 'vscode';
import { SlogDebugAdapterTrackerFactory } from './debugAdapterWrapper';
import { SlogViewerWebviewProvider } from './webviewPanel';
import { SlogViewerTaskProvider } from './taskOutputTracker';
import { FileLogLoader } from './fileLogLoader';

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

  // Register Task Provider for slogViewer tasks
  const taskProvider = new SlogViewerTaskProvider(webviewProvider);
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(SlogViewerTaskProvider.taskType, taskProvider)
  );

  // Track debug session lifecycle
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      webviewProvider.addSession(session);
      webviewProvider.show();
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      webviewProvider.endSession(session.id);
    })
  );

  // Register File Log Loader
  const fileLogLoader = new FileLogLoader(webviewProvider);
  context.subscriptions.push(fileLogLoader);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.clearLogs', () => {
      webviewProvider.clearLogs();
      vscode.window.showInformationMessage('Slog Viewer: Logs cleared');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.openLogFile', (uri?: vscode.Uri) => {
      fileLogLoader.openFile(uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.watchLogFile', (uri?: vscode.Uri) => {
      fileLogLoader.openFile(uri, { watch: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.copyLogs', () => {
      webviewProvider.showExportQuickPick('clipboard');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.saveLogs', () => {
      webviewProvider.showExportQuickPick('file');
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
