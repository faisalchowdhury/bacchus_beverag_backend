// global.d.ts
import { Server as SocketIo } from "socket.io";

declare global {
  namespace Express {
    interface Request {
      user?: import("./modules/user/user.interface").IUser;
    }
  }
  namespace NodeJS {
    interface Global {
      io: SocketIo;
    }
  }
}
