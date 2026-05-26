export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ApiErrorDetails = {
  message: string | null;
  fieldErrors: Record<string, string>;
  globalErrors: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map(item => item.trim());
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function joinPath(parent: string, key: string) {
  return parent ? `${parent}.${key}` : key;
}

function collectFieldErrors(
  value: unknown,
  path: string,
  errors: Record<string, string>,
) {
  const primitiveMessages = stringList(value);
  if (path && primitiveMessages.length > 0) {
    errors[path] = primitiveMessages.join(" ");
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectFieldErrors(item, joinPath(path, String(index)), errors);
    });
    return;
  }

  if (!isRecord(value)) return;

  Object.entries(value).forEach(([key, entry]) => {
    if (key === "detail" || key === "non_field_errors" || key === "delete_blockers") return;
    collectFieldErrors(entry, joinPath(path, key), errors);
  });
}

export function extractApiErrorDetails(body: unknown): ApiErrorDetails {
  const fieldErrors: Record<string, string> = {};
  const globalErrors: string[] = [];

  if (!isRecord(body)) {
    return { message: null, fieldErrors, globalErrors };
  }

  const record = body;

  const deleteBlockerMessages = stringList(record.delete_blockers);
  globalErrors.push(...deleteBlockerMessages);

  if (
    deleteBlockerMessages.length === 0 &&
    typeof record.detail === "string" &&
    record.detail.trim()
  ) {
    globalErrors.push(record.detail.trim());
  }

  globalErrors.push(...stringList(record.non_field_errors));
  collectFieldErrors(record, "", fieldErrors);

  const fieldMessages = Object.entries(fieldErrors).map(([key, value]) => `${key}: ${value}`);
  const messages = [...globalErrors, ...fieldMessages];
  if (fieldMessages.length > 0) {
    return { message: messages.join(" "), fieldErrors, globalErrors };
  }

  return {
    message: globalErrors.length > 0 ? globalErrors.join(" ") : null,
    fieldErrors,
    globalErrors,
  };
}

function formatApiError(body: unknown): string | null {
  return extractApiErrorDetails(body).message;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
    Object.defineProperty(this, "message", {
      value: message,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const headers = isFormData
    ? options?.headers
    : {
        "Content-Type": "application/json",
        ...options?.headers,
      };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let body: unknown;
    try {
      body = await res.json();
      message = formatApiError(body) ?? message;
    } catch {
      /* ignore parse error */
    }
    throw new ApiError(res.status, message, body);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

/** DRF paginated list wrapper */
export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
