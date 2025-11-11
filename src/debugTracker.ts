import * as vscode from 'vscode';
import { processLine } from './logFormatter';

/**
 * Debug Adapter Tracker that intercepts DAP messages
 * and formats JSON logs in the Debug Console
 */
export class SlogDebugAdapterTracker implements vscode.DebugAdapterTracker {
  private config: vscode.WorkspaceConfiguration;
  private session: vscode.DebugSession;

  constructor(session: vscode.DebugSession) {
    this.session = session;
    this.config = vscode.workspace.getConfiguration('slogViewer');
  }

  /**
   * Called when the debug adapter sends a message to VS Code
   */
  onDidSendMessage(message: any): void {
    // Check if formatting is enabled
    const enabled = this.config.get<boolean>('enabled', true);
    if (!enabled) {
      return;
    }

    // Only process OutputEvent messages
    if (message.type !== 'event' || message.event !== 'output') {
      return;
    }

    // Get the output category (stdout, stderr, console, etc.)
    const category = message.body?.category;
    const output = message.body?.output;

    // Only process stdout and stderr
    if (!output || (category !== 'stdout' && category !== 'stderr')) {
      return;
    }

    // Process each line
    const lines = output.split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      // Try to format the line
      const formatted = processLine(line, this.config);
      if (formatted) {
        // Send formatted output back to debug console
        this.sendFormattedOutput(formatted, category);
      }
    }
  }

  /**
   * Send formatted output to the Debug Console
   */
  private sendFormattedOutput(text: string, category: string = 'stdout'): void {
    // We can't directly send messages back through the tracker,
    // but we can use vscode.debug API to write to the debug console
    // Note: This is a limitation - we'll need to use a different approach

    // For now, we'll just log it (this won't show in debug console)
    // A better approach would be to implement a custom debug adapter
    // or use the debug console API if available

    // TODO: Find a way to inject formatted output into debug console
    // Possible approaches:
    // 1. Implement a custom debug adapter wrapper
    // 2. Use vscode.debug.activeDebugConsole (if it exists)
    // 3. Modify the DAP message before it's processed (not possible with tracker)
  }

  onWillStartSession(): void {
    // Refresh config when session starts
    this.config = vscode.workspace.getConfiguration('slogViewer');
  }

  onWillStopSession(): void {
    // Cleanup if needed
  }

  onError(error: Error): void {
    console.error('Slog Viewer: Debug adapter error', error);
  }

  onExit(code: number | undefined, signal: string | undefined): void {
    // Cleanup if needed
  }
}

/**
 * Factory for creating Debug Adapter Trackers
 */
export class SlogDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    return new SlogDebugAdapterTracker(session);
  }
}
