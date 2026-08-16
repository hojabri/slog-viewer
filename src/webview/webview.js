// Get VSCode API
const vscode = acquireVsCodeApi();

// Maximum number of logs to keep in memory and DOM per session
const MAX_LOGS = 5000;

// State
let config = {
    collapseJSON: true,
    showRawJSON: false,
    autoScroll: true,
    theme: 'auto',
    messageMaxLength: 200
};

// Session management
// Each session stores: { info: SessionInfo, logs: ParsedLog[], filters: FilterState }
// FilterState: { selectedLevels: Set<string>, searchText: string, activeFilters: [], availableFields: Set }
let sessions = new Map();
let currentSessionId = null;

// Runtime auto-scroll state (can be paused independently of config)
let autoScrollActive = true;

// In-place "Show Surrounding" state: while active, filters are temporarily
// suppressed so the target log can be revealed inside the main list.
let contextViewActive = false;
let autoScrollWasActive = true;

// Advanced filter state
let activeFilters = [];  // Array of FilterCondition objects
let availableFields = new Set(['message', 'level']);  // Discovered fields from logs
let filterIdCounter = 0;  // For generating unique filter IDs
// { field, value, fileInfo?, logIndex? } — fileInfo is only set when right-clicking JSON lines containing file paths
// logIndex is set when right-clicking on a log entry header (for Show Surrounding)
let contextMenuTarget = null;

/** @type {WeakMap<object, Set<string>>} Tracks expanded JSON paths per log object across DOM rebuilds. */
const expandedJsonPathsByLog = new WeakMap();

const {
    appendJsonPath,
    getValueAtOtherFieldsPath
} = globalThis.SlogViewerPathUtils;

// Filter operators
const FILTER_OPERATORS = {
    contains: (fieldValue, filterValue) =>
        String(fieldValue).toLowerCase().includes(filterValue.toLowerCase()),
    not_contains: (fieldValue, filterValue) =>
        !String(fieldValue).toLowerCase().includes(filterValue.toLowerCase()),
    equals: (fieldValue, filterValue) =>
        String(fieldValue).toLowerCase() === filterValue.toLowerCase(),
    not_equals: (fieldValue, filterValue) =>
        String(fieldValue).toLowerCase() !== filterValue.toLowerCase()
};

// Scroll detection constants
const SCROLL_THRESHOLD = 20; // pixels from bottom to consider "at bottom"
let scrollDebounceTimeout;

// DOM elements
const logContainer = document.getElementById('logContainer');
const clearBtn = document.getElementById('clearBtn');
const levelFilterBtn = document.getElementById('levelFilterBtn');
const levelFilterPanel = document.getElementById('levelFilterPanel');
const searchInput = document.getElementById('searchInput');

// Selected log levels (lowercase). Empty set = show all levels.
let selectedLevels = new Set();

const LEVEL_LABELS = { error: 'Error', warn: 'Warn', info: 'Info', debug: 'Debug', trace: 'Trace' };

// Whether the current level selection hides the given log
function logHiddenByLevel(level) {
    return selectedLevels.size > 0 && !selectedLevels.has(level);
}

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

    if (!config.autoScroll) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'flex';

    if (autoScrollActive) {
        btn.classList.remove('paused');
        btn.classList.add('active');
        btn.title = 'Auto-scroll enabled';
    } else {
        btn.classList.remove('active');
        btn.classList.add('paused');
        btn.title = 'Auto-scroll paused - click to resume';
    }
}

// Initialize
function init() {
    clearBtn.addEventListener('click', handleClear);
    initLevelFilter();
    searchInput.addEventListener('input', debounce(handleSearchWithClearBtn, 300));

    // Search clear button
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    clearSearchBtn.addEventListener('click', handleClearSearch);

    // Session selector
    const sessionSelect = document.getElementById('sessionSelect');
    sessionSelect.addEventListener('change', handleSessionChange);

    // Auto-scroll button and scroll detection
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    autoScrollBtn.addEventListener('click', handleAutoScrollClick);
    logContainer.addEventListener('scroll', handleScroll, { passive: true });
    updateAutoScrollButton();

    // Initialize advanced filtering
    initContextMenu();
    initFilterBuilder();

    // Context view banner restore button
    const contextBannerRestore = document.getElementById('contextBannerRestore');
    if (contextBannerRestore) {
        contextBannerRestore.addEventListener('click', exitContextView);
    }

    // Apply initial theme (will be updated when config is received)
    applyTheme(config.theme);

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });
}

// Handle search with clear button visibility
function handleSearchWithClearBtn() {
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if (searchInput.value) {
        clearSearchBtn.style.display = 'flex';
    } else {
        clearSearchBtn.style.display = 'none';
    }
    handleSearch();
}

// Handle clear search button
function handleClearSearch() {
    searchInput.value = '';
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    clearSearchBtn.style.display = 'none';
    handleSearch();
    searchInput.focus();
}

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'addLog':
            addLogToSession(message.sessionId, message.log);
            break;
        case 'replaceSessionLogs':
            replaceSessionLogs(message.sessionId, message.logs);
            break;
        case 'clearLogs':
            clearCurrentSessionLogs();
            break;
        case 'updateConfig':
            updateConfig(message.config);
            break;
        case 'setSessions':
            updateSessions(message.sessions, message.currentSessionId);
            break;
        case 'requestFormattedLogs':
            handleRequestFormattedLogs(message.format, message.destination);
            break;
    }
});

// ============================================
// SESSION MANAGEMENT FUNCTIONS
// ============================================

// Create default filter state for a new session
function createDefaultFilterState() {
    return {
        selectedLevels: new Set(),
        searchText: '',
        activeFilters: [],
        availableFields: new Set(['message', 'level']),
        filterIdCounter: 0
    };
}

// Update sessions from extension
function updateSessions(sessionInfos, newCurrentSessionId) {
    // Update session info (but keep existing logs and filters)
    for (const info of sessionInfos) {
        if (!sessions.has(info.id)) {
            sessions.set(info.id, {
                info,
                logs: [],
                filters: createDefaultFilterState()
            });
        } else {
            sessions.get(info.id).info = info;
        }
    }

    // Remove sessions that no longer exist
    const validIds = new Set(sessionInfos.map(s => s.id));
    for (const id of sessions.keys()) {
        if (!validIds.has(id)) {
            sessions.delete(id);
        }
    }

    // Update current session
    const oldSessionId = currentSessionId;

    // Save current session's filter state before switching
    if (oldSessionId && sessions.has(oldSessionId)) {
        saveCurrentFilterState(oldSessionId);
    }

    currentSessionId = newCurrentSessionId;

    // Update session selector UI
    updateSessionSelector();

    // Re-render logs if session changed
    if (oldSessionId !== currentSessionId) {
        // Restore filter state for new session
        if (currentSessionId && sessions.has(currentSessionId)) {
            restoreFilterState(currentSessionId);
        }
        renderCurrentSessionLogs();
    }
}

