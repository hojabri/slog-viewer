// Get VSCode API
const vscode = acquireVsCodeApi();

// Maximum number of logs to keep in memory and DOM
const MAX_LOGS = 5000;

// State
let logs = [];
let config = {
    collapseJSON: true,
    showOriginal: false,
    autoScroll: true,
    theme: 'auto'
};

// Runtime auto-scroll state (can be paused independently of config)
let autoScrollActive = true;

// Scroll detection constants
const SCROLL_THRESHOLD = 20; // pixels from bottom to consider "at bottom"
let scrollDebounceTimeout;

// DOM elements
const logContainer = document.getElementById('logContainer');
const clearBtn = document.getElementById('clearBtn');
const levelFilter = document.getElementById('levelFilter');
const searchInput = document.getElementById('searchInput');

// Check if scrolled to bottom (within threshold)
function isScrolledToBottom() {
    const { scrollTop, scrollHeight, clientHeight } = logContainer;
    return (scrollHeight - scrollTop - clientHeight) <= SCROLL_THRESHOLD;
}

// Handle scroll events with debouncing
function handleScroll() {
    clearTimeout(scrollDebounceTimeout);
    scrollDebounceTimeout = setTimeout(() => {
        if (!config.autoScroll) return;

        const isAtBottom = isScrolledToBottom();

        if (!isAtBottom && autoScrollActive) {
            autoScrollActive = false;
            updateAutoScrollButton();
        } else if (isAtBottom && !autoScrollActive) {
            autoScrollActive = true;
            updateAutoScrollButton();
        }
    }, 100);
}

// Handle auto-scroll button click
function handleAutoScrollClick() {
    autoScrollActive = true;
    logContainer.scrollTop = logContainer.scrollHeight;
    updateAutoScrollButton();
}

// Update auto-scroll button visual state
function updateAutoScrollButton() {
    const btn = document.getElementById('autoScrollBtn');
    const icon = btn.querySelector('.icon');

    if (!config.autoScroll) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'flex';

    if (autoScrollActive) {
        btn.classList.remove('paused');
        btn.classList.add('active');
        btn.title = 'Auto-scroll is active';
        icon.textContent = '⏬';
    } else {
        btn.classList.remove('active');
        btn.classList.add('paused');
        btn.title = 'Auto-scroll paused - click to resume';
        icon.textContent = '⬇️';
    }
}

// Initialize
function init() {
    clearBtn.addEventListener('click', handleClear);
    levelFilter.addEventListener('change', handleFilter);
    searchInput.addEventListener('input', debounce(handleSearch, 300));

    // Auto-scroll button and scroll detection
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    autoScrollBtn.addEventListener('click', handleAutoScrollClick);
    logContainer.addEventListener('scroll', handleScroll, { passive: true });
    updateAutoScrollButton();

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });
}

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'addLog':
            addLog(message.log);
            break;
        case 'clearLogs':
            clearLogs();
            break;
        case 'updateConfig':
            updateConfig(message.config);
            break;
    }
});

// Add a log entry
function addLog(log) {
    logs.push(log);

    // Hide empty state
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Create and append log element
    const logElement = createLogElement(log, logs.length - 1);
    logContainer.appendChild(logElement);

    // Remove old logs if we exceed the limit
    while (logs.length > MAX_LOGS) {
        logs.shift();
        const firstEntry = logContainer.querySelector('.log-entry');
        if (firstEntry) {
            firstEntry.remove();
        }
    }

    // Re-index remaining entries after eviction
    if (logs.length === MAX_LOGS) {
        reindexLogEntries();
    }

    // Smart auto-scroll: only scroll if enabled AND active
    if (config.autoScroll && autoScrollActive) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// Re-index log entries after old ones are removed
function reindexLogEntries() {
    const entries = logContainer.querySelectorAll('.log-entry');
    entries.forEach((entry, index) => {
        entry.dataset.index = index;
    });
}

// Create log element
function createLogElement(log, index) {
    const entry = document.createElement('div');
    const levelClass = log.level ? log.level.toLowerCase() : '';
    entry.className = `log-entry ${levelClass}`;
    entry.dataset.index = index;
    entry.dataset.level = levelClass;

    // Header
    const header = document.createElement('div');
    header.className = 'log-header';

    // Only add collapse icon if there are other fields to display
    const hasOtherFields = log.otherFields && Object.keys(log.otherFields).length > 0;

    if (hasOtherFields) {
        const collapseIcon = document.createElement('span');
        collapseIcon.className = config.collapseJSON ? 'collapse-icon collapsed' : 'collapse-icon';
        collapseIcon.textContent = '▼';
        header.appendChild(collapseIcon);
    }

    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = formatTimestamp(log.timestamp);

    const level = document.createElement('span');
    level.className = `log-level ${levelClass}`;
    level.textContent = log.level || 'LOG';

    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = log.message;

    header.appendChild(timestamp);
    header.appendChild(level);
    header.appendChild(message);

    // Only add toggle collapse handler if there are fields to expand
    if (hasOtherFields) {
        header.addEventListener('click', () => {
            const body = entry.querySelector('.log-body');
            const icon = entry.querySelector('.collapse-icon');

            if (body.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                icon.classList.remove('collapsed');
                // Pause auto-scroll when user expands a log entry
                if (autoScrollActive) {
                    autoScrollActive = false;
                    updateAutoScrollButton();
                }
            } else {
                body.classList.add('collapsed');
                icon.classList.add('collapsed');
            }
        });
    }

    entry.appendChild(header);

    // Body (JSON fields)
    const body = document.createElement('div');
    body.className = config.collapseJSON ? 'log-body collapsed' : 'log-body';

    if (log.otherFields && Object.keys(log.otherFields).length > 0) {
        body.appendChild(createJSONElement(log.otherFields));
    }

    entry.appendChild(body);

    // Original JSON (if enabled)
    if (config.showOriginal) {
        const original = document.createElement('div');
        original.className = 'log-original';

        const originalHeader = document.createElement('div');
        originalHeader.className = 'log-original-header';
        originalHeader.textContent = 'Original:';

        const originalContent = document.createElement('pre');
        originalContent.textContent = JSON.stringify({
            time: log.timestamp,
            level: log.level,
            message: log.message,
            ...log.otherFields
        }, null, 2);

        original.appendChild(originalHeader);
        original.appendChild(originalContent);
        entry.appendChild(original);
    }

    return entry;
}

// Create JSON element with syntax highlighting
function createJSONElement(obj, indent = 0) {
    const container = document.createElement('div');

    if (Object.keys(obj).length === 0) {
        const line = document.createElement('div');
        line.className = 'json-line';
        line.style.paddingLeft = `${indent * 16}px`;

        const punct = document.createElement('span');
        punct.className = 'json-punctuation';
        punct.textContent = '{}';
        line.appendChild(punct);

        container.appendChild(line);
        return container;
    }

    // Opening brace
    const openLine = document.createElement('div');
    openLine.className = 'json-line';
    openLine.style.paddingLeft = `${indent * 16}px`;
    const openPunct = document.createElement('span');
    openPunct.className = 'json-punctuation';
    openPunct.textContent = '{';
    openLine.appendChild(openPunct);
    container.appendChild(openLine);

    // Fields
    const entries = Object.entries(obj);
    entries.forEach(([key, value], index) => {
        const line = document.createElement('div');
        line.className = 'json-line';
        line.style.paddingLeft = `${(indent + 1) * 16}px`;

        // Key
        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = `"${key}"`;
        line.appendChild(keySpan);

        // Colon
        const colonSpan = document.createElement('span');
        colonSpan.className = 'json-punctuation';
        colonSpan.textContent = ': ';
        line.appendChild(colonSpan);

        // Value
        const valueSpan = createValueElement(value);
        line.appendChild(valueSpan);

        // Comma
        if (index < entries.length - 1) {
            const commaSpan = document.createElement('span');
            commaSpan.className = 'json-punctuation';
            commaSpan.textContent = ',';
            line.appendChild(commaSpan);
        }

        container.appendChild(line);
    });

    // Closing brace
    const closeLine = document.createElement('div');
    closeLine.className = 'json-line';
    closeLine.style.paddingLeft = `${indent * 16}px`;
    const closePunct = document.createElement('span');
    closePunct.className = 'json-punctuation';
    closePunct.textContent = '}';
    closeLine.appendChild(closePunct);
    container.appendChild(closeLine);

    return container;
}

// Regex to detect file paths with optional line number (e.g., /path/to/file.go:123 or C:\path\file.ts:45)
const FILE_PATH_REGEX = /^((?:\/[^/:*?"<>|]+)+\.[a-zA-Z0-9]+|[A-Z]:\\(?:[^\\/:*?"<>|]+\\)*[^\\/:*?"<>|]+\.[a-zA-Z0-9]+)(?::(\d+))?$/;

// Check if a string looks like a file path
function parseFilePath(value) {
    if (typeof value !== 'string') return null;

    const match = value.match(FILE_PATH_REGEX);
    if (match) {
        return {
            filePath: match[1],
            line: match[2] ? parseInt(match[2], 10) : undefined
        };
    }
    return null;
}

// Create value element with proper styling
function createValueElement(value) {
    const span = document.createElement('span');

    if (value === null) {
        span.className = 'json-null';
        span.textContent = 'null';
    } else if (typeof value === 'boolean') {
        span.className = 'json-boolean';
        span.textContent = value.toString();
    } else if (typeof value === 'number') {
        span.className = 'json-number';
        span.textContent = value.toString();
    } else if (typeof value === 'string') {
        // Check if this is a file path
        const fileInfo = parseFilePath(value);
        if (fileInfo) {
            span.className = 'json-string json-file-link';
            span.textContent = `"${value}"`;
            span.title = 'Click to open file';
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({
                    type: 'openFile',
                    filePath: fileInfo.filePath,
                    line: fileInfo.line
                });
            });
        } else {
            span.className = 'json-string';
            span.textContent = `"${value}"`;
        }
    } else if (Array.isArray(value)) {
        span.className = 'json-string';
        span.textContent = JSON.stringify(value);
    } else if (typeof value === 'object') {
        span.className = 'json-string';
        span.textContent = JSON.stringify(value);
    } else {
        span.textContent = String(value);
    }

    return span;
}

// Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    try {
        const date = new Date(timestamp);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ms = String(date.getMilliseconds()).padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${ms}`;
    } catch {
        return timestamp;
    }
}

// Handle clear button
function handleClear() {
    clearLogs();
    vscode.postMessage({ type: 'clearLogs' });
}

// Clear all logs
function clearLogs() {
    logs = [];
    logContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>No logs yet</p>
            <small>Start debugging to see formatted logs</small>
        </div>
    `;
    // Reset auto-scroll state
    autoScrollActive = true;
    updateAutoScrollButton();
}

