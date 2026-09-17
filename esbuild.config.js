import * as fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["src/cli.ts"],
	bundle: true,
	platform: "node",
	target: "node18",
	format: "cjs",
	outfile: "dist/wf.cjs",
	banner: { js: "#!/usr/bin/env node" },
	logLevel: "info",
});

fs.mkdirSync(".agents/plugins/wf/dist", { recursive: true });
fs.copyFileSync("dist/wf.cjs", ".agents/plugins/wf/dist/wf.cjs");
fs.cpSync("skills", ".agents/plugins/wf/skills", { recursive: true });
fs.cpSync("rules", ".agents/plugins/wf/rules", { recursive: true });
