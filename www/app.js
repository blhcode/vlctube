const main = document.getElementById("main");
const guide = document.getElementById("guide");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const suggestBox = document.getElementById("suggest");

const store = {
  history: load("history", []),
  liked: load("liked", []),
  later: load("later", []),
  subs: load("subs", []),
};

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("vlctube:" + key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem("vlctube:" + key, JSON.stringify(value));
}

function pushHistory(video) {
  store.history = [video, ...store.history.filter((v) => v.id !== video.id)].slice(0, 80);
  save("history", store.history);
  try {
    localStorage.removeItem("vlctube:home-cache");
  } catch {
    /* ignore */
  }
}

function toggleId(listKey, video) {
  const exists = store[listKey].some((v) => v.id === video.id);
  store[listKey] = exists
    ? store[listKey].filter((v) => v.id !== video.id)
    : [video, ...store[listKey]];
  save(listKey, store[listKey]);
  return !exists;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseHash() {
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  return { path: "/" + parts.join("/"), parts, params };
}

function setActiveGuide(path) {
  document.querySelectorAll(".g-item").forEach((a) => {
    const route = a.getAttribute("data-route");
    a.classList.toggle("active", path === route || (route !== "/" && path.startsWith(route)));
  });
}

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (q) location.hash = "#/results?q=" + encodeURIComponent(q);
  suggestBox.hidden = true;
});

let suggestTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  const q = searchInput.value.trim();
  if (!q) {
    suggestBox.hidden = true;
    return;
  }
  suggestTimer = setTimeout(async () => {
    const items = await window.vlctube.suggest(q);
    if (!items.length) {
      suggestBox.hidden = true;
      return;
    }
    suggestBox.innerHTML = items
      .slice(0, 10)
      .map((s) => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`)
      .join("");
    suggestBox.hidden = false;
  }, 200);
});

suggestBox.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  searchInput.value = btn.dataset.q;
  searchForm.requestSubmit();
});

document.addEventListener("click", (e) => {
  if (!searchForm.contains(e.target)) suggestBox.hidden = true;
});

document.getElementById("toggle-sidebar").addEventListener("click", () => {
  document.body.classList.toggle("guide-collapsed");
  guide.classList.toggle("collapsed");
});

window.addEventListener("hashchange", render);
let nav = 0;
render();

function still(token) {
  return token === nav;
}

async function render() {
  const token = ++nav;
  const loc = parseHash();
  setActiveGuide(loc.path.startsWith("/shorts") ? "/shorts" : loc.path.startsWith("/watch") ? "/" : loc.path);
  try {
    if (loc.path === "/") await renderHome(token);
    else if (loc.path === "/vr") {
      window.vlctubeVr?.enter?.();
      return;
    }
    else if (loc.path === "/shorts" || loc.path.startsWith("/shorts/")) await renderShorts(loc.parts[1], token);
    else if (loc.path === "/results") await renderSearch(loc.params.get("q") || "", loc.params.get("type") || "all", token);
    else if (loc.path.startsWith("/watch")) await renderWatch(loc.parts[1] || loc.params.get("v"), token);
    else if (loc.path === "/feed/history") renderList("Watch history", store.history);
    else if (loc.path === "/playlist/watch-later") renderList("Watch later", store.later);
    else if (loc.path === "/playlist/liked") renderList("Liked videos", store.liked);
    else if (loc.path === "/feed/subscriptions") await renderSubs();
    else if (loc.path === "/you") renderYou();
    else if (loc.path.startsWith("/channel/")) await renderChannel(decodeURIComponent(loc.parts[1] || ""), loc.params.get("q") || "");
    else main.innerHTML = `<div class="empty">Not found</div>`;
  } catch (err) {
    if (still(token)) main.innerHTML = `<div class="error">${esc(err.message || err)}</div>`;
  }
}

function videoCard(v, compact = false) {
  const channelHtml = v.channelId
    ? `<a class="channel-link" data-channel="${esc(v.channelId)}" href="#/channel/${esc(v.channelId)}">${esc(v.channel)}</a>`
    : esc(v.channel);
  if (compact) {
    return `<article class="rcard" data-id="${esc(v.id)}" data-short="${v.isShort ? "1" : ""}">
      <div class="thumb-wrap"><img src="${esc(v.thumb)}" alt="" /><span class="badge">${esc(v.duration || "")}</span></div>
      <div><h3>${esc(v.title)}</h3><p>${channelHtml}</p><p>${esc([v.views, v.published].filter(Boolean).join(" • "))}</p></div>
    </article>`;
  }
  return `<article class="card" data-id="${esc(v.id)}" data-short="${v.isShort ? "1" : ""}">
    <div class="thumb-wrap"><img src="${esc(v.thumb)}" alt="" />${v.duration ? `<span class="badge">${esc(v.duration)}</span>` : ""}</div>
    <div class="meta">
      ${v.avatar ? `<img src="${esc(v.avatar)}" alt="" data-channel="${esc(v.channelId || "")}" />` : `<div class="ch-avatar"></div>`}
      <div>
        <h3>${esc(v.title)}</h3>
        <p>${channelHtml}</p>
        <p>${esc([v.views, v.published].filter(Boolean).join(" • "))}</p>
      </div>
    </div>
  </article>`;
}

function channelCard(c) {
  return `<article class="channel-card" data-channel="${esc(c.id)}">
    ${c.thumb ? `<img src="${esc(c.thumb)}" alt="" />` : `<div class="channel-avatar"></div>`}
    <div>
      <h3>${esc(c.title)}</h3>
      <p class="muted">${esc(c.subscribers)}</p>
    </div>
  </article>`;
}

function bindCards(root) {
  root.querySelectorAll("[data-channel]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.channel;
      if (id) location.hash = "#/channel/" + encodeURIComponent(id);
    });
  });
  root.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("mouseenter", () => window.vlctube.prefetch(el.dataset.id));
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-channel]")) return;
      const id = el.dataset.id;
      window.vlctube.prefetch(id);
      location.hash = el.dataset.short === "1" ? `#/shorts/${id}` : `#/watch/${id}`;
    });
  });
}

