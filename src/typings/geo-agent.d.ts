/**
 * Type declarations for geo-agent ES modules still used at runtime.
 *
 * mcp-client.js is used by src/core/mcp.ts (direct MCP connection mode).
 * map-tools.js is used by src/core/tool-metadata.ts (tool description extraction).
 */

declare module 'geo-agent/app/mcp-client.js' {
  export class MCPClient {
    serverUrl: string;
    headers: Record<string, string>;
    connected: boolean;
    tools: Array<{ name: string; description: string; inputSchema: any }>;
    readonly isConnected: boolean;

    constructor(serverUrl: string, headers?: Record<string, string>);
    connect(): Promise<void>;
    ensureConnected(): Promise<void>;
    getTools(): Array<{ name: string; description: string; inputSchema: any }>;
    listTools(): Promise<Array<{ name: string; description: string; inputSchema: any }>>;
    callTool(name: string, args: Record<string, any>): Promise<string>;
    readResource(uri: string): Promise<string>;
    listResources(): Promise<any[]>;
    listPrompts(): Promise<any[]>;
    getPrompt(name: string, args?: Record<string, any>): Promise<string>;
    disconnect(): Promise<void>;
  }
}

declare module 'geo-agent/app/map-tools.js' {
  export function createMapTools(
    mapManager: any,
    catalog: any,
    mcpClient?: any
  ): Array<{
    name: string;
    description: string;
    inputSchema: any;
    execute: (args: Record<string, any>) => any;
  }>;
}
