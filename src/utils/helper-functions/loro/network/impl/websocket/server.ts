import WebSocket from "ws";
import {
  ServerConnection,
  ServerNetwork,
} from "../../../../../../common/loro/network/server";

export class WebsocketServerConnection implements ServerConnection {
  ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(message: Uint8Array): void {
    try {
      this.ws.send(message, (err) => {
        if (err) this.close();
      });
    } catch {
      this.close();
    }
  }

  close(): void {
    this.ws.close();
  }

  ping(): void {
    this.ws.ping();
  }

  onMessage(handler: (msg: Uint8Array) => void): void {
    this.ws.on("message", (data) => {
      handler(new Uint8Array(data as ArrayBuffer));
    });
  }

  onClose(handler: () => void): void {
    this.ws.on("close", handler);
  }

  onError(handler: (error: any) => void): void {
    this.ws.on("error", handler);
  }

  onOpen(handler: () => void): void {
    this.ws.on("open", handler);
  }

  onPong(handler: () => void): void {
    this.ws.on("pong", handler);
  }
}

export class WebsocketServerNetwork implements ServerNetwork {
  wss?: WebSocket.Server;

  constructor() {
    this.wss = new WebSocket.Server({ noServer: true });
  }

  // Handle incoming connections
  onConnection(handler: (conn: ServerConnection, params: any) => void): void {
    if (!this.wss) {
      throw new Error(
        "WebSocket server not initialized. Call startServer first.",
      );
    }
    this.wss.on("connection", (ws, params) => {
      const connection = new WebsocketServerConnection(ws);
      handler(connection, params);
    });
  }
}
