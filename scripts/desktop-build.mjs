import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("node", ["scripts/make-icons.mjs"]);
run("npx", ["tsc", "-p", "tsconfig.electron.json"]);
run("npx", ["prisma", "generate"]);
run("npx", ["next", "build"]);

const platform = process.platform;
if (platform === "darwin") {
  run("npx", ["electron-builder", "--mac", "--arm64"]);
} else if (platform === "win32") {
  run("npx", ["electron-builder", "--win"]);
} else {
  run("npx", ["electron-builder", "--linux", "dir"]);
}
