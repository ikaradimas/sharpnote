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
  loadNotebook: () => ipcRenderer.invoke('load-notebook'),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
});
