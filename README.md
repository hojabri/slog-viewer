# Slog Viewer

Beautiful structured log viewer for debugging. Automatically transforms JSON/logfmt logs into readable, interactive output with syntax highlighting, filtering, and search.

## Features

- **Automatic Detection**: Detects and formats JSON/logfmt logs during debugging
- **Interactive UI**: Modern webview with VSCode theme integration
- **Filtering & Search**: Filter by log level and search across messages
- **Collapsible Fields**: Click to expand/collapse JSON
- **Works with Any Language**: Go slog, Node.js pino, Python structlog, and more

## Quick Start

1. Install the extension
2. Start debugging (F5)
3. View formatted logs in the **Slog Viewer** panel

## Supported Formats

**JSON**
```json
{"time":"2025-01-01T00:00:00Z","level":"info","message":"Server started","port":8080}
```

**Logfmt**
```
time=2025-01-01T00:00:00Z level=info msg="Server started" port=8080
```

## Configuration

Access via VSCode Settings → "Slog Viewer":

- Toggle automatic formatting
- Collapse JSON by default
- Auto-scroll to latest logs
- Theme: light, dark, or auto

## License

MIT