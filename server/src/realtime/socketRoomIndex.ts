export function trackSocketRoom(index: Map<string, Set<string>>, socketId: string, roomCode: string): void {
  const socketIds = index.get(roomCode) ?? new Set<string>();
  socketIds.add(socketId);
  index.set(roomCode, socketIds);
}

export function untrackSocketRoom(index: Map<string, Set<string>>, socketId: string, roomCode: string): void {
  index.get(roomCode)?.delete(socketId);
}
