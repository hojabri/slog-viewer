# Slog Viewer

Beautiful structured log viewer for debugging. Automatically transforms JSON/logfmt logs into readable, interactive output with syntax highlighting, filtering, and search.

![Slog Viewer Demo](slog-viewer.gif)

## Features

- **Automatic Detection**: Detects and formats JSON/logfmt logs during debugging
- **Task Support**: Capture structured logs from VS Code Tasks (`"type": "slogViewer"`)
- **Open Log Files**: View any structured log file directly in the panel, with optional live tail
- **Interactive UI**: Modern webview with VSCode theme integration
- **Advanced Filtering**: Right-click any field to include/exclude logs by value
- **Filtering & Search**: Filter by log level and search across messages
- **Export Logs**: Copy or save filtered logs as JSON, CSV, or text
- **Collapsible Fields**: Click to expand/collapse log details
- **Works with Any Language**: Go slog, Node.js pino, Python structlog, and more

## Quick Start

1. Install the extension
2. **Option A — Debugging**: Start debugging (F5) and view formatted logs in the **Slog Viewer** panel
3. **Option B — Tasks**: Define a task with `"type": "slogViewer"` in `.vscode/tasks.json` and run it
4. **Option C — Log Files**: Run **"Slog Viewer: Open in Slog Viewer"** from the Command Palette, or right-click a file in the Explorer

## Task Support

VS Code Tasks let you run commands directly from VS Code. By using `"type": "slogViewer"` instead of `"type": "shell"`, the extension captures structured logs and displays them in the Slog Viewer panel — while still showing all raw output in the terminal.

**Before** (standard shell task — logs only in terminal):
```json
{
  "label": "Run Server",
  "type": "shell",
  "command": "node",
  "args": ["server.js"]
}
```

**After** (slogViewer task — logs in Slog Viewer panel + terminal):
```json
{
  "label": "Run Server",
  "type": "slogViewer",
  "command": "node",
  "args": ["server.js"]
}
```

### Complete `tasks.json` Example

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Run Dev Server",
      "type": "slogViewer",
      "command": "node",
      "args": ["${workspaceFolder}/server.js"],
      "cwd": "${workspaceFolder}",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Task Properties

| Property  | Required | Description                          |
|-----------|----------|--------------------------------------|
| `command` | Yes      | The command to execute                |
| `args`    | No       | Array of command arguments            |
| `cwd`     | No       | Working directory (defaults to workspace folder) |
| `env`     | No       | Additional environment variables      |

Variable substitution is supported: `${workspaceFolder}`, `${file}`, `${env:VAR_NAME}`.

## Log File Support

Open any log file containing structured JSON or logfmt entries directly in the Slog Viewer panel.

### Opening a Log File

- **Command Palette**: Run `Slog Viewer: Open in Slog Viewer` and select a file
- **Explorer Context Menu**: Right-click a log file and select **Open in Slog Viewer** or **Watch in Slog Viewer (Live Tail)**

### Live Tail (Watch Mode)

Use **"Slog Viewer: Watch in Slog Viewer (Live Tail)"** to monitor a file for new log entries in real time. New lines appended to the file automatically appear in the panel. Log rotation (file truncation) is handled automatically.

### Notes

- Each file appears as a separate session in the session dropdown
- Non-structured lines (plain text, stack traces) are silently skipped
- Any text file with JSON or logfmt log lines is supported (`.log`, `.json`, `.jsonl`, `.txt`, etc.)

## Supported Formats

**JSON**
```json
{"time":"2025-01-01T00:00:00Z","level":"info","message":"Server started","port":8080}
```

**Logfmt**
```
time=2025-01-01T00:00:00Z level=info msg="Server started" port=8080
```

## Advanced Filtering


1. **Right-click any value** - Right-click on a log message or any JSON field value to open the filter menu
2. **Include/Exclude** - Choose to show only logs with that value, or hide logs with that value
3. **Filter chips** - Active filters appear as chips below the toolbar
   - Green chips = include filters
   - Red chips = exclude filters
   - Click a chip to toggle it on/off
   - Click × to remove a filter
4. **Add Filter button** - Manually create filters for any field

**Example**: To hide all "http request" logs, right-click on a message containing "http request" and select "Exclude".

**Tip**: File path values support both left-click (opens the file) and right-click (filter menu with an additional "Open file" option).

## Configuration

Access via VSCode Settings → "Slog Viewer":

| Setting | Default | Description |
|---------|---------|-------------|
| `slogViewer.autoReveal` | `true` | Automatically reveal the panel when the first structured log is detected. Set to `false` to open the panel manually. |
| `slogViewer.collapseJSON` | `true` | Show log details collapsed by default (click to expand) |
| `slogViewer.showRawJSON` | `false` | Show the raw JSON log below each formatted entry |
| `slogViewer.autoScroll` | `true` | Automatically scroll to the latest log entry |
| `slogViewer.theme` | `auto` | Theme for the log viewer (`light`, `dark`, or `auto`) |
| `slogViewer.messageMaxLength` | `200` | Maximum characters of a message shown before truncation (click "Show more" to expand). Set to `0` to disable. |
| `slogViewer.timeFieldAliases` | `[]` | Extra field names recognized as the timestamp — see below. |
| `slogViewer.levelFieldAliases` | `[]` | Extra field names recognized as the log level — see below. |
| `slogViewer.messageFieldAliases` | `[]` | Extra field names recognized as the message — see below. |

### Field aliases

By default the timestamp, level, and message are read from common field names
(`time`, `level`, `msg`/`message`, and others). If your logs use different
keys, add them to the `slogViewer.*FieldAliases` settings and they will be
rendered into the correct columns. Matching is case-insensitive.

For example, to support Python's `logging` module output:

```json
"slogViewer.timeFieldAliases": ["asctime"],
"slogViewer.levelFieldAliases": ["levelname"],
"slogViewer.messageFieldAliases": ["desc"]
```

With the settings above, a log like `{"asctime":"2026-04-17 12:10:02","levelname":"INFO","desc":"title 1"}` is displayed the same as a standard `time`/`level`/`message` log. (For logfmt, alias names must be word characters.)

## License

MIT
