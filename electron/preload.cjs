const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronComfyBridge', {
  isElectron: true,
  request: (options) => ipcRenderer.invoke('comfy:request', options),
  uploadImage: (options) => ipcRenderer.invoke('comfy:upload-image', options),
  syncWorkflows: (options) => ipcRenderer.invoke('comfy:sync-workflows', options),
  getSyncStatus: () => ipcRenderer.invoke('comfy:sync-status'),
  fetchRemoteWorkflow: (url) => ipcRenderer.invoke('comfy:fetch-remote-workflow', url),
  checkAppUpdate: (options) => ipcRenderer.invoke('app-update:check', options),
  applyAppUpdate: () => ipcRenderer.invoke('app-update:apply'),
  loadStudioProject: () => ipcRenderer.invoke('studio-storage:load-project'),
  saveStudioProject: (payload) => ipcRenderer.invoke('studio-storage:save-project', payload),
});

