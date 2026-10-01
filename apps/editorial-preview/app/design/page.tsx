import type { Metadata } from "next";
import { Footer } from "../footer";
import { PrimitiveStudy } from "@/fyd/components/primitive-study";
import "./study.css";

export const metadata: Metadata = {
  title: "PING — The living intelligence infrastructure",
  description: "Continuity, evidence, knowledge. Explore three evolving forms from PING’s living visual language.",
};

export default function DesignPage() {
  return <div className="pg-design-shell">
    <a className="ed-skip" href="#main">Skip to content</a>
    <main id="main" className="pg-study">
      <header className="pg-study-header">
        <a href="/" className="pg-study-wordmark" aria-label="PING home"><h1>PING</h1></a>
        <div className="pg-study-descriptor"><p>The living<br/>intelligence infrastructure</p><div className="pg-study-cycle">Observe <span>→</span> Evidence <span>→</span> Reason <span>→</span> Act <span>→</span> Learn <span>→</span> Evolve</div></div>
        <p className="pg-study-manifesto"><span>17 foundational primitives.</span><span>3 evolving stages each.</span><strong>One living system.</strong></p>
        <ul className="pg-study-taxonomy" aria-label="System principles"><li>Continuity</li><li>Context</li><li>Capability</li><li>Compounding</li></ul>
      </header>
      <PrimitiveStudy/>
    </main>
    <Footer/>
  </div>;
}
