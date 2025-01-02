import EventEmitter from "events";
import {
  ClientConnection,
  ClientNetwork,
} from "../../../../../../common/loro/network/client";
import { MockServerConnection, MockServerNetwork } from "./server";

export class MockClientConnection implements ClientConnection {
  private eventEmitter: EventEmitter = new EventEmitter();
  private serverConn: MockServerConnection | null = null;

  setServerConnection(serverConn: MockServerConnection) {
    this.serverConn = serverConn;
  }

  // @override
  send(message: Uint8Array): void {
    // Simulate asynchronous message delivery to the server
    setTimeout(() => {
      if (this.serverConn) {
        this.serverConn.receiveMessage(message);
      }
    }, 0);
  }

  // @override
  close(): void {
    setTimeout(() => {
      this.eventEmitter.emit("close");
      if (this.serverConn) {
        this.serverConn.close();
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
    }, 0);
  }

  // simulate receiving a message from the server
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

export class MockClientNetwork implements ClientNetwork {
  private serverNetwork: MockServerNetwork;

  /**
   * Initializes the client network with a reference to the server network.
   * @param serverNetwork The server-side network instance.
   */
  constructor(serverNetwork: MockServerNetwork) {
    this.serverNetwork = serverNetwork;
  }

  /**
   * Establishes a new client connection.
   * @param url The server URL (unused in mock).
   * @param protocol The protocol (optional, unused in mock).
   * @returns The client-side connection instance.
   */
  connect(url: string, protocol?: string): ClientConnection {
    // In the mock, 'url' and 'protocol' are not used
    const clientConn = new MockClientConnection();
    // Link this client connection to the server network
    this.serverNetwork.handleNewConnection(clientConn);
    return clientConn;
  }
}
