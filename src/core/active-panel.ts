/**
 * Module-scoped reference to the currently active GeoAgent panel.
 *
 * Commands registered at plugin-activate time dereference this to find the
 * panel to operate on. Panels set it on mount and clear it on unmount.
 * Multi-panel UX: last-mounted wins — matches the ArcGIS "active frame"
 * idiom. (If both panels are open, the LLM operates on whichever was most
 * recently shown.)
 */

import type { MapViewController } from '../components/MapView';
import type { MCPClientWrapper } from './mcp';
import type { ToolCallRecorder } from './tools';

export interface ActivePanel {
  controller: MapViewController;
  mcpClient: MCPClientWrapper | null;
  recorder: ToolCallRecorder;
  /** Called after any tool mutation so React panels re-render. */
  refresh: () => void;
}

let current: ActivePanel | null = null;

export function setActivePanel(panel: ActivePanel | null): void {
  current = panel;
}

export function getActivePanel(): ActivePanel | null {
  return current;
}