// Save current filter state to session
function saveCurrentFilterState(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;

    session.filters = {
        selectedLevels: new Set(selectedLevels),
        searchText: searchInput.value,
        activeFilters: [...activeFilters],
        availableFields: new Set(availableFields),
        filterIdCounter: filterIdCounter
    };
}

// Restore filter state from session
function restoreFilterState(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || !session.filters) return;

    const filters = session.filters;

    // Restore UI state
    selectedLevels = new Set(filters.selectedLevels || []);
    syncLevelFilterUI();
    searchInput.value = filters.searchText;

    // Update search clear button visibility
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    clearSearchBtn.style.display = filters.searchText ? 'flex' : 'none';

    // Restore advanced filter state
    activeFilters = [...filters.activeFilters];
    availableFields = new Set(filters.availableFields);
    filterIdCounter = filters.filterIdCounter;

    // Re-render filter chips
    renderFilterChips();
}

// Update the session selector dropdown
function updateSessionSelector() {
    const selector = document.getElementById('sessionSelector');
    const divider = document.getElementById('sessionDivider');
    const select = document.getElementById('sessionSelect');

    if (!selector || !select) return;

    // Show/hide based on session count
    const showSelector = sessions.size > 1;
    selector.classList.toggle('hidden', !showSelector);
    divider.classList.toggle('hidden', !showSelector);

    if (!showSelector) return;

    // Populate dropdown
    select.innerHTML = '';
    for (const [id, session] of sessions) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = session.info.isActive
            ? session.info.name
            : `${session.info.name} (ended)`;
        if (!session.info.isActive) {
            option.classList.add('ended');
        }
        if (id === currentSessionId) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

// Handle session selection change
function handleSessionChange() {
    const select = document.getElementById('sessionSelect');
    if (!select) return;

    const newSessionId = select.value;
    if (newSessionId !== currentSessionId) {
        // Notify extension of session change
        vscode.postMessage({
            type: 'selectSession',
            sessionId: newSessionId
        });
    }
}

// Render logs for the current session
function renderCurrentSessionLogs() {
    // Exit Show Surrounding mode (the DOM is rebuilt; filters are re-applied below)
    exitContextView();
    closeLevelFilterPanel();

    const session = sessions.get(currentSessionId);
    const logs = session ? session.logs : [];

    // Clear container
    logContainer.innerHTML = '';

    if (logs.length === 0) {
        logContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No logs yet</p>
                <small>Start debugging or run a slogViewer task to see formatted logs</small>
            </div>
        `;
        return;
    }

    // Re-create all log elements
    logs.forEach((log, index) => {
        const logElement = createLogElement(log, index);
        logContainer.appendChild(logElement);
    });

    // Re-apply filters
    applyAllFilters();

    // Reset auto-scroll state
    autoScrollActive = true;
    updateAutoScrollButton();

    // Scroll to bottom
    if (config.autoScroll) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// Get logs for the current session
function getCurrentSessionLogs() {
    const session = sessions.get(currentSessionId);
    return session ? session.logs : [];
}

// Add a log entry to a specific session
function addLogToSession(sessionId, log) {
    // Ensure session exists
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            info: { id: sessionId, name: 'Unknown', isActive: true },
            logs: [],
            filters: createDefaultFilterState()
        });
    }

    const session = sessions.get(sessionId);
    session.logs.push(log);

    // Track fields for filter dropdown (for the session's available fields)
    if (log.otherFields) {
        Object.keys(log.otherFields).forEach(key => {
            session.filters.availableFields.add(key);
            // Also update global if this is current session
            if (sessionId === currentSessionId) {
                availableFields.add(key);
            }
        });
    }

    // Only update UI if this is the current session
    if (sessionId === currentSessionId) {
        // Hide empty state
        const emptyState = logContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        // Create and append log element
        const logElement = createLogElement(log, session.logs.length - 1);
        logContainer.appendChild(logElement);

        // Apply filters to newly added log (suppressed while Show Surrounding is active)
        if (!contextViewActive && (!logMatchesAdvancedFilters(log) ||
            logHiddenByLevel(log.level?.toLowerCase()) ||
            (searchInput.value && !((log.message || '').toLowerCase().includes(searchInput.value.toLowerCase()) ||
                                    JSON.stringify(log.otherFields).toLowerCase().includes(searchInput.value.toLowerCase()))))) {
            logElement.classList.add('hidden');
        }

        // Keep the "no logs match" message in sync with the streamed log
        updateNoResultsState();

        // Smart auto-scroll: only scroll if enabled AND active
        if (config.autoScroll && autoScrollActive) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    // Remove old logs if we exceed the limit (for this session)
    while (session.logs.length > MAX_LOGS) {
        session.logs.shift();
        if (sessionId === currentSessionId) {
            const firstEntry = logContainer.querySelector('.log-entry');
            if (firstEntry) {
                firstEntry.remove();
            }
            reindexLogEntries();
        }
    }
}

// Replace all logs for a session. Used when a parsing setting (e.g. field
// aliases) changes and the extension re-parses already-loaded logs.
function replaceSessionLogs(sessionId, logs) {
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            info: { id: sessionId, name: 'Unknown', isActive: true },
            logs: [],
            filters: createDefaultFilterState()
        };
        sessions.set(sessionId, session);
    }

    session.logs = logs;

    // Rebuild the set of fields available for filtering from the new logs.
    const fields = new Set(['message', 'level']);
    logs.forEach(log => {
        if (log.otherFields) {
            Object.keys(log.otherFields).forEach(key => fields.add(key));
        }
    });
    session.filters.availableFields = new Set(fields);

    if (sessionId === currentSessionId) {
        availableFields = new Set(fields);
        renderCurrentSessionLogs();
    }
}

// Clear logs for current session only
function clearCurrentSessionLogs() {
    // Exit Show Surrounding mode (the list is cleared below)
    exitContextView();

    const session = sessions.get(currentSessionId);
    if (session) {
        session.logs = [];
        // Reset this session's filter state
        session.filters = createDefaultFilterState();
    }

    // Reset global filter state (for current session)
    activeFilters = [];
    availableFields = new Set(['message', 'level']);
    filterIdCounter = 0;
    selectedLevels = new Set();
    syncLevelFilterUI();
    searchInput.value = '';
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    clearSearchBtn.style.display = 'none';

    renderFilterChips();

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

// Re-index log entries after old ones are removed
function reindexLogEntries() {
    const entries = logContainer.querySelectorAll('.log-entry');
    entries.forEach((entry, index) => {
        entry.dataset.index = index;
    });
}

// Render the message text into a span, truncating long messages with a
// "Show more"/"Show less" toggle. The context menu still receives the full
// message, so copying is unaffected.
function renderMessageContent(span, text) {
    const fullText = String(text ?? '');
    const max = config.messageMaxLength;

    if (!max || max <= 0 || fullText.length <= max) {
        span.textContent = fullText;
        return;
    }

    // Collapsed preview keeps the message on a single line.
    const collapsedText = fullText.slice(0, max).replace(/\s*\n\s*/g, ' ') + '…';

    const preview = document.createElement('span');
    preview.className = 'log-message-preview';
    preview.textContent = collapsedText;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'log-message-toggle';
    toggle.textContent = 'Show more';

    let expanded = false;
    toggle.addEventListener('click', (e) => {
        // Don't trigger the header's JSON expand/collapse handler.
        e.stopPropagation();
        expanded = !expanded;
        if (expanded) {
            preview.textContent = fullText;
            preview.classList.add('expanded');
            toggle.textContent = 'Show less';
            // Pause auto-scroll so new logs don't push the message away
            // while the user reads it (mirrors the header expand behavior).
            if (autoScrollActive) {
                autoScrollActive = false;
                updateAutoScrollButton();
            }
        } else {
            preview.textContent = collapsedText;
            preview.classList.remove('expanded');
            toggle.textContent = 'Show more';
        }
    });

    span.appendChild(preview);
    span.appendChild(toggle);
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
    message.className = 'log-message filterable';
    renderMessageContent(message, log.message);
    attachContextMenuHandler(message, 'message', log.message || '');

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

    // Right-click on header shows context menu with Show Surrounding option
    header.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenuForLogEntry(e, index, log.message || '');
    });

    entry.appendChild(header);

    // Body (JSON fields)
    const body = document.createElement('div');
    body.className = config.collapseJSON ? 'log-body collapsed' : 'log-body';

    if (log.otherFields && Object.keys(log.otherFields).length > 0) {
        body.appendChild(createJSONElement(log.otherFields, 0, log));
    }

    entry.appendChild(body);

    // Raw JSON (if enabled)
    if (config.showRawJSON) {
        const original = document.createElement('div');
        original.className = 'log-original';

        const originalHeader = document.createElement('div');
        originalHeader.className = 'log-original-header';
        originalHeader.textContent = 'Raw JSON:';

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

/**
 * Create JSON element with syntax highlighting.
 *
 * @param {Record<string, unknown>} obj
 * @param {number} [indent]
 * @param {object | null} [logRef] Parsed log for lazy nested value expansion state
 */
function createJSONElement(obj, indent = 0, logRef = null) {
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
        line.className = 'json-line filterable';
        line.style.paddingLeft = `${(indent + 1) * 16}px`;

        // Right-click handler for filtering by field value
        const displayValue = value === null ? 'null' :
            typeof value === 'object' ? JSON.stringify(value) : String(value);
        const fileInfo = typeof value === 'string' ? parseFilePath(value) : null;
        attachContextMenuHandler(line, key, displayValue, fileInfo);

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

        // Value — pass fileInfo to avoid re-parsing.
        // Build the root path through appendJsonPath so top-level keys containing
        // dots or brackets get quoted, matching how nested paths are built.
        const valueSpan = createValueElement(
            value,
            fileInfo,
            logRef ? { logRef, path: appendJsonPath('', key) } : null
        );
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

// ============================================
// LAZY COLLAPSIBLE JSON (objects / arrays)
// ============================================

/**
 * 
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObjectLike(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * @param {object} logRef
 * @returns {Set<string>}
 */
function getOrCreateExpandedPathSet(logRef) {
    let set = expandedJsonPathsByLog.get(logRef);
    if (!set) {
        set = new Set();
        expandedJsonPathsByLog.set(logRef, set);
    }
    return set;
}

/** @param {object} logRef @param {string} path */
function markJsonPathExpanded(logRef, path) {
    getOrCreateExpandedPathSet(logRef).add(path);
}

/** @param {object} logRef @param {string} path */
function markJsonPathCollapsed(logRef, path) {
    const set = expandedJsonPathsByLog.get(logRef);
    if (set) {
        set.delete(path);
    }
}

/** @param {object} logRef @param {string} path */
function isJsonPathExpanded(logRef, path) {
    const set = expandedJsonPathsByLog.get(logRef);
    return !!set && set.has(path);
}

/**
 * Remove all child nodes from a lazy children container (collapse).
 *
 * @param {HTMLElement} childrenEl
 */
function clearLazyChildren(childrenEl) {
    while (childrenEl.firstChild) {
        childrenEl.removeChild(childrenEl.firstChild);
    }
}

/**
 * Append one level of rows under a collapsible node; closing bracket on its own row.
 *
 * @param {HTMLElement} childrenEl
 * @param {object|unknown[]} value
 * @param {{ logRef: object, path: string }} ctx
 * @param {string} closeCh `}` or `]`
 */
function appendImmediateChildren(childrenEl, value, ctx, closeCh) {
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            const item = value[index];
            const row = document.createElement('div');
            row.className = 'json-lazy-row filterable';
            const childPath = appendJsonPath(ctx.path, index);
            const displayValue = item === null ? 'null' :
                typeof item === 'object' ? JSON.stringify(item) : String(item);
            const fileInfo = typeof item === 'string' ? parseFilePath(item) : null;
            attachContextMenuHandler(row, childPath, displayValue, fileInfo);

            const indexSpan = document.createElement('span');
            indexSpan.className = 'json-key';
            indexSpan.textContent = String(index);
            row.appendChild(indexSpan);

            const colonSpan = document.createElement('span');
            colonSpan.className = 'json-punctuation';
            colonSpan.textContent = ': ';
            row.appendChild(colonSpan);

            row.appendChild(createValueElement(item, fileInfo, { logRef: ctx.logRef, path: childPath }));

            if (index < value.length - 1) {
                const commaSpan = document.createElement('span');
                commaSpan.className = 'json-punctuation';
                commaSpan.textContent = ',';
                row.appendChild(commaSpan);
            }

            childrenEl.appendChild(row);
        }
    } else {
        const entries = Object.entries(value);
        entries.forEach(([key, val], index) => {
            const row = document.createElement('div');
            row.className = 'json-lazy-row filterable';
            const childPath = appendJsonPath(ctx.path, key);
            const displayValue = val === null ? 'null' :
                typeof val === 'object' ? JSON.stringify(val) : String(val);
            const fileInfo = typeof val === 'string' ? parseFilePath(val) : null;
            attachContextMenuHandler(row, childPath, displayValue, fileInfo);

            const keySpan = document.createElement('span');
            keySpan.className = 'json-key';
            keySpan.textContent = `"${key}"`;
            row.appendChild(keySpan);

            const colonSpan = document.createElement('span');
            colonSpan.className = 'json-punctuation';
            colonSpan.textContent = ': ';
            row.appendChild(colonSpan);

            row.appendChild(createValueElement(val, fileInfo, { logRef: ctx.logRef, path: childPath }));

            if (index < entries.length - 1) {
                const commaSpan = document.createElement('span');
                commaSpan.className = 'json-punctuation';
                commaSpan.textContent = ',';
                row.appendChild(commaSpan);
            }

            childrenEl.appendChild(row);
        });
    }

    const closeLine = document.createElement('div');
    closeLine.className = 'json-lazy-row json-lazy-close-row';
    const closePunct = document.createElement('span');
    closePunct.className = 'json-punctuation';
    closePunct.textContent = closeCh;
    closeLine.appendChild(closePunct);
    childrenEl.appendChild(closeLine);
}

/**
 * Build a collapsible object or array viewer (one DOM level at a time).
 *
 * @param {object|unknown[]} value
 * @param {{ logRef: object, path: string }} ctx
 * @returns {HTMLElement}
 */
function buildLazyValueRoot(value, ctx) {
    const root = document.createElement('div');
    root.className = 'json-lazy-value';

    const isArray = Array.isArray(value);
    const openCh = isArray ? '[' : '{';
    const closeCh = isArray ? ']' : '}';

    const header = document.createElement('span');
    header.className = 'json-lazy-header';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'json-lazy-toggle collapse-icon collapsed';
    toggle.textContent = '▼';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = 'Expand or collapse';

    const openPunct = document.createElement('span');
    openPunct.className = 'json-punctuation';
    openPunct.textContent = openCh;

    const suffix = document.createElement('span');
    suffix.className = 'json-lazy-collapsed-suffix';

    const ellipsis = document.createElement('span');
    ellipsis.className = 'json-lazy-ellipsis';
    ellipsis.textContent = ' … ';

    const closePunctSuffix = document.createElement('span');
    closePunctSuffix.className = 'json-punctuation';
    closePunctSuffix.textContent = closeCh;

    const meta = document.createElement('span');
    meta.className = 'json-lazy-meta';
    const count = isArray ? value.length : Object.keys(value).length;
    meta.textContent = isArray
        ? ` ${count} item${count === 1 ? '' : 's'}`
        : ` ${count} key${count === 1 ? '' : 's'}`;

    suffix.appendChild(ellipsis);
    suffix.appendChild(closePunctSuffix);
    suffix.appendChild(meta);

    const childrenEl = document.createElement('div');
    childrenEl.className = 'json-lazy-children hidden';

    header.appendChild(toggle);
    header.appendChild(openPunct);
    header.appendChild(suffix);

    root.appendChild(header);
    root.appendChild(childrenEl);

    const expand = () => {
        clearLazyChildren(childrenEl);
        appendImmediateChildren(childrenEl, value, ctx, closeCh);
        suffix.style.display = 'none';
        childrenEl.classList.remove('hidden');
        toggle.classList.remove('collapsed');
        toggle.setAttribute('aria-expanded', 'true');
        markJsonPathExpanded(ctx.logRef, ctx.path);
    };

    const collapse = () => {
        clearLazyChildren(childrenEl);
        suffix.style.display = '';
        childrenEl.classList.add('hidden');
        toggle.classList.add('collapsed');
        toggle.setAttribute('aria-expanded', 'false');
        markJsonPathCollapsed(ctx.logRef, ctx.path);
    };

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (toggle.getAttribute('aria-expanded') === 'true') {
            collapse();
        } else {
            expand();
        }
    });

    if (isJsonPathExpanded(ctx.logRef, ctx.path)) {
        expand();
    }

    return root;
}

/**
 * Create a styled DOM node for a JSON value (primitives, file links, or lazy object/array).
 *
 * @param {unknown} value
 * @param {unknown} [fileInfo] Pre-parsed file link for strings (avoids duplicate `parseFilePath`)
 * @param {{ logRef: object, path: string } | null} [ctx] When set, plain objects and non-empty arrays render lazily
 * @returns {HTMLElement}
 */
function createValueElement(value, fileInfo, ctx) {
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
        // Use pre-computed fileInfo if available, otherwise parse
        const resolvedFileInfo = fileInfo !== undefined ? fileInfo : parseFilePath(value);
        if (resolvedFileInfo) {
            span.className = 'json-string json-file-link';
            span.textContent = `"${value}"`;
            span.title = 'Click to open file';
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({
                    type: 'openFile',
                    filePath: resolvedFileInfo.filePath,
                    line: resolvedFileInfo.line
                });
            });
        } else {
            span.className = 'json-string';
            span.textContent = `"${value}"`;
        }
    } else if (Array.isArray(value)) {
        if (value.length === 0) {
            span.className = 'json-punctuation';
            span.textContent = '[]';
        } else if (ctx && ctx.logRef) {
            return buildLazyValueRoot(value, ctx);
        } else {
            span.className = 'json-string';
            span.textContent = JSON.stringify(value);
        }
    } else if (typeof value === 'object') {
        if (!isPlainObjectLike(value)) {
            span.className = 'json-string';
            span.textContent = JSON.stringify(value);
        } else if (Object.keys(value).length === 0) {
            span.className = 'json-punctuation';
            span.textContent = '{}';
        } else if (ctx && ctx.logRef) {
            return buildLazyValueRoot(value, ctx);
        } else {
            span.className = 'json-string';
            span.textContent = JSON.stringify(value);
        }
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
    clearCurrentSessionLogs();
    vscode.postMessage({ type: 'clearLogs' });
}


// Handle search
function handleSearch() {
    applyFilters(searchInput.value);
}

// Apply filters (level, search, and advanced filters)
function applyFilters(searchText) {
    const logEntries = logContainer.querySelectorAll('.log-entry');
    const logs = getCurrentSessionLogs();

    // While Show Surrounding is active, filters are temporarily suppressed so the
    // target log (and everything around it) stays visible in the main list.
    if (contextViewActive) {
        logEntries.forEach(entry => entry.classList.remove('hidden'));
        return;
    }

    logEntries.forEach(entry => {
        const logLevel = entry.dataset.level;
        const logIndex = parseInt(entry.dataset.index);
        const log = logs[logIndex];

        if (!log) {
            entry.classList.add('hidden');
            return;
        }

        // Level filter
        const levelMatch = !logHiddenByLevel(logLevel);

        // Search filter
        let searchMatch = true;
        if (searchText && searchText.trim()) {
            const search = searchText.toLowerCase();
            const messageMatch = (log.message || '').toLowerCase().includes(search);
            const fieldsMatch = JSON.stringify(log.otherFields).toLowerCase().includes(search);
            searchMatch = messageMatch || fieldsMatch;
        }

        // Advanced filters
        const advancedMatch = logMatchesAdvancedFilters(log);

        // Show/hide based on all filters
        if (levelMatch && searchMatch && advancedMatch) {
            entry.classList.remove('hidden');
        } else {
            entry.classList.add('hidden');
        }
    });

    // Update no-results state
    updateNoResultsState();
}

// Update configuration
function updateConfig(newConfig) {
    const wasAutoScrollEnabled = config.autoScroll;
    const oldCollapseJSON = config.collapseJSON;
    const oldShowRawJSON = config.showRawJSON;
    const oldTheme = config.theme;
    const oldMessageMaxLength = config.messageMaxLength;

    config = { ...config, ...newConfig };

    // If user enables auto-scroll in settings, also activate runtime state
    if (!wasAutoScrollEnabled && config.autoScroll) {
        autoScrollActive = true;
    }
    updateAutoScrollButton();

    // Apply theme changes
    if (oldTheme !== config.theme) {
        applyTheme(config.theme);
    }

    // Re-render logs if collapseJSON, showRawJSON, or messageMaxLength changed
    if (oldCollapseJSON !== config.collapseJSON ||
        oldShowRawJSON !== config.showRawJSON ||
        oldMessageMaxLength !== config.messageMaxLength) {
        rerenderAllLogs();
    }
}

// Apply theme to document
function applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'auto') {
        // Remove any forced theme, let VSCode theme take over
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', theme);
    }
}

// Re-render all log entries (used when display settings change)
function rerenderAllLogs() {
    // Exit Show Surrounding mode (the DOM is rebuilt; filters are re-applied below)
    exitContextView();

    const logs = getCurrentSessionLogs();

    // Clear the container
    logContainer.innerHTML = '';

    if (logs.length === 0) {
        logContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No logs yet</p>
                <small>Start debugging or run a slogViewer task to see formatted logs</small>
            </div>
        `;
        return;
    }

    // Re-create all log elements
    logs.forEach((log, index) => {
        const logElement = createLogElement(log, index);
        logContainer.appendChild(logElement);
    });

    // Re-apply filters
    applyAllFilters();

    // Restore no-results state if needed
    updateNoResultsState();
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

