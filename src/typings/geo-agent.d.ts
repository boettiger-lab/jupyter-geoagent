/**
 * Type declarations for geo-agent ES modules.
 *
 * These declare the public interfaces of the plain-JS modules in
 * boettiger-lab/geo-agent so TypeScript can import them.
 */

declare module 'geo-agent/app/dataset-catalog.js' {
  export interface DatasetEntry {
    id: string;
    group: string | null;
    groupCollapsed: boolean;
    title: string;
    description: string;
    license: string;
    keywords: string[];
    provider: string;
    aboutUrl: string | null;
    documentationUrl: string | null;
    columns: ColumnInfo[];
    childIds: string[];
    preload: boolean;
    mapLayers: MapLayerConfig[];
    parquetAssets: ParquetAsset[];
    extent?: {
      spatial?: { bbox?: number[][] };
      temporal?: { interval?: string[][] };
    };
    summaries: Record<string, any>;
  }

  export interface ColumnInfo {
    name: string;
    type: string;
    description: string;
    values?: string[];
  }

  export interface MapLayerConfig {
    assetId: string;
    sourceAssetId?: string;
    layerType: 'vector' | 'raster';
    sourceType?: 'geojson';
    group?: string | null;
    title: string;
    description: string;
    url?: string;
    cogUrl?: string;
    sourceLayer?: string;
    defaultVisible: boolean;
    defaultFilter?: any[];
    defaultStyle?: Record<string, any>;
    outlineStyle?: Record<string, any>;
    renderType?: string | null;
    tooltipFields?: string[] | null;
    colormap?: string;
    rescale?: string | null;
    paint?: Record<string, any> | null;
    legendLabel?: string | null;
    legendType?: string | null;
    legendClasses?: any[] | null;
    animation?: any | null;
    versions?: Array<{
      label: string;
      assetId: string;
      layerType: string;
      url?: string;
      cogUrl?: string;
      sourceLayer?: string;
      sourceType?: string;
      description: string;
      legendClasses?: any[] | null;
    }>;
    defaultVersionIndex?: number;
  }

  export interface ParquetAsset {
    assetId: string;
    title: string;
    s3Path: string;
    originalUrl: string;
    isPartitioned: boolean;
    description: string;
  }

  export class DatasetCatalog {
    datasets: Map<string, DatasetEntry>;
    catalogUrl: string | null;
    titilerUrl: string | null;
    appConfig?: any;

    constructor();
    load(appConfig: any): Promise<void>;
    processCollection(collection: any, options?: any): Promise<DatasetEntry>;
    get(id: string): DatasetEntry | null;
    getIds(): string[];
    getAll(): DatasetEntry[];
    getMapLayerConfigs(): Array<{
      layerId: string;
      datasetId: string;
      group?: string | null;
      groupCollapsed?: boolean;
      displayName: string;
      type: string;
      sourceId?: string;
      source?: any;
      sourceLayer?: string;
      paint?: any;
      outlinePaint?: any;
      renderType?: string | null;
      columns?: ColumnInfo[];
      tooltipFields?: string[] | null;
      defaultVisible?: boolean;
      defaultFilter?: any[];
      colormap?: string | null;
      rescale?: string | null;
      legendLabel?: string | null;
      legendType?: string | null;
      legendClasses?: any[] | null;
      versions?: any[];
      defaultVersionIndex?: number;
      animation?: any;
      tracksUrl?: string | null;
    }>;
    generatePromptCatalog(): string;
  }
}

declare module 'geo-agent/app/tool-registry.js' {
  export interface ToolEntry {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
    source: 'local' | 'remote';
    execute?: (args: Record<string, any>) => any;
    mcpClient?: any;
  }

  export interface ToolResult {
    success: boolean;
    name: string;
    result: string;
    source: 'local' | 'remote' | 'error';
    sqlQuery?: string | null;
  }

  export class ToolRegistry {
    tools: Map<string, ToolEntry>;

    constructor();
    registerLocal(tool: {
      name: string;
      description: string;
      inputSchema: any;
      execute: (args: Record<string, any>) => any;
    }): void;
    registerRemote(mcpTools: any[], mcpClient: any): void;
    getToolsForLLM(): Array<{
      type: 'function';
      function: { name: string; description: string; parameters: any };
    }>;
    isLocal(name: string): boolean;
    execute(name: string, args: Record<string, any>): Promise<ToolResult>;
    executeAll(calls: Array<{ name: string; args: Record<string, any> }>): Promise<ToolResult[]>;
    getNames(): string[];
    has(name: string): boolean;
  }
}

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
