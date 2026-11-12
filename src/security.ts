import {
  redactKnownSecrets,
  sanitizeBoundedText,
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
    const text = plainText(redactKnownSecrets(value, secrets)).replace(
      /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
      "[REDACTED]",
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

// A conservative text filter: discard tag contents, including unclosed tags.
// Every angle bracket is consumed, so nested/malformed markup cannot reappear.
function plainText(value: string): string {
  let inside = false;
  let output = "";
  for (const character of value) {
    if (character === "<") inside = true;
    else if (character === ">") inside = false;
    else if (!inside) output += character;
  }
  return output;
}
