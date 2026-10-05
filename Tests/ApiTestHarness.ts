import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApplication, type ApplicationServices, type BattitoApplication } from "../Server/Application";
import type { Configuration } from "../Server/Configuration";

export const PngBytes = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");
export const Mp3Bytes = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 1)]);

export class ApiClient {
  private cookie = "";

  public constructor(private readonly baseUrl: string) {}

  public async send(method: string, route: string, body?: unknown, form?: FormData): Promise<{ status: number; data: any; headers: Headers; raw: ArrayBuffer }> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers["Cookie"] = this.cookie;
    let payload: BodyInit | undefined;
    const formData = form ?? (body instanceof FormData ? body : undefined);
    if (formData !== undefined) {
      payload = formData;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${route}`, { method, headers, body: payload });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pair = (setCookie.split(";")[0] ?? "").trim();
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const raw = await response.arrayBuffer();
    let data: any = null;
    if ((response.headers.get("content-type") ?? "").includes("json")) {
      data = JSON.parse(Buffer.from(raw).toString("utf8"));
    }
    return { status: response.status, data, headers: response.headers, raw };
  }
}

export class TestServer {
  public readonly directory: string;
  public readonly configuration: Configuration;
  private application: BattitoApplication | null = null;
  private server: Server | null = null;
  public baseUrl = "";

  public constructor(directory?: string) {
    this.directory = directory ?? fs.mkdtempSync(path.join(os.tmpdir(), "battito-"));
    this.configuration = {
      port: 0,
      databasePath: path.join(this.directory, "Test.sqlite"),
      uploadDirectory: path.join(this.directory, "Uploads"),
      publicDirectory: path.join(this.directory, "Public"),
      jwtSecret: "test-secret-test-secret-test-secret-123",
      youtubeApiKey: null,
      secureCookies: false,
      passwordRounds: 4,
      rateLimitEnabled: false
    };
  }

  public async start(overrides: ApplicationServices = {}): Promise<void> {
    this.application = createApplication(this.configuration, overrides);
    await new Promise<void>((resolve) => {
      this.server = this.application!.express.listen(0, "127.0.0.1", () => resolve());
    });
    this.baseUrl = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
      this.server!.closeAllConnections();
    });
    this.application!.database.close();
  }

  public client(): ApiClient {
    return new ApiClient(this.baseUrl);
  }
}

export function audioForm(fields: Record<string, string>, bytes: Buffer = Mp3Bytes, name = "Song.mp3"): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("audio", new Blob([new Uint8Array(bytes)]), name);
  return form;
}

export function imageForm(bytes: Buffer = PngBytes, name = "Cover.png"): FormData {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)]), name);
  return form;
}
