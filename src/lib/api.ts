const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatApiError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;

  if (typeof record.detail === "string" && record.detail.trim()) {
    return record.detail;
  }

  const nonFieldErrors = record.non_field_errors;
  if (Array.isArray(nonFieldErrors) && typeof nonFieldErrors[0] === "string") {
    return nonFieldErrors[0];
  }

  const fieldMessages = Object.entries(record)
    .filter(([key]) => key !== "detail" && key !== "non_field_errors")
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => `${key}: ${item}`);
      }

      if (typeof value === "string" && value.trim()) {
        return [`${key}: ${value}`];
      }

      return [];
    });

  if (fieldMessages.length > 0) {
    return fieldMessages.join(" ");
  }

  return null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = formatApiError(body) ?? message;
    } catch {
      /* ignore parse error */
    }
    throw new ApiError(res.status, message);
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
