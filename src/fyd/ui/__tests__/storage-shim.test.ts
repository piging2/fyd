/**
 * Regression tests for the FYD storage shim (portal lane, 2026-10-02).
 *
 * Covers the user-visible defect: an embedded generated site crashing with
 * "Application error" because localStorage/sessionStorage throw inside FYD's
 * sandboxed iframe (no allow-same-origin).
 *
 * Runs in the repo's node jest env with no DOM dependency: the harness is a
 * plain object contextified with node's vm module, which is enough to prove
 * the shim payload never throws and installs working in-memory fallbacks.
 */
import * as vm from "vm";
import {
  STORAGE_SHIM_ID,
  STORAGE_SHIM_JS,
  injectStorageShim,
  CRASH_BEACON_ID,
  CRASH_BEACON_JS,
  CRASH_BEACON_MESSAGE_TYPE,
  injectCrashBeacon,
  injectEmbedShims,
} from "../storage-shim";

/** Minimal window stand-in. storageUsable/installFallback only touch
 *  window[kind], Object.defineProperty, Object.keys and String. */
function fakeWindow(): any {
  const win: any = {};
  win.window = win;
  return win;
}

/** Window whose storage accessors throw, like a sandboxed cross-origin iframe. */
function deniedWindow(): any {
  const win = fakeWindow();
  const denied = () => {
    throw new Error("SecurityError: access to storage is denied");
  };
  Object.defineProperty(win, "localStorage", { get: denied, configurable: true });
  Object.defineProperty(win, "sessionStorage", { get: denied, configurable: true });
  return win;
}

