import EventEmitter from "events";
import {
  ServerConnection,
  ServerNetwork,
} from "../../../../../../common/loro/network/server";
import { MockClientConnection } from "./client";

export class MockServerConnection implements ServerConnection {
  private eventEmitter: EventEmitter = new EventEmitter();
  private clientConn: MockClientConnection | null = null;
  private isOpen_: boolean = false;

  isOpen(): boolean {
    return this.isOpen_;
  }

  setClientConnection(clientConn: MockClientConnection) {
    this.clientConn = clientConn;
  }

  // @override
  send(message: Uint8Array): void {
    // Simulate asynchronous message delivery to the client
    setTimeout(() => {
      if (this.clientConn) {
        this.clientConn.receiveMessage(message);
      }
    }, 0);
  }

  // @override
  close(): void {
    if (!this.isOpen_) return;
    setTimeout(() => {
      this.isOpen_ = false;
      this.eventEmitter.emit("close");
      if (this.clientConn) {
        this.clientConn.close();
      }
    }, 0);
  }

  // @override
  onMessage(handler: (msg: Uint8Array) => void): void {
    this.eventEmitter.on("message", handler);
  }

  // @override
  onClose(handler: () => void): void {
    this.eventEmitter.on("close", handler);
  }

  // @override
  onError(handler: (error: any) => void): void {
    this.eventEmitter.on("error", handler);
  }

  // @override
  onOpen(handler: () => void): void {
    // Simulate immediate connection open
    setTimeout(() => {
      this.eventEmitter.emit("open");
      handler();
      this.isOpen_ = true;
    }, 0);
  }

  // simulate receiving a message from the client
  receiveMessage(message: Uint8Array): void {
    this.eventEmitter.emit("message", message);
  }

  // simulate an error on the connection
  triggerError(error: any): void {
    setTimeout(() => {
      this.eventEmitter.emit("error", error);
    }, 0);
  }
}

export class MockServerNetwork implements ServerNetwork {
  private connectionHandlers: Array<(conn: ServerConnection) => void> = [];

  // @override
  onConnection(handler: (conn: ServerConnection) => void): void {
    this.connectionHandlers.push(handler);
  }

  // @override
  startServer(host: string, port: number): void {
    console.log(`MockServerNetwork started on port ${port}`);
    // No actual server logic needed for the mock
  }

  handleNewConnection(clientConn: MockClientConnection): void {
    const serverConn = new MockServerConnection();
    clientConn.setServerConnection(serverConn);
    serverConn.setClientConnection(clientConn);
    this.connectionHandlers.forEach((handler) => handler(serverConn));

    // Simulate server-side connection opening
    serverConn.onOpen(() => {});
  }
}
