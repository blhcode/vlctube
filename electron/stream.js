import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolved = new Map();
const STREAM_TTL = 8 * 60 * 1000;

export function ytdlpPath() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "yt-dlp"));
    candidates.push(path.join(process.resourcesPath, "bin", "yt-dlp"));
  }
  candidates.push(path.join(root, "bin", "yt-dlp"));
  const found = candidates.find((p) => existsSync(p));
  return found || "yt-dlp";
}

export function peekStream(videoId) {
  const hit = resolved.get(videoId);
  if (hit && Date.now() - hit.at < STREAM_TTL) return hit.data;
  return null;
}

export function putStream(videoId, data) {
  resolved.set(videoId, { at: Date.now(), data });
}

function fromInfo(info) {
  const streamUrl = info.url;
  if (!streamUrl) throw new Error("yt-dlp did not return a playable URL");
  return {
    url: streamUrl,
    headers: info.http_headers || { "User-Agent": "Mozilla/5.0" },
    ext: info.ext || "mp4",
    mime:
      info.ext === "webm"
        ? "video/webm"
        : info.ext === "m3u8"
          ? "application/vnd.apple.mpegurl"
          : "video/mp4",
    title: info.title,
    duration: info.duration,
    width: info.width,
    height: info.height,
    acodec: info.acodec,
    vcodec: info.vcodec,
    via: "vlc-extractor",
  };
}

export function putStreamFromInfo(videoId, info) {
  try {
    putStream(videoId, fromInfo(info));
  } catch {
    /* listing extracts have no url */
  }
}

const inflight = new Map();

export async function extractAndroid(videoId) {
  if (inflight.has(videoId)) return inflight.get(videoId);
  const p = (async () => {
    const args = [
      "-f",
      "b[ext=mp4]/b/best",
      "--extractor-args",
      "youtube:player_client=android",
      "--no-warnings",
      "--no-playlist",
      "--no-check-certificates",
      "--socket-timeout",
      "20",
      "--retries",
      "1",
      "--no-progress",
      "-j",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const { stdout } = await execFileAsync(ytdlpPath(), args, {
      timeout: 90000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONUTF8: "1" },
    });
    const info = JSON.parse(stdout);
    putStreamFromInfo(videoId, info);
    return info;
  })().finally(() => inflight.delete(videoId));
  inflight.set(videoId, p);
  return p;
}

export async function resolveStream(videoId) {
  const cached = peekStream(videoId);
  if (cached) return cached;
  const info = await extractAndroid(videoId);
  return peekStream(videoId) || fromInfo(info);
}