// ============================================
// ADVANCED FILTERING FUNCTIONS
// ============================================

// Add a new filter
function addFilter(field, operator, value, mode = 'include') {
    const filter = {
        id: `filter-${++filterIdCounter}`,
        field,
        operator,
        value,
        mode,
        enabled: true
    };
    activeFilters.push(filter);
    renderFilterChips();
    applyAllFilters();
}

// Remove a filter by ID
function removeFilter(filterId) {
    activeFilters = activeFilters.filter(f => f.id !== filterId);
    renderFilterChips();
    applyAllFilters();
}

// Toggle filter enabled/disabled
function toggleFilter(filterId) {
    const filter = activeFilters.find(f => f.id === filterId);
    if (filter) {
        filter.enabled = !filter.enabled;
        renderFilterChips();
        applyAllFilters();
    }
}

// Clear all advanced filters
function clearAllAdvancedFilters() {
    activeFilters = [];
    renderFilterChips();
    applyAllFilters();
}

// Check if a log matches all active filters
function logMatchesAdvancedFilters(log) {
    const enabledFilters = activeFilters.filter(f => f.enabled);
    if (enabledFilters.length === 0) return true;

    // Separate include and exclude filters
    const includeFilters = enabledFilters.filter(f => f.mode === 'include');
    const excludeFilters = enabledFilters.filter(f => f.mode === 'exclude');

    // If there are include filters, log must match at least one
    if (includeFilters.length > 0) {
        const matchesInclude = includeFilters.some(filter => matchFilter(log, filter));
        if (!matchesInclude) return false;
    }

    // Log must not match any exclude filter
    for (const filter of excludeFilters) {
        if (matchFilter(log, filter)) {
            return false;
        }
    }

    return true;
}

