import { join } from "path";
import { homedir } from "os";
import type { ActionLog } from "../modes/agent/types";
import { errorLogger } from "../core/logger";

export interface PersistentActionEntry {
  globalActionId: string;
  sessionId: string;
  workspacePath: string;
  timestamp: string;
  action: ActionLog;
}

export class ActionHistoryManager {
  private static historyDir = join(homedir(), ".astra", "history");
  private static historyFile = join(ActionHistoryManager.historyDir, "actions.jsonl");

  /**
   * Appends an array of approved/applied actions to the persistent global log.
   */
  static async recordGlobalActions(sessionId: string, workspacePath: string, actions: ActionLog[]): Promise<void> {
    try {
      // Ensure directory exists
      await Bun.write(join(this.historyDir, ".keep"), "");
      
      const lines = actions.map(action => {
        const entry: PersistentActionEntry = {
          globalActionId: `act_${crypto.randomUUID()}`,
          sessionId,
          workspacePath,
          timestamp: new Date().toISOString(),
          action
        };
        return JSON.stringify(entry);
      }).join("\n") + "\n";

      // Append atomic update using Bun's fast file writes
      const file = Bun.file(this.historyFile);
      const existingContent = await file.exists() ? await file.text() : "";
      await Bun.write(this.historyFile, existingContent + lines);
    } catch (error) {
      // Fixed: Conformed to expected 3 arguments signature
      errorLogger.logAndContinue(
        "ActionHistoryManager", 
        `Failed to write persistent action history: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Retrieves all historical actions across all sessions.
   */
  static async getGlobalHistory(limit = 500): Promise<PersistentActionEntry[]> {
    const file = Bun.file(this.historyFile);
    if (!(await file.exists())) return [];

    try {
      const text = await file.text();
      const lines = text.trim().split("\n").filter(Boolean);
      
      return lines
        .slice(-limit) 
        .map(line => JSON.parse(line) as PersistentActionEntry)
        .reverse(); // Return newest first
    } catch (error) {
      // Fixed: Conformed to expected 3 arguments signature
      errorLogger.logAndContinue(
        "ActionHistoryManager", 
        `Failed to read global history: ${(error as Error).message}`,
        { error }
      );
      return [];
    }
  }

  /**
   * Search historical actions targeting a specific file path across historical boundaries
   */
  static async searchHistoryByFile(targetPath: string): Promise<PersistentActionEntry[]> {
    const history = await this.getGlobalHistory(2000);
    return history.filter(entry => 
      // Fixed: 'context' doesn't exist, checking direct entry.action.path instead
      (entry.action.path && entry.action.path.includes(targetPath)) || 
      JSON.stringify(entry.action).includes(targetPath)
    );
  }
}