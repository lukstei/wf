import { describe, expect, it } from "vitest";
import type { HookInfo } from "../types.ts";
import { handle } from "./index.ts";

describe("handlers index dispatch", () => {
	it("dispatches pre hooks to handlePre", () => {
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "wf-test-pre" },
		};
		const res = handle(info, null);
		expect(res).toEqual({ active: null, response: {} });
	});

	it("dispatches stop hooks to handleStop", () => {
		const info: HookInfo = {
			type: "stop",
			payload: { conversationId: "wf-test-stop" },
		};
		const res = handle(info, null);
		expect(res).toEqual({ active: null, response: { decision: "allow" } });
	});

	it("throws on unknown hook type", () => {
		const info = {
			type: "unknown",
			payload: { conversationId: "wf-test-err" },
		} as unknown as HookInfo;

		expect(() => handle(info, null)).toThrow("Unknown hook type: unknown");
	});
});