// Check if a log matches a single filter
function matchFilter(log, filter) {
    const { field, operator, value } = filter;

    let fieldValue;
    if (field === 'message') {
        fieldValue = log.message || '';
    } else if (field === 'level') {
        fieldValue = log.level || '';
    } else {
        fieldValue = getValueAtOtherFieldsPath(log.otherFields, field);
        if (fieldValue === undefined) {
            fieldValue = log.otherFields?.[field];
        }
        if (fieldValue === undefined || fieldValue === null) return false;
    }

    const operatorFn = FILTER_OPERATORS[operator];
    return operatorFn ? operatorFn(fieldValue, value) : false;
}

// Get field value from log (for display purposes)
function getFieldValue(log, field) {
    if (field === 'message') return log.message || '';
    if (field === 'level') return log.level || '';
    const nested = getValueAtOtherFieldsPath(log.otherFields, field);
    if (nested !== undefined) {
        return typeof nested === 'object' ? JSON.stringify(nested) : String(nested);
    }
    return log.otherFields?.[field] ?? '';
}

// Apply all filters (level, search, and advanced)
function applyAllFilters() {
    applyFilters(searchInput.value);
}

// Render filter chips in the filter area
function renderFilterChips() {
    const container = document.getElementById('filterChips');
    const addBtn = document.getElementById('addFilterBtn');
    const filterArea = document.getElementById('filterArea');

    if (!container) return;

    // Clear existing chips (except add button)
    container.querySelectorAll('.filter-chip').forEach(chip => chip.remove());

    // Add chips before the "Add Filter" button
    activeFilters.forEach(filter => {
        const chip = createFilterChip(filter);
        container.insertBefore(chip, addBtn);
    });

    // Show/hide filter area based on whether filters exist or filter builder is open
    const filterBuilder = document.getElementById('filterBuilder');
    const hasFilters = activeFilters.length > 0;
    const builderOpen = filterBuilder && !filterBuilder.classList.contains('hidden');
    filterArea.classList.toggle('hidden', !hasFilters && !builderOpen);

    // Update field dropdown with discovered fields
    updateFieldDropdown();

    // Update no-results state
    updateNoResultsState();
}

