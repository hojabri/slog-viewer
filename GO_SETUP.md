# Setting Up Go Applications for Slog Viewer

## Problem

Your Go application's logs are showing up incorrectly because they're using console/text format with ANSI colors instead of JSON format.

Example of what you're seeing:
```
⏱️ 90m[2025-11-05T17:12:34.941194+01:00]❌ 37m error initialising Monolith shard connection
```

This happens because:
1. The logs contain ANSI escape codes (`\u001b[90m`, `\u001b[37m`, etc.)
2. They're in text format, not JSON
3. The Debug Adapter Protocol may be fragmenting the output

## Solution: Configure Go to Output JSON Logs

### Option 1: Using Go's `slog` (Go 1.21+)

```go
package main

import (
    "log/slog"
    "os"
)

func main() {
    // Create JSON handler
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelDebug,
    }))

    // Set as default logger
    slog.SetDefault(logger)

    // Use it
    slog.Info("Server started", "port", 8080, "env", "production")
    slog.Error("Connection failed", "error", "timeout", "retry", 3)
}
```

**Output:**
```json
{"time":"2025-11-05T10:00:00Z","level":"INFO","msg":"Server started","port":8080,"env":"production"}
{"time":"2025-11-05T10:00:01Z","level":"ERROR","msg":"Connection failed","error":"timeout","retry":3}
```

### Option 2: Using `zerolog`

```go
package main

import (
    "os"
    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
)

func main() {
    // Set zerolog to use JSON output (instead of console)
    log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

    // Use it
    log.Info().Int("port", 8080).Str("env", "production").Msg("Server started")
    log.Error().Str("error", "timeout").Int("retry", 3).Msg("Connection failed")
}
```

**Output:**
```json
{"level":"info","time":"2025-11-05T10:00:00Z","port":8080,"env":"production","message":"Server started"}
{"level":"error","time":"2025-11-05T10:00:01Z","error":"timeout","retry":3,"message":"Connection failed"}
```

### Option 3: Using `logrus`

```go
package main

import (
    "github.com/sirupsen/logrus"
)

func main() {
    // Set logrus to JSON format
    logrus.SetFormatter(&logrus.JSONFormatter{})

    // Use it
    logrus.WithFields(logrus.Fields{
        "port": 8080,
        "env":  "production",
    }).Info("Server started")

    logrus.WithFields(logrus.Fields{
        "error": "timeout",
        "retry": 3,
    }).Error("Connection failed")
}
```

**Output:**
```json
{"level":"info","msg":"Server started","port":8080,"env":"production","time":"2025-11-05T10:00:00Z"}
{"level":"error","error":"timeout","msg":"Connection failed","retry":3,"time":"2025-11-05T10:00:01Z"}
```

## Switching Between Console and JSON Output

If you want console output for development and JSON for production:

### Using `slog`:

```go
package main

import (
    "log/slog"
    "os"
)

func main() {
    var handler slog.Handler

    if os.Getenv("LOG_FORMAT") == "json" {
        handler = slog.NewJSONHandler(os.Stdout, nil)
    } else {
        handler = slog.NewTextHandler(os.Stdout, nil)
    }

    logger := slog.New(handler)
    slog.SetDefault(logger)

    slog.Info("Application started")
}
```

Then run with:
```bash
LOG_FORMAT=json go run main.go
```

Or in your VSCode `launch.json`:

```json
{
    "name": "Launch Go App (JSON logs)",
    "type": "go",
    "request": "launch",
    "mode": "debug",
    "program": "${workspaceFolder}",
    "env": {
        "LOG_FORMAT": "json"
    },
    "console": "integratedTerminal",
    "outputCapture": "std"
}
```

### Using `zerolog`:

```go
package main

import (
    "os"
    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
)

func main() {
    if os.Getenv("LOG_FORMAT") == "console" {
        log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
    } else {
        log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
    }

    log.Info().Msg("Application started")
}
```

## Verifying JSON Output

Run your application and check that logs are valid JSON:

```bash
go run main.go | head -1 | jq .
```

If `jq` can parse it, it's valid JSON and the Slog Viewer extension will work!

## Common Issues

### Issue: Logs still showing with ANSI codes

**Problem:** Your logging library is outputting console format with colors.

**Solution:** Make sure you're using the JSON handler/formatter, not console/text format.

### Issue: Logs are fragmented

**Problem:** The Debug Adapter Protocol may split output across multiple messages.

**Solution:** The extension now handles this by buffering and reassembling. Make sure you're using the latest version.

### Issue: Some logs don't appear

**Problem:** Not all output goes to stdout (some might go to stderr or different channels).

**Solution:** The extension captures both stdout and stderr. Make sure your logger writes to one of these.

## Testing

After configuring JSON output, test with the test app:

```bash
# In the extension development host window
# Run your Go application with F5
# Check the "Slog Viewer" output channel
```

You should see nicely formatted logs with colors!
