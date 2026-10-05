import type { ApiErrorData } from "../../Shared/Types";

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export class ApiClient {
  public async get<T>(route: string): Promise<T> {
    return this.request<T>("GET", route);
  }

  public async post<T>(route: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", route, body);
  }

  public async put<T>(route: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", route, body);
  }

  public async patch<T>(route: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", route, body);
  }

  public async delete(route: string): Promise<void> {
    await this.request<void>("DELETE", route);
  }

  public async upload<T>(route: string, form: FormData): Promise<T> {
    return this.request<T>("POST", route, form);
  }

  private async request<T>(method: string, route: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, credentials: "same-origin", headers: {} };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      (init.headers as Record<string, string>)["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await fetch(`/api${route}`, init);
    } catch {
      throw new ApiError(0, "NetworkError", "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
    const payload: unknown = isJson ? await response.json().catch(() => null) : null;
    if (!response.ok) {
      const error = payload as Partial<ApiErrorData> | null;
      throw new ApiError(response.status, error?.code ?? "Error", error?.message ?? "Ocurrió un error inesperado. Inténtalo de nuevo.");
    }
    return payload as T;
  }
}
