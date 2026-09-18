import { describe, expect, test } from "vitest";
import { assert } from "./assert.ts";

describe("assert utility", () => {
	test("does not throw when condition is truthy", () => {
		expect(() => assert(true)).not.toThrow();
		expect(() => assert(1)).not.toThrow();
		expect(() => assert("ok")).not.toThrow();
		expect(() => assert({})).not.toThrow();
	});

	test("throws with default message when condition is falsy", () => {
		expect(() => assert(false)).toThrow("Assertion failed");
		expect(() => assert(null)).toThrow("Assertion failed");
		expect(() => assert(undefined)).toThrow("Assertion failed");
		expect(() => assert(0)).toThrow("Assertion failed");
		expect(() => assert("")).toThrow("Assertion failed");
	});

	test("throws with custom message when provided", () => {
		expect(() => assert(false, "Custom error message")).toThrow(
			"Custom error message",
		);
	});
});
