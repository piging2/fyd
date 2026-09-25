/**
 * [Build My FYD] intake route (Track F, 2026-09-25).
 * New route only; the other lane's src/app/build/[siteId]/page.tsx is untouched.
 */

import BuildMyFydClient from "./build-my-fyd-client";

export const metadata = {
  title: "Build My FYD",
  description: "Give us your website. FYD builds your presence from real evidence.",
};

export default function BuildMyFydPage() {
  return <BuildMyFydClient />;
}
