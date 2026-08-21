import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vlctube", {
  home: () => ipcRenderer.invoke("home"),
  search: (q, opts) => ipcRenderer.invoke("search", q, opts || {}),
  suggest: (q) => ipcRenderer.invoke("suggest", q),
  shorts: (id) => ipcRenderer.invoke("shorts", id),
  video: (id) => ipcRenderer.invoke("video", id),
  related: (id, hint) => ipcRenderer.invoke("related", id, hint || ""),
  channel: (id, query) => ipcRenderer.invoke("channel", id, query || ""),
  prefetch: (id) => ipcRenderer.invoke("prefetch", id),
  streamUrl: (id) => ipcRenderer.invoke("stream-url", id),
});
