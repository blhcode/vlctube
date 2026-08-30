(function () {
  function plugin() {
    const p = window.Capacitor?.Plugins?.YtDlp;
    if (!p) throw new Error("YtDlp plugin not available — open this build on Android");
    return p;
  }

  function formatDuration(total) {
    const s = Math.max(0, Math.floor(Number(total) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function formatViews(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "";
    if (x >= 1e9) return `${(x / 1e9).toFixed(1).replace(/\.0$/, "")}B views`;
    if (x >= 1e6) return `${(x / 1e6).toFixed(1).replace(/\.0$/, "")}M views`;
    if (x >= 1e3) return `${(x / 1e3).toFixed(1).replace(/\.0$/, "")}K views`;
    return `${x} views`;
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

  function isChannelEntry(e) {
    if (!e) return false;
    if (e.ie_key === "YoutubeTab") return true;
    const id = String(e.id || "");
    return id.startsWith("UC") && id.length >= 22;
  }

  function fromEntry(e) {
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
      published: e.upload_date || "",
      duration: seconds != null ? formatDuration(seconds) : e.duration_string || "",
      seconds,
      isShort: e.media_type === "short",
      description: e.description || "",
      likeCount: e.like_count,
      subscriberCount:
        e.channel_follower_count != null
          ? formatViews(e.channel_follower_count).replace(" views", " subscribers")
          : "",
      comments: [],
      related: [],
    };
  }

  function fromChannel(e) {
    const id = e.channel_id || e.id || "";
    if (!id) return null;
    return {
      id: String(id),
      title: e.channel || e.title || e.uploader || "Channel",
      thumb: thumbOf(e),
      subscribers:
        e.channel_follower_count != null
          ? formatViews(e.channel_follower_count).replace(" views", " subscribers")
          : "",
    };
  }

  async function run(args) {
    const res = await plugin().execute({ args });
    return String(res.stdout || "");
  }

  async function ytdlpJson(args) {
    return JSON.parse(await run(args));
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
      "--no-warnings",
      "-J",
      `ytsearch${end}:${query}`,
    ]);
    return (data.entries || []).map(fromEntry).filter(Boolean);
  }

  async function searchChannelsRaw(query, n = 16) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%3D%3D`;
    const data = await ytdlpJson([
      "--flat-playlist",
      "--playlist-end",
      String(n),
      "--skip-download",
      "--no-warnings",
      "-J",
      url,
    ]);
    return (data.entries || []).map(fromChannel).filter(Boolean);
  }

  const UA =
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

  async function isRealShort(id) {
    try {
      const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": UA },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  window.vlctube = {
    async home(taste = {}) {
      const channels = Array.isArray(taste.channels) ? taste.channels.slice(0, 4) : [];
      const topics = Array.isArray(taste.topics) ? taste.topics.slice(0, 5) : [];
      const watched = new Set(Array.isArray(taste.watchedIds) ? taste.watchedIds : []);
      const personalized = Boolean(taste.personalized && (channels.length || topics.length));

      if (!personalized) {
        const videos = await searchRaw("official video", 16);
        return { videos, source: "yt-dlp", personalized: false, reasons: [] };
      }

      const jobs = [];
      const reasons = [];

      for (const ch of channels.slice(0, 3)) {
        reasons.push(ch.name);
        if (ch.id) {
          jobs.push(
            window.vlctube
              .channel(ch.id)
              .then((r) => (r.videos || []).slice(0, 10))
              .catch(() => searchRaw(ch.name, 10).catch(() => [])),
          );
        } else {
          jobs.push(searchRaw(ch.name, 10).catch(() => []));
        }
      }

      for (const topic of topics.slice(0, 4)) {
        reasons.push(topic);
        jobs.push(searchRaw(topic, 8).catch(() => []));
      }

      jobs.push(searchRaw("trending", 6).catch(() => searchRaw("official video", 6).catch(() => [])));

      const pools = await Promise.all(jobs);
      const seen = new Set(watched);
      const merged = [];

      let added = true;
      while (added && merged.length < 30) {
        added = false;
        for (const pool of pools) {
          while (pool.length) {
            const v = pool.shift();
            if (!v?.id || seen.has(v.id)) continue;
            seen.add(v.id);
            merged.push(v);
            added = true;
            break;
          }
        }
      }

      if (merged.length < 8) {
        const filler = await searchRaw("official video", 16);
        for (const v of filler) {
          if (!v?.id || seen.has(v.id)) continue;
          seen.add(v.id);
          merged.push(v);
          if (merged.length >= 24) break;
        }
      }

      return {
        videos: merged.slice(0, 28),
        source: "personalized",
        personalized: true,
        reasons: [...new Set(reasons)].slice(0, 8),
      };
    },
    async search(q, opts = {}) {
      const type = opts.type || "all";
      const start = Number(opts.start) || 1;
      const n = Number(opts.n) || 24;
      if (type === "channels") {
        return { videos: [], channels: await searchChannelsRaw(q, n), query: q, type };
      }
      const [videos, channels] = await Promise.all([
        searchRaw(q, n, start),
        type === "all" && start === 1 ? searchChannelsRaw(q, 8).catch(() => []) : Promise.resolve([]),
      ]);
      return { videos, channels, query: q, type };
    },
    async suggest(q) {
      const s = String(q || "").trim();
      if (s.length < 2) return [];
      return [s, `${s} official`, `${s} live`, `${s} shorts`, `${s} channel`];
    },
    async shorts(seedId) {
      const urls = [
        "https://www.youtube.com/channel/UCmEboYJCJ6UdD4iWURmj6Aw/shorts",
        "https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ/shorts",
      ];
      const lists = await Promise.all(
        urls.map((u) =>
          ytdlpJson(["--flat-playlist", "--playlist-end", "10", "--skip-download", "--no-warnings", "-J", u])
            .then((d) => d.entries || [])
            .catch(() => []),
        ),
      );
      const seen = new Set();
      const videos = [];
      for (const e of lists.flat()) {
        const v = fromEntry(e);
        if (!v || seen.has(v.id)) continue;
        seen.add(v.id);
        videos.push({ ...v, isShort: true });
      }
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
      return { videos: videos.slice(0, 16) };
    },
    async video(id) {
      const e = await ytdlpJson([
        "-f",
        "b[ext=mp4]/b/best",
        "--extractor-args",
        "youtube:player_client=android",
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "-j",
        `https://www.youtube.com/watch?v=${id}`,
      ]);
      return { ...fromEntry(e), related: [], comments: [] };
    },
    async related(id, hint = "") {
      try {
        const q = (hint || id).split(/[(|]/)[0].trim() || id;
        return (await searchRaw(q, 12)).filter((v) => v.id !== id);
      } catch {
        return [];
      }
    },
    async channel(channelId, query = "") {
      const base = channelId.startsWith("UC")
        ? `https://www.youtube.com/channel/${channelId}`
        : channelId.startsWith("@")
          ? `https://www.youtube.com/${channelId}`
          : `https://www.youtube.com/@${channelId}`;
      const url = query ? `${base}/search?query=${encodeURIComponent(query)}` : `${base}/videos`;
      const data = await ytdlpJson([
        "--flat-playlist",
        "--playlist-end",
        "48",
        "--skip-download",
        "--no-warnings",
        "-J",
        url,
      ]);
      const videos = (data.entries || [])
        .map((e) => {
          const v = fromEntry(e);
          if (!v) return null;
          return {
            ...v,
            channel: v.channel || data.channel || data.title,
            channelId: v.channelId || channelId,
          };
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
    },
    async streamUrl(id) {
      const stdout = await run([
        "-f",
        "b[ext=mp4]/b/best",
        "--extractor-args",
        "youtube:player_client=android",
        "--no-playlist",
        "--no-warnings",
        "-g",
        `https://www.youtube.com/watch?v=${id}`,
      ]);
      const line = stdout
        .trim()
        .split("\n")
        .find((l) => l.startsWith("http"));
      if (!line) throw new Error("No stream URL");
      return line;
    },
    async prefetch() {
      return true;
    },
  };
})();
