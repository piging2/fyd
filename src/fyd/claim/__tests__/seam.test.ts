/**
 * Regression tests for the verification seam: six named methods, exactly
 * one implemented, honest labeling on the operator attestation proof.
 */
import {
  attestOperatorControl,
  isVerificationMethodImplemented,
  listVerificationMethods,
} from "../verification-seam";
import { ClaimError } from "../types";

describe("verification seam", () => {
  test("declares all six future methods", () => {
    const methods = listVerificationMethods().map((m) => m.method);
    expect(methods).toEqual([
      "dns-txt",
      "well-known-file",
      "html-meta-tag",
      "cms-integration",
      "provider-evidence",
      "operator-attestation",
    ]);
  });
  test("only operator-attestation is implemented", () => {
    const implemented = listVerificationMethods().filter((m) => m.implemented);
    expect(implemented.map((m) => m.method)).toEqual(["operator-attestation"]);
    expect(isVerificationMethodImplemented("operator-attestation")).toBe(true);
    expect(isVerificationMethodImplemented("dns-txt")).toBe(false);
    expect(isVerificationMethodImplemented("well-known-file")).toBe(false);
  });
  test("unimplemented methods say what they are and why", () => {
    for (const m of listVerificationMethods().filter((x) => !x.implemented)) {
      expect(m.description).toMatch(/Not built yet/);
    }
  });
  test("operator attestation fails closed on a missing basis", () => {
    expect(() =>
      attestOperatorControl({ resourceId: "url-x", operatorLabel: "Op", basis: "short" }),
    ).toThrow(ClaimError);
    expect(() =>
      attestOperatorControl({ resourceId: "url-x", operatorLabel: "", basis: "A long enough basis statement." }),
    ).toThrow(ClaimError);
  });
  test("operator attestation proof is honestly labeled", () => {
    const proof = attestOperatorControl({
      resourceId: "url-x",
      operatorLabel: "Nolan (operator)",
      basis: "I operate this site and control its hosting.",
    });
    expect(proof.method).toBe("operator-attestation");
    expect(proof.verifiedBy).toBe("Nolan (operator)");
    expect(proof.basis).toBe("I operate this site and control its hosting.");
    expect(proof.proofNote).toMatch(/not a cryptographic proof/);
  });
});
