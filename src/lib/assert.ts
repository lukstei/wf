/**
 * Asserts that a condition is truthy, otherwise throws an Error.
 * Used to enforce function preconditions and invariants.
 */
export function assert(
	condition: unknown,
	message?: string,
): asserts condition {
	if (!condition) {
		throw new Error(message ?? "Assertion failed");
	}
}
