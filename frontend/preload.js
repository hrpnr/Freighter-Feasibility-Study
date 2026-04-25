const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Basic exposure for verification
    version: process.versions.electron
});
