import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import os from 'os';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let updateStatus = {
  phase: app.isPackaged ? 'checking' : 'idle',
  currentVersion: app.getVersion(),
};

function publishUpdateStatus(status) {
  updateStatus = {
    currentVersion: app.getVersion(),
    ...status,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', updateStatus);
  }
}

// Local LAN Server for multi-counter sync (Port 45455)
const PORT = 45455;
let serverInstance = null;

function startLanServer() {
  if (serverInstance) return;

  serverInstance = http.createServer(async (req, res) => {
    // Enable CORS for LAN requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Ping check for Counter PC
    if (url.pathname === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', serverTime: new Date().toISOString() }));
      return;
    }

    // Database Sync Request
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          if (mainWindow && !mainWindow.isDestroyed()) {
            const result = await mainWindow.webContents.executeJavaScript(
              `window.__handleLanRequest(${JSON.stringify(payload)})`
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: result, error: null }));
          } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: null, error: 'Main PC window not available' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: null, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  serverInstance.listen(PORT, '0.0.0.0', () => {
    console.log(`LAN Server running on port ${PORT}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Pharmacy POS & Inventory System",
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

function startAutoUpdater() {
  ipcMain.handle('updater:get-status', () => updateStatus);

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    publishUpdateStatus({ phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    publishUpdateStatus({ phase: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    publishUpdateStatus({ phase: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    publishUpdateStatus({
      phase: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateStatus({
      phase: 'installing',
      version: info.version,
      percent: 100,
    });

    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1200);
  });

  autoUpdater.on('error', (error) => {
    console.error('Update check or download failed:', error);
    publishUpdateStatus({ phase: 'error', message: error.message });
  });

  const checkForUpdates = async () => {
    publishUpdateStatus({ phase: 'checking' });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      publishUpdateStatus({ phase: 'error', message });
    }
  };

  // Check at launch, then periodically while the app remains open.
  checkForUpdates();
  setInterval(checkForUpdates, 2 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  startLanServer();
  startAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverInstance) serverInstance.close();
  if (process.platform !== 'darwin') app.quit();
});
