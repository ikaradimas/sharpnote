import { Transport } from '@open-rpc/client-js/build/transports/Transport';
import { getNotifications, getBatchRequests } from '@open-rpc/client-js/build/Request';
import { JSONRPCError, ERR_UNKNOWN } from '@open-rpc/client-js/build/Error';

/**
 * LSP Transport that proxies messages via the Electron main process IPC channels.
 *
 * Outgoing: serialises to JSON and adds the LSP Content-Length header before
 * calling window.electronAPI.lspSend, which writes to the kernel's named pipe.
 *
 * Incoming: buffers the UTF-8 string chunks emitted by lsp-receive IPC events,
 * strips the Content-Length header framing, and hands the raw JSON body to the
 * @open-rpc/client-js TransportRequestManager.
 */
export class ElectronLspTransport extends Transport {
  constructor(notebookId) {
    super();
    this._notebookId = notebookId;
    this._buffer = '';
    this._receiveHandler = null;
  }

  connect() {
    this._receiveHandler = (data) => {
      this._buffer += data;
      this._processBuffer();
    };
    window.electronAPI.onLspReceive(this._notebookId, this._receiveHandler);
    return Promise.resolve();
  }

  close() {
    if (this._receiveHandler) {
      window.electronAPI.offLspReceive(this._receiveHandler);
      this._receiveHandler = null;
    }
    this._buffer = '';
  }

  async sendData(data, timeout = 5000) {
    const prom = this.transportRequestManager.addRequest(data, timeout);
    const notifications = getNotifications(data);
    try {
      const json = JSON.stringify(this.parseData(data));
      const byteLen = new TextEncoder().encode(json).length;
      window.electronAPI.lspSend(this._notebookId, `Content-Length: ${byteLen}\r\n\r\n${json}`);
      this.transportRequestManager.settlePendingRequest(notifications);
    } catch (err) {
      const jsonError = new JSONRPCError(err.message, ERR_UNKNOWN, err);
      this.transportRequestManager.settlePendingRequest(notifications, jsonError);
      this.transportRequestManager.settlePendingRequest(getBatchRequests(data), jsonError);
      return Promise.reject(jsonError);
    }
    return prom;
  }

  _processBuffer() {
    while (true) {
      const sep = this._buffer.indexOf('\r\n\r\n');
      if (sep === -1) break;
      const header = this._buffer.slice(0, sep);
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { this._buffer = ''; break; }
      const length = parseInt(m[1], 10);
      const bodyStart = sep + 4;
      if (this._buffer.length < bodyStart + length) break;
      const body = this._buffer.slice(bodyStart, bodyStart + length);
      this._buffer = this._buffer.slice(bodyStart + length);
      this.transportRequestManager.resolveResponse(body);
    }
  }
}
