// Get VSCode API
const vscode = acquireVsCodeApi();

// Maximum number of logs to keep in memory and DOM
const MAX_LOGS = 5000;

// State
let logs = [];
let config = {
    collapseJSON: true,
    showRawJSON: false,
    autoScroll: true,
    theme: 'auto'
};

// Runtime auto-scroll state (can be paused independently of config)
let autoScrollActive = true;

// Advanced filter state
let activeFilters = [];  // Array of FilterCondition objects
let availableFields = new Set(['message', 'level']);  // Discovered fields from logs
let filterIdCounter = 0;  // For generating unique filter IDs
let contextMenuTarget = null;  // { field, value } for context menu actions

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
    levelFilter.addEventListener('change', handleFilter);
    searchInput.addEventListener('input', debounce(handleSearchWithClearBtn, 300));

    // Search clear button
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    clearSearchBtn.addEventListener('click', handleClearSearch);

    // Auto-scroll button and scroll detection
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    autoScrollBtn.addEventListener('click', handleAutoScrollClick);
    logContainer.addEventListener('scroll', handleScroll, { passive: true });
    updateAutoScrollButton();

    // Initialize advanced filtering
    initContextMenu();
    initFilterBuilder();

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

    // Track fields for filter dropdown
    trackFieldsFromLog(log);

    // Hide empty state
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Create and append log element
    const logElement = createLogElement(log, logs.length - 1);
    logContainer.appendChild(logElement);

    // Apply filters to newly added log
    if (!logMatchesAdvancedFilters(log) ||
        (levelFilter.value !== 'all' && log.level?.toLowerCase() !== levelFilter.value) ||
        (searchInput.value && !((log.message || '').toLowerCase().includes(searchInput.value.toLowerCase()) ||
                                JSON.stringify(log.otherFields).toLowerCase().includes(searchInput.value.toLowerCase())))) {
        logElement.classList.add('hidden');
    }

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
    message.className = 'log-message filterable';
    message.textContent = log.message;
    // Add click handler for filtering by message
    message.addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(e, 'message', log.message || '');
    });

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
        line.className = 'json-line filterable';
        line.style.paddingLeft = `${(indent + 1) * 16}px`;

        // Make the whole line clickable for filtering
        const displayValue = value === null ? 'null' :
            typeof value === 'object' ? JSON.stringify(value) : String(value);
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(e, key, displayValue);
        });

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

        // Value (no longer needs individual click handler)
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
            span.title = 'Click to open file (use right-click for filter menu)';
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
    // Reset advanced filters
    activeFilters = [];
    availableFields = new Set(['message', 'level']);
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

// Apply filters (level, search, and advanced filters)
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

    // Re-render logs if collapseJSON or showRawJSON changed
    if (oldCollapseJSON !== config.collapseJSON || oldShowRawJSON !== config.showRawJSON) {
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
    // Clear the container
    logContainer.innerHTML = '';

    if (logs.length === 0) {
        logContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No logs yet</p>
                <small>Start debugging to see formatted logs</small>
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
        fieldValue = log.otherFields?.[field];
        if (fieldValue === undefined || fieldValue === null) return false;
    }

    const operatorFn = FILTER_OPERATORS[operator];
    return operatorFn ? operatorFn(fieldValue, value) : false;
}

// Get field value from log (for display purposes)
function getFieldValue(log, field) {
    if (field === 'message') return log.message || '';
    if (field === 'level') return log.level || '';
    return log.otherFields?.[field] ?? '';
}

// Apply all filters (level, search, and advanced)
function applyAllFilters() {
    const level = levelFilter.value;
    const searchText = searchInput.value;
    applyFilters(level, searchText);
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
    const hasLogs = logs.length > 0;

    let noResults = logContainer.querySelector('.no-filter-results');

    if (hasLogs && visibleCount === 0 && (activeFilters.length > 0 || levelFilter.value !== 'all' || searchInput.value)) {
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
                levelFilter.value = 'all';
                searchInput.value = '';
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

// Show context menu on click
function showContextMenu(e, field, value) {
    e.stopPropagation();

    contextMenuTarget = { field, value: String(value) };

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

    // Position menu near click, but keep on screen
    const menuRect = menu.getBoundingClientRect();
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
        case 'include':
            addFilter(field, 'contains', value, 'include');
            break;
        case 'exclude':
            addFilter(field, 'contains', value, 'exclude');
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
    }

    hideContextMenu();
}

// Initialize context menu handlers
function initContextMenu() {
    // Hide menu on click outside
    document.addEventListener('click', hideContextMenu);

    // Handle Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            // Also hide filter builder
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

// Initialize on load
init();
