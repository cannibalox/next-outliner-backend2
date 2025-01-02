import {
  decodeImportBlobMeta,
  LoroDoc,
  LoroEventBatch,
  Subscription,
} from "loro-crdt";
import {
  ServerConnection,
  ServerNetwork,
} from "../../../common/loro/network/server";
import {
  MessageTypes,
  ParsedMessageType,
  readMessage,
  writePostConflictMessage,
  writePostUpdateMessage,
  writeStartSyncMessage,
} from "../../../common/loro/syncProtocol";
import { logger } from "../../logger";
import { createPromise, createPromiseLock, PromiseLock } from "../promise";
import { LoroCoordinator } from "./coordinator/coordinator";
import { LoroDocPersister } from "./persister/interface/persister";

type LoroDocController = {
  docId: string;
  guid: string;
  doc: LoroDoc;
  conns: Set<ServerConnection>;
  loadPromise: Promise<void>;
  lastEB: LoroEventBatch | null;
  subscriptions: Subscription[];
  lock: PromiseLock;
  location: string;
};

function isEqualArray(a: Uint8Array, b: Uint8Array) {
  if (a.length != b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false;
  return true;
}

// 每个 doc 都有一个 docId，是其在持久化存储中的唯一标识，不同的持久化存储中可能有 docId 相同的 doc
// 每个 doc 还有一个 guid，guid = location + docId，是全局唯一的
// 并且我们限制一个 websocket 连接只能用于同步一个持久化存储中的 doc
// 又一个 doc 可以通过多个 websocket 连接进行同步，因此这些 websocket 连接的 location 必须相同

export class ServerNetworkSetupTool {
  static PING_TIMEOUT = 10000;
  docControllers: Map<string, LoroDocController> = new Map(); // guid -> docController
  persister: LoroDocPersister;
  coordinator: LoroCoordinator;
  conn2location: Map<ServerConnection, string> = new Map(); // conn -> location

  constructor(persister: LoroDocPersister, coordinator: LoroCoordinator) {
    this.persister = persister;
    this.coordinator = coordinator;
  }

  private _loadDoc(
    docId: string,
    location: string,
    conn: ServerConnection,
  ): LoroDocController {
    const guid = location + docId;
    let controller = this.docControllers.get(guid);
    if (!controller) {
      logger.debug(
        `[setupNetwork] controller of ${guid} not found, create new one`,
      );
      const doc = new LoroDoc();
      const loadPromise = this.persister.load(docId, location, doc);
      controller = {
        docId,
        guid,
        doc,
        loadPromise,
        lastEB: null,
        conns: new Set(),
        subscriptions: [],
        lock: createPromiseLock(),
        location,
      };
      const sub = doc.subscribe((ev) => (controller!.lastEB = ev));
      controller.subscriptions.push(sub);
      this.docControllers.set(guid, controller);
    }
    return controller;
  }

  // Close a connection and remove it from all controllers
  private _closeConnection(conn: ServerConnection) {
    logger.debug(`[setupNetwork] closeConnection`);
    for (const controller of this.docControllers.values()) {
      controller.conns.delete(conn);
    }
    if (conn.isOpen()) {
      conn.close();
    }
  }

  // Send a message to a specific connection
  private _sendToConnection(conn: ServerConnection, msg: Uint8Array) {
    try {
      conn.send(msg);
    } catch (err) {
      this._closeConnection(conn);
    }
  }

  // Handle "canSync" messages from clients
  private async _handleCanSyncMessage(
    conn: ServerConnection,
    msg: ParsedMessageType<"canSync">,
  ) {
    logger.debug(`[setupNetwork] recv canSyncMessage, docId=${msg.docId}`);
    // Create remote doc from snapshot
    const remoteDoc = LoroDoc.fromSnapshot(msg.snapshot);

    // Wait for local doc to be loaded
    const location = this.conn2location.get(conn)!;
    const localDocController = this._loadDoc(msg.docId, location, conn);
    await localDocController.loadPromise;
    const localDoc = localDocController.doc;

    const canSync = this.coordinator.checkDoc(localDoc, remoteDoc);
    if (canSync) {
      // Server replies with postUpdate message immediately
      const updates = localDoc.export({
        mode: "update",
        from: remoteDoc.version(),
      });
      const vv = localDoc.version().encode();
      const replyMsg = writeStartSyncMessage(msg.docId, updates, vv);
      this._sendToConnection(conn, replyMsg);
      localDocController.conns.add(conn);
      logger.debug(
        `[setupNetwork] can sync ${msg.docId}, reply with startSync`,
      );
    } else {
      const snapshot = localDoc.export({ mode: "snapshot" });
      const replyMsg = writePostConflictMessage(msg.docId, snapshot);
      this._sendToConnection(conn, replyMsg);
      logger.debug(
        `[setupNetwork] cannot sync ${msg.docId}, reply with postConflict`,
      );
    }
  }

  // Handle "postUpdate" messages from clients
  private async _handlePostUpdateMessage(
    conn: ServerConnection,
    msg: ParsedMessageType<"postUpdate">,
  ) {
    if (msg.updates.length === 0) return;
    logger.debug(
      `[setupNetwork] recv postUpdateMessage, docId=${msg.docId}, length=${msg.updates.length}`,
    );

    // Get local doc controller
    const location = this.conn2location.get(conn)!;
    const localDocController = this._loadDoc(msg.docId, location, conn);
    await localDocController.loadPromise;
    const localDoc = localDocController.doc;

    await localDocController.lock.withLock(
      async () => {
        const beforeFrontiers = localDoc.frontiers();
        const beforeOpCount = localDoc.opCount();
        localDoc.import(msg.updates);
        if (localDoc.opCount() === beforeOpCount) {
          logger.debug(`[setupNetwork] no op applied, skip`);
          return;
        }
        // 事件将于下一个 microtask 被提交，因此这里先清空 lastEB，然后等待事件提交
        localDocController.lastEB = null;
        await Promise.resolve();
        // 没有等到事件，说明这个 updates 是空的（不对文档造成任何改变）
        if (!localDocController.lastEB) {
          logger.debug(
            `[setupNetwork] no event received, should be an empty update, skip`,
          );
          return;
        }
        // 询问协调器是否可以应用这一更改
        const canApply = this.coordinator.checkEvents(
          localDoc,
          localDocController.lastEB,
        );
        if (!canApply) {
          // Discard imported changes by forking the document
          const peerId = localDoc.peerId;
          const newLocalDoc = localDoc.forkAt(beforeFrontiers);
          newLocalDoc.setPeerId(peerId);
          localDoc.free();
          localDocController.doc = newLocalDoc;
          logger.debug(
            `[setupNetwork] cannot apply, discard everything we just imported`,
          );
        } else {
          // Broadcast the update to all connected clients
          const meta = decodeImportBlobMeta(msg.updates, true);
          const updates = localDoc.export({
            mode: "update",
            from: localDoc.frontiersToVV(meta.startFrontiers),
          });
          logger.debug(`[setupNetwork] can apply`);
          this.persister.saveNewUpdates(localDocController.docId, localDoc);
          logger.debug(`[setupNetwork] saveNewUpdates`);
          logger.debug(
            `[setupNetwork] broadcast the update to all ${localDocController.conns.size} connected clients`,
          );
          logger.debug("updates length:", updates.length, msg.updates.length);
          const replyMsg = writePostUpdateMessage(
            localDocController.docId,
            updates,
          );
          for (const connection of localDocController.conns) {
            this._sendToConnection(connection, replyMsg);
          }
        }
      },
      () => {
        logger.debug(
          `[setupNetwork] try get lock on ${localDocController.docId}`,
        );
      },
      () => {
        logger.debug(
          `[setupNetwork] get lock success on ${localDocController.docId}`,
        );
      },
    );
  }

  // Register message handlers for a new connection
  private _registerMessageHandler(conn: ServerConnection) {
    conn.onMessage((msg: Uint8Array) => {
      try {
        const parsedMsg = readMessage(msg);
        if (parsedMsg.type === MessageTypes.canSync)
          this._handleCanSyncMessage(conn, parsedMsg);
        else if (parsedMsg.type === MessageTypes.postUpdate)
          this._handlePostUpdateMessage(conn, parsedMsg);
      } catch (err) {
        logger.error(`[setupNetwork] Error handling message: ${err}`);
      }
    });
  }

  // Register an alive checker (heartbeat) for a connection
  private _registerAliveChecker(conn: ServerConnection) {
    let pongReceived = true,
      pingInterval: any = null;
    if (conn.ping && conn.onPong) {
      pingInterval = setInterval(() => {
        if (!pongReceived) {
          this._closeConnection(conn);
          clearInterval(pingInterval);
        } else {
          pongReceived = false;
          try {
            conn.ping!();
            // logger.debug(`[setupNetwork] ping`);
          } catch (e) {
            this._closeConnection(conn);
            clearInterval(pingInterval);
          }
        }
      }, ServerNetworkSetupTool.PING_TIMEOUT);

      conn.onPong(() => {
        pongReceived = true;
        // logger.debug(`[setupNetwork] pong`);
      });
    }

    conn.onClose(() => {
      this._closeConnection(conn);
      if (pingInterval) clearInterval(pingInterval);
    });
  }

  // Setup WebSocket connection using ServerNetwork
  setup(network: ServerNetwork) {
    network.onConnection((conn: ServerConnection, params) => {
      const location = params.location;
      if (!location) {
        logger.error(`[setupNetwork] Invalid params, location is required`);
        conn.close();
        return;
      }
      this.conn2location.set(conn, location);
      logger.debug(`[setupNetwork] params: ${JSON.stringify(params)}`);

      logger.info(
        `[setupNetwork] New incoming ws connection, location=${location}`,
      );
      conn.onOpen(() => {
        logger.info(
          `[setupNetwork] ws connection opened, location=${location}`,
        );
      });
      conn.onClose(() => {
        logger.info(
          `[setupNetwork] ws connection closed, location=${location}`,
        );
      });
      conn.onError((err) => {
        logger.error(
          `[setupNetwork] ws connection error, location=${location}, err=${err}`,
        );
      });
      this._registerMessageHandler(conn);
      this._registerAliveChecker(conn);
    });
  }
}
