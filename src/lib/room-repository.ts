import { assertHost, changeRoom, createRoom, GameError, getRoomView, joinRoom, runWithState, tickRoom, type StoredRoom } from "@/lib/game";

type Row = { revision: number; state: StoredRoom };
type Session = { code: string; token: string; playerId: string };

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new GameError("Supabase is not configured on the server.", 503);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new GameError("SUPABASE_URL is invalid.", 503);
  return { url, key };
}

async function request(path: string, options: RequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${key}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers, cache: "no-store" });
  if (!response.ok) {
    if (response.status === 409) throw new GameError("Room code collision.", 409);
    throw new GameError(`Supabase request failed (${response.status}). Check the database schema and server credentials.`, 502);
  }
  return response;
}

async function read(code: string): Promise<Row> {
  const normalized = code.trim().toUpperCase();
  const response = await request(`nookplay_rooms?code=eq.${encodeURIComponent(normalized)}&select=revision,state&limit=1`);
  const rows = await response.json() as Row[];
  if (!rows.length) throw new GameError("Room not found. It may have been deleted.", 404);
  const room = rows[0].state.room;
  if (Date.now() >= (room.expiresAt ?? room.createdAt + 24 * 60 * 60 * 1000)) throw new GameError("This room expired after 24 hours.", 410);
  return rows[0];
}

async function compareAndSave(code: string, revision: number, state: StoredRoom) {
  const response = await request(`nookplay_rooms?code=eq.${encodeURIComponent(code)}&revision=eq.${revision}&select=revision`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ revision: state.room.revision, state })
  });
  const rows = await response.json() as Array<{ revision: number }>;
  return rows.length === 1;
}

export async function createPersistedRoom(name: unknown, capacity: unknown): Promise<Session> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { result, state } = runWithState(null, () => createRoom(name, capacity));
    try {
      await request("nookplay_rooms", { method: "POST", body: JSON.stringify({ code: result.code, revision: state.room.revision, state }) });
      return result;
    } catch (error) { if (!(error instanceof GameError) || error.status !== 409) throw error; }
  }
  throw new GameError("Could not create a unique room code. Try again.", 503);
}

export async function joinPersistedRoom(code: unknown, name: unknown, reclaim = false): Promise<Session> {
  const normalized = String(code ?? "").trim().toUpperCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await read(normalized);
    const { result, state } = runWithState(row.state, () => joinRoom(normalized, name, reclaim));
    if (await compareAndSave(normalized, row.revision, state)) return result;
  }
  throw new GameError("The room changed while you joined. Try again.", 409);
}

export async function getPersistedRoom(code: string, token: string | null) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await read(code);
    const { result, state } = runWithState(row.state, () => {
      const tick = tickRoom(code);
      return { code: tick.code, changed: tick.changed, view: getRoomView(code, token) };
    });
    if (!result.changed || await compareAndSave(code.trim().toUpperCase(), row.revision, state)) return result.view;
  }
  throw new GameError("The room changed. Try again.", 409);
}

export async function changePersistedRoom(code: string, token: string | null, input: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await read(code);
    const { result, state } = runWithState(row.state, () => {
      tickRoom(code);
      return changeRoom(code, token, input);
    });
    if (await compareAndSave(code.trim().toUpperCase(), row.revision, state)) return result;
  }
  throw new GameError("The room changed at the same time. Try again.", 409);
}

export async function deletePersistedRoom(code: string, token: string | null) {
  const normalized = code.trim().toUpperCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await read(normalized);
    runWithState(row.state, () => assertHost(normalized, token));
    const response = await request(`nookplay_rooms?code=eq.${encodeURIComponent(normalized)}&revision=eq.${row.revision}&select=code`, {
      method: "DELETE", headers: { Prefer: "return=representation" }
    });
    const rows = await response.json() as Array<{ code: string }>;
    if (rows.length === 1) return { code: normalized, deleted: true };
  }
  throw new GameError("The room changed. Try deleting it again.", 409);
}
