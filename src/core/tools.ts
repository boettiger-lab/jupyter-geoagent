/**
 * ToolCallRecorder — wraps tool execution and records every call.
 *
 * Every GUI action (show layer, set filter, run query, etc.) is dispatched
 * as a named tool call through this recorder. The log can be exported as
 * a reproducible JSON artifact.
 */

import { RecordedToolCall, ToolCallLog } from './types';

export class ToolCallRecorder {
  private log: RecordedToolCall[] = [];
  private nextId = 1;
  private catalogUrl: string;

  /** Callback fired after each recorded call, for UI updates. */
  onRecord?: (entry: RecordedToolCall) => void;

  constructor(catalogUrl: string) {
    this.catalogUrl = catalogUrl;
  }

  /**
   * Record a tool call and its result.
   */
  record(tool: string, args: Record<string, any>, result?: string): RecordedToolCall {
    const entry: RecordedToolCall = {
      id: this.nextId++,
      tool,
      args,
      result,
      timestamp: new Date().toISOString(),
    };
    this.log.push(entry);
    if (this.onRecord) this.onRecord(entry);
    return entry;
  }

  /**
   * Get all recorded calls.
   */
  getLog(): RecordedToolCall[] {
    return [...this.log];
  }

  /**
   * Export the full log as a structured JSON object.
   */
  export(): ToolCallLog {
    return {
      version: '1.0',
      catalog: this.catalogUrl,
      created: new Date().toISOString(),
      calls: this.getLog(),
    };
  }

  /**
   * Clear the log (e.g. when starting a new session).
   */
  clear(): void {
    this.log = [];
    this.nextId = 1;
  }

  get length(): number {
    return this.log.length;
  }
}
