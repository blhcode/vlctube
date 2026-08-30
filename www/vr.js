(function () {
  const COLS = 2;
  const DEADZONE = 0.45;
  const REPEAT_MS = 220;

  const state = {
    active: false,
    screen: "browse",
    tab: "home",
    items: [],
    focus: 0,
    shorts: [],
    shortIndex: 0,
    watch: null,
    loading: false,
    hint: "",
    lastNav: 0,
    pressed: Object.create(null),
  };

  let root = null;
  let raf = 0;
  let videoEl = null;

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function vibrate(ms = 12) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* ignore */
    }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem("vlctube:history")) || [];
    } catch {
      return [];
    }
  }

  function pushHistory(video) {
    const list = [video, ...loadHistory().filter((v) => v.id !== video.id)].slice(0, 80);
    localStorage.setItem("vlctube:history", JSON.stringify(list));
    try {
      localStorage.removeItem("vlctube:home-cache");
    } catch {
      /* ignore */
    }
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "vr-root";
    root.hidden = true;
    root.innerHTML = `
      <div class="vr-sbs">
        <div class="vr-eye" data-eye="L"><div class="vr-panel"></div></div>
        <div class="vr-divider" aria-hidden="true"></div>
        <div class="vr-eye" data-eye="R"><div class="vr-panel"></div></div>
      </div>
      <div class="vr-stage" id="vr-stage" hidden></div>
      <div class="vr-toast" id="vr-toast" hidden></div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function panels() {
    return [...root.querySelectorAll(".vr-panel")];
  }

  function toast(msg) {
    const el = document.getElementById("vr-toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 1600);
  }

  function paintBrowse() {
    const tabs = [
      { id: "home", label: "Home" },
      { id: "shorts", label: "Shorts" },
      { id: "history", label: "History" },
      { id: "exit", label: "Exit VR" },
    ];
    const tabHtml = tabs
      .map(
        (t, i) =>
          `<button class="vr-tab ${state.tab === t.id ? "on" : ""} ${state.focus === i - 1000 ? "focus" : ""}" data-tab="${t.id}">${esc(t.label)}</button>`,
      )
      .join("");

    let body;
    if (state.loading) {
      body = `<div class="vr-msg">Loading…</div>`;
    } else if (!state.items.length) {
      body = `<div class="vr-msg">Nothing here yet. Watch something in normal mode first, or open Home.</div>`;
    } else {
      body = `<div class="vr-grid">${state.items
        .map((v, i) => {
          const on = i === state.focus;
          return `<article class="vr-card ${on ? "focus" : ""}" data-i="${i}">
            <div class="vr-thumb"><img src="${esc(v.thumb)}" alt="" /></div>
            <h3>${esc(v.title)}</h3>
            <p>${esc(v.channel || "")}</p>
          </article>`;
        })
        .join("")}</div>`;
    }

    const html = `
      <div class="vr-hud">
        <div class="vr-title">VLCTube VR</div>
        <div class="vr-tabs">${tabHtml}</div>
        ${body}
        <div class="vr-help">Stick / D-pad move · A select · B back · Start exit</div>
      </div>
    `;
    for (const p of panels()) p.innerHTML = html;
  }

  function paintWatch() {
    const v = state.watch || {};
    const html = `
      <div class="vr-hud vr-hud-watch">
        <div class="vr-title">${esc(v.title || "Playing")}</div>
        <p class="vr-sub">${esc(v.channel || "")}</p>
        <div class="vr-help">A play/pause · Stick ←→ seek · B back · ↑↓ volume</div>
      </div>
    `;
    for (const p of panels()) p.innerHTML = html;
  }

  function paintShorts() {
    const v = state.shorts[state.shortIndex] || {};
    const html = `
      <div class="vr-hud vr-hud-shorts">
        <div class="vr-title">Shorts</div>
        <p class="vr-sub">${esc(v.channel || "")}</p>
        <h3>${esc(v.title || "")}</h3>
        <div class="vr-help">Stick ↑↓ next/prev · A play/pause · B menu · ${state.shortIndex + 1}/${state.shorts.length || 0}</div>
      </div>
    `;
    for (const p of panels()) p.innerHTML = html;
  }

  function paint() {
    if (!state.active) return;
    if (state.screen === "watch") paintWatch();
    else if (state.screen === "shorts") paintShorts();
    else paintBrowse();
  }

  async function loadTab(tab) {
    state.tab = tab;
    state.focus = 0;
    state.loading = true;
    paint();
    try {
      if (tab === "home") {
        const history = loadHistory();
        const taste = window.vlctubeTaste?.buildTaste?.(history) || { personalized: false };
        const home = await window.vlctube.home(taste);
        const watched = new Set(taste.watchedIds || []);
        state.items = (home.videos || []).filter((v) => v?.id && !watched.has(v.id) && !v.isShort);
      } else if (tab === "history") {
        state.items = loadHistory().filter((v) => v?.id);
      } else if (tab === "shorts") {
        const { videos } = await window.vlctube.shorts();
        state.shorts = videos || [];
        state.items = state.shorts;
      }
    } catch (err) {
      state.items = [];
      toast(String(err.message || err));
    } finally {
      state.loading = false;
      paint();
    }
  }

  function clearStage() {
    const stage = document.getElementById("vr-stage");
    if (!stage) return;
    stage.hidden = true;
    stage.innerHTML = "";
    videoEl = null;
  }

  async function openWatch(item) {
    if (!item?.id) return;
    state.screen = "watch";
    state.watch = item;
    state.loading = true;
    paint();
    const stage = document.getElementById("vr-stage");
    stage.hidden = false;
    stage.innerHTML = `<video id="vr-video" playsinline autoplay></video>`;
    videoEl = document.getElementById("vr-video");
    try {
      const src = await window.vlctube.streamUrl(item.id);
      const info = await window.vlctube.video(item.id).catch(() => item);
      state.watch = { ...item, ...info };
      pushHistory(state.watch);
      videoEl.src = src;
      await videoEl.play().catch(() => {});
    } catch (err) {
      toast(String(err.message || err));
    } finally {
      state.loading = false;
      paint();
    }
  }

  async function openShorts(startIndex = 0) {
    if (!state.shorts.length) {
      state.loading = true;
      paint();
      try {
        const { videos } = await window.vlctube.shorts();
        state.shorts = videos || [];
      } catch (err) {
        toast(String(err.message || err));
      }
      state.loading = false;
    }
    if (!state.shorts.length) {
      toast("No Shorts found");
      state.screen = "browse";
      paint();
      return;
    }
    state.screen = "shorts";
    state.shortIndex = Math.max(0, Math.min(startIndex, state.shorts.length - 1));
    await playCurrentShort();
  }

  async function playCurrentShort() {
    const item = state.shorts[state.shortIndex];
    if (!item) return;
    state.watch = item;
    paint();
    const stage = document.getElementById("vr-stage");
    stage.hidden = false;
    if (!videoEl || videoEl.id !== "vr-video") {
      stage.innerHTML = `<video id="vr-video" class="vr-short-video" playsinline loop autoplay></video>`;
      videoEl = document.getElementById("vr-video");
    }
    try {
      videoEl.src = await window.vlctube.streamUrl(item.id);
      videoEl.loop = true;
      await videoEl.play().catch(() => {});
      pushHistory(item);
    } catch (err) {
      toast(String(err.message || err));
    }
    paint();
  }

  function moveFocus(dx, dy) {
    if (state.screen !== "browse" || !state.items.length) return;
    const cols = COLS;
    const rows = Math.ceil(state.items.length / cols);
    let col = state.focus % cols;
    let row = Math.floor(state.focus / cols);
    col = Math.max(0, Math.min(cols - 1, col + dx));
    row = Math.max(0, Math.min(rows - 1, row + dy));
    const next = Math.min(state.items.length - 1, row * cols + col);
    if (next !== state.focus) {
      state.focus = next;
      vibrate(8);
      paint();
      root.querySelector(`.vr-card.focus`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function select() {
    vibrate(16);
    if (state.screen === "watch" || state.screen === "shorts") {
      if (videoEl) videoEl.paused ? videoEl.play() : videoEl.pause();
      return;
    }
    // Tab row when focus is negative sentinel — use tab buttons via L1/R1 instead
    const item = state.items[state.focus];
    if (!item) return;
    if (state.tab === "shorts") {
      openShorts(state.focus);
    } else {
      openWatch(item);
    }
  }

  function back() {
    vibrate(10);
    if (state.screen === "watch" || state.screen === "shorts") {
      clearStage();
      state.screen = "browse";
      if (state.tab === "shorts") loadTab("shorts");
      else paint();
      return;
    }
    exit();
  }

  function cycleTab(dir) {
    const order = ["home", "shorts", "history"];
    const i = order.indexOf(state.tab);
    const next = order[(i + dir + order.length) % order.length];
    loadTab(next);
  }

  function seek(delta) {
    if (!videoEl || !Number.isFinite(videoEl.duration)) return;
    videoEl.currentTime = Math.max(0, Math.min(videoEl.duration - 0.5, videoEl.currentTime + delta));
  }

  function volume(delta) {
    if (!videoEl) return;
    videoEl.volume = Math.max(0, Math.min(1, (videoEl.volume || 1) + delta));
  }

  async function nextShort(dir) {
    if (state.screen !== "shorts" || !state.shorts.length) return;
    state.shortIndex = (state.shortIndex + dir + state.shorts.length) % state.shorts.length;
    vibrate(10);
    await playCurrentShort();
  }

  function edge(name, down) {
    const was = state.pressed[name];
    state.pressed[name] = down;
    return down && !was;
  }

  function pollGamepad() {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find((p) => p);
    const now = performance.now();
    const canRepeat = now - state.lastNav > REPEAT_MS;

    let dx = 0;
    let dy = 0;
    let a = false;
    let b = false;
    let start = false;
    let lb = false;
    let rb = false;

    if (gp) {
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (Math.abs(ax) > DEADZONE) dx = ax > 0 ? 1 : -1;
      if (Math.abs(ay) > DEADZONE) dy = ay > 0 ? 1 : -1;
      if (gp.buttons[14]?.pressed) dx = -1;
      if (gp.buttons[15]?.pressed) dx = 1;
      if (gp.buttons[12]?.pressed) dy = -1;
      if (gp.buttons[13]?.pressed) dy = 1;
      a = Boolean(gp.buttons[0]?.pressed);
      b = Boolean(gp.buttons[1]?.pressed || gp.buttons[8]?.pressed);
      start = Boolean(gp.buttons[9]?.pressed);
      lb = Boolean(gp.buttons[4]?.pressed);
      rb = Boolean(gp.buttons[5]?.pressed);
    }

    if ((dx || dy) && canRepeat) {
      state.lastNav = now;
      if (state.screen === "shorts") {
        if (dy) nextShort(dy);
        else if (dx) seek(dx * 5);
      } else if (state.screen === "watch") {
        if (dx) seek(dx * 10);
        if (dy) volume(-dy * 0.1);
      } else {
        moveFocus(dx, dy);
      }
    }

    if (edge("a", a)) select();
    if (edge("b", b)) back();
    if (edge("start", start)) exit();
    if (edge("lb", lb)) {
      if (state.screen === "browse") cycleTab(-1);
    }
    if (edge("rb", rb)) {
      if (state.screen === "browse") cycleTab(1);
    }
  }

  function onKey(e) {
    if (!state.active) return;
    const k = e.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "Escape", "Backspace"].includes(k)) {
      e.preventDefault();
    }
    const now = performance.now();
    if (now - state.lastNav < 80 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) return;
    state.lastNav = now;

    if (k === "ArrowLeft") {
      if (state.screen === "watch") seek(-10);
      else if (state.screen === "shorts") seek(-5);
      else moveFocus(-1, 0);
    } else if (k === "ArrowRight") {
      if (state.screen === "watch") seek(10);
      else if (state.screen === "shorts") seek(5);
      else moveFocus(1, 0);
    } else if (k === "ArrowUp") {
      if (state.screen === "shorts") nextShort(-1);
      else if (state.screen === "watch") volume(0.1);
      else moveFocus(0, -1);
    } else if (k === "ArrowDown") {
      if (state.screen === "shorts") nextShort(1);
      else if (state.screen === "watch") volume(-0.1);
      else moveFocus(0, 1);
    } else if (k === "Enter" || k === " ") {
      select();
    } else if (k === "Escape" || k === "Backspace") {
      back();
    } else if (k === "[" || k === "q") {
      cycleTab(-1);
    } else if (k === "]" || k === "e") {
      cycleTab(1);
    } else if (k === "1") loadTab("home");
    else if (k === "2") {
      loadTab("shorts").then(() => openShorts(0));
    } else if (k === "3") loadTab("history");
  }

  function onClick(e) {
    if (!state.active) return;
    const tab = e.target.closest?.("[data-tab]");
    if (tab) {
      const id = tab.dataset.tab;
      if (id === "exit") exit();
      else if (id === "shorts") loadTab("shorts").then(() => openShorts(0));
      else loadTab(id);
      return;
    }
    const card = e.target.closest?.(".vr-card");
    if (card && state.screen === "browse") {
      state.focus = Number(card.dataset.i) || 0;
      select();
    }
  }

  function loop() {
    if (!state.active) return;
    pollGamepad();
    raf = requestAnimationFrame(loop);
  }

  async function enter() {
    if (state.active) return;
    ensureRoot();
    state.active = true;
    state.screen = "browse";
    document.body.classList.add("vr-active");
    root.hidden = false;
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* ignore */
    }
    try {
      await screen.orientation?.lock?.("landscape");
    } catch {
      /* ignore */
    }
    window.addEventListener("keydown", onKey, true);
    root.addEventListener("click", onClick);
    toast("VR mode — connect a controller");
    await loadTab("home");
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function exit() {
    if (!state.active) return;
    state.active = false;
    cancelAnimationFrame(raf);
    clearStage();
    window.removeEventListener("keydown", onKey, true);
    root?.removeEventListener("click", onClick);
    document.body.classList.remove("vr-active");
    if (root) root.hidden = true;
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* ignore */
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    if (location.hash === "#/vr") location.hash = "#/";
  }

  window.addEventListener("click", (e) => {
    const btn = e.target.closest?.("#vr-toggle, [data-vr-enter]");
    if (btn) {
      e.preventDefault();
      enter();
    }
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#/vr") enter();
    else if (state.active && !location.hash.startsWith("#/vr")) {
      /* stay in VR until Exit — hash changes for watch are separate */
    }
  });

  window.vlctubeVr = { enter, exit, isActive: () => state.active };
})();
