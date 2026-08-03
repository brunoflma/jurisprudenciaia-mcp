# -*- coding: utf-8 -*-
"""Regenera os assets de favicon do espelho publico na paleta neutra (sem AMF).

Sobrescreve somente os blocos FAVICON_* em src/worker.ts, o theme-color da
landing e os arquivos public/favicon.{svg,png,ico}. Nao toca na tela OAuth.
"""
import base64
import io
import re
import sys
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Paleta neutra alinhada com docs/deploy-guide.html e tela OAuth (sem AMF).
INK = "#0b1014"
INK_LINE = "#1f2a33"
COPPER = "#d98a4a"

SVG = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" '
    f'aria-label="Balança da justiça"><title>Balança da justiça</title>'
    f'<rect width="96" height="96" rx="20" fill="{INK}"/>'
    f'<rect x="5" y="5" width="86" height="86" rx="17" fill="none" stroke="{INK_LINE}" stroke-width="2"/>'
    f'<path d="M48 22v55M18 36h60M27 38 14 62M27 38l13 24M69 38 56 62M69 38l13 24'
    f'M10 62h34l-7 11H17zM52 62h34l-7 11H59zM35 82h26" fill="none" stroke="{COPPER}" '
    f'stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)

# Contrato de tests/favicon-assets.test.ts.
ICON_SIZES = [16, 32, 48, 64, 128, 256]
PNG_SIZE = 256


def render_png(svg: str, size: int) -> bytes:
    return cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=size, output_height=size)


def png_to_ico(png_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    buf = io.BytesIO()
    # ICO multi-size com os seis tamanhos exigidos pelo teste de assets.
    img.save(buf, format="ICO", sizes=[(s, s) for s in ICON_SIZES])
    return buf.getvalue()


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def main() -> int:
    png = render_png(SVG, PNG_SIZE)
    ico = png_to_ico(png)

    # Assets estaticos servidos e testados por tests/favicon-assets.test.ts.
    (ROOT / "public" / "favicon.svg").write_text(SVG, encoding="utf-8")
    (ROOT / "public" / "favicon.png").write_bytes(png)
    (ROOT / "public" / "apple-touch-icon.png").write_bytes(png)
    (ROOT / "public" / "favicon.ico").write_bytes(ico)

    worker = ROOT / "src" / "worker.ts"
    text = worker.read_text(encoding="utf-8")

    # Em src/worker.ts o SVG esta inline numa template literal (linha unica).
    text = re.sub(
        r'const FAVICON_SVG = `.*?`;',
        f"const FAVICON_SVG = `{SVG}`;",
        text,
        count=1,
        flags=re.S,
    )
    text = re.sub(
        r'const FAVICON_PNG_BASE64 = ".*?";',
        f'const FAVICON_PNG_BASE64 = "{b64(png)}";',
        text,
        count=1,
        flags=re.S,
    )
    text = re.sub(
        r'const FAVICON_ICO_BASE64 = ".*?";',
        f'const FAVICON_ICO_BASE64 = "{b64(ico)}";',
        text,
        count=1,
        flags=re.S,
    )
    # theme-color da landing alinhado ao ink neutro.
    text = text.replace('content="#0a1224"', f'content="{INK}"')

    worker.write_text(text, encoding="utf-8")

    # Atualiza o hash pinado do PNG de 256px no teste de assets.
    import hashlib
    new_hash = hashlib.sha256(png).hexdigest()
    test_file = ROOT / "tests" / "favicon-assets.test.ts"
    ttext = test_file.read_text(encoding="utf-8")
    ttext = re.sub(
        r'const expectedPngSha256 = "[0-9a-f]{64}";',
        f'const expectedPngSha256 = "{new_hash}";',
        ttext,
        count=1,
    )
    test_file.write_text(ttext, encoding="utf-8")

    print("ok: favicon neutralizado", len(SVG), "svg /", len(png), "png /", len(ico), "ico")
    print("sha256 png256 =", new_hash)
    return 0


if __name__ == "__main__":
    sys.exit(main())
