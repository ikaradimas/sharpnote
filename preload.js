const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Kernel communication
  onKernelMessage: (callback) => {
    ipcRenderer.on('kernel-message', (_event, message) => callback(message));
  },
  offKernelMessage: (callback) => {
    ipcRenderer.removeListener('kernel-message', callback);
  },
  sendToKernel: (message) => {
    ipcRenderer.send('kernel-send', message);
  },
  resetKernel: () => {
    ipcRenderer.send('kernel-reset');
  },

  // File operations
  saveNotebook: (data) => ipcRenderer.invoke('save-notebook', data),
  saveNotebookTo: (filePath, data) => ipcRenderer.invoke('save-notebook-to', { filePath, data }),
  loadNotebook: () => ipcRenderer.invoke('load-notebook'),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),

  // Font size
  onFontSizeChange: (callback) => {
    ipcRenderer.on('font-size-change', (_event, size) => callback(size));
  },

  // Menu actions
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  },

  // Log operations
  onLogEntry: (callback) => {
    ipcRenderer.on('log-entry', (_event, entry) => callback(entry));
  },
  offLogEntry: (callback) => {
    ipcRenderer.removeListener('log-entry', callback);
  },
  getLogFiles: () => ipcRenderer.invoke('get-log-files'),
  readLogFile: (filename) => ipcRenderer.invoke('read-log-file', filename),
  deleteLogFile: (filename) => ipcRenderer.invoke('delete-log-file', filename),
});
