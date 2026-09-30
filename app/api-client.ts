/** Shared JSON transport for login, factory and shop requests. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const retryable = new Set([429, 502, 503, 504]);

function responseMessage(status: number, saving: boolean) {
  const messages: Record<number, string> = {
    401: "Your session has expired. Please sign in again.",
    403: "The server blocked this request. Check your access or contact the administrator.",
    404: "The app's API could not be found. The website deployment needs to be checked.",
    413: "The request is too large. Reduce the attachment or number of entries and try again.",
    429: "The server is receiving too many requests. Wait a moment before trying again.",
    502: "The hosting server could not reach the application.",
    503: "The application is temporarily unavailable on the hosting server.",
    504: "The hosting server timed out waiting for the application.",
  };
  const message = messages[status] || (status >= 500
    ? "The application server could not complete the request."
    : "The server returned an unexpected page instead of application data.");
  return `${message}${status ? ` (HTTP ${status})` : ""}${saving ? " Save status is unknown. Check the record before submitting again." : " Please try loading again."}`;
}

async function parseResponse(response: Response, saving: boolean): Promise<Record<string, unknown>> {
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    throw new ApiError(responseMessage(response.status, saving), response.status);
  }
  // A CDN/login page or JSON null/array must never become application state.
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(responseMessage(response.status, saving), response.status);
  }
  return data as Record<string, unknown>;
}

export async function apiRequest<T>(url: string, options: RequestInit & { readOnly?: boolean } = {}): Promise<{ response: Response; data: T }> {
  const { readOnly = false, ...init } = options;
  const method = (init.method || "GET").toUpperCase();
  const safeMethod = method === "GET" || method === "HEAD";
  const saving = !safeMethod && !readOnly;
  const attempts = safeMethod ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeout = AbortSignal.timeout(30000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      const response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin", headers, signal });
      if (safeMethod && retryable.has(response.status) && attempt + 1 < attempts) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      const data = await parseResponse(response, saving);
      return { response, data: data as T };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (init.signal?.aborted) throw error;
      if (safeMethod && attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      const message = timeout.aborted ? "The server took too long to respond." : "Could not reach the server. Check your connection.";
      throw new ApiError(`${message}${saving ? " Save status is unknown. Check the record before submitting again." : " Please try loading again."}`);
    }
  }
  throw new ApiError("Could not reach the server.");
}
