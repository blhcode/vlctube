import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dir = path.join(os.homedir(), ".cache", "vlctube");
const file = path.join(dir, "cache.json");
const mem = new Map();
const inflight = new Map();

let disk = {};
try {
  disk = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  disk = {};
}

let persistTimer;
function persist() {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(disk));
  } catch {
    /* ignore */
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 300);
}

function record(key, value, keep) {
  const rec = { at: Date.now(), value };
  mem.set(key, rec);
  if (keep) {
    disk[key] = rec;
    schedulePersist();
  }
  return value;
}

export function peek(key, ttl) {
  const now = Date.now();
  const rec = mem.get(key) || disk[key];
  if (rec && now - rec.at < ttl) {
    mem.set(key, rec);
    return rec.value;
  }
  return null;
}

export function cached(key, ttl, fn, keep = true) {
  const hit = peek(key, ttl);
  if (hit != null) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(fn)
    .then((value) => record(key, value, keep))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function staleThen(key, ttl, staleTtl, fn, keep = true) {
  const stale = peek(key, staleTtl);
  const fresh = peek(key, ttl);
  if (fresh != null) return Promise.resolve(fresh);
  const p = cached(key, ttl, fn, keep);
  if (stale != null) {
    p.catch(() => {});
    return Promise.resolve(stale);
  }
  return p;
}

export function rememberShort(id) {
  const rec = disk.verifiedShorts || { at: Date.now(), value: [] };
  const set = new Set(rec.value);
  if (set.has(id)) return;
  set.add(id);
  disk.verifiedShorts = { at: Date.now(), value: [...set].slice(-500) };
  schedulePersist();
}

export function knownShort(id) {
  const list = disk.verifiedShorts?.value;
  return Array.isArray(list) && list.includes(id);
}

export function rememberNotShort(id) {
  const rec = disk.notShorts || { at: Date.now(), value: [] };
  const set = new Set(rec.value);
  set.add(id);
  disk.notShorts = { at: Date.now(), value: [...set].slice(-800) };
  schedulePersist();
}

export function knownNotShort(id) {
  const list = disk.notShorts?.value;
  return Array.isArray(list) && list.includes(id);
}
