/**
 * Regression: the existing DEMO OWNER MODE path keeps working and stays
 * independent of the new identity lane.
 *
 * Demo owner mode is NOT authentication: it is a labeled dev-only control
 * (localhost/private hosts only) that exists so the demo can show the
 * owner-action seam. It must keep working until real credentials arrive,
 * and it must never be consulted for a real authorization decision.
 */

import { isDemoOwnerModeEnabled, isPrivateHost, DEMO_OWNER_MODE_ENV_VAR } from "../../owner-mode/gate";

describe("demo owner mode path (unchanged)", () => {
  const OLD = process.env[DEMO_OWNER_MODE_ENV_VAR];

  afterEach(() => {
    if (OLD === undefined) delete process.env[DEMO_OWNER_MODE_ENV_VAR];
    else process.env[DEMO_OWNER_MODE_ENV_VAR] = OLD;
  });

  test("opt-in env var enables the demo path", () => {
    process.env[DEMO_OWNER_MODE_ENV_VAR] = "1";
    expect(isDemoOwnerModeEnabled()).toBe(true);
  });

  test("demo path is off by default", () => {
    delete process.env[DEMO_OWNER_MODE_ENV_VAR];
    expect(isDemoOwnerModeEnabled()).toBe(false);
  });

  test("any other value keeps the demo path off", () => {
    process.env[DEMO_OWNER_MODE_ENV_VAR] = "true";
    expect(isDemoOwnerModeEnabled()).toBe(false);
  });

  test("private hosts: loopback, RFC 1918, Tailscale, link-local", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("10.0.5.9")).toBe(true);
    expect(isPrivateHost("192.168.1.20")).toBe(true);
    expect(isPrivateHost("172.16.4.4")).toBe(true);
    expect(isPrivateHost("100.79.154.43")).toBe(true); // Tailscale demo route
    expect(isPrivateHost("169.254.10.20")).toBe(true);
  });

  test("public hosts are refused", () => {
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("203.0.113.7")).toBe(false);
    expect(isPrivateHost("example.com")).toBe(false);
  });
});
