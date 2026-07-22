/**
 * miniWebSocketServer.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §11 — a minimal RFC 6455 WebSocket
 * server built on Node's built-in `http`/`crypto`/`net` modules only.
 *
 * Why this exists instead of using the `ws` package: this dev sandbox
 * has no network access to the npm registry (`npm install ws` returns
 * 403). This is a deliberate, documented workaround for THIS
 * environment, not a general recommendation — a real deployment should
 * use `ws` or an equivalent, well-audited library instead of a hand-
 * rolled WebSocket implementation.
 *
 * Scope: text frames only (this server only ever sends/receives JSON
 * signaling messages — see signalingServer.js), server-to-client frames
 * unmasked (per spec), client-to-server frames masked (per spec, browsers
 * always mask; this implementation requires and unmasks them). Supports
 * basic close frames. Does not support binary frames, per-message
 * compression extensions, or frame fragmentation (browsers don't
 * fragment small JSON text frames in practice).
 * ------------------------------------------------------------------
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

const WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function computeAcceptKey(clientKey) {
  return createHash("sha1").update(clientKey + WS_MAGIC_GUID).digest("base64");
}

/** One connected WebSocket client. */
class MiniWebSocket extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this._buffer = Buffer.alloc(0);
    this._closed = false;

    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("close", () => this._onClose());
    socket.on("error", () => this._onClose());
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    // A client may send multiple frames in one TCP chunk, or a frame
    // split across chunks — loop until we can't parse a complete frame.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const frame = this._tryParseFrame(this._buffer);
      if (!frame) return; // incomplete frame, wait for more data
      this._buffer = this._buffer.subarray(frame.totalLength);
      this._handleFrame(frame);
    }
  }

  _tryParseFrame(buf) {
    if (buf.length < 2) return null;
    const byte0 = buf[0];
    const byte1 = buf[1];
    const opcode = byte0 & 0x0f;
    const masked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (buf.length < offset + 2) return null;
      payloadLen = buf.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (buf.length < offset + 8) return null;
      // JS-safe: signaling payloads are always tiny JSON, never near 2^53.
      payloadLen = Number(buf.readBigUInt64BE(offset));
      offset += 8;
    }

    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + payloadLen) return null; // wait for the rest

    let payload = buf.subarray(offset, offset + payloadLen);
    if (masked) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) {
        unmasked[i] = payload[i] ^ maskKey[i % 4];
      }
      payload = unmasked;
    }

    return { opcode, payload, totalLength: offset + payloadLen };
  }

  _handleFrame(frame) {
    switch (frame.opcode) {
      case 0x1: // text
        this.emit("message", frame.payload.toString("utf8"));
        break;
      case 0x8: // close
        this._sendFrame(0x8, Buffer.alloc(0));
        this.socket.end();
        break;
      case 0x9: // ping -> pong
        this._sendFrame(0xa, frame.payload);
        break;
      default:
        break; // binary/pong/continuation: not used by this protocol
    }
  }

  _sendFrame(opcode, payload) {
    if (this._closed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    // Server-to-client frames are sent unmasked, per RFC 6455.
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (err) {
      this._onClose();
    }
  }

  send(data) {
    const payload = Buffer.from(typeof data === "string" ? data : JSON.stringify(data), "utf8");
    this._sendFrame(0x1, payload);
  }

  close() {
    if (this._closed) return;
    this._sendFrame(0x8, Buffer.alloc(0));
    this.socket.end();
  }

  _onClose() {
    if (this._closed) return;
    this._closed = true;
    this.emit("close");
  }
}

/** Minimal WebSocket server: `new MiniWebSocketServer({ server })` attaches
 * to an existing http.Server's 'upgrade' event, or `{ port }` creates its
 * own. Emits 'connection' with a MiniWebSocket instance, matching the
 * subset of the `ws` package's API this project actually uses. */
export class MiniWebSocketServer extends EventEmitter {
  constructor({ server, port } = {}) {
    super();
    this.server = server ?? createServer();
    // Render (and most PaaS hosts) health-check with a plain HTTP GET to
    // "/" before ever attempting a WebSocket upgrade. Without a 'request'
    // handler, http.createServer() accepts the connection but never
    // responds — the request just hangs forever, which reads as "service
    // down" to a health checker. This never touches the WebSocket path,
    // which is handled entirely by the separate 'upgrade' event below.
    if (!server) {
      this.server.on("request", (req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("FIELDTALK signaling server: ok");
      });
    }
    this.server.on("upgrade", (req, socket, head) => this._handleUpgrade(req, socket, head));
    if (!server && port) {
      this.server.listen(port);
    }
  }

  _handleUpgrade(req, socket, head) {
    const key = req.headers["sec-websocket-key"];
    if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
      socket.destroy();
      return;
    }
    const acceptKey = computeAcceptKey(key);
    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");
    socket.write(responseHeaders);

    const ws = new MiniWebSocket(socket);
    if (head && head.length > 0) {
      // Any bytes the client sent immediately after the handshake, before
      // we attached our data listener — feed them in so nothing's lost.
      ws._onData(head);
    }
    this.emit("connection", ws, req);
  }

  /** Stop accepting new connections and release the bound port. Only the
   * self-created http server is owned here; an injected `server` is the
   * caller's to close. Used for clean test teardown and graceful shutdown. */
  close() {
    try {
      this.server.close?.();
    } catch (err) {
      // best-effort — a never-listened server throws; safe to ignore
    }
  }
}
