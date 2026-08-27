import { io, type Socket } from 'socket.io-client';

type SocketEventHandler<TArgs extends unknown[]> = (...args: TArgs) => void;
type RegisteredSocketHandler = (...args: any[]) => void;

export interface SocketEventScope {
  on<TArgs extends unknown[]>(event: string, handler: SocketEventHandler<TArgs>): void;
  dispose(): void;
}

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket || !socket.connected) {
    if (socket) socket.disconnect();
    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function createSocketEventScope(target: Socket): SocketEventScope {
  const listeners: Array<{ event: string; handler: RegisteredSocketHandler }> = [];

  return {
    on<TArgs extends unknown[]>(event: string, handler: SocketEventHandler<TArgs>) {
      const registered = handler as RegisteredSocketHandler;
      target.on(event, registered);
      listeners.push({ event, handler: registered });
    },
    dispose() {
      for (const { event, handler } of listeners) target.off(event, handler);
      listeners.length = 0;
    },
  };
}
