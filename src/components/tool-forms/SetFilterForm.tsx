/**
 * SetFilterForm — wraps geo-agent's set_filter / clear_filter /
 * reset_filter tools. Shows the current filter read-only; pre-fills a
 * textarea with that filter so the user can edit and Apply. Help text
 * (MapLibre expression examples) is sourced live from geo-agent's tool
 * description, so corrections there propagate on `yarn upgrade`.
 */

import * as React from 'react';
import { LayerState } from '../../core/types';
import { MapViewController } from '../MapView';
import { ToolCallRecorder } from '../../core/tools';
import { getToolMetadata } from '../../core/tool-metadata';

export interface SetFilterFormProps {
  layer: LayerState;
  mapController: MapViewController;
  recorder: ToolCallRecorder;
  onChange: () => void;
}

export const SetFilterForm: React.FC<SetFilterFormProps> = ({
  layer,
  mapController,
  recorder,
  onChange,
}) => {
  const initial = layer.filter ? JSON.stringify(layer.filter) : '';
  const [text, setText] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  // Re-sync the textarea when the selected layer changes. Mid-edit state
  // is not clobbered by unrelated re-renders because the local state
  // only re-initializes on layer.id change.
  React.useEffect(() => {
    setText(layer.filter ? JSON.stringify(layer.filter) : '');
    setError(null);
  }, [layer.id]);

  const meta = React.useMemo(() => getToolMetadata(mapController), [mapController]);
  const setFilterDesc = meta['set_filter']?.description ?? '';

  const apply = () => {
    if (!text.trim()) {
      setError('Enter a MapLibre filter expression, or use Clear to remove any filter.');
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (!Array.isArray(parsed)) {
      setError('Filter must be a JSON array (MapLibre expression).');
      return;
    }
    try {
      mapController.setFilter(layer.id, parsed);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    recorder.record('set_filter', { layer_id: layer.id, filter: parsed });
    setError(null);
    setText(JSON.stringify(parsed));
    onChange();
  };

  const clear = () => {
    mapController.clearFilter(layer.id);
    recorder.record('clear_filter', { layer_id: layer.id });
    setText('');
    setError(null);
    onChange();
  };

  const reset = () => {
    mapController.resetFilter(layer.id);
    recorder.record('reset_filter', { layer_id: layer.id });
    setText(layer.defaultFilter ? JSON.stringify(layer.defaultFilter) : '');
    setError(null);
    onChange();
  };

  const currentText = layer.filter ? JSON.stringify(layer.filter) : '(none)';

  return (
    <div className="jp-GeoAgent-field jp-GeoAgent-tool-form">
      <div className="jp-GeoAgent-field-label">
        <span>Filter</span>
      </div>
      <div className="jp-GeoAgent-tool-form-current">
        <span className="jp-GeoAgent-field-label">Current:</span>{' '}
        <code>{currentText}</code>
      </div>
      <textarea
        className="jp-GeoAgent-textarea"
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder='["match", ["get", "col"], ["v1","v2"], true, false]'
      />
      {error && <div className="jp-GeoAgent-error">{error}</div>}
      <div className="jp-GeoAgent-field-row">
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={apply}>Apply</button>
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={clear}>Clear</button>
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={reset}>Reset to default</button>
      </div>
      {setFilterDesc && (
        <details className="jp-GeoAgent-tool-form-help">
          <summary>Filter syntax (from geo-agent)</summary>
          <pre>{setFilterDesc}</pre>
        </details>
      )}
    </div>
  );
};
