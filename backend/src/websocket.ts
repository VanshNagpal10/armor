/**
 * WebSocket handler — broadcasts real-time updates to connected clients.
 * Used primarily for pushing policy rule changes so the frontend stays in sync.
 */

import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";

export type WebSocketBroadcast = (type: string, data: unknown) => void;

export function setupWebSocket(server: Server): WebSocketBroadcast {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients: Set<WebSocket> = new Set();

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[ws] Client connected (${clients.size} total)`);

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[ws] Client disconnected (${clients.size} total)`);
    });

    ws.on("error", (err) => {
      console.error("[ws] Client error:", err);
      clients.delete(ws);
    });

    // Send a welcome message
    ws.send(
      JSON.stringify({ type: "connected", data: { message: "Connected to ArmorIQ" } })
    );
  });

  /** Broadcast a message to all connected clients */
  const broadcast: WebSocketBroadcast = (type: string, data: unknown) => {
    const msg = JSON.stringify({ type, data });
    for (const client of clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(msg);
      }
    }
  };

  return broadcast;
}
