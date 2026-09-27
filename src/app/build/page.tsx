/**
 * P-01 one-box: PASTE URL -> BUILD MY FYD.
 *
 * One URL field plus one button. The button POSTs to /api/fyd/presence,
 * which runs the presence compiler in the background; this client polls
 * GET for the real checkpoint states and renders them:
 * ANALYZING -> UNDERSTANDING -> BUILDING -> READY (or FAILED).
 * No timers invent transitions: every label shown comes from the server.
 */
import PresenceBox from "./presence-box";

export const metadata = {
  title: "Build My FYD",
  description: "Paste your website URL. FYD builds your presence from real evidence.",
};

export default function BuildPage() {
  return <PresenceBox />;
}
