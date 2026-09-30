import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { apiRequest, ApiError } from "../app/api-client.ts";

afterEach(() => mock.restoreAll());

test("valid JSON preserves status and requests uncached JSON", async () => {
  mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.get("Accept"), "application/json");
    assert.equal(options.headers.get("X-Test"), "yes");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return Response.json({ lots: [] });
  });
  const result = await apiRequest("/api/factory", { headers: { "X-Test": "yes" } });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, { lots: [] });
});

test("a temporary GET gateway failure is retried and recovers", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => ++calls === 1 ? new Response("<!DOCTYPE html>Gateway", { status: 502 }) : Response.json({ lots: [] }));
  assert.deepEqual((await apiRequest("/api/factory")).data, { lots: [] });
  assert.equal(calls, 2);
});

test("HTML errors after saving never leak parser errors or replay a mutation", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => new Response("<!DOCTYPE html><h1>secret server details</h1>", { status: 502 }));
  await assert.rejects(apiRequest("/api/factory", { method: "POST", body: "{}" }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 502);
    assert.match(error.message, /hosting server/);
    assert.match(error.message, /Save status is unknown/);
    assert.doesNotMatch(error.message, /DOCTYPE|secret|Unexpected token/);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test("a dropped save response is never retried", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(apiRequest("/api/factory", { method: "POST" }), /Check the record before submitting again/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("HTML with status 200 is not accepted as saved data", async () => {
  mock.method(globalThis, "fetch", async () => new Response("<!DOCTYPE html>Login page", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(apiRequest("/api/factory", { method: "POST" }), /unexpected page/);
});

test("malformed, empty and non-object JSON are rejected", async () => {
  for (const text of ["", "{bad", "null", "[]", '"hello"']) {
    mock.method(globalThis, "fetch", async () => new Response(text));
    await assert.rejects(apiRequest("/api/factory"), ApiError);
    mock.restoreAll();
  }
});

test("JSON validation errors and expired sessions remain available to the caller", async () => {
  for (const status of [400, 401, 403, 409, 500]) {
    mock.method(globalThis, "fetch", async () => Response.json({ error: "Specific server explanation" }, { status }));
    const result = await apiRequest("/api/factory", { method: "POST" });
    assert.equal(result.response.status, status);
    assert.equal(result.data.error, "Specific server explanation");
    mock.restoreAll();
  }
});

test("login and session failures do not incorrectly claim a record was saved", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(apiRequest("/api/factory", { method: "POST", readOnly: true }), (error) => {
    assert.match(error.message, /temporarily unavailable/);
    assert.doesNotMatch(error.message, /Save status/);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test("persistent GET gateway errors stop after one retry", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 504 }));
  await assert.rejects(apiRequest("/api/factory"), /HTTP 504/);
  assert.equal(fetch.mock.callCount(), 2);
});

test("caller cancellation is respected without retries", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetch = mock.method(globalThis, "fetch", async (_url, options) => { options.signal.throwIfAborted(); });
  await assert.rejects(apiRequest("/api/factory", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});
