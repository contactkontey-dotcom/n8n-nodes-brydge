/* Copy node icons into dist beside their compiled node, where n8n looks for them. Cross-platform. */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const icons = [["nodes/Brydge/brydge.svg", "dist/nodes/Brydge/brydge.svg"]];
for (const [from, to] of icons) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}
