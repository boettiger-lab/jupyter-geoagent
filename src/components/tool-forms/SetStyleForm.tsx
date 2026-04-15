/**
 * SetStyleForm — wraps geo-agent's set_style / reset_style tools.
 * Pre-fills a textarea with layer.currentStyle so the user can tweak
 * individual keys or paste a full paint object (including match /
 * interpolate / step expressions). Help text sourced from geo-agent.
 */

import * as React from 'react';
import { LayerState } from '../../core/types';
import { MapViewController } from '../MapView';
import { ToolCallRecorder } from '../../core/tools';
import { getToolMetadata } from '../../core/tool-metadata';

export interface SetStyleFormProps {
  layer: LayerState;
  mapController: MapViewController;
  recorder: ToolCallRecorder;
  onChange: () => void;
}

export const SetStyleForm: React.FC<SetStyleFormProps> = ({
  layer,
  mapController,
  recorder,
  onChange,
}) => {
  const format = (s?: Record<string, any>) =>
    s ? JSON.stringify(s, null, 2) : '';

  const [text, setText] = React.useState(format(layer.currentStyle));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText(format(layer.currentStyle));
    setError(null);
  }, [layer.id]);

  const meta = React.useMemo(() => getToolMetadata(mapController), [mapController]);
  const setStyleDesc = meta['set_style']?.description ?? '';

  const apply = () => {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError('Style must be a JSON object (MapLibre paint properties).');
      return;
    }
    try {
      mapController.setStyle(layer.id, parsed);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    recorder.record('set_style', { layer_id: layer.id, style: parsed });
    setError(null);
    setText(format(layer.currentStyle));
    onChange();
  };

  const reset = () => {
    mapController.resetStyle(layer.id);
    recorder.record('reset_style', { layer_id: layer.id });
    setText(format(layer.defaultStyle));
    setError(null);
    onChange();
  };

  const currentText = format(layer.currentStyle) || '(none)';

  return (
    <div className="jp-GeoAgent-field jp-GeoAgent-tool-form">
      <div className="jp-GeoAgent-field-label">
        <span>Style</span>
      </div>
      <div className="jp-GeoAgent-tool-form-current">
        <span className="jp-GeoAgent-field-label">Current:</span>
        <pre className="jp-GeoAgent-filter-readonly">{currentText}</pre>
      </div>
      <textarea
        className="jp-GeoAgent-textarea"
        rows={5}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'{\n  "fill-color": "#2E7D32",\n  "fill-opacity": 0.5\n}'}
      />
      {error && <div className="jp-GeoAgent-error">{error}</div>}
      <div className="jp-GeoAgent-field-row">
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={apply}>Apply</button>
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={reset}>Reset to default</button>
      </div>
      {setStyleDesc && (
        <details className="jp-GeoAgent-tool-form-help">
          <summary>Style syntax (from geo-agent)</summary>
          <pre>{setStyleDesc}</pre>
        </details>
      )}
    </div>
  );
};
