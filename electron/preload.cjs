const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ultronDesktop', {
  isDesktop: true,
  minimize: () => ipcRenderer.send('ultron-window-minimize'),
  maximizeToggle: () => ipcRenderer.send('ultron-window-maximize'),
  close: () => ipcRenderer.send('ultron-window-close'),
  onWakeFromTray: (callback) => {
    ipcRenderer.on('ultron-tray-wake', () => callback());
  },
});
