import type { BrowserContext, Locator, Page } from "playwright";
import type { z } from "zod";
import type { RuntimeConfig } from "./config.js";
import { GodmodeError } from "./errors.js";
import { assertBrowserActionAllowed, assertContextPolicy, assertEvaluateAllowed, assertUrlAllowed, clearContextPolicyViolations, settleContextPolicy } from "./policy.js";
import type { BrowserActInput, BrowserCaptureInput, BrowserEvaluateInput, BrowserNavigateInput } from "./schemas.js";
import { LocatorSchema } from "./schemas.js";
import type { SessionManager } from "./sessions.js";

export type LocatorInput = z.infer<typeof LocatorSchema>;

export function resolveLocator(page: Page, target: LocatorInput): Locator {
  let locator: Locator = page.locator(target.value);
  switch (target.kind) {
    case "css": locator = page.locator(target.value); break;
    case "xpath": locator = page.locator(`xpath=${target.value}`); break;
    case "text": locator = page.getByText(target.value, target.exact !== undefined ? { exact: target.exact } : {}); break;
    case "label": locator = page.getByLabel(target.value, target.exact !== undefined ? { exact: target.exact } : {}); break;
    case "placeholder": locator = page.getByPlaceholder(target.value, target.exact !== undefined ? { exact: target.exact } : {}); break;
    case "testid": locator = page.getByTestId(target.value); break;
    case "role": locator = page.getByRole(target.value as Parameters<Page["getByRole"]>[0], {
      ...(target.name !== undefined ? { name: target.name } : {}),
      ...(target.exact !== undefined ? { exact: target.exact } : {}),
    }); break;
  }
  return target.index === undefined ? locator : locator.nth(target.index);
}

export class BrowserOperations {
  constructor(private readonly sessions: SessionManager, private readonly config: RuntimeConfig) {}

  private assertContext(page: Page): void {
    assertContextPolicy(page.context(), this.config);
  }

  private snapshot(context: BrowserContext): Map<Page, string> {
    return new Map(context.pages().map((page) => [page, page.url()]));
  }

  private async assertOrRecover(context: BrowserContext, before: Map<Page, string>): Promise<void> {
    const currentPage = context.pages().find((page) => before.has(page)) ?? context.pages()[0];
    try {
      if (currentPage) await settleContextPolicy(currentPage, this.config);
      else assertContextPolicy(context, this.config);
    }
    catch (policyError) {
      clearContextPolicyViolations(context);
      // An aborted Chromium navigation can commit its inert chrome-error page
      // just after the route abort. Let that settle before restoring the last
      // allowed URL, otherwise it can race and interrupt the recovery goto.
      await Promise.all(context.pages().map((page) => page.waitForTimeout(100).catch(() => undefined)));
      for (const page of context.pages()) {
        const previous = before.get(page);
        if (!previous) { await page.close().catch(() => undefined); continue; }
        try { assertUrlAllowed(page.url(), this.config); }
        catch {
          if (previous === "about:blank") await page.close().catch(() => undefined);
          else await page.goto(previous, { waitUntil: "domcontentloaded", timeout: this.config.timeoutMs }).catch(() => undefined);
        }
      }
      // Recovery navigation can race with the late chrome-error commit from the
      // blocked request. Clear that inert internal-page violation only after all
      // pages have either been restored to their prior allowed URL or closed.
      clearContextPolicyViolations(context);
      throw policyError;
    }
  }

  async navigate(input: BrowserNavigateInput): Promise<unknown> {
    const page = this.sessions.getPage(input.sessionId, input.pageId, input.operation === "goto");
    const context = page.context();
    const before = this.snapshot(context);
    if (input.operation === "goto") clearContextPolicyViolations(context);
    const timeout = input.timeoutMs ?? this.config.timeoutMs;
    let response;
    try {
      if (input.operation === "goto") {
        if (!input.url) throw new GodmodeError("BAD_INPUT", "url is required for goto");
        assertUrlAllowed(input.url, this.config);
        response = await page.goto(input.url, { timeout, waitUntil: input.waitUntil ?? "domcontentloaded" });
      } else if (input.operation === "back") {
        response = await page.goBack({ timeout, waitUntil: input.waitUntil ?? "domcontentloaded" });
      } else if (input.operation === "forward") {
        response = await page.goForward({ timeout, waitUntil: input.waitUntil ?? "domcontentloaded" });
      } else {
        response = await page.reload({ timeout, waitUntil: input.waitUntil ?? "domcontentloaded" });
      }
    } catch (error) {
      await this.assertOrRecover(context, before);
      throw error;
    }
    await this.assertOrRecover(context, before);
    return { url: page.url(), title: await page.title(), status: response?.status() ?? null, ok: response?.ok() ?? null };
  }

