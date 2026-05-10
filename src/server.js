import { createServer } from "node:http";
import { buildErrorResponse, handleRequest, getListenConfig, MAX_BODY_BYTES } from "./app.js";

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
    : Buffer.concat(await readChunks(req));

  return new Request(url, {
    method: req.method,
    headers,
    body,
    duplex: body ? "half" : undefined
  });
}

async function readChunks(req) {
  const chunks = [];
  let received = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > MAX_BODY_BYTES) {
      const error = new Error("Payload too large. Keep uploads under 6 MB.");
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  return chunks;
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
  let response;
  try {
    const request = await toFetchRequest(req);
    response = await handleRequest(request, { serveStatic: true });
  } catch (error) {
    response = buildErrorResponse(error);
  }
  await sendNodeResponse(res, response);
});

const { port, host } = getListenConfig();
server.listen(port, host, () => {
  console.log(`Resume Refresh running at http://${host}:${port}`);
});
