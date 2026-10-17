#!/usr/bin/env python3
# Joins src/ (HTML template, CSS, JS modules, WGSL shaders) into the single file dist/pineapple-jelly.html.
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "pineapple-jelly.html"

JS_ORDER = [
    "util.js",
    "mesh.js",
    "physics.js",
    "camera.js",
    "gpu.js",
    "passes/skin.js",
    "passes/depth.js",
    "passes/scene.js",
    "passes/back.js",
    "passes/jelly.js",
    "passes/tonemap.js",
    "renderer.js",
    "interaction.js",
    "ui.js",
    "main.js",
]
WGSL_LIBS = {"common", "zones"}  # only ever included, never compiled alone
INCLUDE = re.compile(r"^//#include (\w+)\s*$", re.M)


def wgsl(name, seen):
    if name in seen:
        return ""
    seen.add(name)
    text = (SRC / "shaders" / f"{name}.wgsl").read_text()
    return INCLUDE.sub(lambda m: wgsl(m.group(1), seen), text)


def main():
    shaders = {
        p.stem: wgsl(p.stem, set())
        for p in sorted((SRC / "shaders").glob("*.wgsl"))
        if p.stem not in WGSL_LIBS
    }
    js = "const SHADERS = " + json.dumps(shaders) + ";\n\n"
    js += "\n".join((SRC / "js" / f).read_text() for f in JS_ORDER)
    js = "(() => {\n'use strict';\n" + js + "\n})();\n"
    if "</script" in js:
        raise SystemExit("a source contains '</script', which would end the inline script")
    css = (SRC / "style.css").read_text()
    html = (SRC / "index.html").read_text().replace("/*@CSS*/", css).replace("/*@JS*/", js)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(html) // 1024} KB, {len(shaders)} shaders)")


if __name__ == "__main__":
    main()
