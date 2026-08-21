import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const deb = path.join(root, "dist", `vlctube_${pkg.version}_amd64.deb`);
if (!fs.existsSync(deb)) {
  console.error("Missing", deb);
  process.exit(1);
}

const unpack = fs.mkdtempSync(path.join(os.tmpdir(), "vlctube-deb-"));
execFileSync("dpkg-deb", ["-R", deb, unpack]);
fs.mkdirSync(path.join(unpack, "usr", "bin"), { recursive: true });
const link = path.join(unpack, "usr", "bin", "vlctube");
try {
  fs.unlinkSync(link);
} catch {
  /* none */
}
fs.symlinkSync("/opt/VLCTube/vlctube", link);

const desktop = path.join(unpack, "usr", "share", "applications", "vlctube.desktop");
if (fs.existsSync(desktop)) {
  let text = fs.readFileSync(desktop, "utf8");
  if (!text.includes("Categories=AudioVideo;Video;Player;")) {
    text = text.replace(/Categories=.*/, "Categories=AudioVideo;Video;Player;TV;");
  }
  fs.writeFileSync(desktop, text);
}

execFileSync("dpkg-deb", ["-b", unpack, deb]);
fs.rmSync(unpack, { recursive: true, force: true });
console.log("Fixed", deb);
