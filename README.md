# Slog Viewer

A VSCode/Cursor extension that transforms structured JSON logs in the Debug Console into readable, colored, and organized output.

## Features

- **Automatic JSON Detection**: Automatically detects and parses JSON logs from debug output
- **Colored Output**: Syntax highlighting for JSON and color-coded log levels
- **Clean Format**: Displays timestamp, message, and log level prominently
- **Organized Fields**: Shows additional fields as formatted JSON
- **Works with Any Language**: Compatible with any application that outputs JSON logs (Go slog, Node.js, Python, etc.)

## Example

### Before:
```json
{"level":"info","message":"Starting server","time":"2025-01-01T00:00:00.000Z"}
{"level":"error","message":"Failed to start server","error":"Connection refused","time":"2025-01-01T00:00:00.000Z"}
```

### After:
```
[2025-01-01T00:00:00.000Z] Starting server [INFO]
{
  // Additional fields shown as formatted JSON
}

[2025-01-01T00:00:00.000Z] Failed to start server [ERROR]
{
  "error": "Connection refused"
}
```

## Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd slog-viewer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Open the project in VSCode:
   ```bash
   code .
   ```

5. Press `F5` to launch the extension in a new VSCode window

### From VSIX (Production)

1. Package the extension:
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

2. Install the generated `.vsix` file in VSCode:
   - Open VSCode
   - Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
   - Click the "..." menu → "Install from VSIX..."
   - Select the generated `.vsix` file

## Usage

1. **Start Debugging**: Launch your application in debug mode (F5)
2. **View Formatted Logs**: The "Slog Viewer" panel will automatically appear in the bottom panel when structured logs are detected
3. **Original Debug Console**: The original Debug Console still shows raw output

### Commands

- **Slog Viewer: Enable** - Enable automatic log formatting
- **Slog Viewer: Disable** - Disable automatic log formatting
- **Slog Viewer: Toggle** - Toggle formatting on/off
- **Slog Viewer: Clear Logs** - Clear the formatted log output

### Configuration

Open VSCode Settings (Ctrl+, / Cmd+,) and search for "Slog Viewer":

- `slogViewer.enabled` - Enable/disable automatic formatting (default: `true`)
- `slogViewer.collapseJSON` - Show JSON collapsed by default (default: `true`)
- `slogViewer.showOriginal` - Show original JSON alongside formatted output (default: `false`)
- `slogViewer.maxLogEntries` - Maximum number of log entries to keep in memory (default: `10000`)
- `slogViewer.autoScroll` - Automatically scroll to the latest log entry (default: `true`)
- `slogViewer.theme` - Theme for the log viewer: `light`, `dark`, or `auto` (default: `auto`)

## Supported Log Formats

The extension automatically detects common JSON log field names:

- **Timestamp**: `time`, `timestamp`, `ts`, `@timestamp`, `datetime`
- **Level**: `level`, `severity`, `lvl`, `loglevel`
- **Message**: `message`, `msg`, `text`

All other fields are displayed as formatted JSON.

## Features

- **Interactive Webview**: Beautiful, modern UI with VSCode theme integration
- **Log Level Filtering**: Filter logs by level (Error, Warning, Info, Debug, Trace)
- **Search**: Real-time search across log messages and fields
- **Collapsible JSON**: Click on log entries to expand/collapse JSON fields
- **Syntax Highlighting**: Color-coded JSON with proper type formatting
- **Auto-scroll**: Automatically scroll to latest logs (configurable)
- **Performance**: Handles thousands of logs efficiently with configurable limits

## Color Scheme

Log levels are color-coded with badges:
- **ERROR/FATAL**: Red
- **WARN/WARNING**: Yellow
- **INFO**: Blue
- **DEBUG**: Gray
- **TRACE**: Dim Gray

JSON syntax highlighting uses VSCode theme colors:
- **Keys**: Property color
- **Strings**: String color
- **Numbers**: Number color
- **Booleans**: Boolean color
- **Null**: Error color

## Examples

### Go (slog)
```go
import "log/slog"

slog.Info("Server started", "port", 8080, "env", "production")
```

### Node.js (pino)
```javascript
const logger = require('pino')()
logger.info({ port: 8080, env: 'production' }, 'Server started')
```

### Python (structlog)
```python
import structlog
logger = structlog.get_logger()
logger.info("server_started", port=8080, env="production")
```

## Development

### Project Structure

```
slog-viewer/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── debugAdapterWrapper.ts    # Debug adapter tracker
│   ├── logFormatter.ts           # JSON parsing and formatting
│   └── ansiColors.ts             # ANSI color utilities
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

### Building

```bash
npm run compile     # Compile TypeScript
npm run watch       # Watch mode for development
```

### Testing

1. Open the project in VSCode
2. Press `F5` to launch Extension Development Host
3. Open a project with JSON logging
4. Start debugging and observe formatted logs in the "Slog Viewer" panel

## Limitations

- The extension displays formatted logs in a separate "Slog Viewer" panel (VSCode API limitation prevents modifying the Debug Console directly)
- Original Debug Console still shows raw JSON output
- Only structured logs (JSON/logfmt) are formatted; plain text logs remain in the Debug Console

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT