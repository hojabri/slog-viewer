// Get VSCode API
const vscode = acquireVsCodeApi();

// State
let logs = [];
let config = {
    collapseJSON: true,
    showOriginal: false,
    maxLogEntries: 10000,
    autoScroll: true,
    theme: 'auto'
};

// DOM elements
const logContainer = document.getElementById('logContainer');
const clearBtn = document.getElementById('clearBtn');
const levelFilter = document.getElementById('levelFilter');
const searchInput = document.getElementById('searchInput');

// Initialize
function init() {
    clearBtn.addEventListener('click', handleClear);
    levelFilter.addEventListener('change', handleFilter);
    searchInput.addEventListener('input', debounce(handleSearch, 300));

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

    // Trim if exceeds max
    if (logs.length > config.maxLogEntries) {
        logs.shift();
        // Remove first log element from DOM
        const firstLog = logContainer.querySelector('.log-entry');
        if (firstLog) {
            firstLog.remove();
        }
    }

    // Hide empty state
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Create and append log element
    const logElement = createLogElement(log, logs.length - 1);
    logContainer.appendChild(logElement);

    // Auto-scroll to bottom
    if (config.autoScroll) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// Create log element
function createLogElement(log, index) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.level.toLowerCase()}`;
    entry.dataset.index = index;
    entry.dataset.level = log.level.toLowerCase();

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
    level.className = `log-level ${log.level.toLowerCase()}`;
    level.textContent = log.level;

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
        span.className = 'json-string';
        span.textContent = `"${value}"`;
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
    config = { ...config, ...newConfig };
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