/** Window with genuinely working storage, like a normal top-level page. */
function workingWindow(): { win: any; native: any } {
  const win = fakeWindow();
  const store: Record<string, string> = {};
  const native = {
    get length() { return Object.keys(store).length; },
    key: (i: number) => { const ks = Object.keys(store); return i >= 0 && i < ks.length ? ks[i] : null; },
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k: string, v: string) => { store[String(k)] = String(v); },
    removeItem: (k: string) => { delete store[String(k)]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  win.localStorage = native;
  win.sessionStorage = native;
  return { win, native };
}

/** Run the shim payload in a window context; must never throw. */
function runShim(win: any): void {
  const ctx = vm.createContext(win);
  expect(() => vm.runInContext(STORAGE_SHIM_JS, ctx)).not.toThrow();
}

describe("storage shim payload", () => {
  it("never throws when storage access itself throws (sandboxed iframe)", () => {
    const win = deniedWindow();
    expect(() => runShim(win)).not.toThrow();
  });

  it("installs a working in-memory localStorage fallback", () => {
    const win = deniedWindow();
    runShim(win);
    const ls = win.localStorage;
    expect(() => ls.setItem("a", "1")).not.toThrow();
    expect(ls.getItem("a")).toBe("1");
    expect(ls.getItem("missing")).toBeNull();
    expect(ls.length).toBe(1);
    expect(ls.key(0)).toBe("a");
    expect(ls.key(9)).toBeNull();
    ls.removeItem("a");
    expect(ls.getItem("a")).toBeNull();
    ls.setItem("b", "2");
    ls.clear();
    expect(ls.length).toBe(0);
  });

  it("installs a working in-memory sessionStorage fallback", () => {
    const win = deniedWindow();
    runShim(win);
    const ss = win.sessionStorage;
    expect(() => ss.setItem("k", "v")).not.toThrow();
    expect(ss.getItem("k")).toBe("v");
  });

  it("preserves a genuinely working storage (does not replace native)", () => {
    const { win, native } = workingWindow();
    runShim(win);
    expect(win.localStorage).toBe(native);
    win.localStorage.setItem("n", "native");
    expect(win.localStorage.getItem("n")).toBe("native");
  });
});

describe("injectStorageShim", () => {
  const marker = `id="${STORAGE_SHIM_ID}"`;

  it("injects the shim script immediately after <head>", () => {
    const out = injectStorageShim(
      "<!doctype html><html><head><title>t</title></head><body>x</body></html>",
    );
    expect(out).toContain(marker);
    const headEnd = out.indexOf("<head>") + "<head>".length;
    expect(out.indexOf(marker) - headEnd).toBeLessThan(200);
    expect(out.indexOf(marker)).toBeGreaterThan(headEnd);
  });

  it("tolerates <head> attributes and uppercase tags", () => {
    const withAttrs = injectStorageShim('<html><HEAD data-x="1"><title>t</title></HEAD></html>');
    expect(withAttrs).toContain(marker);
    expect(withAttrs.indexOf(marker)).toBeGreaterThan(withAttrs.toUpperCase().indexOf("<HEAD"));
  });

  it("falls back to after <html> when there is no <head>", () => {
    const out = injectStorageShim("<html lang=\"en\"><body>x</body></html>");
    expect(out).toContain(marker);
    expect(out.indexOf(marker)).toBeGreaterThan(out.indexOf("<html"));
  });

  it("leaves non-HTML responses untouched", () => {
    const json = '{"hello":"world"}';
    expect(injectStorageShim(json)).toBe(json);
  });

  it("is idempotent: a shimmed document is returned unchanged", () => {
    const once = injectStorageShim("<html><head></head><body></body></html>");
    const twice = injectStorageShim(once);
    expect(twice).toBe(once);
    expect(once.split(marker).length - 1).toBe(1);
  });

  it("injected page output contains the payload the route will serve", () => {
    // This is the contract /api/live/[siteId] must satisfy: the served HTML
    // carries the shim script as the first thing after <head>.
    const served = injectStorageShim(
      "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>app</body></html>",
    );
    expect(served).toContain(`<script id="${STORAGE_SHIM_ID}"`);
    expect(served).toContain("makeMemoryStorage");
  });
});

/** Fake window for the crash beacon: records postMessages and event listeners. */
function beaconWindow(): any {
  const win: any = {};
  win.window = win;
  win.posted = [] as Array<{ msg: any; target: string }>;
  win.parent = {
    postMessage: (msg: any, target: string) => {
      win.posted.push({ msg, target });
    },
  };
  win.listeners = {} as Record<string, Array<(ev: any) => void>>;
  win.addEventListener = (type: string, fn: (ev: any) => void) => {
    (win.listeners[type] = win.listeners[type] || []).push(fn);
  };
  return win;
}

/** Run the beacon payload in a window context; must never throw. */
function runBeacon(win: any): void {
  const ctx = vm.createContext(win);
  expect(() => vm.runInContext(CRASH_BEACON_JS, ctx)).not.toThrow();
}

/** Fire a synthetic window "error" event carrying the given error value. */
function fireWindowError(win: any, err: any): void {
  for (const fn of win.listeners["error"] || []) {
    expect(() =>
      fn({ error: err, message: err instanceof Error ? err.message : String(err) }),
    ).not.toThrow();
  }
}

/** The exact failure mode: Happy Place's mount effect reads parent location. */
const LOCATION_PROBE_CRASH = new Error(
  "SecurityError: Failed to read a named property 'origin' from 'Location': " +
    "Sandbox access violation: Blocked a frame from accessing a frame at " +
    '"null". The frame requesting access is sandboxed and lacks the ' +
    '"allow-same-origin" flag.',
);

describe("crash beacon payload", () => {
  it("never throws when installed", () => {
    runBeacon(beaconWindow());
  });

  it("posts the crash message type the portal preview listens for", () => {
    expect(CRASH_BEACON_JS).toContain(CRASH_BEACON_MESSAGE_TYPE);
    expect(CRASH_BEACON_MESSAGE_TYPE).toBe("fyd-embed-crash");
  });

  it("reports a sandbox location-probe crash to the parent frame", () => {
    const win = beaconWindow();
    runBeacon(win);
    fireWindowError(win, LOCATION_PROBE_CRASH);
    expect(win.posted).toHaveLength(1);
    expect(win.posted[0].msg.type).toBe(CRASH_BEACON_MESSAGE_TYPE);
    expect(win.posted[0].msg.reason).toContain("SecurityError");
  });

  it("reports an unhandled rejection carrying the same failure mode", () => {
    const win = beaconWindow();
    runBeacon(win);
    for (const fn of win.listeners["unhandledrejection"] || []) {
      expect(() => fn({ reason: LOCATION_PROBE_CRASH })).not.toThrow();
    }
    expect(win.posted).toHaveLength(1);
    expect(win.posted[0].msg.type).toBe(CRASH_BEACON_MESSAGE_TYPE);
  });

  it("stays silent for unrelated page errors (no behavior change)", () => {
    const win = beaconWindow();
    runBeacon(win);
    fireWindowError(win, new TypeError("Cannot read properties of null"));
    fireWindowError(win, new Error("plain render bug"));
    expect(win.posted).toHaveLength(0);
  });

  it("never throws when the parent is unreachable", () => {
    const win = beaconWindow();
    win.parent = null;
    runBeacon(win);
    fireWindowError(win, LOCATION_PROBE_CRASH);
    expect(win.posted).toHaveLength(0);
  });
});

describe("injectCrashBeacon", () => {
  const marker = `id="${CRASH_BEACON_ID}"`;

  it("injects the beacon script immediately after <head>", () => {
    const out = injectCrashBeacon(
      "<!doctype html><html><head><title>t</title></head><body>x</body></html>",
    );
    expect(out).toContain(marker);
    expect(out).toContain(CRASH_BEACON_MESSAGE_TYPE);
  });

  it("leaves non-HTML responses untouched and is idempotent", () => {
    expect(injectCrashBeacon('{"hello":"world"}')).toBe('{"hello":"world"}');
    const once = injectCrashBeacon("<html><head></head><body></body></html>");
    expect(injectCrashBeacon(once)).toBe(once);
    expect(once.split(marker).length - 1).toBe(1);
  });
});

describe("injectEmbedShims", () => {
  it("carries both shims with the storage shim first after <head>", () => {
    const out = injectEmbedShims(
      '<!doctype html><html><head><meta charset="utf-8"></head><body>app</body></html>',
    );
    expect(out).toContain(`id="${STORAGE_SHIM_ID}"`);
    expect(out).toContain(`id="${CRASH_BEACON_ID}"`);
    const headEnd = out.indexOf("<head>") + "<head>".length;
    expect(out.indexOf(`id="${STORAGE_SHIM_ID}"`)).toBeGreaterThan(headEnd);
    expect(out.indexOf(`id="${STORAGE_SHIM_ID}"`)).toBeLessThan(
      out.indexOf(`id="${CRASH_BEACON_ID}"`),
    );
  });

  it("is idempotent across repeated application", () => {
    const once = injectEmbedShims("<html><head></head><body></body></html>");
    const twice = injectEmbedShims(once);
    expect(twice).toBe(once);
    expect(once.split(`id="${STORAGE_SHIM_ID}"`).length - 1).toBe(1);
    expect(once.split(`id="${CRASH_BEACON_ID}"`).length - 1).toBe(1);
  });
});
