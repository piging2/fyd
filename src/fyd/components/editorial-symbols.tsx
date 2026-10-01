/** A common geometric vocabulary for records, relationships, and bounded work.
 * The three drawing phases explain a concept; they never represent runtime state.
 */
export const symbolForms = {
  continuity: {
    label: "Continuity", meaning: "The earlier record remains connected to what comes next.",
    stages: ["A record", "A next record", "A retained connection"],
    base: "M12 20H62V38H32V82H62V100H12Z",
    link: "M72 20H108V100H72V82H90V38H72Z",
    trace: "M46 60H78 M60 46V74",
  },
  events: {
    label: "Events", meaning: "An occurrence gains a place in recorded history.",
    stages: ["An occurrence", "A place in sequence", "A causal reference"],
    base: "M42 16H64L82 34V56H42Z",
    link: "M12 86H108 M26 76V96 M60 56V96 M94 76V96",
    trace: "M16 28H30 M90 28H104",
  },
  evidence: {
    label: "Evidence", meaning: "A claim keeps a visible path to the source supporting it.",
    stages: ["A source", "A claim", "A checkable reference"],
    base: "M12 22H48L60 34V84H12Z M28 40V66H44V40Z",
    link: "M74 16H94L108 30V78H74V16Z",
    trace: "M36 96H94 M36 88V104 M94 88V104",
  },
  identity: {
    label: "Identity", meaning: "An actor belongs to a specific, visible context.",
    stages: ["An actor", "A context", "An explicit binding"],
    base: "M46 26H62L78 42V76L62 92H46L30 76V42Z M48 46V72H60V46Z",
    link: "M12 38V12H38 M82 12H108V38 M108 82V108H82 M38 108H12V82",
    trace: "M12 60H30 M78 60H108",
  },
  missions: {
    label: "Missions", meaning: "An objective connects the work needed to reach it.",
    stages: ["An objective", "Related work", "An outcome to examine"],
    base: "M62 12H108V58H90V42L38 94L24 80L76 28H62Z",
    link: "M14 56V106H64",
    trace: "M76 106H106V76",
  },
  workers: {
    label: "Workers", meaning: "Separate executors return results through a shared boundary.",
    stages: ["A work request", "Bounded executors", "Attributable results"],
    base: "M12 42H34L52 60L34 78H12Z",
    link: "M52 60H62 M62 26V94 M62 26H86 M62 60H86 M62 94H86",
    trace: "M88 16H108V36H88Z M88 50H108V70H88Z M88 84H108V104H88Z",
  },
  capabilities: {
    label: "Capabilities", meaning: "A permitted path passes through an explicit boundary.",
    stages: ["A boundary", "A scoped grant", "A permitted path"],
    base: "M30 12H50V44H30Z M30 76H50V108H30Z M70 12H90V44H70Z M70 76H90V108H70Z",
    link: "M12 60H108 M98 50L108 60L98 70",
    trace: "M50 44H70V76H50Z",
  },
  replay: {
    label: "Replay", meaning: "The same recorded history can be followed again.",
    stages: ["Recorded history", "A second pass", "A comparison"],
    base: "M12 18H108V58H88V38H12Z",
    link: "M98 58V78H22V102H108",
    trace: "M32 50V62 M56 50V62 M32 90V102 M56 90V102",
  },
  knowledge: {
    label: "Knowledge", meaning: "A record becomes useful through its relationships.",
    stages: ["A record", "Related records", "A connected understanding"],
    base: "M50 12H70V108H50Z M20 22H40V42H20Z M80 68H100V88H80Z",
    link: "M40 32H50 M70 78H80 M24 90H50 M70 24H96",
    trace: "M14 80H34V100H14Z M86 14H106V34H86Z",
  },
  lineage: {
    label: "Lineage", meaning: "An outcome carries a path back to its causes.",
    stages: ["A cause", "A consequence", "An inspectable chain"],
    base: "M12 12H48V48H12Z M24 24V36H36V24Z",
    link: "M48 30H66V66H102V102",
    trace: "M30 48V102H66 M56 92H76V112H56Z M92 92H112V112H92Z",
  },
  witness: {
    label: "Witness", meaning: "An attributable record connects an execution and its result.",
    stages: ["An execution", "A result", "An attestation"],
    base: "M12 20H46V38H30V72H46V90H12Z M74 20H108V90H74V72H90V38H74Z",
    link: "M46 54H74 M60 54V94",
    trace: "M42 94H78V108H42Z",
  },
  projection: {
    label: "Projection", meaning: "One source can support several views without becoming several truths.",
    stages: ["A source", "Different views", "A shared reference"],
    base: "M12 38H36L58 60L36 82H12Z",
    link: "M58 60L94 20 M58 60H94 M58 60L94 100",
    trace: "M84 12H108V28H84Z M84 52H108V68H84Z M84 92H108V108H84Z",
  },
  coordination: {
    label: "Coordination", meaning: "A plan connects separate work while retaining the point of coordination.",
    stages: ["A plan", "Delegated work", "Results to reconcile"],
    base: "M42 42H66L78 54V78H42Z M54 54V66H66V54Z",
    link: "M14 60V14H60 M60 14H106V60 M106 60V106H60 M60 106H14V60",
    trace: "M60 14V30 M106 60H90 M60 106V90 M14 60H30",
  },
  tenancy: {
    label: "Tenant context", meaning: "Knowledge and work sit inside a business boundary.",
    stages: ["A business", "Its knowledge and work", "An explicit boundary"],
    base: "M12 12H88L108 32V108H12Z M30 30V90H90V40L80 30Z",
    link: "M44 46H64L76 58V76H44Z",
    trace: "M12 60H30 M90 60H108",
  },
  uncertainty: {
    label: "Uncertainty", meaning: "An unresolved result remains a visible gap.",
    stages: ["A request", "An incomplete result", "A hold for reconciliation"],
    base: "M12 34H38L52 48V72L38 86H12Z",
    link: "M76 34H108V86H76 M76 34V46 M76 74V86",
    trace: "M56 14H68 M62 14V34 M56 106H68 M62 86V106",
  },
  practice: {
    label: "Practice", meaning: "A business workflow is studied before the intervention is chosen.",
    stages: ["The existing work", "A point to improve", "A considered intervention"],
    base: "M12 24H108V38H12Z M12 82H108V96H12Z",
    link: "M12 60H108 M32 12V50 M84 70V108",
    trace: "M50 48H74V72H50Z",
  },
  observation: {
    label: "Observation", meaning: "An input retains its source before interpretation.",
    stages: ["An input", "A recorded observation", "Its source retained"],
    base: "M12 16H32L64 48V72L32 104H12L44 72V48Z",
    link: "M76 26H94L108 40V94H76Z",
    trace: "M64 60H88 M88 48V72",
  },
} as const;

