import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("build", { recursive: true });
mkdirSync("electron/static", { recursive: true });
copyFileSync("public/icon-512.png", "build/icon.png");
copyFileSync("public/icon-192.png", "build/tray.png");
copyFileSync("public/icon-512.png", "electron/static/logo.png");

const png = readFileSync("public/icon-512.png");
const chunk = Buffer.alloc(8 + png.length);
chunk.write("ic09", 0, 4, "ascii");
chunk.writeUInt32BE(chunk.length, 4);
png.copy(chunk, 8);
const file = Buffer.alloc(8 + chunk.length);
file.write("icns", 0, 4, "ascii");
file.writeUInt32BE(file.length, 4);
chunk.copy(file, 8);
writeFileSync("build/icon.icns", file);
console.log("Wrote build/icon.icns, build/icon.png, build/tray.png");