function paintHome(videos, shorts, meta = {}) {
  const rail = (shorts || []).slice(0, 12);
  const rest = (videos || []).filter((v) => !v.isShort);
  const reasons = meta.reasons || [];
  const personalized = Boolean(meta.personalized);
  const chips = personalized
    ? ["For you", ...reasons.slice(0, 5), "Music", "Gaming", "News"]
    : ["All", "Music", "Gaming", "News", "Live", "Mixes"];
  main.innerHTML = `
    <div class="chips">
      ${chips
        .map((label, i) => `<button class="chip ${i === 0 ? "active" : ""}" data-chip="${esc(label)}">${esc(label)}</button>`)
        .join("")}
    </div>
    ${
      personalized
        ? `<p class="muted" style="margin:0 0 14px;font-size:13px">Recommended from channels and topics you’ve been watching</p>`
        : ""
    }
    ${
      rail.length
        ? `<section class="shorts-rail">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M10 14.65v-5.3L15 12z"/></svg>
              Shorts
            </h2>
            <div class="shorts-row">${rail
              .map(
                (v) => `<article class="short-card" data-id="${esc(v.id)}" data-short="1">
              <div class="thumb-wrap"><img src="${esc(v.thumb)}" alt="" /></div>
              <h3>${esc(v.title)}</h3>
              <p class="muted">${esc(v.views)}</p>
            </article>`,
              )
              .join("")}</div>
          </section>`
        : ""
    }
    <section class="grid">${rest.map((v) => videoCard(v)).join("") || `<div class="loading">Loading…</div>`}</section>
  `;
  bindCards(main);
  main.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const label = chip.dataset.chip || chip.textContent;
      if (label === "All" || label === "For you") return;
      location.hash = "#/results?q=" + encodeURIComponent(label);
    });
  });
}

