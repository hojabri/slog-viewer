import * as vscode from 'vscode';
import * as cp from 'child_process';
import { processLogLine } from './logFormatter';
import { processChunk, normalizeLineEndings } from './lineUtils';
import { SlogViewerWebviewProvider } from './webviewPanel';

// Re-export for backwards compatibility (used by fileLogLoader and tests)
export { processChunk, normalizeLineEndings };

// Maximum number of recent lines to track for deduplication
const MAX_PROCESSED_LINES = 1000;

/**
 * Resolve VS Code variables in a string value.
 * VS Code does NOT perform variable substitution on custom task definition properties,
 * so we must do it manually.
 */
export function resolveVariables(value: string, folder?: vscode.WorkspaceFolder): string {
  let result = value;

  // ${workspaceFolder} and ${workspaceRoot} (legacy alias)
  if (folder) {
    result = result.replace(/\$\{workspaceFolder\}/g, folder.uri.fsPath);
    result = result.replace(/\$\{workspaceRoot\}/g, folder.uri.fsPath);
  }

  // ${file} — the currently active file
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    result = result.replace(/\$\{file\}/g, activeEditor.document.uri.fsPath);
  }

  // ${env:VAR_NAME}
  result = result.replace(/\$\{env:([^}]+)\}/g, (_match, varName) => {
    return process.env[varName] ?? '';
  });

  return result;
}

/**
 * Pseudoterminal that spawns a process and intercepts structured log output.
 */
class SlogViewerPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();

  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

  private process: cp.ChildProcess | undefined;
  private lineBuffer = '';
  private errLineBuffer = '';
  private processedLines: Set<string> = new Set();
  private processedLinesQueue: string[] = [];
  private hasShownWebview = false;

  constructor(
    private command: string,
    private args: string[],
    private cwd: string | undefined,
    private env: Record<string, string> | undefined,
    private sessionId: string,
    private webviewProvider: SlogViewerWebviewProvider
  ) {}

  open(): void {
    // Build the full command string
    const fullCommand = this.args.length > 0
      ? `${this.command} ${this.args.join(' ')}`
      : this.command;

    this.writeEmitter.fire(`\x1b[90m> ${fullCommand}\x1b[0m\r\n\r\n`);

    const spawnEnv = this.env
      ? { ...process.env, ...this.env }
      : process.env;

    const isWindows = process.platform === 'win32';

    this.process = cp.spawn(fullCommand, [], {
      shell: true,
      cwd: this.cwd,
      env: spawnEnv,
      detached: !isWindows, // Process group for clean tree-killing on Unix
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      // Write raw output to terminal (normalized line endings)
      this.writeEmitter.fire(normalizeLineEndings(str));
      // Process for structured logs
      this.lineBuffer = processChunk(str, this.lineBuffer, (line) => {
        this.processLine(line);
      });
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      // Write raw output to terminal (normalized line endings)
      this.writeEmitter.fire(normalizeLineEndings(str));
      // Process for structured logs
      this.errLineBuffer = processChunk(str, this.errLineBuffer, (line) => {
        this.processLine(line);
      });
    });

    this.process.on('error', (err) => {
      this.writeEmitter.fire(`\r\n\x1b[31mFailed to start process: ${err.message}\x1b[0m\r\n`);
      this.closeEmitter.fire(1);
    });

    this.process.on('exit', (code) => {
      // Flush remaining buffers
      if (this.lineBuffer.trim()) {
        this.processLine(this.lineBuffer);
        this.lineBuffer = '';
      }
      if (this.errLineBuffer.trim()) {
        this.processLine(this.errLineBuffer);
        this.errLineBuffer = '';
      }

      this.writeEmitter.fire(`\r\n\x1b[90mProcess exited with code ${code ?? 'unknown'}\x1b[0m\r\n`);
      this.webviewProvider.endSession(this.sessionId);
      this.closeEmitter.fire(code ?? 0);
    });
  }

  handleInput(data: string): void {
    // Ctrl+C
    if (data === '\x03') {
      this.killProcess();
      return;
    }
    // Forward other input to the process
    this.process?.stdin?.write(data);
  }

  close(): void {
    this.killProcess();
  }

  private killProcess(): void {
    if (!this.process || this.process.exitCode !== null) {
      return;
    }

    const pid = this.process.pid;
    if (!pid) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        // Windows: kill the process tree
        cp.exec(`taskkill /pid ${pid} /T /F`);
      } else {
        // macOS/Linux: kill the process group (negative PID)
        process.kill(-pid, 'SIGTERM');
      }
    } catch {
      // Process may have already exited
      try {
        this.process.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }

  private processLine(line: string): void {
    // Deduplication
    if (this.processedLines.has(line)) {
      return;
    }

    this.processedLines.add(line);
    this.processedLinesQueue.push(line);

    // Evict oldest entries if we exceed the limit
    while (this.processedLinesQueue.length > MAX_PROCESSED_LINES) {
      const oldest = this.processedLinesQueue.shift();
      if (oldest) {
        this.processedLines.delete(oldest);
      }
    }

    const parsed = processLogLine(line);
    if (parsed) {
      this.webviewProvider.addLog(this.sessionId, parsed);

      // Auto-show the webview on first structured log
      if (!this.hasShownWebview) {
        this.webviewProvider.autoShow();
        this.hasShownWebview = true;
      }
    }
  }
}

/**
 * Task provider for the "slogViewer" task type.
 * Users define tasks with "type": "slogViewer" in tasks.json and the extension
 * spawns the process, piping output to both the terminal and the slog-viewer panel.
 */
export class SlogViewerTaskProvider implements vscode.TaskProvider {
  static readonly taskType = 'slogViewer';

  constructor(private webviewProvider: SlogViewerWebviewProvider) {}

  provideTasks(): vscode.Task[] {
    // Users define tasks in tasks.json; we don't provide any default tasks
    return [];
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition;

    if (definition.type !== SlogViewerTaskProvider.taskType) {
      return undefined;
    }

    const command: string | undefined = definition.command;
    if (!command) {
      return undefined;
    }

    const args: string[] = definition.args || [];
    const cwd: string | undefined = definition.cwd;
    const env: Record<string, string> | undefined = definition.env;

    // Determine the workspace folder for variable resolution
    const folder = task.scope !== undefined && task.scope !== vscode.TaskScope.Global && task.scope !== vscode.TaskScope.Workspace
      ? task.scope as vscode.WorkspaceFolder
      : vscode.workspace.workspaceFolders?.[0];

    // Resolve variables in command, args, and cwd
    const resolvedCommand = resolveVariables(command, folder);
    const resolvedArgs = args.map((a: string) => resolveVariables(a, folder));
    const resolvedCwd = cwd ? resolveVariables(cwd, folder) : folder?.uri.fsPath;

    const webviewProvider = this.webviewProvider;
    const sessionId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const sessionName = `Task: ${task.name}`;

    const execution = new vscode.CustomExecution(async () => {
      // Create the task session in the webview
      webviewProvider.addTaskSession(sessionId, sessionName);

      return new SlogViewerPseudoterminal(
        resolvedCommand,
        resolvedArgs,
        resolvedCwd,
        env,
        sessionId,
        webviewProvider
      );
    });

    // IMPORTANT: Must reuse the original task.definition object, not a copy,
    // otherwise VS Code silently ignores the resolved task.
    const resolvedTask = new vscode.Task(
      definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      task.source ?? SlogViewerTaskProvider.taskType,
      execution
    );

    return resolvedTask;
  }
}
