# Change Log

All notable changes to the "Slog Viewer" extension will be documented in this file.

## [1.5.1] - 2026-03-17

### Fixed
- Explorer context menu items no longer appear at the top of the menu (Issue #13)
- Context menu now only shows for relevant file types (`.log`, `.json`, `.jsonl`, `.txt`, `.ndjson`)

### Changed
- Renamed "Open Log File" to "Open in Slog Viewer" for clarity
- Renamed "Watch Log File (Live Tail)" to "Watch in Slog Viewer (Live Tail)" for clarity

## [1.4.0] - 2026-03-09

### Added
- **Export Logs**: Export filtered/visible logs to clipboard or file in JSON, CSV, or text format
- Toolbar export button with VS Code native QuickPick for format and destination selection
- Right-click context menu on log entries for quick copy/save access
- New commands: `Slog Viewer: Copy Logs to Clipboard` and `Slog Viewer: Save Logs to File`

## [1.3.0] - 2026-03-09

### Added
- **Open Log Files**: View any structured log file (JSON/logfmt) directly in the Slog Viewer panel
- **Live Tail (Watch Mode)**: Monitor log files in real time with automatic detection of new entries and log rotation
- **Explorer Context Menu**: Right-click any file to open or watch it in Slog Viewer
- New commands: `Slog Viewer: Open Log File` and `Slog Viewer: Watch Log File (Live Tail)`

### Changed
- Extracted shared `processLogLine()` helper to eliminate duplicate parsing logic across debug adapter, task, and file log sources
- Added bounded session log storage (FIFO eviction at 5000 entries) to prevent unbounded memory growth

## [1.2.0] - 2026-02-17

### Added
- **VS Code Task support**: Run commands with `"type": "slogViewer"` in `tasks.json` to capture structured logs in the Slog Viewer panel while preserving terminal output
- Task properties: `command`, `args`, `cwd`, `env` with VS Code variable substitution support

## [1.1.3] - 2026-01-26

### Added
- **ECS (Elastic Common Schema) log format support**: Automatically detects and parses ECS-formatted logs alongside JSON and logfmt

## [1.1.2] - 2025-12-30

### Fixed
- Fixed escaped quotes in logfmt string value parsing (Issue #1)
- Fixed escaped backslashes in logfmt path values

## [1.1.1] - 2025-12-01

### Changed
- Enhanced views configuration in `package.json`
- Removed auto version bump from publish workflow

## [1.1.0] - 2025-12-01

### Added
- **Multi-session debug support**: Debug multiple services simultaneously in the same VSCode window
- Session selector dropdown that appears automatically when multiple debug sessions are active
- Per-session log storage: logs from each debug session are kept separately
- Per-session filter state: each session maintains its own level filter, search text, and advanced filters
- Background log collection: logs continue accumulating in non-active sessions while viewing another session

### Changed
- Logs are no longer cleared when starting a new debug session
- Clear button now only clears the current session's logs
- Session selector shows "(ended)" suffix for terminated debug sessions

## [1.0.5] - 2025-01-30

### Changed
- Refactored toolbar and search components with SVG icons for better visual appearance
- Enhanced styling and added clear search functionality
- Removed development files from repository for cleaner distribution

### Fixed
- Fixed GitHub Actions detached HEAD error by specifying branch ref

## [1.0.4] - 2025-01-29

### Changed
- CI/CD improvements for automated publishing

## [1.0.3] - 2025-01-28

### Changed
- Updated GitHub Actions workflow to use Personal Access Token for improved permissions
- Enhanced workflow to automatically bump version after publishing

## [1.0.2] - 2025-01-27

### Changed
- Added workflow_dispatch trigger for manual publishing
- Updated Node.js version in CI from 18 to 20

## [1.0.1] - 2025-01-26

### Added
- Webview panel interface replacing output channel for better log viewing
- Advanced filtering capabilities with filter builder
- Context menu for log entries
- Auto-scroll feature with toggle button
- File opening functionality from log entries
- Log management improvements

### Changed
- Removed command toggles (enable/disable) in favor of automatic display
- Updated configuration properties for raw JSON display
- Enhanced theme handling in webview
- Improved README with demo image and usage instructions

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
