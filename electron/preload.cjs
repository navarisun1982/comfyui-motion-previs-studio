const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronComfyBridge', {
  isElectron: true,
  request: (options) => ipcRenderer.invoke('comfy:request', options),
  uploadImage: (options) => ipcRenderer.invoke('comfy:upload-image', options),
  syncWorkflows: (options) => ipcRenderer.invoke('comfy:sync-workflows', options),
  getSyncStatus: () => ipcRenderer.invoke('comfy:sync-status'),
  fetchRemoteWorkflow: (url) => ipcRenderer.invoke('comfy:fetch-remote-workflow', url),
});