// Handle level filter
function handleFilter() {
    const level = levelFilter.value;
    const searchText = searchInput.value;
    applyFilters(level, searchText);
}

// Handle search
function handleSearch() {
    const level = levelFilter.value;
    const searchText = searchInput.value;
    applyFilters(level, searchText);
}

// Apply filters
function applyFilters(level, searchText) {
    const logEntries = logContainer.querySelectorAll('.log-entry');

    logEntries.forEach(entry => {
        const logLevel = entry.dataset.level;
        const logIndex = parseInt(entry.dataset.index);
        const log = logs[logIndex];

        if (!log) {
            entry.classList.add('hidden');
            return;
        }

        // Level filter
        const levelMatch = level === 'all' || logLevel === level.toLowerCase();

        // Search filter
        let searchMatch = true;
        if (searchText && searchText.trim()) {
            const search = searchText.toLowerCase();
            const messageMatch = log.message.toLowerCase().includes(search);
            const fieldsMatch = JSON.stringify(log.otherFields).toLowerCase().includes(search);
            searchMatch = messageMatch || fieldsMatch;
        }

        // Show/hide based on filters
        if (levelMatch && searchMatch) {
            entry.classList.remove('hidden');
        } else {
            entry.classList.add('hidden');
        }
    });
}

// Update configuration
function updateConfig(newConfig) {
    const wasAutoScrollEnabled = config.autoScroll;
    config = { ...config, ...newConfig };

    // If user enables auto-scroll in settings, also activate runtime state
    if (!wasAutoScrollEnabled && config.autoScroll) {
        autoScrollActive = true;
    }
    updateAutoScrollButton();
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize on load
init();
