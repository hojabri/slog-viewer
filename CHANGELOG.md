# Change Log

All notable changes to the "Slog Viewer" extension will be documented in this file.

## [1.0.0] - 2025-01-12

### Added
- Initial release of Slog Viewer
- Automatic detection and parsing of JSON and logfmt structured logs
- Interactive webview panel for formatted log display
- Syntax highlighting for JSON fields with VSCode theme integration
- Log level filtering (Error, Warning, Info, Debug, Trace)
- Real-time search functionality across log messages and fields
- Collapsible JSON fields for cleaner viewing
- Auto-scroll to latest log entries
- Configurable maximum log entries (default: 10,000)
- Support for multiple log formats:
  - JSON logs with various field name conventions
  - Logfmt (key=value) format
- Commands:
  - `Slog Viewer: Enable` - Enable automatic log formatting
  - `Slog Viewer: Disable` - Disable automatic log formatting
  - `Slog Viewer: Toggle` - Toggle formatting on/off
  - `Slog Viewer: Clear Logs` - Clear all formatted logs
- Configuration options:
  - `slogViewer.enabled` - Enable/disable automatic formatting
  - `slogViewer.collapseJSON` - Show JSON collapsed by default
  - `slogViewer.showOriginal` - Show original JSON alongside formatted output
  - `slogViewer.maxLogEntries` - Maximum log entries to keep in memory
  - `slogViewer.autoScroll` - Auto-scroll to latest logs
  - `slogViewer.theme` - Theme preference (light/dark/auto)

### Features
- Works with any programming language that outputs structured logs:
  - Go (slog)
  - Node.js (pino, winston, bunyan)
  - Python (structlog, python-json-logger)
  - Java/Kotlin (Logback with JSON encoder)
  - Rust (tracing, slog)
  - And many more!
- Preserves original Debug Console output
- Color-coded log levels with badge styling
- Timestamp formatting (HH:mm:ss.ms)
- Duplicate log detection and prevention
- Clean empty state with helpful instructions
