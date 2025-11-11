/**
 * ANSI color codes for terminal output formatting
 */

export enum AnsiColor {
  Reset = '\u001b[0m',

  // Standard colors
  Black = '\u001b[30m',
  Red = '\u001b[31m',
  Green = '\u001b[32m',
  Yellow = '\u001b[33m',
  Blue = '\u001b[34m',
  Magenta = '\u001b[35m',
  Cyan = '\u001b[36m',
  White = '\u001b[37m',
  Gray = '\u001b[90m',

  // Bright colors
  BrightRed = '\u001b[91m',
  BrightGreen = '\u001b[92m',
  BrightYellow = '\u001b[93m',
  BrightBlue = '\u001b[94m',
  BrightMagenta = '\u001b[95m',
  BrightCyan = '\u001b[96m',
  BrightWhite = '\u001b[97m',

  // Text styles
  Bold = '\u001b[1m',
  Dim = '\u001b[2m',
  Italic = '\u001b[3m',
  Underline = '\u001b[4m',
}

/**
 * Colorizes text with ANSI escape codes
 */
export function colorize(text: string, color: AnsiColor): string {
  return `${color}${text}${AnsiColor.Reset}`;
}

/**
 * Gets the ANSI color for a log level
 */
export function getLogLevelColor(level: string): AnsiColor {
  const levelLower = level.toLowerCase();

  switch (levelLower) {
    case 'error':
    case 'fatal':
    case 'err':
      return AnsiColor.BrightRed;
    case 'warn':
    case 'warning':
      return AnsiColor.BrightYellow;
    case 'info':
      return AnsiColor.BrightBlue;
    case 'debug':
      return AnsiColor.Gray;
    case 'trace':
      return AnsiColor.Dim;
    default:
      return AnsiColor.White;
  }
}

/**
 * Colorizes a JSON string with syntax highlighting
 */
export function colorizeJSON(jsonString: string, indent: number = 2): string {
  try {
    const obj = JSON.parse(jsonString);
    return colorizeValue(obj, indent, 0);
  } catch {
    return jsonString;
  }
}

function colorizeValue(value: any, indent: number, depth: number): string {
  if (value === null) {
    return colorize('null', AnsiColor.Gray);
  }

  if (value === undefined) {
    return colorize('undefined', AnsiColor.Gray);
  }

  if (typeof value === 'boolean') {
    return colorize(String(value), AnsiColor.BrightYellow);
  }

  if (typeof value === 'number') {
    return colorize(String(value), AnsiColor.BrightMagenta);
  }

  if (typeof value === 'string') {
    return colorize(`"${value}"`, AnsiColor.BrightGreen);
  }

  if (Array.isArray(value)) {
    return colorizeArray(value, indent, depth);
  }

  if (typeof value === 'object') {
    return colorizeObject(value, indent, depth);
  }

  return String(value);
}

function colorizeObject(obj: Record<string, any>, indent: number, depth: number): string {
  const entries = Object.entries(obj);

  if (entries.length === 0) {
    return '{}';
  }

  const indentStr = ' '.repeat(indent * (depth + 1));
  const closeIndentStr = ' '.repeat(indent * depth);

  const lines = entries.map(([key, value]) => {
    const coloredKey = colorize(`"${key}"`, AnsiColor.BrightCyan);
    const coloredValue = colorizeValue(value, indent, depth + 1);
    return `${indentStr}${coloredKey}: ${coloredValue}`;
  });

  return `{\n${lines.join(',\n')}\n${closeIndentStr}}`;
}

function colorizeArray(arr: any[], indent: number, depth: number): string {
  if (arr.length === 0) {
    return '[]';
  }

  const indentStr = ' '.repeat(indent * (depth + 1));
  const closeIndentStr = ' '.repeat(indent * depth);

  const lines = arr.map(item => {
    return `${indentStr}${colorizeValue(item, indent, depth + 1)}`;
  });

  return `[\n${lines.join(',\n')}\n${closeIndentStr}]`;
}

/**
 * Removes ANSI color codes from text
 */
export function stripColors(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[\d+m/g, '');
}
