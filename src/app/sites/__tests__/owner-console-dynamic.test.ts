/**
 * Item 8 (fyd-execution) regression: the owner console stays dynamic.
 *
 * The internal editor (site-editor-client, the OwnerConsoleIsland) must
 * only ever be downloaded on an explicit owner surface. This test asserts
 * the public site entry (site-client.tsx) references it exclusively
 * through next/dynamic — a static import would pull the entire editor
 * into every generated visitor page's client bundle.
 */

import * as fs from "fs";
import * as path from "path";

const SITE_CLIENT = path.resolve(__dirname, "..", "_shared", "site-client.tsx");

test("site-editor-client is only ever imported via next/dynamic", () => {
  const src = fs.readFileSync(SITE_CLIENT, "utf8");
  // The one sanctioned reference: inside a dynamic() call.
  expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/site-editor-client["']\s*\)/);
  // No static import of the editor module anywhere in the file.
  const withoutDynamic = src.replace(
    /dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/site-editor-client["']\s*\)[^)]*\)/g,
    "",
  );
  expect(withoutDynamic).not.toContain("site-editor-client");
});
