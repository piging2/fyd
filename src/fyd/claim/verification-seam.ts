/**
 * The verification seam (onboarding order J). Extensible by design:
 * VERIFICATION_METHODS names every proof the product will ever accept.
 * Exactly one is implemented today (operator-attestation); the rest are
 * declared with implemented: false and a reason, so no caller can mistake
 * a future method for a present one.
 *
 * To add a method later: implement its checker, flip its flag, keep the
 * VerificationProof shape. The state machine needs no changes.
 */
import { ClaimError, type VerificationMethod, type VerificationProof } from "./types";

export interface VerificationMethodInfo {
  method: VerificationMethod;
  implemented: boolean;
  label: string;
  description: string;
}

const METHODS: VerificationMethodInfo[] = [
  {
    method: "dns-txt",
    implemented: false,
    label: "DNS TXT record",
    description:
      "A TXT record at _fyd-challenge.<domain> holding a server-issued token. Not built yet.",
  },
  {
    method: "well-known-file",
    implemented: false,
    label: "Well-known file",
    description:
      "A token file served at /.well-known/fyd-verification.txt. Not built yet.",
  },
  {
    method: "html-meta-tag",
    implemented: false,
    label: "HTML meta tag",
    description:
      "A meta tag carrying a server-issued token on the site homepage. Not built yet.",
  },
  {
    method: "cms-integration",
    implemented: false,
    label: "CMS integration",
    description: "Proof via an installed CMS plugin or app handshake. Not built yet.",
  },
  {
    method: "provider-evidence",
    implemented: false,
    label: "Verified-domain provider",
    description:
      "Evidence from a domain-verified provider (for example Search Console). Not built yet.",
  },
  {
    method: "operator-attestation",
    implemented: true,
    label: "Operator attestation",
    description:
      "A human operator asserts control with a written basis. Honestly labeled: a statement, not a cryptographic proof of domain control.",
  },
];

/** All known verification methods, implemented or not. Defensive copy. */
export function listVerificationMethods(): VerificationMethodInfo[] {
  return METHODS.map((m) => ({ ...m }));
}

export function isVerificationMethodImplemented(method: VerificationMethod): boolean {
  return METHODS.some((m) => m.method === method && m.implemented);
}

export interface OperatorAttestationInput {
  resourceId: string;
  operatorLabel: string;
  basis: string;
}

/**
 * Build an operator-attestation proof. Fails closed on a missing basis.
 * The proof carries its limitation in proofNote so no surface can present
 * it as stronger evidence than it is.
 */
export function attestOperatorControl(input: OperatorAttestationInput): VerificationProof {
  const basis = (input.basis ?? "").trim();
  if (basis.length < 10) {
    throw new ClaimError(
      "Operator attestation needs a written basis (at least 10 characters).",
      "weak-proof",
    );
  }
  if (!input.operatorLabel || !input.operatorLabel.trim()) {
    throw new ClaimError("Operator attestation needs a named operator.", "weak-proof");
  }
  return {
    method: "operator-attestation",
    verifiedAt: new Date().toISOString(),
    verifiedBy: input.operatorLabel.trim(),
    basis,
    artifacts: {
      resourceId: input.resourceId,
      attestation: "operator-statement",
    },
    proofNote:
      "Operator attestation: a human operator asserts control. This is a statement, not a cryptographic proof of domain control.",
  };
}
