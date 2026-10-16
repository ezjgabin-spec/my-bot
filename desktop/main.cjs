const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  safeStorage,
  shell,
  dialog,
} = require("electron");
const { fork } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const net = require("node:net");
const { randomBytes, randomUUID } = require("node:crypto");

let window,
  tray,
  server,
  origin,
  quitting = false;
let preferences = {
  model: "claude-sonnet-4-6",
  startAtLogin: true,
  encryptedKey: "",
};
let key = "";
const pending = new Map();
const token = randomBytes(32).toString("hex");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const dataDir = () => path.join(app.getPath("userData"), "data");
function encryptionAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    !(
      process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text"
    )
  );
}

function publicSettings() {
  return {
    hasKey: Boolean(key),
    model: preferences.model,
    startAtLogin:
      process.platform === "win32" && app.isPackaged
        ? app.getLoginItemSettings().openAtLogin
        : preferences.startAtLogin,
    encryptionAvailable: encryptionAvailable(),
    startupAvailable: process.platform === "win32" && app.isPackaged,
  };
}
function authorize(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== origin
  )
    throw new Error("Access denied.");
}
async function persist(value) {
  const file = settingsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
  await fs.rename(file + ".tmp", file);
}
function configureChild() {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error("The study engine did not respond. Restart StudyPredict."),
      );
    }, 30000);
    pending.set(id, () => {
      clearTimeout(timeout);
      resolve();
    });
    server.send({
      type: "configure",
      id,
      apiKey: key,
      model: preferences.model,
    });
  });
}
function loginSetting(enabled) {
  if (process.platform === "win32" && app.isPackaged)
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ["--background"],
    });
}
function show() {
  window?.show();
  if (window?.isMinimized()) window.restore();
  window?.focus();
}

async function start() {
  app.setAppUserModelId("com.studypredict.ai");
  try {
    const saved = JSON.parse(await fs.readFile(settingsFile(), "utf8"));
    preferences = { ...preferences, ...saved };
    if (preferences.encryptedKey) {
      try {
        key = safeStorage.decryptString(
          Buffer.from(preferences.encryptedKey, "base64"),
        );
      } catch {
        dialog.showErrorBox(
          "API key needs to be entered again",
          "Windows could not unlock your saved API key. Open Settings to save it again. Your study data is unchanged.",
        );
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "Settings could not be read. Your study data has been preserved.",
      );
    await persist(preferences);
    loginSetting(true);
  }
  await fs.mkdir(dataDir(), { recursive: true });
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  origin = "http://127.0.0.1:" + port;
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "..", "server");
  // Run as a real Node process: PDF.js intentionally treats Electron utility
  // processes as browser contexts and otherwise tries to use browser workers.
  server = fork(path.join(__dirname, "server.cjs"), [], {
    execPath: process.execPath,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      STUDYPREDICT_DESKTOP: "1",
      STUDYPREDICT_SESSION_TOKEN: token,
      STUDYPREDICT_SERVER_ROOT: serverRoot,
      STUDYPREDICT_DATA_DIR: dataDir(),
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_MODEL: "",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  // Discard output rather than retaining private study content or provider errors.
  server.stdout?.resume();
  server.stderr?.resume();
  server.on("message", (message) => {
    if (message.type === "configured") {
      pending.get(message.id)?.();
      pending.delete(message.id);
    }
  });
  server.on("exit", () => {
    if (!quitting) {
      dialog.showErrorBox(
        "Study engine stopped",
        "Please reopen StudyPredict. Saved tests and answers remain on this computer.",
      );
      app.quit();
    }
  });
  await configureChild();
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(origin + "/api/state", {
        headers: { Cookie: "studypredict-session=" + token },
        signal: AbortSignal.timeout(1000),
      });
      // A damaged data file should still allow opening Settings for recovery.
      if (response.status === 200 || response.status === 500) {
        ready = true;
        break;
      }
    } catch {
      /* Startup is still in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready)
    throw new Error(
      "The local study engine could not start. Close StudyPredict and try again.",
    );
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 600,
    show: false,
    title: "StudyPredict AI",
    backgroundColor: "#0b1020",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "study-session",
    },
  });
  const session = window.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.setPermissionCheckHandler(() => false);
  await session.cookies.set({
    url: origin,
    name: "studypredict-session",
    value: token,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.png")));
  tray.setToolTip("StudyPredict AI — running");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open StudyPredict", click: show },
      {
        label: "Settings",
        click: () => {
          window.loadURL(origin + "/settings");
          show();
        },
      },
      { type: "separator" },
      { label: "Quit StudyPredict", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", show);
  tray.on("click", show);
  Menu.setApplicationMenu(null);
  ipcMain.handle("study:settings", (event) => {
    authorize(event);
    return publicSettings();
  });
  ipcMain.handle("study:save", async (event, input) => {
    authorize(event);
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.startAtLogin !== "boolean" ||
      typeof input.model !== "string" ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(input.model)
    )
      throw new Error("Please check your settings.");
    const next = {
      ...preferences,
      model: input.model,
      startAtLogin: input.startAtLogin,
    };
    let nextKey = key;
    if (input.removeKey === true) {
      next.encryptedKey = "";
      nextKey = "";
    } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
      nextKey = input.apiKey.trim();
      if (
        !nextKey.startsWith("sk-ant-") ||
        nextKey.length < 20 ||
        nextKey.length > 512 ||
        /\s/.test(nextKey)
      )
        throw new Error(
          "Paste your full Anthropic API key, starting with sk-ant-.",
        );
      if (!encryptionAvailable())
        throw new Error(
          "Windows key encryption is unavailable. The key was not saved.",
        );
      next.encryptedKey = safeStorage.encryptString(nextKey).toString("base64");
    }
    await persist(next);
    key = nextKey;
    preferences = next;
    loginSetting(preferences.startAtLogin);
    await configureChild();
    return publicSettings();
  });
  ipcMain.handle("study:open-data", async (event) => {
    authorize(event);
    const error = await shell.openPath(dataDir());
    if (error) throw new Error("The data folder could not be opened.");
  });
  ipcMain.handle("study:open-keys", (event) => {
    authorize(event);
    return shell.openExternal("https://console.anthropic.com/settings/keys");
  });
  await window.loadURL(origin + (key ? "/" : "/settings"));
  if (!process.argv.includes("--background") || !key) show();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app.on("activate", show);
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    server?.kill();
    tray?.destroy();
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(
        "StudyPredict could not start",
        error.message || "Please reopen the app.",
      );
      app.quit();
    });
}
