import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ytdlpPath, extractAndroid } from "./stream.js";
import { formatDuration } from "./serialize.js";
import {
  cached,
  staleThen,
  knownShort,
  knownNotShort,
  rememberShort,
  rememberNotShort,
} from "./cache.js";

const execFileAsync = promisify(execFile);
const HOME_TTL = 12 * 60 * 1000;
const SEARCH_TTL = 10 * 60 * 1000;
const SHORTS_TTL = 15 * 60 * 1000;
const VIDEO_TTL = 25 * 60 * 1000;
const CHANNEL_TTL = 12 * 60 * 1000;

async function ytdlpJson(args, { player = false } = {}) {
  const prefix = [
    "--no-warnings",
    "--no-check-certificates",
    "--socket-timeout",
    "15",
    "--retries",
    "1",
    "--no-progress",
  ];
  if (player) {
    prefix.push("--extractor-args", "youtube:player_client=android");
  }
  const { stdout } = await execFileAsync(ytdlpPath(), [...prefix, ...args], {
    timeout: 90000,
    maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: "1" },
  });
  return JSON.parse(stdout);
}

function formatViews(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  if (x >= 1e9) return `${(x / 1e9).toFixed(1).replace(/\.0$/, "")}B views`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1).replace(/\.0$/, "")}M views`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${x} views`;
}

function publishedOf(e) {
  if (e.upload_date && /^\d{8}$/.test(e.upload_date)) {
    const y = e.upload_date.slice(0, 4);
    const m = e.upload_date.slice(4, 6);
    const d = e.upload_date.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return "";
}

function thumbOf(e) {
  const thumbs = e.thumbnails || [];
  const best = thumbs.reduce((a, b) => ((b.height || 0) > (a.height || 0) ? b : a), thumbs[0]);
  let url = best?.url || e.thumbnail || "";
  if (url.startsWith("//")) url = "https:" + url;
  if (url) return url;
  if (e.id && !String(e.id).startsWith("UC")) return `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`;
  return "";
}

export function fromChannel(e) {
  const id = e.channel_id || e.id || "";
  if (!id) return null;
  return {
    id: String(id),
    title: e.channel || e.title || e.uploader || "Channel",
    thumb: thumbOf(e),
    subscribers:
      e.channel_follower_count != null ? formatViews(e.channel_follower_count).replace(" views", " subscribers") : "",
    description: e.description || "",
  };
}

function isChannelEntry(e) {
  if (!e) return false;
  if (e.ie_key === "YoutubeTab") return true;
  const id = String(e.id || "");
  return id.startsWith("UC") && id.length >= 22;
}

export function fromEntry(e) {
  if (!e?.id) return null;
  if (isChannelEntry(e)) return null;
  const seconds = typeof e.duration === "number" ? e.duration : null;
  return {
    id: String(e.id),
    title: e.title || "Untitled",
    channel: e.channel || e.uploader || e.uploader_id || "",
    channelId: e.channel_id || "",
    avatar: "",
    thumb: thumbOf(e),
    views: e.view_count != null ? formatViews(e.view_count) : "",
    published: publishedOf(e),
    duration: seconds != null ? formatDuration(seconds) : e.duration_string || "",
    seconds,
    isShort: e.media_type === "short",
    description: e.description || "",
    likeCount: e.like_count,
    subscriberCount:
      e.channel_follower_count != null ? formatViews(e.channel_follower_count).replace(" views", " subscribers") : "",
    comments: [],
    related: [],
  };
}

async function searchRaw(query, n = 20, start = 1) {
  const end = start + n - 1;
  const data = await ytdlpJson([
    "--flat-playlist",
    "--playlist-start",
    String(start),
    "--playlist-end",
    String(end),
    "--skip-download",
    "-J",
    `ytsearch${end}:${query}`,
  ]);
  return (data.entries || []).map(fromEntry).filter(Boolean);
}

async function searchChannelsRaw(query, n = 16) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%3D%3D`;
  const data = await ytdlpJson(["--flat-playlist", "--playlist-end", String(n), "--skip-download", "-J", url]);
  return (data.entries || []).map(fromChannel).filter(Boolean);
}

export async function searchVideos(query, opts = {}) {
  const type = opts.type || "all";
  const start = Number(opts.start) || 1;
  const n = Number(opts.n) || 24;
  const key = `search:${type}:${start}:${n}:${query}`;
  return cached(key, SEARCH_TTL, async () => {
    if (type === "channels") {
      const channels = await searchChannelsRaw(query, n);
      return { videos: [], channels, query, type };
    }
    const [videos, channels] = await Promise.all([
      searchRaw(query, n, start),
      type === "all" && start === 1 ? searchChannelsRaw(query, 8).catch(() => []) : Promise.resolve([]),
    ]);
    return { videos, channels, query, type };
  });
}

async function playlistEntries(url, end = 24) {
  const data = await ytdlpJson(["--flat-playlist", "--lazy-playlist", "--playlist-end", String(end), "--skip-download", "-J", url]);
  return data.entries || [];
}

export async function isRealShort(id) {
  if (!id || !/^[\w-]{6,20}$/.test(id)) return false;
  if (knownShort(id)) return true;
  if (knownNotShort(id)) return false;
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/144.0.0.0 Safari/537.36",
      },
    });
    const ok = res.status === 200;
    if (ok) rememberShort(id);
    else rememberNotShort(id);
    return ok;
  } catch {
    return false;
  }
}

async function collectTrustedShorts() {
  const urls = [
    "https://www.youtube.com/channel/UCmEboYJCJ6UdD4iWURmj6Aw/shorts",
    "https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ/shorts",
  ];
  const lists = await Promise.all(urls.map((u) => playlistEntries(u, 10).catch(() => [])));
  return lists.flat();
}

export async function homeFeed() {
  return staleThen("home:videos", HOME_TTL, HOME_TTL * 4, async () => {
    const videos = await searchRaw("official video", 16);
    return { videos, source: "yt-dlp" };
  });
}

export async function suggestions(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  return [q, `${q} official`, `${q} live`, `${q} shorts`, `${q} channel`];
}

export async function shortsFeed(seedId) {
  const base = await staleThen("shorts:feed:v2", SHORTS_TTL, SHORTS_TTL * 3, async () => {
    const seen = new Set();
    const verified = [];
    for (const e of await collectTrustedShorts()) {
      const v = fromEntry(e);
      if (!v || seen.has(v.id)) continue;
      seen.add(v.id);
      rememberShort(v.id);
      verified.push({ ...v, isShort: true });
    }
    return { videos: verified.slice(0, 16) };
  });

  const videos = [...(base.videos || [])];
  if (seedId && !videos.some((v) => v.id === seedId) && (await isRealShort(seedId))) {
    videos.unshift({
      id: seedId,
      title: "Short",
      channel: "",
      channelId: "",
      avatar: "",
      thumb: `https://i.ytimg.com/vi/${seedId}/hqdefault.jpg`,
      views: "",
      published: "",
      duration: "",
      seconds: null,
      isShort: true,
      description: "",
    });
  }
  return { videos };
}

