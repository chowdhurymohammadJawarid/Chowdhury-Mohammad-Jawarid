const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProc = null;
let tray = null;
let isQuitting = false;

function waitForServer(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const check = () => {
      count += 1;
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (count >= attempts) {
          reject(new Error('ULTRON core server timed out starting on port 3000.'));
        } else {
          setTimeout(check, 350);
        }
      });
    };
    check();
  });
}

function startBackendServer() {
  const rootDir = path.resolve(__dirname, '..');
  const bundledEntry = path.join(rootDir, 'dist-server', 'server.mjs');

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ULTRON_ROOT_DIR: rootDir,
  };

  serverProc = spawn(process.execPath, [bundledEntry], {
    cwd: rootDir,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
    backgroundColor: '#070402',
    title: 'ULTRON — Personal Desktop AI Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.loadURL('http://127.0.0.1:3000');

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= 3.0) {
        // Warm amber core (#fde047)
        buf[idx] = 253;
        buf[idx + 1] = 224;
        buf[idx + 2] = 71;
        buf[idx + 3] = 255;
      } else if (dist >= 5.2 && dist <= 7.2) {
        // Glowing orange ring (#f59e0b)
        buf[idx] = 245;
        buf[idx + 1] = 158;
        buf[idx + 2] = 11;
        buf[idx + 3] = 255;
      } else if (dist < 7.5) {
        // Obsidian fill (#070402)
        buf[idx] = 7;
        buf[idx + 1] = 4;
        buf[idx + 2] = 2;
        buf[idx + 3] = 245;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('ULTRON — Personal Desktop AI Assistant');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show ULTRON',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Wake & Listen',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('ultron-tray-wake');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit ULTRON',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  startBackendServer();
  await waitForServer('http://127.0.0.1:3000/api/health');

  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('ultron-tray-wake');
    }
  });

  ipcMain.on('ultron-window-minimize', () => mainWindow?.minimize());
  ipcMain.on('ultron-window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('ultron-window-close', () => {
    isQuitting = true;
    app.quit();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
  }
});
