export function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value.text === "string") return value.text;
  if (typeof value.toString === "function") {
    const s = value.toString();
    if (s && s !== "[object Object]") return s;
  }
  if (Array.isArray(value.runs)) {
    return value.runs.map((r) => r.text || "").join("");
  }
  return "";
}

function thumbOf(thumbs) {
  if (!thumbs) return "";
  const list = Array.isArray(thumbs) ? thumbs : thumbs.length ? [...thumbs] : [];
  if (!list.length && thumbs.url) return thumbs.url;
  const best = list.reduce((a, b) => ((b?.width || 0) > (a?.width || 0) ? b : a), list[0]);
  return best?.url || thumbs?.best?.url || thumbs?.url || "";
}

export function serializeVideo(item) {
  if (!item) return null;
  const id =
    item.id ||
    item.video_id ||
    item.videoId ||
    item.on_click_endpoint?.payload?.videoId ||
    item.endpoint?.payload?.videoId ||
    "";
  if (!id) return null;

  const durationText =
    textOf(item.duration) ||
    item.duration?.text ||
    (typeof item.duration?.seconds === "number"
      ? formatDuration(item.duration.seconds)
      : "") ||
    textOf(item.length_text);

  const seconds =
    item.duration?.seconds ??
    (typeof item.duration === "number" ? item.duration : null);

  const overlay = item.thumbnail_overlays?.find?.((o) => o.type === "ThumbnailOverlayTimeStatus");
  const isShort =
    item.is_short === true ||
    overlay?.style === "SHORTS" ||
    /short/i.test(textOf(item.badges)) ||
    (seconds != null && seconds > 0 && seconds <= 60 && (item.width || 0) < (item.height || 1));

  return {
    id: String(id),
    title: textOf(item.title) || textOf(item.headline) || "Untitled",
    channel: textOf(item.author?.name) || textOf(item.short_byline_text) || textOf(item.author) || "",
    channelId: item.author?.id || item.author?.channel_id || "",
    avatar: thumbOf(item.author?.thumbnails) || item.author?.best_thumbnail?.url || "",
    thumb:
      thumbOf(item.thumbnails) ||
      item.best_thumbnail?.url ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    views: textOf(item.view_count) || textOf(item.short_view_count) || textOf(item.views) || "",
    published: textOf(item.published) || textOf(item.published_text) || "",
    duration: durationText,
    seconds,
    isShort,
    description: textOf(item.description) || textOf(item.description_snippet) || "",
  };
}

export function formatDuration(total) {
  const s = Math.max(0, Math.floor(Number(total) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function serializeComment(c) {
  if (!c) return null;
  return {
    id: c.comment_id || c.id || Math.random().toString(36).slice(2),
    author: textOf(c.author?.name) || textOf(c.author_name) || "User",
    avatar: thumbOf(c.author?.thumbnails) || c.author?.best_thumbnail?.url || "",
    text: textOf(c.content) || textOf(c.text) || "",
    published: textOf(c.published) || "",
    likes: textOf(c.vote_count) || textOf(c.like_count) || "",
  };
}

export function collectVideos(node, out = [], seen = new Set()) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectVideos(n, out, seen);
    return out;
  }
  if (typeof node !== "object") return out;

  const type = node.type || node.constructor?.name || "";
  const looksVideo =
    type.includes("Video") ||
    type.includes("RichItem") ||
    type.includes("GridVideo") ||
    type.includes("CompactVideo") ||
    type.includes("Shorts") ||
    node.video_id ||
    node.videoId ||
    (node.id && (node.thumbnails || node.best_thumbnail) && node.title);

  if (looksVideo) {
    const content = node.content || node.item || node;
    const v = serializeVideo(content) || serializeVideo(node);
    if (v && !seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  }

  for (const key of [
    "contents",
    "videos",
    "results",
    "items",
    "header",
    "content",
    "secondary_contents",
    "tabs",
    "shelves",
    "fill_content",
    "memo",
  ]) {
    if (node[key]) collectVideos(node[key], out, seen);
  }

  if (node.endpoint && node.title && (node.thumbnails || node.best_thumbnail)) {
    const v = serializeVideo(node);
    if (v && !seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  }

  return out;
}
