const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studyDesktop", {
  settings: () => ipcRenderer.invoke("study:settings"),
  save: (settings) => ipcRenderer.invoke("study:save", settings),
  openData: () => ipcRenderer.invoke("study:open-data"),
  openKeys: () => ipcRenderer.invoke("study:open-keys"),
});
