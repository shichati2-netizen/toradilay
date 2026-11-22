const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");

process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
app.commandLine.appendSwitch("disable-dev-shm-usage");

let mainWindow = null;
let activePort = 3210;
let diagnosticLogDirectory = null;
let diagnosticLogFile = null;

const DIAGNOSTIC_LOG_MAX_BYTES = 5 * 1024 * 1024;
const DIAGNOSTIC_LOG_ARCHIVES = 4;

function redactLogString(value) {
  return String(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:access_token|refresh_token|token|key|api_key|pin)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(access_token|refresh_token|token|password|secret|api[_-]?key|authorization|pin)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b\d{9,12}\b/g, "[ID]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
}

function normalizeLogValue(value, depth = 0) {
  if (depth > 5) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return {
      name: redactLogString(value.name),
      message: redactLogString(value.message),
      stack: value.stack ? redactLogString(value.stack).slice(0, 12000) : undefined,
    };
  }
  if (typeof value === "string") return redactLogString(value).slice(0, 12000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => normalizeLogValue(item, depth + 1));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 60)) {
      if (/token|secret|password|authorization|cookie|api.?key|^pin$/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = normalizeLogValue(item, depth + 1);
      }
    }
    return result;
  }
  return redactLogString(String(value));
}

function rotateDiagnosticLogIfNeeded() {
  try {
    if (!diagnosticLogFile || !fs.existsSync(diagnosticLogFile)) return;
    if (fs.statSync(diagnosticLogFile).size < DIAGNOSTIC_LOG_MAX_BYTES) return;
    const oldest = diagnosticLogFile + "." + DIAGNOSTIC_LOG_ARCHIVES;
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
    for (let index = DIAGNOSTIC_LOG_ARCHIVES - 1; index >= 1; index--) {
      const from = diagnosticLogFile + "." + index;
      const to = diagnosticLogFile + "." + (index + 1);
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    fs.renameSync(diagnosticLogFile, diagnosticLogFile + ".1");
  } catch {
    // Logging must never prevent the application from starting or running.
  }
}

function writeDiagnosticLog(level, event, details = {}) {
  try {
    if (!diagnosticLogFile) return;
    rotateDiagnosticLogIfNeeded();
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      appVersion: app.getVersion(),
      pid: process.pid,
      details: normalizeLogValue(details),
    };
    fs.appendFileSync(diagnosticLogFile, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {
    // Logging must never crash the application.
  }
}

function initializeDiagnosticLogging() {
  const dataDirectory = process.env.KIOSK_DATA_DIR || path.join(app.getPath("userData"), "data");
  diagnosticLogDirectory = path.join(dataDirectory, "logs");
  fs.mkdirSync(diagnosticLogDirectory, { recursive: true });
  diagnosticLogFile = path.join(diagnosticLogDirectory, "toradelia-diagnostics.jsonl");

  for (const method of ["log", "info", "warn", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      const level = method === "error" ? "error" : method === "warn" ? "warn" : "info";
      writeDiagnosticLog(level, "console." + method, { arguments: args });
      original(...args);
    };
  }

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    writeDiagnosticLog("fatal", "process.uncaughtException", { origin, error });
  });
  process.on("unhandledRejection", (reason) => {
    writeDiagnosticLog("error", "process.unhandledRejection", { reason });
  });
  process.on("warning", (warning) => {
    writeDiagnosticLog("warn", "process.warning", { warning });
  });

  writeDiagnosticLog("info", "application.start", {
    platform: process.platform,
    architecture: process.arch,
    userDataDirectory: app.getPath("userData"),
    logFile: diagnosticLogFile,
  });
}

