// Structural subset of the Cloudflare runtime used by this adapter.
// Keeping these types local avoids replacing the browser DOM globals in the shared core.
export interface Socket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
export interface DurableState {
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  getWebSockets(): Socket[];
  acceptWebSocket(socket: Socket): void;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    put(values: Record<string, unknown>): Promise<void>;
    delete(key: string): Promise<boolean>;
    deleteAll(): Promise<void>;
    list<T>(options: { prefix: string }): Promise<Map<string, T>>;
    getAlarm(): Promise<number | null>;
    setAlarm(time: number): Promise<void>;
    sql: {
      exec<T = Record<string, unknown>>(
        query: string,
        ...bindings: unknown[]
      ): { toArray(): T[] };
    };
  };
}
export interface DurableNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): Service;
}
export interface Service {
  fetch(request: Request): Promise<Response>;
}
export function socketPair(): { 0: Socket; 1: Socket } {
  const Pair = (
    globalThis as unknown as {
      WebSocketPair: new () => { 0: Socket; 1: Socket };
    }
  ).WebSocketPair;
  return new Pair();
}
export function upgrade(socket: Socket): Response {
  return new Response(null, { status: 101, webSocket: socket } as ResponseInit);
}