async function renderHome(token) {
  const taste = window.vlctubeTaste.buildTaste(store.history);
  const fp = window.vlctubeTaste.tasteFingerprint(taste);
  const cachedHome = load("home-cache", null);
  const cachedShorts = load("shorts-cache", null);
  const cacheFresh = cachedHome?.videos?.length && cachedHome.fp === fp;

  if (cacheFresh) paintHome(cachedHome.videos, cachedShorts?.videos, cachedHome.meta || {});
  else main.innerHTML = `<div class="loading">${taste.personalized ? "Finding videos for you…" : "Loading…"}</div>`;

  const homeP = window.vlctube.home(taste);
  const shortsP = window.vlctube.shorts();
  const home = await homeP;
  if (!still(token)) return;
  const watched = new Set(taste.watchedIds || []);
  const videos = (home.videos || []).filter((v) => !watched.has(v.id));
  const meta = { personalized: home.personalized, reasons: home.reasons || [] };
  paintHome(videos, cachedShorts?.videos, meta);
  save("home-cache", { videos, meta, fp });
  const { videos: shorts } = await shortsP;
  if (!still(token)) return;
  paintHome(videos, shorts, meta);
  save("shorts-cache", { videos: shorts });
}

async function renderSearch(q, type = "all", token) {
  searchInput.value = q;
  if (!main.querySelector("#search-grid")) main.innerHTML = `<div class="loading">Loading…</div>`;
  const { videos, channels } = await window.vlctube.search(q, { type, start: 1, n: 24 });
  if (token && !still(token)) return;
  const types = [
    ["all", "All"],
    ["videos", "Videos"],
    ["channels", "Channels"],
  ];
  main.innerHTML = `
    <div class="chips">
      ${types.map(([id, label]) => `<button class="chip ${type === id ? "active" : ""}" data-type="${id}">${label}</button>`).join("")}
    </div>
    <h2 style="font-size:16px;font-weight:400;color:var(--muted);margin:0 0 16px">Results for “${esc(q)}”</h2>
    <section class="channel-results">${(channels || []).map(channelCard).join("")}</section>
    <section class="grid" id="search-grid">${videos.map((v) => videoCard(v)).join("") || (channels?.length ? "" : `<div class="empty">No results</div>`)}</section>
    ${type !== "channels" && videos.length >= 12 ? `<button class="load-more" id="load-more">Load more</button>` : ""}
  `;
  bindCards(main);
  main.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      location.hash = `#/results?q=${encodeURIComponent(q)}&type=${chip.dataset.type}`;
    });
  });
  const more = document.getElementById("load-more");
  if (more) {
    let start = 25;
    more.addEventListener("click", async () => {
      more.disabled = true;
      more.textContent = "Loading…";
      try {
        const extra = await window.vlctube.search(q, { type: type === "all" ? "videos" : type, start, n: 24 });
        const grid = document.getElementById("search-grid");
        extra.videos.forEach((v) => grid.insertAdjacentHTML("beforeend", videoCard(v)));
        bindCards(grid);
        start += 24;
        more.disabled = false;
        more.textContent = extra.videos.length ? "Load more" : "No more results";
        if (!extra.videos.length) more.disabled = true;
      } catch (err) {
        more.textContent = String(err.message || err);
      }
    });
  }
}

function renderList(title, videos) {
  main.innerHTML = `<h2 style="margin:0 0 16px">${esc(title)}</h2>
    ${videos.length ? `<section class="grid">${videos.map((v) => videoCard(v)).join("")}</section>` : `<div class="empty">No videos yet</div>`}`;
  bindCards(main);
}