export type SymbolName = keyof typeof symbolForms;
const aliases: Record<string, SymbolName> = {
  observe: "observation", remember: "events", connect: "knowledge", act: "capabilities", prove: "evidence",
  permissions: "capabilities", work: "missions", history: "continuity", plan: "missions", delegate: "workers",
  verify: "witness", learn: "knowledge", reason: "lineage", authority: "capabilities", execution: "workers",
  outcome: "evidence", tenant: "tenancy", control: "witness", business: "tenancy", product: "projection",
  article: "lineage", service: "practice", persistence: "continuity", "human-boundaries": "capabilities",
  "external-execution": "workers",
};

export function resolveSymbol(concept?: string): SymbolName {
  const key = concept?.toLowerCase() ?? "continuity";
  return key in symbolForms ? key as SymbolName : aliases[key] ?? "continuity";
}

export function EditorialSymbol({ concept = "continuity", phase = 2, className = "" }: {
  concept?: string; phase?: number; className?: string;
}) {
  const name = resolveSymbol(concept), form = symbolForms[name];
  return <svg className={`pg-symbol ${className}`} data-symbol={name} data-phase={phase} viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
    <path className="pg-symbol-base" d={form.base} fillRule="evenodd"/>
    <path className="pg-symbol-link" d={form.link}/>
    <path className="pg-symbol-trace" d={form.trace}/>
  </svg>;
}

/** Illustrations inherit article provenance; this mapping supplies artwork only. */
export function articleSymbol(id: string): SymbolName {
  if (id.includes("execution")) return "capabilities";
  if (id.includes("evidence")) return "evidence";
  if (id.includes("tenant")) return "tenancy";
  return "continuity";
}
