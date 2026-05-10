import { Readable } from "node:stream";
import { handleRequest } from "../src/app.js";

export const config = {
  runtime: "nodejs"
};

export async function toFetchRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const origin = `${protocol}://${req.headers.host}`;
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

export async function sendNodeResponse(res, response) {
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

export async function nodeHandler(req, res) {
  const request = await toFetchRequest(req);
  const response = await handleRequest(request, { serveStatic: false });
  await sendNodeResponse(res, response);
}
