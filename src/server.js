import { createServer } from "node:http";
import { Readable } from "node:stream";
import { handleRequest, getListenConfig } from "./app.js";

async function toFetchRequest(req) {
  const origin = `http://${req.headers.host || "127.0.0.1"}`;
  const url = new URL(req.url || "/", origin).toString();
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value) {
      headers.set(key, value);
    }
  }

  const body = ["GET", "HEAD"].includes(req.method || "GET")
    ? undefined
    : Readable.toWeb(req);

  return new Request(url, {
    method: req.method,
    headers,
    body,
    duplex: body ? "half" : undefined
  });
}

async function sendNodeResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === "set-cookie") {
      const existing = res.getHeader("set-cookie");
      const next = existing ? ([]).concat(existing, value) : value;
      res.setHeader("set-cookie", next);
      return;
    }
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

const server = createServer(async (req, res) => {
  const request = await toFetchRequest(req);
  const response = await handleRequest(request, { serveStatic: true });
  await sendNodeResponse(res, response);
});

const { port, host } = getListenConfig();
server.listen(port, host, () => {
  console.log(`Resume Refresh running at http://${host}:${port}`);
});