function renderYou() {
  main.innerHTML = `
    <h2>You</h2>
    <p class="muted">History, Watch later and Liked videos are stored on this computer.</p>
    <div class="pills" style="margin:16px 0">
      <a class="pill" href="#/feed/history">History</a>
      <a class="pill" href="#/playlist/watch-later">Watch later</a>
      <a class="pill" href="#/playlist/liked">Liked</a>
    </div>
    <section class="grid">${store.history.slice(0, 8).map((v) => videoCard(v)).join("")}</section>`;
  bindCards(main);
}

async function renderSubs() {
  if (!store.subs.length) {
    main.innerHTML = `<div class="empty">Subscribe to channels while watching — they show up here.</div>`;
    return;
  }
  const packs = await Promise.all(store.subs.slice(0, 6).map((id) => window.vlctube.channel(id).catch(() => null)));
  const videos = packs.flatMap((p) => p?.videos || []).slice(0, 30);
  main.innerHTML = `<h2>Subscriptions</h2><section class="grid">${videos.map((v) => videoCard(v)).join("")}</section>`;
  bindCards(main);
}

async function renderChannel(id, query = "") {
  const data = await window.vlctube.channel(id, query);
  const subscribed = store.subs.includes(data.id);
  main.innerHTML = `
    <div class="channel-head">
      ${data.thumb ? `<img src="${esc(data.thumb)}" alt="" />` : `<div class="channel-avatar"></div>`}
      <div>
        <h2 style="margin:0 0 4px">${esc(data.title)}</h2>
        <p class="muted">${esc(data.subscriberCount)}</p>
        <button class="subscribe ${subscribed ? "on" : ""}" id="sub">${subscribed ? "Subscribed" : "Subscribe"}</button>
      </div>
    </div>
    <form class="channel-search" id="ch-search">
      <input id="ch-q" type="search" placeholder="Search this channel" value="${esc(query)}" />
      <button type="submit">Search</button>
    </form>
    ${query ? `<p class="muted">Results for “${esc(query)}” in this channel</p>` : ""}
    <section class="grid">${data.videos.map((v) => videoCard(v)).join("") || `<div class="empty">No videos found</div>`}</section>
  `;
  bindCards(main);
  document.getElementById("ch-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("ch-q").value.trim();
    location.hash = q
      ? `#/channel/${encodeURIComponent(data.id)}?q=${encodeURIComponent(q)}`
      : `#/channel/${encodeURIComponent(data.id)}`;
  });
  document.getElementById("sub").addEventListener("click", (e) => {
    if (!data.id) return;
    const i = store.subs.indexOf(data.id);
    if (i >= 0) store.subs.splice(i, 1);
    else store.subs.unshift(data.id);
    save("subs", store.subs);
    e.currentTarget.classList.toggle("on");
    e.currentTarget.textContent = e.currentTarget.classList.contains("on") ? "Subscribed" : "Subscribe";
  });
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

async function renderWatch(id, token) {
  if (!id) throw new Error("Missing video id");
  window.vlctube.prefetch(id);
  const src = await window.vlctube.streamUrl(id);
  const cached = store.history.find((v) => v.id === id) || load("watch:" + id, null);
  if (cached?.title) paintWatch(id, cached, src, token);
  else if (still(token)) main.innerHTML = `<div class="loading">Loading…</div>`;
  const info = await window.vlctube.video(id);
  if (!still(token)) return;
  paintWatch(id, info, src, token);
  pushHistory(info);
  save("watch:" + id, info);
  const related = await window.vlctube.related(id, info.title || info.channel || "");
  if (!still(token)) return;
  const aside = main.querySelector(".related");
  if (aside) {
    aside.innerHTML = related.map((v) => videoCard(v, true)).join("");
    bindCards(aside);
  }
}

