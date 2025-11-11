# Testing the Slog Viewer Extension

## Step-by-Step Test Instructions

### 1. Launch the Extension (Development Mode)

In the current VSCode/Cursor window:
- Open the slog-viewer folder
- Press **F5** or go to Run → Start Debugging
- Select **"Run Extension"** from the debug dropdown
- A new window titled **"[Extension Development Host]"** will open

**Expected**: You should see "Slog Viewer extension is now active" in the Debug Console

### 2. Test with the Sample App

In the **NEW Extension Development Host window**:

1. Open the slog-viewer folder (File → Open Folder)
2. Go to Run and Debug panel (Ctrl+Shift+D / Cmd+Shift+D)
3. Select **"Test App (Node.js)"** from the dropdown
4. Press **F5** to debug the test app

**Expected**:
- The test app runs and outputs JSON logs
- A new output channel called **"Slog Viewer"** appears in the Output panel
- Logs are formatted with colors and structure

### 3. View the Formatted Logs

1. Open the Output panel (View → Output or Ctrl+Shift+U)
2. In the dropdown at the top-right, select **"Slog Viewer"**
3. You should see formatted logs like:

```
[2025-11-05T...] Application started [INFO]
{
  "port": 8080,
  "env": "development"
}

[2025-11-05T...] Failed to connect to external API [ERROR]
{
  "error": "Connection timeout",
  "url": "https://api.example.com",
  "attemptNumber": 3
}
```

## Troubleshooting

### "Slog Viewer" output channel doesn't appear
- Make sure you're running the test app in the Extension Development Host window
- Check that the extension is enabled (Command Palette → "Slog Viewer: Enable")
- Verify the test app is outputting JSON logs to stdout

### No colors in output
- ANSI colors require VSCode 1.80.0+
- Check settings: `slogViewer.colorizeOutput` should be `true`

### Original Debug Console still shows raw JSON
- This is expected behavior due to VSCode API limitations
- The formatted logs appear in the separate "Slog Viewer" output channel
- Both views are available: raw in Debug Console, formatted in Slog Viewer

## Testing with Your Own Application

To test with your own Go/Node.js/Python application:

1. Ensure your app outputs JSON logs to stdout/stderr
2. Create a launch configuration in `.vscode/launch.json`:

```json
{
  "name": "My App",
  "type": "node", // or "go", "python", etc.
  "request": "launch",
  "program": "${workspaceFolder}/my-app.js",
  "console": "integratedTerminal",
  "outputCapture": "std"
}
```

3. Start debugging your app
4. Check the "Slog Viewer" output channel

## Common JSON Log Formats Supported

### Go (slog)
```json
{"time":"2025-11-05T10:00:00Z","level":"INFO","msg":"Server started","port":8080}
```

### Node.js (Pino)
```json
{"level":30,"time":1699185600000,"msg":"Server started","port":8080}
```

### Python (structlog)
```json
{"event":"Server started","level":"info","timestamp":"2025-11-05T10:00:00Z","port":8080}
```

The extension automatically detects these formats and extracts the relevant fields.
