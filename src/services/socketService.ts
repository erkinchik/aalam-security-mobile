import { io, Socket } from "socket.io-client";
import { ENV } from "../config/env";

let socket: Socket | null = null;
let currentToken: string | null = null;

export const socketService = {
  connect(token: string) {
    if (socket) {
      if (currentToken !== token) {
        currentToken = token;
        socket.auth = { token };
        if (socket.connected) {
          socket.disconnect();
        }
        socket.connect();
      }
      return socket;
    }

    socket = io(`${ENV.wsUrl}/ws`, {
      // Порядок именно такой. Чистый websocket в Expo Go срывается с
      // «websocket error», а engine.io переходит к следующему транспорту только
      // при tryAllTransports (по умолчанию выключен) — из-за этого приложение
      // оставалось вообще без событий. polling поднимает соединение сразу,
      // после чего engine.io сам апгрейдит его до websocket, если тот доступен.
      transports: ["polling", "websocket"],
      tryAllTransports: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      // 30s cap is friendlier on battery and infra than 10s under sustained outages.
      reconnectionDelayMax: 30000,
    });
    currentToken = token;
    return socket;
  },
  getSocket() {
    return socket;
  },
  disconnect() {
    socket?.disconnect();
    socket = null;
    currentToken = null;
  },
};
