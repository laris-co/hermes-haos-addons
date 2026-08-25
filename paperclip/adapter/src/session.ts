import type { AdapterSessionCodec } from "./types.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSession(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const sessionId =
    readNonEmptyString(record.sessionId) ??
    readNonEmptyString(record.session_id) ??
    readNonEmptyString(record.session);
  if (!sessionId) return null;
  const cwd = readNonEmptyString(record.cwd) ?? readNonEmptyString(record.workdir);
  const model = readNonEmptyString(record.model);
  return {
    sessionId,
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
  };
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    return normalizeSession(raw);
  },
  serialize(params: Record<string, unknown> | null) {
    return normalizeSession(params);
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id) ??
      readNonEmptyString(params.session)
    );
  },
};