// Create a filter chip element
function createFilterChip(filter) {
    const chip = document.createElement('div');
    chip.className = `filter-chip ${filter.mode} ${filter.enabled ? '' : 'disabled'}`;
    chip.dataset.filterId = filter.id;

    const operatorDisplay = {
        contains: '~',
        not_contains: '!~',
        equals: '=',
        not_equals: '!='
    };

    const modeIcon = filter.mode === 'include' ? '+' : '-';
    const truncatedValue = filter.value.length > 20 ? filter.value.substring(0, 20) + '...' : filter.value;

    chip.innerHTML = `
        <span class="chip-icon">${modeIcon}</span>
        <span class="chip-field">${escapeHtml(filter.field)}</span>
        <span class="chip-operator">${operatorDisplay[filter.operator]}</span>
        <span class="chip-value" title="${escapeHtml(filter.value)}">"${escapeHtml(truncatedValue)}"</span>
        <span class="chip-close" title="Remove filter">&times;</span>
    `;

    // Toggle on chip click (not close button)
    chip.addEventListener('click', (e) => {
        if (!e.target.classList.contains('chip-close')) {
            toggleFilter(filter.id);
        }
    });

    // Remove on close button click
    chip.querySelector('.chip-close').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFilter(filter.id);
    });

    return chip;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update field dropdown with discovered fields
