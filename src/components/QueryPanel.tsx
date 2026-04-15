/**
 * QueryPanel — interface for running MCP tool calls (SQL queries via DuckDB).
 */

import * as React from 'react';
import { MCPClient } from '../core/mcp';
import { ToolCallRecorder } from '../core/tools';

export interface QueryPanelProps {
  mcpClient: MCPClient | null;
  recorder: ToolCallRecorder;
}

export const QueryPanel: React.FC<QueryPanelProps> = ({
  mcpClient,
  recorder,
}) => {
  const [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runQuery = React.useCallback(async () => {
    if (!mcpClient || !query.trim()) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const text = await mcpClient.callTool('query', { sql_query: query });
      setResult(text);
      recorder.record('query', { sql_query: query }, text);
    } catch (e: any) {
      setError(e.message || 'Query failed');
      recorder.record('query', { sql_query: query }, `Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }, [mcpClient, query, recorder]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      runQuery();
    }
  }, [runQuery]);

  return (
    <div className="jp-GeoAgent-query">
      <h3>Query</h3>

      {!mcpClient ? (
        <p className="jp-GeoAgent-empty">No MCP server connected.</p>
      ) : (
        <>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter SQL query... (Ctrl+Enter to run)"
            className="jp-GeoAgent-textarea"
            rows={5}
          />
          <button
            onClick={runQuery}
            disabled={running || !query.trim()}
            className="jp-GeoAgent-button"
          >
            {running ? 'Running...' : 'Run Query'}
          </button>

          {error && <div className="jp-GeoAgent-error">{error}</div>}

          {result && (
            <div className="jp-GeoAgent-query-result">
              <pre>{result}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};
