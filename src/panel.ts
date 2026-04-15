/**
 * GeoAgentPanel — JupyterLab main area widget wrapping the React app.
 */

import { ReactWidget } from '@jupyterlab/apputils';
import * as React from 'react';
import { GeoAgentApp, GeoAgentAppProps } from './components/GeoAgentApp';

export class GeoAgentPanel extends ReactWidget {
  private _props: GeoAgentAppProps;

  constructor(props: GeoAgentAppProps) {
    super();
    this._props = props;
    this.addClass('jp-GeoAgent-panel');
    this.id = 'geoagent-panel';
    this.title.label = 'GeoAgent Map';
    this.title.closable = true;
  }

  protected render(): React.ReactElement {
    return React.createElement(GeoAgentApp, this._props);
  }
}
