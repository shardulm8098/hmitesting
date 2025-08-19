const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDevices: () => ipcRenderer.invoke('get-devices'),
  inspectScreen: (data) => ipcRenderer.invoke('inspect-screen', data),
  executeTests: (code) => ipcRenderer.invoke('execute-tests', code),
  openReportFolder: () => ipcRenderer.invoke('open-report-folder'),
  onUpdateLog: (callback) => ipcRenderer.on('update-log', (_event, value) => callback(value)),
  onExecutionFinished: (callback) => ipcRenderer.on('execution-finished', (_event, value) => callback(value))
});