export async function videoDetails(id) {
  return cached(`video:${id}`, VIDEO_TTL, async () => {
    const e = await extractAndroid(id);
    const video = fromEntry(e);
    return { ...video, related: [], comments: [] };
  });
}

export async function relatedVideos(id, hint = "") {
  return cached(`related:${id}`, SEARCH_TTL, async () => {
    const q = hint || id;
    try {
      return (await searchRaw(q.split(/[(|]/)[0].trim() || q, 12)).filter((v) => v.id !== id);
    } catch {
      return [];
    }
  });
}

export async function channelVideos(channelId, query = "") {
  return cached(`channel:${channelId}:${query}`, CHANNEL_TTL, async () => {
  const base = channelId.startsWith("UC")
    ? `https://www.youtube.com/channel/${channelId}`
    : channelId.startsWith("@")
      ? `https://www.youtube.com/${channelId}`
      : `https://www.youtube.com/@${channelId}`;
  const url = query ? `${base}/search?query=${encodeURIComponent(query)}` : `${base}/videos`;
  try {
    const data = await ytdlpJson(["--flat-playlist", "--playlist-end", "48", "--skip-download", "-J", url]);
    const videos = (data.entries || [])
      .map((e) => {
        const v = fromEntry(e);
        if (!v) return null;
        return { ...v, channel: v.channel || data.channel || data.title, channelId: v.channelId || channelId };
      })
      .filter(Boolean);
    return {
      id: data.channel_id || channelId,
      title: (data.channel || data.title || "Channel").replace(/ - Videos.*$/, "").replace(/ - Search.*$/, ""),
      thumb: thumbOf(data),
      subscriberCount:
        data.channel_follower_count != null
          ? formatViews(data.channel_follower_count).replace(" views", " subscribers")
          : "",
      videos,
      query,
    };
  } catch (err) {
    const videos = await searchRaw(query ? `${query} ${channelId}` : channelId, 16);
    return { id: channelId, title: videos[0]?.channel || "Channel", videos, query, error: String(err?.message || err) };
  }
  });
}
