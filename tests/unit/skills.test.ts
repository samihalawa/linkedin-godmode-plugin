import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged skills", () => {
  it("uses directories that exactly match every SKILL.md frontmatter name and complete manifests", async () => {
    const root = resolve("skills");
    const directories = (await readdir(root)).sort();
    expect(directories).toEqual([
      "linkedin-browser-providers", "linkedin-network-capture-replay", "linkedin-operator",
      "linkedin-safety-verification", "linkedin-voyager-sdui-methodology",
    ]);
    for (const directory of directories) {
      const skillRoot = join(root, directory);
      expect((await stat(join(skillRoot, "agents", "openai.yaml"))).isFile()).toBe(true);
      expect((await stat(join(skillRoot, "references"))).isDirectory()).toBe(true);
      const markdown = await readFile(join(skillRoot, "SKILL.md"), "utf8");
      expect(markdown.match(/^name:\s*(.+)$/m)?.[1]).toBe(directory);
      const manifest = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");
      expect(manifest).toContain(`$${directory}`);
    }
  });
});
