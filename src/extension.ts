import * as vscode from 'vscode';
import { SlogDebugAdapterTrackerFactory } from './debugAdapterWrapper';
import { SlogViewerWebviewProvider } from './webviewPanel';

let webviewProvider: SlogViewerWebviewProvider;
let isEnabled = true;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Slog Viewer extension is now active');

  // Get initial configuration
  const config = vscode.workspace.getConfiguration('slogViewer');
  isEnabled = config.get<boolean>('enabled', true);

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

  // Show Slog Viewer when debug session starts (fires after Debug Console takes focus)
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(() => {
      const config = vscode.workspace.getConfiguration('slogViewer');
      if (config.get<boolean>('enabled', true)) {
        webviewProvider.show();
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.enable', () => {
      isEnabled = true;
      vscode.workspace.getConfiguration('slogViewer').update('enabled', true, true);
      vscode.window.showInformationMessage('Slog Viewer: Enabled');
      webviewProvider.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.disable', () => {
      isEnabled = false;
      vscode.workspace.getConfiguration('slogViewer').update('enabled', false, true);
      vscode.window.showInformationMessage('Slog Viewer: Disabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.toggle', () => {
      isEnabled = !isEnabled;
      vscode.workspace.getConfiguration('slogViewer').update('enabled', isEnabled, true);
      vscode.window.showInformationMessage(`Slog Viewer: ${isEnabled ? 'Enabled' : 'Disabled'}`);
      if (isEnabled) {
        webviewProvider.show();
      }
    })
  );

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
        const config = vscode.workspace.getConfiguration('slogViewer');
        isEnabled = config.get<boolean>('enabled', true);
        webviewProvider.updateConfig();
      }
    })
  );

  // Show welcome message if enabled
  if (isEnabled) {
    vscode.window.showInformationMessage(
      'Slog Viewer is active. JSON logs will appear in the Slog Viewer panel when debugging.'
    );
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Cleanup handled by subscriptions
}
