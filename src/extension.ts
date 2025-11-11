import * as vscode from 'vscode';
import { SlogDebugAdapterTrackerFactory } from './debugAdapterWrapper';

let outputChannel: vscode.OutputChannel;
let isEnabled = true;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Slog Viewer extension is now active');

  // Create output channel for formatted logs with ANSI color support
  outputChannel = vscode.window.createOutputChannel('Slog Viewer');
  context.subscriptions.push(outputChannel);

  // Get initial configuration
  const config = vscode.workspace.getConfiguration('slogViewer');
  isEnabled = config.get<boolean>('enabled', true);

  // Register Debug Adapter Tracker Factory for all debug types
  const trackerFactory = new SlogDebugAdapterTrackerFactory(outputChannel);
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.enable', () => {
      isEnabled = true;
      vscode.workspace.getConfiguration('slogViewer').update('enabled', true, true);
      vscode.window.showInformationMessage('Slog Viewer: Enabled');
      outputChannel.show(true);
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
        outputChannel.show(true);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('slog-viewer.clearLogs', () => {
      outputChannel.clear();
      vscode.window.showInformationMessage('Slog Viewer: Logs cleared');
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('slogViewer')) {
        const config = vscode.workspace.getConfiguration('slogViewer');
        isEnabled = config.get<boolean>('enabled', true);
      }
    })
  );

  // Show welcome message if enabled
  if (isEnabled) {
    vscode.window.showInformationMessage(
      'Slog Viewer is active. JSON logs in the Debug Console will be formatted automatically.'
    );
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}
