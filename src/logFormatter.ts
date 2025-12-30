import * as vscode from 'vscode';

export interface ParsedLog {
  timestamp?: string;
  level?: string;
  message?: string;
  otherFields: Record<string, any>;
  raw: string;
}

/**
 * Strip ANSI color codes from a string
 */
function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '').replace(/\u001b\[[\d;]*[A-Za-z]/g, '');
}

/**
 * Format JSON with plain text (no ANSI codes, fallback for when colors are disabled)
 */
function formatJSONWithMarkers(obj: Record<string, any>, indent: number = 2): string {
  const lines: string[] = [];
  lines.push('{');

  const entries = Object.entries(obj);
  entries.forEach(([key, value], index) => {
    const isLast = index === entries.length - 1;
    const indentStr = ' '.repeat(indent);

    // Format key
    const keyStr = `"${key}"`;

    // Format value based on type
    let valueStr: string;
    if (typeof value === 'string') {
      // Escape backslashes and quotes for valid JSON output
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      valueStr = `"${escaped}"`;
    } else if (typeof value === 'number') {
      valueStr = `${value}`;
    } else if (typeof value === 'boolean') {
      valueStr = `${value}`;
    } else if (value === null) {
      valueStr = 'null';
    } else {
      valueStr = JSON.stringify(value);
    }

    const comma = isLast ? '' : ',';
    lines.push(`${indentStr}${keyStr}: ${valueStr}${comma}`);
  });

  lines.push('}');
  return lines.join('\n');
}

/**
 * Parse a quoted string value, handling escape sequences
 * Returns the unescaped string and the position after the closing quote
 */
function parseQuotedValue(line: string, startPos: number): { value: string; endPos: number } | null {
  let result = '';
  let i = startPos;

  while (i < line.length) {
    const char = line[i];

    if (char === '\\' && i + 1 < line.length) {
      // Handle escape sequences
      const nextChar = line[i + 1];
      if (nextChar === '"') {
        result += '"';
        i += 2;
      } else if (nextChar === '\\') {
        result += '\\';
        i += 2;
      } else if (nextChar === 'n') {
        result += '\n';
        i += 2;
      } else if (nextChar === 't') {
        result += '\t';
        i += 2;
      } else if (nextChar === 'r') {
        result += '\r';
        i += 2;
      } else {
        // Unknown escape, keep both characters
        result += char + nextChar;
        i += 2;
      }
    } else if (char === '"') {
      // End of quoted string
      return { value: result, endPos: i + 1 };
    } else {
      result += char;
      i++;
    }
  }

  // No closing quote found
  return null;
}

/**
 * Parse logfmt format (key=value pairs) into an object
 */
