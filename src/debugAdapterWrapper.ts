import * as vscode from 'vscode';
import { processLine } from './logFormatter';

/**
 * Debug Adapter Descriptor Factory that wraps the original debug adapter
 * to intercept and modify output messages
 */
export class SlogDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  async createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined
  ): Promise<vscode.DebugAdapterDescriptor | undefined> {
    // We can't easily wrap the debug adapter without implementing a full proxy
    // This approach has limitations - returning undefined to use default
    return undefined;
  }
}

/**
 * Alternative approach: Use DebugAdapterTracker with custom output channel
 * This creates a separate output channel with formatted logs
 */
export class SlogDebugAdapterTracker implements vscode.DebugAdapterTracker {
  private config: vscode.WorkspaceConfiguration;
  private outputChannel: vscode.OutputChannel;
  private processedLines: Set<string> = new Set();

  constructor(session: vscode.DebugSession, outputChannel: vscode.OutputChannel) {
    this.config = vscode.workspace.getConfiguration('slogViewer');
    this.outputChannel = outputChannel;
  }

  onDidSendMessage(message: any): void {
    const enabled = this.config.get<boolean>('enabled', true);
    if (!enabled) {
      return;
    }

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

      this.processedLines.add(line);

      const formatted = processLine(line, this.config);
      if (formatted) {
        // Show formatted JSON/logfmt logs
        this.outputChannel.appendLine(formatted);
      } else {
        // Show non-JSON logs as-is
        this.outputChannel.appendLine(line);
      }

      // Auto-show the output channel on first log (without preserveFocus to switch to the tab)
      if (this.processedLines.size === 1) {
        this.outputChannel.show(false); // false = switch focus to the Slog Viewer tab
      }
    }
  }

  onWillStartSession(): void {
    this.config = vscode.workspace.getConfiguration('slogViewer');
    this.processedLines.clear();
    this.outputChannel.clear();
  }

  onWillStopSession(): void {
    // Keep the logs visible after session ends
  }
}

/**
 * Tracker factory that provides output channel
 */
export class SlogDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    return new SlogDebugAdapterTracker(session, this.outputChannel);
  }
}
