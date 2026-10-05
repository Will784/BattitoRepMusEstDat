import type { AppearanceData, PreferencesData } from "../../Shared/Types";
import type { DatabaseConnection } from "./DatabaseConnection";

export const DefaultPreferences: PreferencesData = {
  theme: "dark",
  appearance: { mode: "default" }
};

export class PreferenceRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public get(userId: string): PreferencesData {
    const row = this.database.handle.prepare("SELECT theme, appearanceJson FROM preferences WHERE userId = ?").get(userId) as
      | { theme: string; appearanceJson: string }
      | undefined;
    if (row === undefined) {
      return { theme: DefaultPreferences.theme, appearance: { ...DefaultPreferences.appearance } };
    }
    return {
      theme: row.theme === "light" ? "light" : "dark",
      appearance: JSON.parse(row.appearanceJson) as AppearanceData
    };
  }

  public save(userId: string, preferences: PreferencesData): PreferencesData {
    this.database.handle
      .prepare(
        "INSERT INTO preferences (userId, theme, appearanceJson) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET theme = excluded.theme, appearanceJson = excluded.appearanceJson"
      )
      .run(userId, preferences.theme, JSON.stringify(preferences.appearance));
    return preferences;
  }
}
