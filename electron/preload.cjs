const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("toradeliaDesktop", {
  selectFolder: () => ipcRenderer.invoke("toradelia:select-folder"),
  openLogsFolder: () => ipcRenderer.invoke("toradelia:open-logs-folder"),
});
