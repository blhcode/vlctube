import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMediaProxy, prefetchStream } from "./proxy.js";
import * as youtube from "./youtube.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.commandLine.appendSwitch("no-sandbox");
app.setName("VLCTube");

let mainWindow;
let proxyPort = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f0f0f",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    title: "VLCTube",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  const proxy = await startMediaProxy();
  proxyPort = proxy.port;

  ipcMain.handle("home", () => youtube.homeFeed());
  ipcMain.handle("search", (_e, q, opts) => youtube.searchVideos(q, opts || {}));
  ipcMain.handle("suggest", (_e, q) => youtube.suggestions(q));
  ipcMain.handle("shorts", (_e, id) => youtube.shortsFeed(id));
  ipcMain.handle("video", (_e, id) => youtube.videoDetails(id));
  ipcMain.handle("related", (_e, id, hint) => youtube.relatedVideos(id, hint || ""));
  ipcMain.handle("channel", (_e, id, query) => youtube.channelVideos(id, query || ""));
  ipcMain.handle("prefetch", (_e, id) => {
    youtube.videoDetails(id).catch(() => {});
    return true;
  });
  ipcMain.handle("stream-url", (_e, id) => {
    prefetchStream(id);
    return `http://127.0.0.1:${proxyPort}/play?v=${encodeURIComponent(id)}`;
  });

  createWindow();
  youtube.homeFeed().catch(() => {});
  youtube.shortsFeed().catch(() => {});
});

app.on("window-all-closed", () => {
  app.quit();
});
