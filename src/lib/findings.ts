/**
 * Findings System
 * 
 * Centralized finding structure for validation results.
 * All validation emits Findings, which are then aggregated by the Metrics Engine.
 * 
 * Architecture: Authorities → Validation Engine → Findings → Analysis Engine → Metrics → Health Score
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type Authority = "media" | "projects" | "reviews" | "brand" | "services" | "seo" | "forms" | "users" | "analytics";

export interface Finding {
  id: string; // Unique finding ID
  rule: string; // Rule that was violated (e.g., "missing-alt-text")
  severity: Severity;
  authority: Authority;
  resourceId?: string; // ID of the resource that triggered the finding
  message: string;
  path?: string; // Path to the resource (e.g., "media.v1.json[0]")
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface FindingGroup {
  rule: string;
  severity: Severity;
  authority: Authority;
  count: number;
  findings: Finding[];
}

export interface FindingsSummary {
  total: number;
  bySeverity: Record<Severity, number>;
  byAuthority: Record<Authority, number>;
  byRule: Record<string, number>;
  groups: FindingGroup[];
}

/**
 * Severity weights for health scoring
 */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 25,
  high: 10,
  medium: 5,
  low: 1,
};

/**
 * Create a finding
 */
export function createFinding(params: {
  rule: string;
  severity: Severity;
  authority: Authority;
  resourceId?: string;
  message: string;
  path?: string;
  metadata?: Record<string, unknown>;
}): Finding {
  return {
    id: `${params.authority}-${params.rule}-${params.resourceId || 'global'}-${Date.now()}`,
    ...params,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Group findings by rule and severity
 */
export function groupFindings(findings: Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  findings.forEach(finding => {
    const key = `${finding.rule}-${finding.severity}-${finding.authority}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        rule: finding.rule,
        severity: finding.severity,
        authority: finding.authority,
        count: 0,
        findings: [],
      });
    }

    const group = groups.get(key)!;
    group.count++;
    group.findings.push(finding);
  });

  return Array.from(groups.values()).sort((a, b) => {
    // Sort by severity (critical first)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    // Then by count (most findings first)
    return b.count - a.count;
  });
}

/**
 * Summarize findings
 */
export function summarizeFindings(findings: Finding[]): FindingsSummary {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const byAuthority: Record<Authority, number> = {} as Record<Authority, number>;
  const byRule: Record<string, number> = {};

  findings.forEach(finding => {
    bySeverity[finding.severity]++;
    byAuthority[finding.authority] = (byAuthority[finding.authority] || 0) + 1;
    byRule[finding.rule] = (byRule[finding.rule] || 0) + 1;
  });

  return {
    total: findings.length,
    bySeverity,
    byAuthority,
    byRule,
    groups: groupFindings(findings),
  };
}

/**
 * Calculate health score from findings
 */
export function calculateHealthScore(findings: Finding[]): {
  score: number;
  category: "excellent" | "good" | "fair" | "poor";
  breakdown: Record<Severity, number>;
} {
  const summary = summarizeFindings(findings);
  
  // Calculate weighted score
  let totalWeight = 0;
  Object.entries(summary.bySeverity).forEach(([severity, count]) => {
    totalWeight += count * SEVERITY_WEIGHTS[severity as Severity];
  });

  const score = Math.max(0, 100 - totalWeight);
  
  let category: "excellent" | "good" | "fair" | "poor";
  if (score >= 90) category = "excellent";
  else if (score >= 70) category = "good";
  else if (score >= 50) category = "fair";
  else category = "poor";

  return {
    score,
    category,
    breakdown: summary.bySeverity,
  };
}
