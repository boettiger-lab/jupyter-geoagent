/**
 * QueryPanel — interface for running MCP tool calls (SQL queries via DuckDB).
 *
 * Includes an MCP server URL field so the user can connect on the fly.
 */

import * as React from 'react';
import { ServerConnection } from '@jupyterlab/services';
import { MCPClientWrapper } from '../core/mcp';
import { ToolCallRecorder } from '../core/tools';

const DEFAULT_MCP_URL = 'https://duckdb-mcp.nrp-nautilus.io/mcp';

export interface QueryPanelProps {
  mcpClient: MCPClientWrapper | null;
  recorder: ToolCallRecorder;
  serverSettings?: ServerConnection.ISettings;
  defaultMcpUrl?: string;
  useProxy?: boolean;
}

export const QueryPanel: React.FC<QueryPanelProps> = ({
  mcpClient: externalClient,
  recorder,
  serverSettings,
  defaultMcpUrl = DEFAULT_MCP_URL,
  useProxy = false,
}) => {
  const [mcpUrl, setMcpUrl] = React.useState(defaultMcpUrl);
  const [client, setClient] = React.useState<MCPClientWrapper | null>(externalClient);
  const [connecting, setConnecting] = React.useState(false);
  const [connectError, setConnectError] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync with external client if one is provided later
  React.useEffect(() => {
    if (externalClient) setClient(externalClient);
  }, [externalClient]);

  const connect = React.useCallback(async () => {
    if (!mcpUrl.trim()) return;
    setConnecting(true);
    setConnectError(null);

    try {
      const c = new MCPClientWrapper(mcpUrl, {
        useProxy,
        jupyterSettings: serverSettings,
      });
      await c.connect();
      setClient(c);
    } catch (e: any) {
      setConnectError(e.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, [mcpUrl, useProxy, serverSettings]);

  const runQuery = React.useCallback(async () => {
    if (!client || !query.trim()) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const text = await client.callTool('query', { sql_query: query });
      setResult(text);
      recorder.record('query', { sql_query: query }, text);
    } catch (e: any) {
      setError(e.message || 'Query failed');
      recorder.record('query', { sql_query: query }, `Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }, [client, query, recorder]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      runQuery();
    }
  }, [runQuery]);

  return (
    <div className="jp-GeoAgent-query">
      <h3>Query</h3>

      {/* MCP connection */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <input
          type="text"
          value={mcpUrl}
          onChange={e => setMcpUrl(e.target.value)}
          placeholder="MCP server URL"
          className="jp-GeoAgent-input"
          style={{ flex: 1 }}
          disabled={!!client}
        />
        {client ? (
          <button
            onClick={() => { setClient(null); setConnectError(null); }}
            className="jp-GeoAgent-button jp-GeoAgent-button-small"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={connecting || !mcpUrl.trim()}
            className="jp-GeoAgent-button jp-GeoAgent-button-small"
          >
            {connecting ? '...' : 'Connect'}
          </button>
        )}
      </div>
      {connectError && <div className="jp-GeoAgent-error">{connectError}</div>}

      {!client ? (
        <p className="jp-GeoAgent-empty">Enter an MCP server URL and click Connect.</p>
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
