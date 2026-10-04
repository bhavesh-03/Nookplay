import { NextResponse } from "next/server";
import { GameError } from "@/lib/game";
import { createPersistedRoom, joinPersistedRoom } from "@/lib/room-repository";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = body.action === "create" ? await createPersistedRoom(body.name, body.capacity) : body.action === "join" || body.action === "reclaim" ? await joinPersistedRoom(body.code, body.name, body.action === "reclaim") : null;
    if (!result) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof GameError ? error.message : "Could not update the room." }, { status: error instanceof GameError ? error.status : 500 });
  }
}
