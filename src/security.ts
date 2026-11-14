import {
  redactKnownSecrets,
  sanitizeBoundedText,
  stripAngleBracketText,
  redactJwtLikeTokens,
  sanitizeErrorMessage,
} from "@commercekit-tools/notification-contract";
import { redactTransportText } from "@commercekit-tools/ccv2-client";

// Build disclosure policy and exact-secret registration; shared packages own generic redaction/bounds.
export class Sanitizer {
  private secrets = new Set<string>();
  constructor(private mask: (value: string) => void) {}
  add(value: string) {
    if (!value) return;
    this.mask(value);
    this.secrets.add(value);
  }
  text(value: string, max = 1000): string {
    const secrets = [...this.secrets];
    const text = redactJwtLikeTokens(
      stripAngleBracketText(redactKnownSecrets(value, secrets)),
    );
    if (!text.trim()) return "";
    return sanitizeBoundedText(
      sanitizeErrorMessage(redactTransportText(text, secrets), secrets),
      max,
    ).trim();
  }
  contains(value: string): boolean {
    return redactKnownSecrets(value, [...this.secrets]) !== value;
  }
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