function updateFieldDropdown() {
    const select = document.getElementById('filterField');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '';

    // Add standard fields first
    ['message', 'level'].forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        select.appendChild(option);
    });

    // Add discovered fields (sorted)
    const sortedFields = Array.from(availableFields).filter(f => f !== 'message' && f !== 'level').sort();
    sortedFields.forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        select.appendChild(option);
    });

    // Restore selection if possible
    if (currentValue && [...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
    }
}

// Track fields from a log for auto-complete
function trackFieldsFromLog(log) {
    if (log.otherFields) {
        Object.keys(log.otherFields).forEach(key => availableFields.add(key));
    }
}

// Update no-results state
function updateNoResultsState() {
    const logEntries = logContainer.querySelectorAll('.log-entry');
    const visibleCount = Array.from(logEntries).filter(e => !e.classList.contains('hidden')).length;
    const logs = getCurrentSessionLogs();
    const hasLogs = logs.length > 0;

    let noResults = logContainer.querySelector('.no-filter-results');

    if (hasLogs && visibleCount === 0 && (activeFilters.length > 0 || selectedLevels.size > 0 || searchInput.value)) {
        if (!noResults) {
            noResults = document.createElement('div');
            noResults.className = 'no-filter-results';
            noResults.innerHTML = `
                <div class="no-results-icon">🔍</div>
                <p>No logs match your filters</p>
                <button class="btn btn-small" id="clearFiltersBtn">Clear All Filters</button>
            `;
            logContainer.appendChild(noResults);

            document.getElementById('clearFiltersBtn').addEventListener('click', () => {
                clearAllAdvancedFilters();
                selectedLevels = new Set();
                syncLevelFilterUI();
                searchInput.value = '';
                const clearSearchBtn = document.getElementById('clearSearchBtn');
                if (clearSearchBtn) {
                    clearSearchBtn.style.display = 'none';
                }
                applyAllFilters();
            });
        }
    } else if (noResults) {
        noResults.remove();
    }
}

// ============================================
// CONTEXT MENU FUNCTIONS
// ============================================

// Attach a right-click context menu handler to an element
function attachContextMenuHandler(element, field, value, fileInfo) {
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, field, value, fileInfo || null);
    });
}

// Whether any filter (level, search, or advanced) is currently active.
// "Show Surrounding" is hidden from the context menu when there's nothing to
// filter out — revealing the log would just show what's already visible.
function hasActiveFilters() {
    return selectedLevels.size > 0 ||
        (searchInput.value && searchInput.value.trim()) ||
        activeFilters.length > 0;
}

// Show context menu on right-click (field-level: message, JSON fields)
function showContextMenu(e, field, value, fileInfo) {
    // Find the parent log entry to get the log index for Show Surrounding
    const logEntry = e.target.closest('.log-entry');
    const logIndex = logEntry ? parseInt(logEntry.dataset.index, 10) : null;

    contextMenuTarget = { field, value: String(value), fileInfo: fileInfo || null, logIndex: logIndex };

    const menu = document.getElementById('contextMenu');
    menu.classList.remove('hidden');

    // Update menu text with field/value info
    const includeItem = menu.querySelector('[data-action="include"]');
    const excludeItem = menu.querySelector('[data-action="exclude"]');
    const truncatedValue = contextMenuTarget.value.length > 30
        ? contextMenuTarget.value.substring(0, 30) + '...'
        : contextMenuTarget.value;

    includeItem.innerHTML = `<span class="menu-icon">+</span> Include ${escapeHtml(field)} = "${escapeHtml(truncatedValue)}"`;
    excludeItem.innerHTML = `<span class="menu-icon">-</span> Exclude ${escapeHtml(field)} = "${escapeHtml(truncatedValue)}"`;

    // Show/hide "Open file" menu item based on file info
    const openFileItem = document.getElementById('contextMenuOpenFile');
    const fileSeparator = document.getElementById('contextMenuFileSeparator');
    if (openFileItem && fileSeparator) {
        const showFile = !!contextMenuTarget.fileInfo;
        openFileItem.style.display = showFile ? '' : 'none';
        fileSeparator.style.display = showFile ? '' : 'none';
    }

    // Show "Show Surrounding" if we found a parent log entry and there are
    // active filters to suppress (no filters = nothing to reveal)
    const showContext = logIndex != null && hasActiveFilters();
    const viewContextItem = document.getElementById('contextMenuViewContext');
    const contextSeparator = document.getElementById('contextMenuContextSeparator');
    if (viewContextItem) { viewContextItem.style.display = showContext ? '' : 'none'; }
    if (contextSeparator) { contextSeparator.style.display = showContext ? '' : 'none'; }

    positionContextMenu(menu, e);
}

// Show context menu on right-click on a log entry header (includes Show Surrounding)
function showContextMenuForLogEntry(e, logIndex, message) {
    contextMenuTarget = { field: 'message', value: String(message), fileInfo: null, logIndex: logIndex };

    const menu = document.getElementById('contextMenu');
    menu.classList.remove('hidden');

    // Update include/exclude with message field
    const includeItem = menu.querySelector('[data-action="include"]');
    const excludeItem = menu.querySelector('[data-action="exclude"]');
    const truncatedValue = contextMenuTarget.value.length > 30
        ? contextMenuTarget.value.substring(0, 30) + '...'
        : contextMenuTarget.value;

    includeItem.innerHTML = `<span class="menu-icon">+</span> Include message = "${escapeHtml(truncatedValue)}"`;
    excludeItem.innerHTML = `<span class="menu-icon">-</span> Exclude message = "${escapeHtml(truncatedValue)}"`;

    // Hide "Open file" (no file info from header click)
    const openFileItem = document.getElementById('contextMenuOpenFile');
    const fileSeparator = document.getElementById('contextMenuFileSeparator');
    if (openFileItem) { openFileItem.style.display = 'none'; }
    if (fileSeparator) { fileSeparator.style.display = 'none'; }

    // Show "Show Surrounding" only when there are active filters to suppress
    const showContext = hasActiveFilters();
    const viewContextItem = document.getElementById('contextMenuViewContext');
    const contextSeparator = document.getElementById('contextMenuContextSeparator');
    if (viewContextItem) { viewContextItem.style.display = showContext ? '' : 'none'; }
    if (contextSeparator) { contextSeparator.style.display = showContext ? '' : 'none'; }

    positionContextMenu(menu, e);
}