function parseLogfmt(line: string): Record<string, any> | null {
  try {
    const obj: Record<string, any> = {};
    let i = 0;

    while (i < line.length) {
      // Skip whitespace
      while (i < line.length && /\s/.test(line[i])) {
        i++;
      }

      if (i >= line.length) break;

      // Parse key (word characters)
      const keyStart = i;
      while (i < line.length && /\w/.test(line[i])) {
        i++;
      }

      if (i === keyStart) {
        // No key found, skip this character
        i++;
        continue;
      }

      const key = line.slice(keyStart, i);

      // Expect '='
      if (i >= line.length || line[i] !== '=') {
        continue;
      }
      i++; // Skip '='

      let value: string;

      if (i < line.length && line[i] === '"') {
        // Quoted value - parse with escape handling
        i++; // Skip opening quote
        const parsed = parseQuotedValue(line, i);
        if (parsed) {
          value = parsed.value;
          i = parsed.endPos;
        } else {
          // Malformed quoted string, take rest of line
          value = line.slice(i);
          i = line.length;
        }
      } else {
        // Unquoted value - read until whitespace
        const valueStart = i;
        while (i < line.length && !/\s/.test(line[i])) {
          i++;
        }
        value = line.slice(valueStart, i);
      }

      // Try to parse numbers and booleans
      if (value === 'true') {
        obj[key] = true;
      } else if (value === 'false') {
        obj[key] = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        obj[key] = Number(value);
      } else {
        obj[key] = value;
      }
    }

    return Object.keys(obj).length > 0 ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Check if a line is a structured log (JSON or logfmt)
 */
export function isJSONLog(line: string): boolean {
  // Strip ANSI codes first
  const cleaned = stripAnsiCodes(line).trim();

  // Check for JSON format
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  // Check for logfmt format (key=value pairs)
  // Must have at least time/timestamp and level and msg/message fields
  const hasTimeField = /\b(?:time|timestamp)=/.test(cleaned);
  const hasLevelField = /\blevel=/.test(cleaned);
  const hasMsgField = /\b(?:msg|message)=/.test(cleaned);

  return hasTimeField && hasLevelField && hasMsgField;
}

/**
 * Parse a JSON log line and extract key fields
 */
export function parseJSONLog(line: string): ParsedLog | null {
  try {
    // Strip ANSI codes before parsing
    const cleaned = stripAnsiCodes(line).trim();

    let obj: Record<string, any>;

    // Try JSON first
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      obj = JSON.parse(cleaned);
    } else {
      // Try logfmt format
      const parsed = parseLogfmt(cleaned);
      if (!parsed) {
        return null;
      }
      obj = parsed;
    }

    // Extract common fields (check various common field names)
    const timestamp = obj.time || obj.timestamp || obj.ts || obj['@timestamp'] || obj.datetime;
    let level = obj.level || obj.severity || obj.lvl || obj.loglevel;
    const message = obj.message || obj.msg || obj.text;

    // Normalize log level to standard values
    if (level) {
      const levelLower = level.toString().toLowerCase();
      if (levelLower === 'fatal' || levelLower === 'panic' || levelLower === 'critical') {
        level = 'ERROR';
      } else if (levelLower === 'warning' || levelLower === 'warn') {
        level = 'WARN';
      } else if (levelLower === 'information' || levelLower === 'info') {
        level = 'INFO';
      } else if (levelLower === 'debug') {
        level = 'DEBUG';
      } else if (levelLower === 'trace') {
        level = 'TRACE';
      } else if (levelLower === 'error' || levelLower === 'err') {
        level = 'ERROR';
      } else {
        // Keep original case if it doesn't match known levels
        level = level.toString().toUpperCase();
      }
    }

    // Get other fields (excluding the extracted ones)
    const otherFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      if (
        keyLower !== 'time' &&
        keyLower !== 'timestamp' &&
        keyLower !== 'ts' &&
        keyLower !== '@timestamp' &&
        keyLower !== 'datetime' &&
        keyLower !== 'level' &&
        keyLower !== 'severity' &&
        keyLower !== 'lvl' &&
        keyLower !== 'loglevel' &&
        keyLower !== 'message' &&
        keyLower !== 'msg' &&
        keyLower !== 'text'
      ) {
        otherFields[key] = value;
      }
    }

    return {
      timestamp,
      level,
      message,
      otherFields,
      raw: line,
    };
  } catch {
    return null;
  }
}

/**
 * Format a parsed log for display in the Debug Console
 */
export function formatLog(parsed: ParsedLog, config: vscode.WorkspaceConfiguration): string {
  const showOriginal = config.get<boolean>('showOriginal', false);

  let output = '';

  // Build the header line: [timestamp] message [level]
  const parts: string[] = [];

  if (parsed.timestamp) {
    parts.push(`[${parsed.timestamp}]`);
  }

  if (parsed.message) {
    parts.push(parsed.message);
  }

  if (parsed.level) {
    parts.push(`[${parsed.level.toUpperCase()}]`);
  }

  output += parts.join(' ');

  // Add the JSON fields if there are any
  const hasOtherFields = Object.keys(parsed.otherFields).length > 0;

  if (hasOtherFields) {
    // Use plain text formatting only
    const jsonStr = formatJSONWithMarkers(parsed.otherFields, 2);
    const indentedJson = jsonStr.split('\n').map(line => '  ' + line).join('\n');
    output += '\n' + indentedJson;
  }

  // Optionally show original JSON
  if (showOriginal) {
    output += '\n    // Original: ' + parsed.raw;
  }

  return output;
}

/**
 * Process a line from the debug console output
 * Returns formatted output if it's a JSON log, otherwise returns null
 */
export function processLine(line: string, config: vscode.WorkspaceConfiguration): string | null {
  if (!isJSONLog(line)) {
    return null;
  }

  const parsed = parseJSONLog(line);
  if (!parsed) {
    return null;
  }

  return formatLog(parsed, config);
}
