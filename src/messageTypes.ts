/**
 * Message types for communication between extension and webview
 */

import { ParsedLog } from './logFormatter';

/**
 * Session information for multi-session support (debug sessions and task sessions)
 */
export interface SessionInfo {
  id: string;           // Session identifier (debug session ID or task-generated ID)
  name: string;         // Display name (e.g., "Launch server.js" or "Task: Run Server")
  isActive: boolean;    // Whether session is still running
}

/**
 * Messages sent from extension to webview
 */
export type ExtensionMessage =
  | AddLogMessage
  | ClearLogsMessage
  | UpdateConfigMessage
  | SetSessionsMessage;

export interface AddLogMessage {
  type: 'addLog';
  log: ParsedLog;
  sessionId: string;
}

export interface SetSessionsMessage {
  type: 'setSessions';
  sessions: SessionInfo[];
  currentSessionId: string | null;
}

export interface ClearLogsMessage {
  type: 'clearLogs';
}

export interface UpdateConfigMessage {
  type: 'updateConfig';
  config: WebviewConfig;
}

/**
 * Messages sent from webview to extension
 */
export type WebviewMessage =
  | ReadyMessage
  | FilterChangeMessage
  | CopyLogMessage
  | OpenFileMessage
  | SelectSessionMessage;

export interface ReadyMessage {
  type: 'ready';
}

export interface FilterChangeMessage {
  type: 'filterChange';
  level?: string;
  searchText?: string;
}

export interface CopyLogMessage {
  type: 'copyLog';
  logIndex: number;
}

export interface OpenFileMessage {
  type: 'openFile';
  filePath: string;
  line?: number;
}

export interface SelectSessionMessage {
  type: 'selectSession';
  sessionId: string;
}

/**
 * Configuration passed to webview
 */
export interface WebviewConfig {
  collapseJSON: boolean;
  showRawJSON: boolean;
  autoScroll: boolean;
  theme: 'light' | 'dark' | 'auto';
}
