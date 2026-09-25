// Builds the HTTP + websocket server. Separate from index.ts so tests can boot one on any port.
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@kitforge/shared-types';
import type { ServerConfig } from './config.ts';
import { installRoutes } from './http/routes.ts';
import { setServices, type Services } from './services.ts';
import { LocalAssetStorage } from './storage/LocalAssetStorage.ts';
import { TableRoom } from './table/TableRoom.ts';

export async function startServer(config: ServerConfig) {
  const services: Services = { config, storage: new LocalAssetStorage(config.uploadDir) };
  setServices(services);
  const server = new Server({
    // A kit load can carry several rasterized images in one message — well past Colyseus's
    // default 4 KB cap, which would just drop the socket.
    transport: new WebSocketTransport({ maxPayload: config.maxMessageBytes }),
    greet: false,
    gracefullyShutdown: false,
    express: app => installRoutes(app, services),
  });
  server.define(ROOM_NAME, TableRoom);
  await server.listen(config.port);
  return { server, services, stop: () => server.gracefullyShutdown(false) };
}
