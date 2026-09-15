import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardNavigation } from "../lib/veydrava/navigation.mjs";

function fixture(url = "https://example.test/dashboard") {
  const entries = [{ url, state: { framework: "retained" } }];
  const listeners = new Set();
  let position = 0;
  const browser = {
    location: { get href() { return entries[position].url; } },
    history: {
      get state() { return entries[position].state; },
      replaceState(state, _, next) { entries[position] = { state, url: next ? String(next) : entries[position].url }; },
      pushState(state, _, next) { entries.splice(++position, Infinity, { state, url: String(next) }); },
      back() { if (position > 0) { position--; listeners.forEach(fn => fn()); } },
      forward() { if (position + 1 < entries.length) { position++; listeners.forEach(fn => fn()); } },
    },
    addEventListener(_, fn) { listeners.add(fn); },
    removeEventListener(_, fn) { listeners.delete(fn); },
  };
  let current;
  const controller = createDashboardNavigation(browser, ["overview", "agents", "payments", "setup"], (view, canGoBack) => { current = { view, canGoBack }; });
  return { browser, controller, entries, listeners, get current() { return current; } };
}

test("page changes and browser Back/Forward restore the active page", () => {
  const f = fixture();
  assert.deepEqual(f.current, { view: "overview", canGoBack: false });
  f.controller.navigate("agents");
  f.controller.navigate("payments");
  f.controller.back();
  assert.equal(f.current.view, "agents");
  f.browser.history.back();
  assert.deepEqual(f.current, { view: "overview", canGoBack: false });
  f.browser.history.forward();
  assert.equal(f.current.view, "agents");
  f.controller.navigate("setup");
  assert.equal(f.entries.length, 3);
  f.browser.history.forward();
  assert.equal(f.current.view, "setup");
});

test("duplicate and invalid destinations do not add history", () => {
  const f = fixture();
  f.controller.navigate("overview");
  f.controller.navigate("missing");
  assert.equal(f.entries.length, 1);
});

test("deep links return to Overview when no prior app page exists", () => {
  const f = fixture("https://example.test/dashboard?view=payments&source=saved#vault");
  assert.equal(f.current.view, "payments");
  f.controller.back();
  assert.deepEqual(f.current, { view: "overview", canGoBack: false });
  assert.equal(f.entries.length, 1);
  const url = new URL(f.browser.location.href);
  assert.equal(url.pathname, "/dashboard");
  assert.equal(url.searchParams.get("source"), "saved");
  assert.equal(url.hash, "#vault");
  assert.equal(f.browser.history.state.framework, "retained");
});

test("unknown deep links safely display Overview and listeners clean up", () => {
  const f = fixture("https://example.test/?view=unknown");
  assert.deepEqual(f.current, { view: "overview", canGoBack: false });
  f.controller.dispose();
  assert.equal(f.listeners.size, 0);
});

test("reinitializing after reload preserves the existing back stack", () => {
  const f = fixture();
  f.controller.navigate("agents");
  f.controller.dispose();
  let view;
  const restored = createDashboardNavigation(f.browser, ["overview", "agents"], next => { view = next; });
  assert.equal(view, "agents");
  restored.back();
  assert.equal(view, "overview");
  restored.dispose();
});