  async act(input: BrowserActInput): Promise<unknown> {
    assertBrowserActionAllowed(input.action, this.config);
    const page = this.sessions.getPage(input.sessionId, input.pageId);
    const context = page.context();
    const before = this.snapshot(context);
    const locator = resolveLocator(page, input.locator);
    const timeout = input.timeoutMs ?? this.config.timeoutMs;
    const common = {
      timeout,
      ...(input.force !== undefined ? { force: input.force } : {}),
      ...(input.noWaitAfter !== undefined ? { noWaitAfter: input.noWaitAfter } : {}),
    };
    try {
      switch (input.action) {
        case "click": await locator.click(common); break;
        case "dblclick": await locator.dblclick(common); break;
        case "fill": {
          if (typeof input.value !== "string") throw new GodmodeError("BAD_INPUT", "fill requires a string value");
          await locator.fill(input.value, { timeout });
          break;
        }
        case "type": {
          if (typeof input.value !== "string") throw new GodmodeError("BAD_INPUT", "type requires a string value");
          await locator.pressSequentially(input.value, { timeout });
          break;
        }
        case "press": {
          if (typeof input.value !== "string") throw new GodmodeError("BAD_INPUT", "press requires a key string");
          await locator.press(input.value, { timeout });
          break;
        }
        case "check": await locator.check(common); break;
        case "uncheck": await locator.uncheck(common); break;
        case "select": {
          if (input.value === undefined) throw new GodmodeError("BAD_INPUT", "select requires a string or string-array value");
          await locator.selectOption(input.value, { timeout });
          break;
        }
        case "hover": await locator.hover({ timeout, ...(input.force !== undefined ? { force: input.force } : {}) }); break;
        case "focus": await locator.focus({ timeout }); break;
        case "wait": await locator.waitFor({ state: "visible", timeout }); break;
      }
    } catch (error) {
      await this.assertOrRecover(context, before);
      throw error;
    }
    await page.waitForTimeout(0);
    await this.assertOrRecover(context, before);
    return { ok: true, action: input.action, url: page.url() };
  }

  async evaluate(input: BrowserEvaluateInput): Promise<unknown> {
    assertEvaluateAllowed(this.config);
    const page = this.sessions.getPage(input.sessionId, input.pageId);
    const context = page.context();
    const before = this.snapshot(context);
    let result: unknown;
    try {
      result = await page.evaluate(
        async ({ source, arg }) => {
          const run = new Function("arg", `"use strict"; return (async () => { ${source}\n })();`) as (value: unknown) => Promise<unknown>;
          return run(arg);
        },
        { source: input.source, arg: input.arg },
      );
    } catch (error) {
      await this.assertOrRecover(context, before);
      throw error;
    }
    await this.assertOrRecover(context, before);
    return result;
  }

  async capture(input: BrowserCaptureInput): Promise<unknown> {
    const page = this.sessions.getPage(input.sessionId, input.pageId);
    this.assertContext(page);
    const maxBytes = Math.min(input.maxBytes ?? this.config.maxOutputBytes, this.config.maxOutputBytes);
    if (input.format === "screenshot") {
      const buffer = input.selector
        ? await resolveLocator(page, input.selector).screenshot({ timeout: this.config.timeoutMs })
        : await page.screenshot({ fullPage: input.fullPage ?? false, type: "png" });
      if (buffer.byteLength > maxBytes) throw new GodmodeError("OUTPUT_TOO_LARGE", `Screenshot exceeds ${maxBytes} bytes`);
      return { format: "png", encoding: "base64", bytes: buffer.byteLength, data: buffer.toString("base64") };
    }
    let data: string;
    if (input.format === "html") data = await page.content();
    else if (input.format === "text") data = await (input.selector ? resolveLocator(page, input.selector).innerText() : page.locator("body").innerText());
    else data = await (input.selector ? resolveLocator(page, input.selector).ariaSnapshot() : page.locator("body").ariaSnapshot());
    const bytes = Buffer.byteLength(data);
    if (bytes > maxBytes) throw new GodmodeError("OUTPUT_TOO_LARGE", `Capture exceeds ${maxBytes} bytes`);
    return { format: input.format, bytes, data };
  }
}
