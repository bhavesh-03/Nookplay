import { NextResponse } from "next/server";
import { GameError } from "@/lib/game";
import { changePersistedRoom, getPersistedRoom } from "@/lib/room-repository";

export const runtime = "nodejs";
const response = (error: unknown) => NextResponse.json({ error: error instanceof GameError ? error.message : "Could not load the room." }, { status: error instanceof GameError ? error.status : 500 });
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try { return NextResponse.json(await getPersistedRoom((await params).code, request.headers.get("x-room-token")), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return response(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try { return NextResponse.json(await changePersistedRoom((await params).code, request.headers.get("x-room-token"), await request.json())); }
  catch (error) { return response(error); }
}
