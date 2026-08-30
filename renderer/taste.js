(function () {
  const STOP = new Set(
    (
      "a an the and or but of to in on for with from by at as is are was were be been being " +
      "this that these those it its you your me my we our they their he she his her " +
      "official video videos music live stream streaming shorts short full movie trailer " +
      "episode ep part ft featuring feat vs versus watch new best top how what why when where " +
      "day days week month year hours mins minutes seconds officialmusicvideo " +
      "hd 4k 8k 1080p 720p lyrics lyric audio"
    ).split(/\s+/),
  );

  function tokensFromTitle(title) {
    return String(title || "")
      .toLowerCase()
      .replace(/[#|@[\](){}<>]/g, " ")
      .replace(/[^a-z0-9+\s.-]/g, " ")
      .split(/[\s./_-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
  }

  function extractTopics(title) {
    const toks = tokensFromTitle(title);
    const out = [];
    const seen = new Set();
    function add(term) {
      const t = term.trim();
      if (!t || seen.has(t) || STOP.has(t)) return;
      seen.add(t);
      out.push(t);
    }
    for (let i = 0; i < toks.length; i++) {
      add(toks[i]);
      if (i + 1 < toks.length) add(`${toks[i]} ${toks[i + 1]}`);
    }
    // Light topic boosts from common review/tech cues
    const joined = toks.join(" ");
    if (/\b(iphone|android|pixel|samsung|laptop|gpu|cpu|ssd|review|unboxing|tech)\b/.test(joined)) {
      add("tech review");
    }
    if (/\b(game|gameplay|minecraft|fortnite|roblox|xbox|playstation|nintendo)\b/.test(joined)) {
      add("gaming");
    }
    if (/\b(recipe|cook|baking|food)\b/.test(joined)) add("cooking");
    if (/\b(workout|gym|fitness)\b/.test(joined)) add("fitness");
    return out.slice(0, 12);
  }

  function buildTaste(history) {
    const recent = (history || []).slice(0, 50);
    if (!recent.length) {
      return { channels: [], topics: [], watchedIds: [], personalized: false };
    }

    const channelScore = new Map();
    const channelIds = new Map();
    const topicScore = new Map();
    const watchedIds = [];

    recent.forEach((v, i) => {
      const weight = Math.max(1, 50 - i);
      if (v?.id) watchedIds.push(v.id);
      if (v?.channel) {
        channelScore.set(v.channel, (channelScore.get(v.channel) || 0) + weight * 2);
        if (v.channelId) channelIds.set(v.channel, v.channelId);
      }
      for (const topic of extractTopics(v?.title || "")) {
        topicScore.set(topic, (topicScore.get(topic) || 0) + weight);
      }
    });

    const channels = [...channelScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, score]) => ({ name, id: channelIds.get(name) || "", score }));

    const topics = [...topicScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term)
      .filter((t) => !channels.some((c) => c.name.toLowerCase() === t.toLowerCase()));

    return {
      channels,
      topics,
      watchedIds: [...new Set(watchedIds)].slice(0, 120),
      personalized: channels.length > 0 || topics.length > 0,
    };
  }

  function tasteFingerprint(taste) {
    if (!taste?.personalized) return "default";
    const ch = (taste.channels || []).map((c) => c.name).join("|");
    const tp = (taste.topics || []).slice(0, 6).join("|");
    return `${ch}::${tp}`;
  }

  window.vlctubeTaste = { buildTaste, tasteFingerprint, extractTopics };
})();
