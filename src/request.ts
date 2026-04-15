import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

export async function requestAPI<T>(
  endPoint: string,
  serverSettings: ServerConnection.ISettings,
  init: RequestInit = {}
): Promise<T> {
  const requestUrl = URLExt.join(
    serverSettings.baseUrl,
    'jupyter-geoagent',
    endPoint
  );

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, serverSettings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error as any);
  }

  let data: any = await response.text();
  if (data.length > 0) {
    try {
      data = JSON.parse(data);
    } catch {
      // not JSON
    }
  }

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message || data);
  }

  return data;
}