function isLocalAppUrl(target) {
  try {
    const url = new URL(target);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isTrustedAuthUrl(target) {
  try {
    const hostname = new URL(target).hostname.toLowerCase();
    return (
      hostname === "accounts.google.com" ||
      hostname === "google.com" || hostname.endsWith(".google.com") ||
      hostname.endsWith(".googleusercontent.com") ||
      hostname.endsWith(".gstatic.com") ||
      hostname.endsWith(".firebaseapp.com") ||
      hostname.endsWith(".web.app")
    );
  } catch {
    return false;
  }
}

function isAllowedPopupUrl(target) {
  return target === "about:blank" || target.startsWith("about:blank#") ||
    isLocalAppUrl(target) || isTrustedAuthUrl(target);
}

function loadUserEnvironment() {
  const configPath = path.join(app.getPath("userData"), "app.env");
  if (!fs.existsSync(configPath)) return configPath;
  for (const rawLine of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return configPath;
}

function findFreePort(start = 3210, tries = 25) {
  return new Promise((resolve, reject) => {
    let port = start;
    const attempt = () => {
      if (tries-- <= 0) return reject(new Error("לא נמצא פורט פנוי להפעלת השרת המקומי."));
      const probe = net.createServer();
      probe.once("error", () => { port++; attempt(); });
      probe.listen(port, "127.0.0.1", () => probe.close((err) => {
        if (err) { port++; attempt(); } else resolve(port);
      }));
    };
    attempt();
  });
}

function waitForServer(url, maxAttempts = 100) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const retry = () => {
      attempts++;
      if (attempts >= maxAttempts) return reject(new Error("השרת המקומי לא עלה בזמן. בדוק שההתקנה מלאה ושאין תוכנת אבטחה שחוסמת את האפליקציה."));
      setTimeout(check, 350);
    };
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.setTimeout(1200, () => req.destroy(new Error("timeout")));
      req.on("error", retry);
    };
    check();
  });
}


ipcMain.handle("toradelia:open-logs-folder", async () => {
  try {
    if (!diagnosticLogDirectory) {
      diagnosticLogDirectory = path.join(process.env.KIOSK_DATA_DIR || path.join(app.getPath("userData"), "data"), "logs");
    }
    fs.mkdirSync(diagnosticLogDirectory, { recursive: true });
    writeDiagnosticLog("info", "diagnostics.open-folder", {});
    const result = await shell.openPath(diagnosticLogDirectory);
    if (result) {
      writeDiagnosticLog("error", "diagnostics.open-folder-failed", { error: result });
      return { ok: false, error: result };
    }
    return { ok: true };
  } catch (error) {
    writeDiagnosticLog("error", "diagnostics.open-folder-failed", { error });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("toradelia:select-folder", async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "בחירת תיקיית תלמידים",
    properties: ["openDirectory"],
  });
  return result.canceled || !result.filePaths[0]
    ? { canceled: true }
    : { canceled: false, path: result.filePaths[0] };
});

