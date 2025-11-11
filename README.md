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
2. **View Formatted Logs**: Open the "Slog Viewer" output channel to see formatted logs
3. **Original Debug Console**: The original Debug Console still shows raw output

### Commands

- **Slog Viewer: Enable** - Enable automatic log formatting
- **Slog Viewer: Disable** - Disable automatic log formatting
- **Slog Viewer: Toggle** - Toggle formatting on/off
- **Slog Viewer: Clear Logs** - Clear the formatted log output

### Configuration

Open VSCode Settings (Ctrl+, / Cmd+,) and search for "Slog Viewer":

- `slogViewer.enabled` - Enable/disable automatic formatting (default: `true`)
- `slogViewer.colorizeOutput` - Use ANSI colors for syntax highlighting (default: `true`)
- `slogViewer.collapseJSON` - Show JSON collapsed by default (default: `true`)
- `slogViewer.showOriginal` - Show original JSON alongside formatted output (default: `false`)

## Supported Log Formats

The extension automatically detects common JSON log field names:

- **Timestamp**: `time`, `timestamp`, `ts`, `@timestamp`, `datetime`
- **Level**: `level`, `severity`, `lvl`, `loglevel`
- **Message**: `message`, `msg`, `text`

All other fields are displayed as formatted JSON.

## Color Scheme

- **ERROR/FATAL**: Bright Red
- **WARN/WARNING**: Bright Yellow
- **INFO**: Bright Blue
- **DEBUG**: Gray
- **TRACE**: Dim Gray

JSON syntax highlighting:
- **Keys**: Cyan
- **Strings**: Green
- **Numbers**: Magenta
- **Booleans**: Yellow
- **Null**: Gray

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
4. Start debugging and observe formatted logs in "Slog Viewer" output channel

## Limitations

- The extension creates a separate "Slog Viewer" output channel for formatted logs
- Original Debug Console still shows raw JSON (this is a VSCode API limitation)
- ANSI colors require VSCode 1.80.0 or later

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT