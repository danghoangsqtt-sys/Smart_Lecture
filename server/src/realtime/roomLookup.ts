export function findRoomBySession<T extends { sessionId: string }>(rooms: Iterable<T>, sessionId: string): T | null {
  for (const room of rooms) {
    if (room.sessionId === sessionId) return room;
  }
  return null;
}