function createWindow(url) {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1366, height: 850, minWidth: 1024, minHeight: 640,
    show: false, backgroundColor: "#071124", title: "תורה דיליה",
    icon: path.join(app.getAppPath(), "182b1da6-2942-43c4-8971-c140c46ee0b8.jfif"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
      backgroundThrottling: true,
    }
  });
  mainWindow.once("ready-to-show", () => {
    writeDiagnosticLog("info", "window.ready-to-show", { url });
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    writeDiagnosticLog("info", "renderer.did-finish-load", { url: mainWindow?.webContents.getURL() });
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeDiagnosticLog("error", "renderer.did-fail-load", { errorCode, errorDescription, url: validatedURL, isMainFrame });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeDiagnosticLog("fatal", "renderer.process-gone", details);
  });
  mainWindow.webContents.on("unresponsive", () => {
    writeDiagnosticLog("error", "renderer.unresponsive", {});
  });
  mainWindow.webContents.on("responsive", () => {
    writeDiagnosticLog("info", "renderer.responsive", {});
  });
  mainWindow.webContents.on("console-message", (_event, detailsOrLevel, legacyMessage, lineNumber, sourceId) => {
    const details = detailsOrLevel && typeof detailsOrLevel === "object"
      ? detailsOrLevel
      : { level: detailsOrLevel, message: legacyMessage, lineNumber, sourceId };
    const rawLevel = String(details.level ?? "info").toLowerCase();
    const level = rawLevel === "3" || rawLevel === "error" ? "error"
      : rawLevel === "2" || rawLevel === "warning" || rawLevel === "warn" ? "warn" : "info";
    writeDiagnosticLog(level, "renderer.console", details);
  });

  // Firebase Auth פותח תחילה about:blank ואז מנווט לחלון ההזדהות.
  // חסימת about:blank משאירה חלון לבן או מונעת מהחלון להתחלף למסך Google.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    return isAllowedPopupUrl(target) ? { action: "allow" } : { action: "deny" };
  });
  mainWindow.webContents.on("did-create-window", (popupWindow) => {
    // גם חלונות התחברות נשארים מוגבלים ל-Google/Firebase ולשרת המקומי.
    popupWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      return isAllowedPopupUrl(target) ? { action: "allow" } : { action: "deny" };
    });
    const guardPopupNavigation = (event, target) => {
      // התחל עם about:blank מותר, אחרת Firebase Auth עלול להיתקע בחלון לבן.
      // אחרי כן מותרות רק כתובות של היישום המקומי או ספקי Google/Firebase.
      if (!isAllowedPopupUrl(target)) {
        event.preventDefault();
        try {
          const blockedOrigin = new URL(target).origin;
          console.warn("[auth-popup] blocked navigation origin:", blockedOrigin);
        } catch {
          console.warn("[auth-popup] blocked non-URL navigation");
        }
      }
    };
    popupWindow.webContents.on("will-navigate", guardPopupNavigation);
    popupWindow.webContents.on("will-redirect", guardPopupNavigation);
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    let u;
    try { u = new URL(target); } catch { event.preventDefault(); return; }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) event.preventDefault();
  });
  mainWindow.on("unresponsive", () => writeDiagnosticLog("error", "window.unresponsive", {}));
  mainWindow.on("closed", () => { writeDiagnosticLog("info", "window.closed", {}); mainWindow = null; app.quit(); });
  mainWindow.loadURL(url).catch((err) => {
    writeDiagnosticLog("fatal", "window.load-url-failed", { error: err });
    dialog.showErrorBox("תורה דיליה", `לא ניתן לפתוח את האפליקציה: ${err.message}`);
    app.quit();
  });
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) { writeDiagnosticLog("warn", "application.second-instance-blocked", {}); app.quit(); return; }
  // app.env נשאר אופציונלי להגדרות מתקדמות בלבד. נתוני הקיוסק נשמרים מקומית.
  loadUserEnvironment();
  process.env.KIOSK_DATA_DIR = path.join(app.getPath("userData"), "data");
  initializeDiagnosticLogging();
  // קובץ הרישומים נגיש למשתמש בתיקיית המסמכים, ונותר גם אחרי עדכון התוכנה.
  process.env.KIOSK_REGISTRATIONS_FILE = path.join(app.getPath("documents"), "ToraDelia-Registrations.csv");
  try {
    const standaloneDir = path.join(app.getAppPath(), "standalone");
    const serverScript = path.join(standaloneDir, "server.js");
    if (!fs.existsSync(serverScript)) throw new Error(`קובץ השרת לא נמצא: ${serverScript}`);
    writeDiagnosticLog("info", "server.starting", { standaloneDir, serverScript });
    activePort = await findFreePort();
    writeDiagnosticLog("info", "server.port-selected", { port: activePort });
    process.env.PORT = String(activePort);
    process.env.HOSTNAME = "localhost";
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    process.chdir(standaloneDir);
    require(serverScript);
    const appUrl = `http://localhost:${activePort}`;
    await waitForServer(appUrl);
    writeDiagnosticLog("info", "server.ready", { url: appUrl });
    createWindow(appUrl);
  } catch (err) {
    writeDiagnosticLog("fatal", "application.startup-failed", { error: err, port: activePort, cwd: process.cwd() });
    dialog.showErrorBox("שגיאה בהפעלת תורה דיליה", err instanceof Error ? err.stack || err.message : String(err));
    app.quit();
  }
});
app.on("second-instance", () => writeDiagnosticLog("info", "application.second-instance", {}));
app.on("before-quit", () => writeDiagnosticLog("info", "application.before-quit", {}));
app.on("window-all-closed", () => { writeDiagnosticLog("info", "application.window-all-closed", {}); app.quit(); });
