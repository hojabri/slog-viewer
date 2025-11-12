/**
 * Message types for communication between extension and webview
 */

import { ParsedLog } from './logFormatter';

/**
 * Messages sent from extension to webview
 */
export type ExtensionMessage =
  | AddLogMessage
  | ClearLogsMessage
  | UpdateConfigMessage;

export interface AddLogMessage {
  type: 'addLog';
  log: ParsedLog;
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
  | CopyLogMessage;

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

/**
 * Configuration passed to webview
 */
export interface WebviewConfig {
  collapseJSON: boolean;
  showOriginal: boolean;
  autoScroll: boolean;
  theme: 'light' | 'dark' | 'auto';
}
