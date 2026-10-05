import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { MinimumPasswordLength } from "../../Shared/Constants";
import type { UserData } from "../../Shared/Types";
import type { UserRecord, UserRepository } from "../Database/UserRepository";
import { HttpError } from "../HttpError";

export class AuthenticationService {
  public constructor(
    private readonly users: UserRepository,
    private readonly secret: string,
    private readonly rounds: number
  ) {}

  public async register(email: string, password: string, displayName: string | undefined): Promise<UserData> {
    const normalized = email.trim().toLowerCase();
    if (password.length < MinimumPasswordLength) {
      throw new HttpError(400, "WeakPassword", `La contraseña debe tener al menos ${MinimumPasswordLength} caracteres.`);
    }
    if (this.users.findByEmail(normalized) !== null) {
      throw new HttpError(409, "EmailTaken", "Ya existe una cuenta con ese correo electrónico.");
    }
    const hash = await bcrypt.hash(password, this.rounds);
    const name = (displayName ?? "").trim() || normalized.split("@")[0] || "Usuario";
    const record = this.users.create(normalized, name.slice(0, 60), hash);
    return this.toUserData(record);
  }

  public async login(email: string, password: string): Promise<UserData> {
    const record = this.users.findByEmail(email.trim().toLowerCase());
    const hash = record?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
    const matches = await bcrypt.compare(password, hash).catch(() => false);
    if (record === null || !matches) {
      throw new HttpError(401, "InvalidCredentials", "Correo o contraseña incorrectos.");
    }
    return this.toUserData(record);
  }

  public issueToken(userId: string): string {
    return jwt.sign({ sub: userId }, this.secret, { expiresIn: "30d" });
  }

  public verifyToken(token: string): UserData | null {
    try {
      const payload = jwt.verify(token, this.secret);
      if (typeof payload === "string" || typeof payload.sub !== "string") {
        return null;
      }
      const record = this.users.findById(payload.sub);
      return record === null ? null : this.toUserData(record);
    } catch {
      return null;
    }
  }

  private toUserData(record: UserRecord): UserData {
    return { id: record.id, email: record.email, displayName: record.displayName };
  }
}
