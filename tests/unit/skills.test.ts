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

  it("keeps batch autonomy compatible with selected-controller confirmation policy", async () => {
    const safety = await readFile(resolve("skills/linkedin-safety-verification/SKILL.md"), "utf8");
    const gates = await readFile(resolve("skills/linkedin-safety-verification/references/verification-gates.md"), "utf8");
    const operator = await readFile(resolve("skills/linkedin-operator/SKILL.md"), "utf8");
    expect(safety).toContain("never overrides the selected controller's action-time confirmation policy");
    expect(safety).toContain("ask once at the latest permitted moment");
    expect(gates).toContain("selected controller's mandatory action-time boundary");
    expect(operator).toContain("selected controller's mandatory action-time confirmation policy");
    expect(safety).not.toContain("continue automatically through the authorized batch without confirmation prompts");
  });
});
