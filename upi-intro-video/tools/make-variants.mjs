// Builds the square (1080x1080) and vertical (1080x1920) projects from this 16:9 master.
// Every scene lays itself out from the canvas size, so only the declared sizes change.
// Run after editing the master:  node tools/make-variants.mjs
import fs from "fs";
import path from "path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const variants = { square: [1080, 1080], vertical: [1080, 1920], feed45: [1080, 1350] };
const resize = (s, w, h) =>
  s
    .replace(/data-width="1920"/g, `data-width="${w}"`)
    .replace(/data-height="1080"/g, `data-height="${h}"`)
    .replace(/width=1920, height=1080/g, `width=${w}, height=${h}`)
    .replace(/width: 1920px;/g, `width: ${w}px;`)
    .replace(/height: 1080px;/g, `height: ${h}px;`);
for (const [name, [w, h]] of Object.entries(variants)) {
  const out = path.join(root, "variants", name);
  fs.rmSync(path.join(out, "compositions"), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), resize(fs.readFileSync(path.join(root, "index.html"), "utf8"), w, h));
  for (const f of fs.readdirSync(path.join(root, "compositions")))
    fs.writeFileSync(path.join(out, "compositions", f), resize(fs.readFileSync(path.join(root, "compositions", f), "utf8"), w, h));
  fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });
  for (const f of ["hyperframes.json", "meta.json", "package.json"])
    if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(out, f));
  console.log("built", name, w + "x" + h);
}
