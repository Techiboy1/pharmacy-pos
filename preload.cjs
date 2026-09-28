const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pharmacyUpdater', {
  getStatus: () => ipcRenderer.invoke('updater:get-status'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  },
});
