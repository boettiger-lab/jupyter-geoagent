/**
 * MCP client for jupyter-geoagent.
 *
 * Supports two modes:
 *   1. Direct — browser connects to a remote MCP server (same as geo-agent web apps)
 *   2. Proxy  — requests are relayed through the Jupyter server extension,
 *               bypassing CORS / network restrictions in JupyterHub environments
 *
 * The proxy mode uses the /jupyter-geoagent/mcp-proxy endpoint from handlers.py.
 */

import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export class MCPClient {
  private serverUrl: string;
  private headers: Record<string, string>;
  private useProxy: boolean;
  private jupyterSettings?: ServerConnection.ISettings;
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
    this.tools = await this.fetchTools();
  }

  /**
   * Get cached tools.
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Call an MCP tool by name.
   */
  async callTool(name: string, args: Record<string, any>): Promise<string> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const response = await this.sendRequest(payload);
    const result = response.result;

    if (result?.content?.[0]?.text) {
      return result.content[0].text;
    }
    return 'Query executed successfully but returned no data.';
  }

  /**
   * Send a JSON-RPC request, either directly or via the proxy.
   */
  private async sendRequest(payload: any): Promise<any> {
    if (this.useProxy && this.jupyterSettings) {
      return this.sendViaProxy(payload);
    }
    return this.sendDirect(payload);
  }

  private async sendDirect(payload: any): Promise<any> {
    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...this.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`MCP error: HTTP ${response.status}`);
    }
    return response.json();
  }

  private async sendViaProxy(payload: any): Promise<any> {
    const proxyUrl = URLExt.join(
      this.jupyterSettings!.baseUrl,
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
      this.jupyterSettings!
    );

    if (!response.ok) {
      throw new ServerConnection.ResponseError(response);
    }
    return response.json();
  }

  private async fetchTools(): Promise<MCPTool[]> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {},
    };

    try {
      const response = await this.sendRequest(payload);
      return (response.result?.tools || []) as MCPTool[];
    } catch (e) {
      console.warn('[MCP] Failed to list tools:', e);
      return [];
    }
  }
}
