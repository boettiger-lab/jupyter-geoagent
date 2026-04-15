/**
 * MCP client for jupyter-geoagent.
 *
 * Two modes:
 *   1. Direct — uses geo-agent's MCPClient (same transport, same reconnect logic)
 *   2. Proxy  — relays requests through the Jupyter server extension at
 *               /jupyter-geoagent/mcp-proxy, bypassing CORS / network restrictions
 *
 * The proxy mode is needed for JupyterHub environments that restrict
 * outbound browser connections.
 */

import { MCPClient as GeoAgentMCPClient } from 'geo-agent/app/mcp-client.js';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

/**
 * Thin wrapper that unifies direct (geo-agent MCPClient) and proxy modes
 * behind a single interface.
 */
export class MCPClientWrapper {
  private serverUrl: string;
  private headers: Record<string, string>;
  private useProxy: boolean;
  private jupyterSettings?: ServerConnection.ISettings;

  /** Underlying geo-agent MCPClient, used for direct mode. */
  private directClient?: GeoAgentMCPClient;

  private tools: MCPTool[] = [];

  constructor(
    serverUrl: string,
    options: {
      headers?: Record<string, string>;
      useProxy?: boolean;
      jupyterSettings?: ServerConnection.ISettings;
    } = {}
  ) {
    this.serverUrl = serverUrl;
    this.headers = options.headers || {};
    this.useProxy = options.useProxy ?? false;
    this.jupyterSettings = options.jupyterSettings;
  }

  /**
   * Connect and cache the tool list.
   */
  async connect(): Promise<void> {
    if (this.useProxy) {
      this.tools = await this.proxyListTools();
    } else {
      this.directClient = new GeoAgentMCPClient(this.serverUrl, this.headers);
      await this.directClient.connect();
      this.tools = this.directClient.getTools() as MCPTool[];
    }
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Call an MCP tool by name.
   */
  async callTool(name: string, args: Record<string, any>): Promise<string> {
    if (this.useProxy) {
      return this.proxyCallTool(name, args);
    }
    if (!this.directClient) throw new Error('MCP client not connected');
    return this.directClient.callTool(name, args);
  }

  // ── Proxy-mode methods ──

  private async proxyListTools(): Promise<MCPTool[]> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {},
    };

    try {
      const response = await this.proxyRequest(payload);
      return (response.result?.tools || []) as MCPTool[];
    } catch (e) {
      console.warn('[MCP proxy] Failed to list tools:', e);
      return [];
    }
  }

  private async proxyCallTool(name: string, args: Record<string, any>): Promise<string> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const response = await this.proxyRequest(payload);
    const result = response.result;
    if (result?.content?.[0]?.text) {
      return result.content[0].text;
    }
    return 'Query executed successfully but returned no data.';
  }

  private async proxyRequest(payload: any): Promise<any> {
    if (!this.jupyterSettings) {
      throw new Error('Jupyter server settings required for proxy mode');
    }

    const proxyUrl = URLExt.join(
      this.jupyterSettings.baseUrl,
      'jupyter-geoagent',
      'mcp-proxy'
    );

    const response = await ServerConnection.makeRequest(
      proxyUrl,
      {
        method: 'POST',
        body: JSON.stringify({
          server_url: this.serverUrl,
          payload,
          headers: this.headers,
        }),
      },
      this.jupyterSettings
    );

    if (!response.ok) {
      throw new ServerConnection.ResponseError(response);
    }
    return response.json();
  }
}