function paintWatch(id, info, src, token) {
  if (token && !still(token)) return;
  const subscribed = store.subs.includes(info.channelId);
  const liked = store.liked.some((v) => v.id === id);
  const later = store.later.some((v) => v.id === id);
  const existing = document.getElementById("player");
  if (existing && existing.getAttribute("src") === src && main.querySelector(".watch-title")) {
    main.querySelector(".watch-title").textContent = info.title || "";
    const desc = document.getElementById("desc");
    if (desc) desc.innerHTML = `<strong>${esc(info.views)} ${esc(info.published)}</strong><br />${esc(info.description || "")}`;
    return;
  }

  main.innerHTML = `
    <div class="watch">
      <div>
        <div class="player-shell" id="player-shell">
            <div class="player-loading" id="player-loading">Resolving stream with VLC’s YouTube extractor…</div>
            <video id="player" src="${esc(src)}" autoplay playsinline></video>
          <div class="controls">
            <div class="bar" id="seek"><div class="bar-fill" id="fill"></div></div>
            <div class="ctrl-row">
              <button id="playpause" aria-label="Play">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <span class="time"><span id="cur">0:00</span> / <span id="dur">${esc(info.duration)}</span></span>
              <span class="spacer"></span>
              <button id="mute" aria-label="Mute"><svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0014 8.15v7.7A4.47 4.47 0 0016.5 12z"/></svg></button>
              <button id="fs" aria-label="Full screen"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm12 5h-5v-2h3v-3h2v5zM7 7h3V5H5v5h2V7zm12 3h-2V7h-3V5h5v5z"/></svg></button>
            </div>
          </div>
        </div>
        <h1 class="watch-title">${esc(info.title)}</h1>
        <div class="watch-row">
          <div class="channel-line">
            ${info.avatar ? `<img class="ch-avatar" src="${esc(info.avatar)}" alt="" />` : `<div class="ch-avatar"></div>`}
            <div>
              <div style="font-weight:500" class="channel-link">${esc(info.channel)}</div>
              <div class="muted" style="font-size:12px">${esc(info.subscriberCount)}</div>
            </div>
            <button class="subscribe ${subscribed ? "on" : ""}" id="sub">${subscribed ? "Subscribed" : "Subscribe"}</button>
          </div>
          <div class="pills">
            <button class="pill" id="like">${liked ? "Liked" : "Like"} ${info.likeCount ? esc(String(info.likeCount)) : ""}</button>
            <button class="pill" id="later">${later ? "Saved" : "Save"}</button>
            <button class="pill" id="share">Share</button>
          </div>
        </div>
        <div class="desc clamp" id="desc"><strong>${esc(info.views)} ${esc(info.published)}</strong><br />${esc(info.description)}</div>
        <section class="comments">
          <h2>Comments</h2>
          ${
            info.comments?.length
              ? info.comments
                  .map(
                    (c) => `<article class="comment">
                ${c.avatar ? `<img class="ch-avatar" src="${esc(c.avatar)}" alt="" />` : `<div class="ch-avatar"></div>`}
                <div><strong>${esc(c.author)}</strong> <span class="muted">${esc(c.published)}</span><p>${esc(c.text)}</p></div>
              </article>`,
                  )
                  .join("")
              : `<p class="muted">No comments loaded.</p>`
          }
        </section>
      </div>
      <aside class="related">${(info.related || []).map((v) => videoCard(v, true)).join("")}</aside>
    </div>
  `;
  bindCards(main.querySelector(".related"));

  const video = document.getElementById("player");
  const fill = document.getElementById("fill");
  const cur = document.getElementById("cur");
  const dur = document.getElementById("dur");
  const playpause = document.getElementById("playpause");

  video.addEventListener("canplay", () => {
    document.getElementById("player-loading")?.remove();
  });
  video.addEventListener("error", () => {
    const el = document.getElementById("player-loading");
    if (el) el.textContent = "Could not play this stream. Try another video.";
  });
  video.addEventListener("timeupdate", () => {
    const p = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    fill.style.width = p + "%";
    cur.textContent = fmtTime(video.currentTime);
    if (video.duration) dur.textContent = fmtTime(video.duration);
  });
  document.getElementById("seek").addEventListener("click", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    video.currentTime = ((e.clientX - r.left) / r.width) * (video.duration || 0);
  });
  playpause.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
  video.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
  document.getElementById("mute").addEventListener("click", () => (video.muted = !video.muted));
  document.getElementById("fs").addEventListener("click", () => {
    const shell = document.getElementById("player-shell");
    if (!document.fullscreenElement) shell.requestFullscreen();
    else document.exitFullscreen();
  });
  document.getElementById("desc").addEventListener("click", (e) => e.currentTarget.classList.toggle("clamp"));
  document.querySelector(".channel-line").addEventListener("click", (e) => {
    if (e.target.closest("#sub")) return;
    if (info.channelId) location.hash = "#/channel/" + encodeURIComponent(info.channelId);
  });
  document.getElementById("sub").addEventListener("click", (e) => {
    if (!info.channelId) return;
    const i = store.subs.indexOf(info.channelId);
    if (i >= 0) store.subs.splice(i, 1);
    else store.subs.unshift(info.channelId);
    save("subs", store.subs);
    e.currentTarget.classList.toggle("on");
    e.currentTarget.textContent = e.currentTarget.classList.contains("on") ? "Subscribed" : "Subscribe";
  });
  document.getElementById("like").addEventListener("click", (e) => {
    const on = toggleId("liked", info);
    e.currentTarget.textContent = on ? "Liked" : "Like";
  });
  document.getElementById("later").addEventListener("click", (e) => {
    const on = toggleId("later", info);
    e.currentTarget.textContent = on ? "Saved" : "Save";
  });
  document.getElementById("share").addEventListener("click", async () => {
    const url = `https://youtu.be/${id}`;
    await navigator.clipboard.writeText(url);
    alert("Link copied");
  });
}

