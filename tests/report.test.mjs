import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/report/route.ts";

const url = "https://nookplay.vercel.app/api/report";
function request(body, origin = "https://nookplay.vercel.app") {
  return new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
const valid = { title: "Room cannot be joined", description: "Joining a room with the code shows an unexpected error.", steps: "Create a room, then join on another phone.", email: "player@example.com", website: "" };

test("bug report rejects invalid content and a cross-site request", async () => {
  assert.equal((await POST(request({ ...valid, description: "short" }))).status, 400);
  assert.equal((await POST(request(valid, "https://other.example"))).status, 403);
});

test("bug report does not claim email was sent without SMTP configuration", async () => {
  const response = await POST(request(valid));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /GitHub Issues/);
});

test("hidden spam field silently discards automated submissions", async () => {
  assert.equal((await POST(request({ ...valid, website: "https://spam.example" }))).status, 200);
});
