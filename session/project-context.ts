import fs from "fs";
import path from "path";

export class ProjectContextLoader {
  private static fileName = "ASTRA.md";

  /**
   * Searches for an ASTRA.md file starting from the workspace root directory.
   * Traverses upwards to handle projects run from nested subdirectories.
   */
  static findAndReadContext(startDir: string = process.cwd()): string | null {
    let currentDir = path.resolve(startDir);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      const targetPath = path.join(currentDir, this.fileName);
      
      if (fs.existsSync(targetPath)) {
        try {
          const content = fs.readFileSync(targetPath, "utf8");
          if (content.trim().length > 0) {
            return content.trim();
          }
        } catch {
          // Fail-safe default to allow engine initialization to proceed
        }
        break; 
      }

      // Optimization boundary: stop looking up if we hit a repository anchor root
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        break; 
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * Encloses the user-defined instructions into a distinctive context block.
   */
  static injectContextBlock(rawContext: string): string {
    return [
      "=========================================================================",
      "📌 WORKSPACE MEMORY & PROJECT CONVENTIONS (LOADED FROM ASTRA.md)",
      "The following persistent project instructions apply directly to this workspace.",
      "You MUST strictly adhere to these criteria for all modifications and actions:",
      "=========================================================================",
      rawContext,
      "=========================================================================\n"
    ].join("\n");
  }
}