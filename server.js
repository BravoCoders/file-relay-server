import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/", (req, res) => {
  res.send("File relay server running");
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

let hostClient = null; // The Android device connection
const clients = new Set();

wss.on("connection", (ws, req) => {
  console.log("New WS connection");

  ws.isHost = false;
  ws.isClient = false;
  ws.pendingRequests = new Map(); // Map reqId => original client WS (for host only)

  ws.on("message", (data) => {
    try {
      const msg = data.toString();

      // Try parse JSON message from clients/host
      let obj = null;
      try {
        obj = JSON.parse(msg);
      } catch {}

      // Protocol: client connects first and sends {"type":"client"} or {"type":"host"}
      if (obj && obj.type === "host" && !hostClient) {
        ws.isHost = true;
        hostClient = ws;
        console.log("Registered host client");
        return;
      }
      if (obj && obj.type === "client") {
        ws.isClient = true;
        clients.add(ws);
        console.log("Registered client");
        return;
      }

      // If message is from a client and wants files or download, forward to host
      if (ws.isClient && hostClient) {
        // Attach the client WS so we can send back response later
        const reqId = obj.reqId || Date.now().toString();
        // Save mapping of reqId -> ws client on host connection
        hostClient.pendingRequests.set(reqId, ws);

        // Forward to host with reqId (so host can send response tagged with it)
        const forwardMsg = JSON.stringify({ ...obj, reqId });
        hostClient.send(forwardMsg);
        console.log(`Forwarded request ${obj.action} to host`);
        return;
      }

      // If message is from host, forward response back to requesting client
      if (ws.isHost) {
        // The host will send base64 chunks or JSON with reqId

        // Expect format: either JSON with reqId or string starting with reqId:
        if (obj && obj.reqId) {
          const clientWs = ws.pendingRequests.get(obj.reqId);
          if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
          }
          // Optionally remove mapping if this is last chunk? Depends on your protocol
          // Leave removal to client side or implement heartbeat if needed
        } else if (typeof msg === "string") {
          // Check if message starts with reqId:chunkBase64 or __END__:reqId
          const sepIndex = msg.indexOf(":");
          if (sepIndex > 0) {
            const reqId = msg.substring(0, sepIndex);
            const clientWs = ws.pendingRequests.get(reqId);
            if (clientWs && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(msg);
            }
          }
        }
        return;
      }
    } catch (err) {
      console.error("Error handling WS message:", err);
    }
  });

  ws.on("close", () => {
    console.log("WS connection closed");

    if (ws.isHost) {
      hostClient = null;
      ws.pendingRequests.clear();
      console.log("Host client disconnected");
    }
    if (ws.isClient) {
      clients.delete(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
