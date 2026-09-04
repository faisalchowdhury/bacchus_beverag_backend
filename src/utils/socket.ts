import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";

import { verifySocketToken } from "./JwtToken";
import { UserModel } from "../modules/user/user.model";
import { CLIENT_URL, EXTRA_CORS_ORIGINS } from "../config";

declare module "socket.io" {
  interface Socket {
    user?: { _id: string; name: string; email: string; role: string };
  }
}

let io: SocketIOServer;

/** userId -> socket id of the currently connected client. */
export const connectedUsers = new Map<string, { socketID: string }>();

export const initSocketIO = async (server: HttpServer): Promise<void> => {
  const { Server } = await import("socket.io");

  io = new Server(server, {
    cors: {
      origin: [CLIENT_URL, "https://faisal6000.ssh.bd", ...EXTRA_CORS_ORIGINS],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Handshake auth: the client sends the same JWT it uses for the REST API,
  // either as `auth.token` or a `token` header.
  io.use(async (socket: Socket, next: (err?: any) => void) => {
    const token =
      (socket.handshake.auth.token as string) ||
      (socket.handshake.headers.token as string);

    if (!token) return next(new Error("Authentication error: token missing"));

    const decoded = verifySocketToken(token);
    if (!decoded) return next(new Error("Authentication error: invalid token"));

    const user = await UserModel.findById(decoded.id);
    if (!user) return next(new Error("Authentication error: user not found"));

    socket.user = user as any;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.user?._id?.toString();
    if (userId) {
      connectedUsers.set(userId, { socketID: socket.id });
      console.log(`🔌 Socket connected: ${userId} (${socket.id})`);
    }

    socket.on("disconnect", () => {
      for (const [key, value] of connectedUsers.entries()) {
        if (value.socketID === socket.id) {
          connectedUsers.delete(key);
          break;
        }
      }
      console.log(`🔌 Socket disconnected: ${userId ?? socket.id}`);
    });
  });

  console.log("🎉 Socket.IO initialized");
};

export { io };

/**
 * Emits a `notification` event to a single connected user. No-op when the
 * user is offline or the socket server has not started (e.g. in tests).
 */
export const emitNotification = async (
  userId: string | { toString(): string },
  payload: {
    title: string;
    message: string;
    type?: string;
    referenceId?: string;
  },
): Promise<void> => {
  if (!io) return;

  const target = connectedUsers.get(userId.toString());
  if (!target) return;

  io.to(target.socketID).emit("notification", { userId, ...payload });
};

/** Emits an arbitrary event to one user. */
export const emitToUser = (
  userId: string | { toString(): string },
  event: string,
  payload: unknown,
): void => {
  if (!io) return;
  const target = connectedUsers.get(userId.toString());
  if (target) io.to(target.socketID).emit(event, payload);
};