async function renderShorts(startId, token) {
  if (!load("shorts-cache", null)?.videos?.length) main.innerHTML = `<div class="loading">Loading…</div>`;
  const { videos } = await window.vlctube.shorts(startId);
  if (token && !still(token)) return;
  if (!videos.length) {
    main.innerHTML = `<div class="empty">No Shorts found.</div>`;
    return;
  }
  main.innerHTML = `<div class="shorts-view"><div class="shorts-col" id="shorts-col">
    ${videos
      .map(
        (v, i) => `<section class="short-slide" data-id="${esc(v.id)}">
        <video ${i === 0 ? "autoplay" : ""} playsinline loop muted></video>
        <div class="short-meta">
          <div style="font-weight:600">@${esc(v.channel || "channel")}</div>
          <div>${esc(v.title)}</div>
        </div>
        <div class="short-actions">
          <button data-act="like"><svg viewBox="0 0 24 24"><path d="M3 11h3v10H3zm4 10h12.4a2 2 0 001.95-1.54L22 11h-7V6.5A2.5 2.5 0 0012.5 4 1.5 1.5 0 0011 5.5V9L7 13.1V21z"/></svg></button>
          <button data-act="watch">Open</button>
        </div>
      </section>`,
      )
      .join("")}
  </div></div>`;

  const col = document.getElementById("shorts-col");
  const loaded = new Set();

  async function ensure(slide) {
    const id = slide.dataset.id;
    if (loaded.has(id)) return;
    loaded.add(id);
    const video = slide.querySelector("video");
    video.src = await window.vlctube.streamUrl(id);
    video.play().catch(() => {});
  }

  await ensure(col.querySelector(".short-slide"));

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target.querySelector("video");
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          ensure(entry.target);
          video.muted = false;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    },
    { threshold: [0.6] },
  );
  col.querySelectorAll(".short-slide").forEach((s) => io.observe(s));
  col.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    const slide = e.target.closest(".short-slide");
    if (!slide) return;
    if (act?.dataset.act === "watch") location.hash = "#/watch/" + slide.dataset.id;
    if (act?.dataset.act === "like") {
      const v = videos.find((x) => x.id === slide.dataset.id);
      if (v) toggleId("liked", v);
    }
    if (!act) {
      const video = slide.querySelector("video");
      video.paused ? video.play() : video.pause();
    }
  });
}