// Position context menu near click, keeping it on screen
function positionContextMenu(menu, e) {
    let x = e.clientX;
    let y = e.clientY;

    // Temporarily show to get dimensions
    menu.style.left = '0px';
    menu.style.top = '0px';
    const actualRect = menu.getBoundingClientRect();

    if (x + actualRect.width > window.innerWidth) {
        x = window.innerWidth - actualRect.width - 10;
    }
    if (y + actualRect.height > window.innerHeight) {
        y = window.innerHeight - actualRect.height - 10;
    }

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

// Hide context menu
function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.classList.add('hidden');
    }
    contextMenuTarget = null;
}

// Handle context menu action
function handleContextMenuAction(action) {
    if (!contextMenuTarget) return;

    const { field, value } = contextMenuTarget;

    switch (action) {
        case 'view_context':
            if (contextMenuTarget.logIndex != null) {
                openContextView(contextMenuTarget.logIndex);
            }
            break;
        case 'include':
            addFilter(field, 'equals', value, 'include');
            break;
        case 'exclude':
            addFilter(field, 'equals', value, 'exclude');
            break;
        case 'include_exact':
            addFilter(field, 'equals', value, 'include');
            break;
        case 'exclude_exact':
            addFilter(field, 'equals', value, 'exclude');
            break;
        case 'copy':
            navigator.clipboard.writeText(value);
            break;
        case 'open_file':
            if (contextMenuTarget.fileInfo) {
                vscode.postMessage({
                    type: 'openFile',
                    filePath: contextMenuTarget.fileInfo.filePath,
                    line: contextMenuTarget.fileInfo.line
                });
            }
            break;
    }

    hideContextMenu();
}

// Initialize context menu handlers
function initContextMenu() {
    // Hide menu on click or right-click outside
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', hideContextMenu);

    // Handle Escape key: close exactly one transient UI per press, topmost first
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const menu = document.getElementById('contextMenu');
            if (menu && !menu.classList.contains('hidden')) {
                hideContextMenu();
                return;
            }
            if (contextViewActive) {
                exitContextView();
                return;
            }
            if (isLevelFilterPanelOpen()) {
                closeLevelFilterPanel({ refocus: true });
                return;
            }
            const filterBuilder = document.getElementById('filterBuilder');
            if (filterBuilder && !filterBuilder.classList.contains('hidden')) {
                filterBuilder.classList.add('hidden');
                renderFilterChips();
            }
        }
    });

    // Handle context menu item clicks
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                handleContextMenuAction(item.dataset.action);
            });
        });
    }
}

// ============================================
// CONTEXT VIEW (in-place reveal)
// ============================================

// Reveal a log entry inside the main list: temporarily suppress the active
// filters, scroll the target into view, highlight it, and show the restore
// banner. Re-targeting works too — invoking it on another log while already
// active just moves the highlight and re-centers.
function openContextView(targetIndex) {
    const session = sessions.get(currentSessionId);
    if (!session || !session.logs[targetIndex]) return;

    const entering = !contextViewActive;
    contextViewActive = true;
    closeLevelFilterPanel();

    // Pause auto-scroll so new logs don't push the target away while reading
    if (entering) {
        autoScrollWasActive = autoScrollActive;
        autoScrollActive = false;
        updateAutoScrollButton();
    }

    // Show the restore banner
    const banner = document.getElementById('contextBanner');
    if (banner) {
        banner.classList.remove('hidden');
    }

    // Move the highlight to the new target
    const previousTarget = logContainer.querySelector('.log-entry.context-target');
    if (previousTarget) {
        previousTarget.classList.remove('context-target');
    }
    const targetEl = logContainer.querySelector(`.log-entry[data-index="${targetIndex}"]`);
    if (targetEl) {
        targetEl.classList.add('context-target');
    }

    // Show every log (filters are suppressed while contextViewActive is set)
    applyAllFilters();

    // Scroll the target into the center of the viewport
    requestAnimationFrame(() => {
        const el = logContainer.querySelector('.log-entry.context-target');
        if (el) {
            el.scrollIntoView({ block: 'center' });
        }
    });
}

// Restore the previous filters and leave Show Surrounding mode.
function exitContextView() {
    if (!contextViewActive) return;

    contextViewActive = false;

    // Remove highlight
    const targetEl = logContainer.querySelector('.log-entry.context-target');
    if (targetEl) {
        targetEl.classList.remove('context-target');
    }

    // Hide the restore banner
    const banner = document.getElementById('contextBanner');
    if (banner) {
        banner.classList.add('hidden');
    }

    // Restore the auto-scroll state from before entering context view
    autoScrollActive = autoScrollWasActive;
    updateAutoScrollButton();

    // Re-apply the real filters (re-hides logs that don't match)
    applyAllFilters();
}

// ============================================
// LEVEL FILTER DROPDOWN (multi-select)
// ============================================

function isLevelFilterPanelOpen() {
    return levelFilterPanel && !levelFilterPanel.classList.contains('hidden');
}

function openLevelFilterPanel(focusFirst) {
    if (!levelFilterPanel) return;

    // Only one popover at a time
    hideContextMenu();
    const filterBuilder = document.getElementById('filterBuilder');
    if (filterBuilder && !filterBuilder.classList.contains('hidden')) {
        filterBuilder.classList.add('hidden');
        renderFilterChips();
    }

    levelFilterPanel.classList.remove('hidden');
    levelFilterBtn.setAttribute('aria-expanded', 'true');

    // Move focus into the panel only on keyboard opens — after a mouse click
    // the programmatic focus would draw a focus ring on the first checkbox
    if (focusFirst) {
        const firstCheckbox = levelFilterPanel.querySelector('input[type="checkbox"]');
        if (firstCheckbox) {
            firstCheckbox.focus();
        }
    }
}

function closeLevelFilterPanel(options) {
    if (!isLevelFilterPanelOpen()) return;

    levelFilterPanel.classList.add('hidden');
    levelFilterBtn.setAttribute('aria-expanded', 'false');

    if (options && options.refocus) {
        levelFilterBtn.focus();
    }
}

