/**
 * Unit tests for the SSRF gate (pure function: no network).
 */
import { isPublicIp } from "../safe-fetch";

describe("isPublicIp", () => {
  test("rejects loopback", () => {
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
  });
  test("rejects RFC1918", () => {
    expect(isPublicIp("10.0.0.5")).toBe(false);
    expect(isPublicIp("172.16.9.9")).toBe(false);
    expect(isPublicIp("172.31.255.1")).toBe(false);
    expect(isPublicIp("192.168.1.1")).toBe(false);
  });
  test("rejects link-local and metadata endpoint", () => {
    expect(isPublicIp("169.254.169.254")).toBe(false);
    expect(isPublicIp("169.254.10.20")).toBe(false);
    expect(isPublicIp("fe80::1")).toBe(false);
  });
  test("rejects CGNAT / tailnet space", () => {
    expect(isPublicIp("100.79.154.43")).toBe(false);
    expect(isPublicIp("100.64.0.1")).toBe(false);
  });
  test("rejects multicast and v4-mapped private", () => {
    expect(isPublicIp("224.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:192.168.1.1")).toBe(false);
  });
  test("accepts public addresses", () => {
    expect(isPublicIp("93.184.216.34")).toBe(true);
    expect(isPublicIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });
  test("rejects garbage", () => {
    expect(isPublicIp("not-an-ip")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});
