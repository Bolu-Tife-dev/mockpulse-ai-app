'use strict';

/**
 * MockPulse AI — Electron main process.
 * Handles window lifecycle, secure API-key storage (OS keychain via `safeStorage`
 * with a keytar-compatible interface), a local JSON settings store, and screen
 * capture / media permission plumbing.
 */

const { app, BrowserWindow, ipcMain, safeStorage, session, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDev = !!process.env.VITE_DEV_SERVER_URL;

/* -------------------------------------------------------------------------- */
/* Local JSON store (electron-store compatible, zero native deps)             */
/* -------------------------------------------------------------------------- */

const STORE_DIR = path.join(app.getPath('userData'), 'mockpulse');
const SETTINGS_FILE = path.join(STORE_DIR, 'settings.json');
const SECRETS_FILE = path.join(STORE_DIR, 'secrets.enc');
const REPORTS_DIR = path.join(STORE_DIR, 'reports');

function ensureDirs() {
  for (const dir of [STORE_DIR, REPORTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDirs();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** In-memory settings cache. */
let settings = {};

function loadSettings() {
  settings = readJson(SETTINGS_FILE, {});
  return settings;
}

/* -------------------------------------------------------------------------- */
/* Secret storage — keytar-compatible facade backed by Electron safeStorage   */
/* (OS keychain: Keychain / DPAPI / libsecret). Falls back to AES-256-GCM     */
/* with a machine-derived key if the OS keystore is unavailable.               */
/* -------------------------------------------------------------------------- */

const SECRET_SERVICE = 'MockPulse AI';

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function readSecretsBlob() {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return null;
    return fs.readFileSync(SECRETS_FILE);
  } catch {
    return null;
  }
}

/** Deterministic machine-local key used only as a last-resort fallback. */
function fallbackKey() {
  const seed = `${app.getName()}|${app.getVersion()}|${process.platform}|${app.getPath('userData')}`;
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptBuffer(buf) {
  if (encryptionAvailable()) {
    return { v: 1, mode: 'safeStorage', payload: safeStorage.encryptString(buf.toString('utf8')) };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fallbackKey(), iv);
  const enc = Buffer.concat([cipher.update(buf, 'utf8'), cipher.final()]);
  return { v: 1, mode: 'aes-256-gcm', payload: Buffer.concat([iv, enc, cipher.getAuthTag()]) };
}

function decryptBuffer(rec) {
  if (rec.mode === 'safeStorage') {
    return Buffer.from(safeStorage.decryptString(rec.payload), 'utf8');
  }
  const data = rec.payload;
  const iv = data.subarray(0, 12);
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(12, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', fallbackKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

let secretsCache = null;

function loadSecrets() {
  if (secretsCache) return secretsCache;
  const blob = readSecretsBlob();
  if (!blob) {
    secretsCache = {};
    return secretsCache;
  }
  try {
    const rec = JSON.parse(blob.toString('utf8'));
    rec.payload = Buffer.from(rec.payload.data ? rec.payload.data : rec.payload, 'base64');
    secretsCache = JSON.parse(decryptBuffer(rec).toString('utf8'));
  } catch {
    secretsCache = {};
  }
  return secretsCache;
}

function saveSecrets(obj) {
  secretsCache = obj;
  ensureDirs();
  const rec = encryptBuffer(Buffer.from(JSON.stringify(obj), 'utf8'));
  const out = { v: rec.v, mode: rec.mode, payload: rec.payload.toString('base64') };
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(out), { mode: 0o600 });
}

/**
 * keytar-compatible API surface so the renderer can swap `keytar` in later.
 * service = "MockPulse AI", account = key alias (e.g. "gemini", "groq").
 */
const keytar = {
  async getPassword(_service, account) {
    return loadSecrets()[account] || null;
  },
  async setPassword(_service, account, password) {
    const s = loadSecrets();
    s[account] = password;
    saveSecrets(s);
    return true;
  },
  async deletePassword(_service, account) {
    const s = loadSecrets();
    const existed = Object.prototype.hasOwnProperty.call(s, account);
    delete s[account];
    saveSecrets(s);
    return existed;
  },
  async findCredentials(_service) {
    return Object.entries(loadSecrets()).map(([account, password]) => ({ account, password }));
  },
};

/* -------------------------------------------------------------------------- */
/* Window                                                                     */
/* -------------------------------------------------------------------------- */

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0e24',
    title: 'MockPulse AI',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* -------------------------------------------------------------------------- */
/* Media / permission plumbing                                                */
/* -------------------------------------------------------------------------- */

function setupPermissions() {
  const granted = new Set([
    'media',
    'mediaKeySystem',
    'display-capture',
    'fullscreen',
    'pointerLock',
    'openExternal',
    'clipboard-sanitized-write',
    'audioCapture',
    'videoCapture',
  ]);

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(granted.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return granted.has(permission);
  });
}

/* -------------------------------------------------------------------------- */
/* IPC                                                                        */
/* -------------------------------------------------------------------------- */

function setupIpc() {
  /* ---- settings (non-secret) ---- */
  ipcMain.handle('settings:get', () => loadSettings());

  ipcMain.handle('settings:set', (_e, patch) => {
    settings = { ...loadSettings(), ...(patch || {}) };
    writeJson(SETTINGS_FILE, settings);
    return settings;
  });

  ipcMain.handle('settings:reset', () => {
    settings = {};
    writeJson(SETTINGS_FILE, settings);
    try {
      if (fs.existsSync(SECRETS_FILE)) fs.unlinkSync(SECRETS_FILE);
    } catch {
      /* ignore */
    }
    secretsCache = {};
    return settings;
  });

  /* ---- secrets (keytar compatible) ---- */
  ipcMain.handle('secrets:get', (_e, account) => keytar.getPassword(SECRET_SERVICE, account));
  ipcMain.handle('secrets:set', (_e, account, value) => keytar.setPassword(SECRET_SERVICE, account, value));
  ipcMain.handle('secrets:delete', (_e, account) => keytar.deletePassword(SECRET_SERVICE, account));
  ipcMain.handle('secrets:list', async () => (await keytar.findCredentials(SECRET_SERVICE)).map((c) => c.account));
  ipcMain.handle('secrets:backend', () => (encryptionAvailable() ? 'os-keystore' : 'aes-256-fallback'));

  /* ---- reports ---- */
  ipcMain.handle('reports:list', () => {
    ensureDirs();
    try {
      return fs
        .readdirSync(REPORTS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const full = path.join(REPORTS_DIR, f);
          const stat = fs.statSync(full);
          return { file: f, mtime: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.mtime - a.mtime);
    } catch {
      return [];
    }
  });

  ipcMain.handle('reports:save', (_e, report) => {
    ensureDirs();
    const id = `${report.id || Date.now()}`;
    const file = path.join(REPORTS_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
    return file;
  });

  ipcMain.handle('reports:load', (_e, file) => {
    const safe = path.basename(String(file));
    const full = path.join(REPORTS_DIR, safe);
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  });

  ipcMain.handle('reports:export', async (_e, { name, content }) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), `${name}`),
      filters: name.endsWith('.md')
        ? [{ name: 'Markdown', extensions: ['md'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, content, 'base64');
    return result.filePath;
  });

  /* ---- app ---- */
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    dev: isDev,
  }));

  ipcMain.handle('app:openPath', (_e, p) => shell.openPath(String(p)));

  ipcMain.handle('media:devices', async () => {
    // Enumerating via the renderer's getUserMedia is preferred; this is a
    // best-effort fallback that never throws.
    try {
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadSettings();
    setupPermissions();
    setupIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    try {
      if (fs.existsSync(`${SETTINGS_FILE}.tmp`)) fs.unlinkSync(`${SETTINGS_FILE}.tmp`);
    } catch {
      /* ignore */
    }
  });
}
