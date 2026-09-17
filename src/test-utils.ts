import * as path from "node:path";

const defaultRepoRoot = path.resolve(import.meta.dirname, "..");

export function stripAbsolutePath<T extends string | string[]>(
	input: T,
	root?: string,
): T {
	const resolvedRoot = typeof root === "string" ? root : defaultRepoRoot;
	const cleanRoot = resolvedRoot.replace(/[/\\]+$/, "");
	const slashPrefix = `${cleanRoot.replaceAll("\\", "/")}/`;
	const backslashPrefix = `${cleanRoot.replaceAll("/", "\\")}\\`;

	function clean(str: string): string {
		return str.replaceAll(slashPrefix, "").replaceAll(backslashPrefix, "");
	}

	if (Array.isArray(input)) {
		return input.map(clean) as T;
	}

	return clean(input as string) as T;
}
