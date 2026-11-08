export class Sanitizer {
  private secrets = new Set<string>();
  constructor(private mask: (value: string) => void) {}
  add(value: string) {
    if (!value) return;
    this.mask(value);
    this.secrets.add(value);
    this.secrets.add(encodeURIComponent(value));
    this.secrets.add(new URLSearchParams({ v: value }).toString().slice(2));
  }
  text(value: string, max = 1000): string {
    let text = value;
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length))
      text = text.split(secret).join("[REDACTED]");
    return text
      .replace(/https?:\/\/\S+/gi, "[URL]")
      .replace(/Bearer\s+\S+/gi, "[REDACTED]")
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED]")
      .replace(/<[^>]*>/g, "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .split(/\s+at\s+\S+\s*\(/)[0]!
      .slice(0, max)
      .trim();
  }
  contains(value: string): boolean {
    return [...this.secrets].some((s) => value.includes(s));
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
