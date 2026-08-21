import { chmod, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "bin", "yt-dlp");

if (existsSync(dest)) process.exit(0);

await mkdir(path.join(root, "bin"), { recursive: true });
const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.warn("Could not download yt-dlp:", res.status);
  process.exit(0);
}
const buf = Buffer.from(await res.arrayBuffer());
await import("node:fs/promises").then((fs) => fs.writeFile(dest, buf));
await chmod(dest, 0o755);
console.log("Downloaded yt-dlp to", dest);
