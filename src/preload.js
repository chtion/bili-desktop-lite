'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bili', {
  api: async (method, data) => {
    const result = await ipcRenderer.invoke('app:request', method, data);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
  command: (action, value) => ipcRenderer.send('app:command', action, value),
  onEvent: (callback) => ipcRenderer.on('app:event', (_event, type, value) => callback(type, value))
});