// Sync the trigger label and checkbox states with selectedLevels
function syncLevelFilterUI() {
    if (!levelFilterBtn || !levelFilterPanel) return;

    levelFilterPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = selectedLevels.has(cb.value);
    });

    let label;
    if (selectedLevels.size === 0) {
        label = 'All Levels';
    } else if (selectedLevels.size <= 2) {
        // Fixed order so the label doesn't depend on click order
        label = Object.keys(LEVEL_LABELS)
            .filter(l => selectedLevels.has(l))
            .map(l => LEVEL_LABELS[l])
            .join('+');
    } else {
        label = `${selectedLevels.size} levels`;
    }
    levelFilterBtn.textContent = label;
    levelFilterBtn.title = selectedLevels.size === 0
        ? 'Filter by log level'
        : 'Showing: ' + Object.keys(LEVEL_LABELS)
            .filter(l => selectedLevels.has(l))
            .map(l => LEVEL_LABELS[l])
            .join(', ');
}

function initLevelFilter() {
    if (!levelFilterBtn || !levelFilterPanel) return;

    levelFilterBtn.addEventListener('click', (e) => {
        if (isLevelFilterPanelOpen()) {
            closeLevelFilterPanel();
        } else {
            // e.detail is 0 for keyboard-triggered clicks (Enter/Space)
            openLevelFilterPanel(e.detail === 0);
        }
    });

    levelFilterPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                selectedLevels.add(cb.value);
            } else {
                selectedLevels.delete(cb.value);
            }
            syncLevelFilterUI();
            applyAllFilters();
        });
    });

    const levelClearBtn = document.getElementById('levelFilterClear');
    if (levelClearBtn) {
        levelClearBtn.addEventListener('click', () => {
            selectedLevels = new Set();
            syncLevelFilterUI();
            applyAllFilters();
        });
    }

    // Close on click outside the wrapper (clicks inside keep it open)
    document.addEventListener('click', (e) => {
        if (isLevelFilterPanelOpen() && !e.target.closest('#levelFilterWrapper')) {
            closeLevelFilterPanel();
        }
    });

    syncLevelFilterUI();
}

// ============================================
// FILTER BUILDER PANEL
// ============================================

// Initialize filter builder
function initFilterBuilder() {
    const addBtn = document.getElementById('addFilterBtn');
    const builder = document.getElementById('filterBuilder');
    const applyBtn = document.getElementById('applyFilterBtn');
    const cancelBtn = document.getElementById('cancelFilterBtn');
    const filterArea = document.getElementById('filterArea');

    if (!addBtn || !builder) return;

    addBtn.addEventListener('click', () => {
        builder.classList.remove('hidden');
        filterArea.classList.remove('hidden');
        document.getElementById('filterValue').focus();
    });

    cancelBtn.addEventListener('click', () => {
        builder.classList.add('hidden');
        resetFilterBuilder();
        renderFilterChips();
    });

    applyBtn.addEventListener('click', () => {
        const field = document.getElementById('filterField').value;
        const operator = document.getElementById('filterOperator').value;
        const value = document.getElementById('filterValue').value.trim();

        if (value) {
            // Determine mode based on operator (not_ operators are exclude)
            const mode = operator.startsWith('not_') ? 'exclude' : 'include';
            // Convert operator to base form for exclude mode
            const baseOperator = operator.startsWith('not_') ? operator : operator;
            addFilter(field, baseOperator, value, mode);
            builder.classList.add('hidden');
            resetFilterBuilder();
        }
    });

    // Allow Enter key to apply
    document.getElementById('filterValue').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            applyBtn.click();
        } else if (e.key === 'Escape') {
            cancelBtn.click();
        }
    });
}

// Reset filter builder form
function resetFilterBuilder() {
    const fieldSelect = document.getElementById('filterField');
    const operatorSelect = document.getElementById('filterOperator');
    const valueInput = document.getElementById('filterValue');

    if (fieldSelect) fieldSelect.selectedIndex = 0;
    if (operatorSelect) operatorSelect.selectedIndex = 0;
    if (valueInput) valueInput.value = '';
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

// Get currently visible (non-hidden) logs
function getVisibleLogs() {
    const entries = logContainer.querySelectorAll('.log-entry:not(.hidden)');
    const logs = getCurrentSessionLogs();
    const visible = [];
    entries.forEach(entry => {
        const idx = parseInt(entry.dataset.index);
        if (logs[idx]) {
            visible.push(logs[idx]);
        }
    });
    return visible;
}

// Flatten a ParsedLog into a simple object
function flattenLog(log) {
    const obj = {};
    if (log.timestamp) obj.timestamp = log.timestamp;
    if (log.level) obj.level = log.level;
    if (log.message) obj.message = log.message;
    if (log.otherFields) {
        for (const [key, value] of Object.entries(log.otherFields)) {
            obj[key] = value;
        }
    }
    return obj;
}

function formatLogsAsJSON(logs) {
    return JSON.stringify(logs.map(flattenLog), null, 2);
}

function formatLogsAsText(logs) {
    return logs.map(log => {
        const ts = formatTimestamp(log.timestamp);
        const level = (log.level || '').padEnd(5);
        const msg = log.message || '';
        const fields = log.otherFields
            ? Object.entries(log.otherFields)
                .map(([k, v]) => {
                    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return `${k}=${val}`;
                })
                .join(' ')
            : '';
        return fields
            ? `${ts} | ${level} | ${msg} | ${fields}`
            : `${ts} | ${level} | ${msg}`;
    }).join('\n');
}

function formatLogsAsCSV(logs) {
    const flattened = logs.map(flattenLog);

    // Collect all field names (preserving insertion order, timestamp/level/message first)
    const fieldOrder = ['timestamp', 'level', 'message'];
    const fieldSet = new Set(fieldOrder);
    for (const obj of flattened) {
        for (const key of Object.keys(obj)) {
            if (!fieldSet.has(key)) {
                fieldSet.add(key);
                fieldOrder.push(key);
            }
        }
    }

    function escapeCSV(value) {
        if (value === undefined || value === null) return '';
        const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    const header = fieldOrder.map(escapeCSV).join(',');
    const rows = flattened.map(obj =>
        fieldOrder.map(field => escapeCSV(obj[field])).join(',')
    );
    return [header, ...rows].join('\n');
}

function formatLogs(logs, format) {
    switch (format) {
        case 'json': return formatLogsAsJSON(logs);
        case 'text': return formatLogsAsText(logs);
        case 'csv': return formatLogsAsCSV(logs);
        default: return formatLogsAsJSON(logs);
    }
}

// Handle export button click — ask extension to show QuickPick
function handleExportClick() {
    vscode.postMessage({ type: 'requestExport' });
}

// Handle requestFormattedLogs from extension
function handleRequestFormattedLogs(format, destination) {
    const logs = getVisibleLogs();
    const content = logs.length > 0 ? formatLogs(logs, format) : '';
    vscode.postMessage({
        type: 'formattedLogs',
        content,
        format,
        destination,
        count: logs.length
    });
}

// Wire up export button
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', handleExportClick);
}

// Initialize on load
init();
