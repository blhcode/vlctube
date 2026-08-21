import http from "node:http";
import { request as httpsRequest } from "node:https";
import { resolveStream, peekStream } from "./stream.js";

export async function cachedStream(videoId) {
  return peekStream(videoId) || resolveStream(videoId);
}

export function prefetchStream(videoId) {
  if (peekStream(videoId)) return;
  resolveStream(videoId).catch(() => {});
}

export function startMediaProxy() {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/play") {
        res.writeHead(404);
        res.end();
        return;
      }
      const id = u.searchParams.get("v");
      if (!id || !/^[\w-]{6,20}$/.test(id)) {
        res.writeHead(400);
        res.end("bad id");
        return;
      }

      const stream = await cachedStream(id);
      const target = new URL(stream.url);
      const headers = { ...(stream.headers || {}) };
      if (req.headers.range) headers.Range = req.headers.range;

      const up = httpsRequest(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          path: target.pathname + target.search,
          method: "GET",
          headers,
        },
        (upRes) => {
          const outHeaders = {
            "Content-Type": stream.mime || upRes.headers["content-type"] || "video/mp4",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          };
          if (upRes.headers["content-length"]) outHeaders["Content-Length"] = upRes.headers["content-length"];
          if (upRes.headers["content-range"]) outHeaders["Content-Range"] = upRes.headers["content-range"];
          res.writeHead(upRes.statusCode || 200, outHeaders);
          upRes.pipe(res);
        },
      );
      up.on("error", (err) => {
        if (!res.headersSent) res.writeHead(502);
        res.end(String(err));
      });
      up.end();
    } catch (err) {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(err?.message || err));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}
