const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("toradeliaDesktop", {
  selectFolder: () => ipcRenderer.invoke("toradelia:select-folder"),
});
