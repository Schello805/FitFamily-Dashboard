export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly payload: unknown = null) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

export async function requestJson<T>(input: RequestInfo | URL, fallback: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(input, init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiRequestError(fallback, response.status);
  }

  if (!response.ok) throw new ApiRequestError(errorMessage(payload, fallback), response.status, payload);
  return payload as T;
}
