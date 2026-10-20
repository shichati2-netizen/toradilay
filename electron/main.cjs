const { app, BrowserWindow, Menu, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");

process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");

let mainWindow = null;
let activePort = 3210;

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

function createWindow(url) {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1366, height: 850, minWidth: 1024, minHeight: 640,
    show: false, backgroundColor: "#071124", title: "תורה דיליה",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  mainWindow.once("ready-to-show", () => { mainWindow.show(); mainWindow.focus(); });

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
  mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
  mainWindow.loadURL(url).catch((err) => {
    dialog.showErrorBox("תורה דיליה", `לא ניתן לפתוח את האפליקציה: ${err.message}`);
    app.quit();
  });
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  // app.env נשאר אופציונלי להגדרות מתקדמות בלבד. נתוני הקיוסק נשמרים מקומית.
  loadUserEnvironment();
  process.env.KIOSK_DATA_DIR = path.join(app.getPath("userData"), "data");
  try {
    const standaloneDir = path.join(app.getAppPath(), "standalone");
    const serverScript = path.join(standaloneDir, "server.js");
    if (!fs.existsSync(serverScript)) throw new Error(`קובץ השרת לא נמצא: ${serverScript}`);
    activePort = await findFreePort();
    process.env.PORT = String(activePort);
    process.env.HOSTNAME = "localhost";
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    process.chdir(standaloneDir);
    require(serverScript);
    const appUrl = `http://localhost:${activePort}`;
    await waitForServer(appUrl);
    createWindow(appUrl);
  } catch (err) {
    dialog.showErrorBox("שגיאה בהפעלת תורה דיליה", err instanceof Error ? err.stack || err.message : String(err));
    app.quit();
  }
});
app.on("window-all-closed", () => app.quit());
