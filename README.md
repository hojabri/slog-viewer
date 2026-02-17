# Slog Viewer

Beautiful structured log viewer for debugging. Automatically transforms JSON/logfmt logs into readable, interactive output with syntax highlighting, filtering, and search.

![Slog Viewer Demo](slog-viewer.gif)

## Features

- **Automatic Detection**: Detects and formats JSON/logfmt logs during debugging
- **Task Support**: Capture structured logs from VS Code Tasks (`"type": "slogViewer"`)
- **Interactive UI**: Modern webview with VSCode theme integration
- **Advanced Filtering**: Click any field to include/exclude logs by value
- **Filtering & Search**: Filter by log level and search across messages
- **Collapsible Fields**: Click to expand/collapse JSON
- **Works with Any Language**: Go slog, Node.js pino, Python structlog, and more

## Quick Start

1. Install the extension
2. **Option A — Debugging**: Start debugging (F5) and view formatted logs in the **Slog Viewer** panel
3. **Option B — Tasks**: Define a task with `"type": "slogViewer"` in `.vscode/tasks.json` and run it

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


1. **Click any value** - Click on a log message or any JSON field value to open the filter menu
2. **Include/Exclude** - Choose to show only logs with that value, or hide logs with that value
3. **Filter chips** - Active filters appear as chips below the toolbar
   - Green chips = include filters
   - Red chips = exclude filters
   - Click a chip to toggle it on/off
   - Click × to remove a filter
4. **Add Filter button** - Manually create filters for any field

**Example**: To hide all "http request" logs, click on a message containing "http request" and select "Exclude".

## Configuration

Access via VSCode Settings → "Slog Viewer":

- Toggle automatic formatting
- Collapse JSON by default
- Auto-scroll to latest logs
- Theme: light, dark, or auto

## License

MIT
