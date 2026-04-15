/**
 * LayerPanel — shows active map layers with visibility, opacity, and remove controls.
 */

import * as React from 'react';
import { MapViewController } from './MapView';
import { LayerState } from '../core/types';
import { ToolCallRecorder } from '../core/tools';

export interface LayerPanelProps {
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  /** Increment this to force re-render when layers change externally */
  refreshKey: number;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  mapController,
  recorder,
  refreshKey,
}) => {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  const layers = React.useMemo(() => {
    if (!mapController) return [];
    return [...mapController.layers.values()].reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapController, refreshKey]);

  const toggleVisibility = React.useCallback((layer: LayerState) => {
    if (!mapController) return;
    if (layer.visible) {
      mapController.hideLayer(layer.id);
      recorder.record('hide_layer', { layer_id: layer.id });
    } else {
      mapController.showLayer(layer.id);
      recorder.record('show_layer', { layer_id: layer.id });
    }
    forceUpdate();
  }, [mapController, recorder]);

  const removeLayer = React.useCallback((layer: LayerState) => {
    if (!mapController) return;
    mapController.removeLayer(layer.id);
    recorder.record('hide_layer', { layer_id: layer.id });
    forceUpdate();
  }, [mapController, recorder]);

  if (layers.length === 0) {
    return (
      <div className="jp-GeoAgent-layers">
        <h3>Layers</h3>
        <p className="jp-GeoAgent-empty">No layers added yet. Browse the STAC catalog to add data.</p>
      </div>
    );
  }

  return (
    <div className="jp-GeoAgent-layers">
      <h3>Layers</h3>
      <ul className="jp-GeoAgent-layer-list">
        {layers.map(layer => (
          <li key={layer.id} className="jp-GeoAgent-layer-item">
            <div className="jp-GeoAgent-layer-header">
              <label className="jp-GeoAgent-layer-toggle">
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleVisibility(layer)}
                />
                <span>{layer.displayName}</span>
              </label>
              <button
                onClick={() => removeLayer(layer)}
                className="jp-GeoAgent-button-icon"
                title="Remove layer"
              >
                x
              </button>
            </div>
            <div className="jp-GeoAgent-layer-meta">
              <span className="jp-GeoAgent-layer-type">{layer.type}</span>
              <span className="jp-GeoAgent-layer-id">{layer.id}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
