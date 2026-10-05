import type { SessionData, UserData } from "../../Shared/Types";
import { ApiClient, ApiError } from "../Services/ApiClient";
import { Emitter } from "../Utils/Emitter";

export class UserManager extends Emitter<{ changed: UserData | null }> {
  private currentUser: UserData | null = null;

  public constructor(private readonly api: ApiClient) {
    super();
  }

  public get user(): UserData | null {
    return this.currentUser;
  }

  public get isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  public async restore(): Promise<UserData | null> {
    try {
      const session = await this.api.get<SessionData>("/auth/me");
      this.currentUser = session.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.currentUser = null;
      } else {
        throw error;
      }
    }
    return this.currentUser;
  }

  public async login(email: string, password: string): Promise<UserData> {
    const session = await this.api.post<SessionData>("/auth/login", { email, password });
    this.currentUser = session.user;
    this.emit("changed", this.currentUser);
    return session.user;
  }

  public async register(email: string, password: string, displayName: string): Promise<UserData> {
    const session = await this.api.post<SessionData>("/auth/register", { email, password, displayName });
    this.currentUser = session.user;
    this.emit("changed", this.currentUser);
    return session.user;
  }

  public async logout(): Promise<void> {
    await this.api.post<void>("/auth/logout");
    this.currentUser = null;
    this.emit("changed", null);
  }
}
