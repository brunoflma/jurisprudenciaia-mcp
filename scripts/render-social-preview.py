"""Render the public share card. Requires Pillow and a Manrope TTF supplied with --font."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--font", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
scale = 2
image = Image.new("RGB", (1280 * scale, 640 * scale), "#0b1118")
draw = ImageDraw.Draw(image)


def box(bounds, fill, outline=None, radius=0, width=1):
    scaled = tuple(int(value * scale) for value in bounds)
    if radius:
        draw.rounded_rectangle(scaled, radius=radius * scale, fill=fill, outline=outline, width=width * scale)
    else:
        draw.rectangle(scaled, fill=fill, outline=outline, width=width * scale)


def text(position, value, size, color, weight=500):
    font = ImageFont.truetype(str(args.font), size * scale)
    font.set_variation_by_axes([weight])
    draw.text(tuple(coordinate * scale for coordinate in position), value, font=font, fill=color)


for x in range(710, 1280, 40):
    draw.line((x * scale, 0, x * scale, 640 * scale), fill="#152b35", width=scale)
for y in range(0, 640, 40):
    draw.line((710 * scale, y * scale, 1280 * scale, y * scale), fill="#152b35", width=scale)
box((24, 24, 1256, 616), None, "#355767", 22, 2)
box((65, 65, 109, 109), "#5edffa", radius=11)
draw.ellipse((76 * scale, 75 * scale, 94 * scale, 93 * scale), outline="#14212a", width=3 * scale)
draw.line((92 * scale, 91 * scale, 100 * scale, 99 * scale), fill="#14212a", width=3 * scale)
text((125, 68), "JurisprudênciaIA", 30, "#eef3f5", 800)
box((405, 71, 475, 104), "#17343e", "#416777", 6)
text((418, 77), "MCP", 16, "#5edffa", 750)
text((64, 199), "Sua pesquisa,", 64, "#eef3f5", 800)
text((64, 280), "conectada.", 78, "#5edffa", 800)
text((68, 395), "Pergunte no assistente.", 26, "#adbfcc")
text((68, 434), "Aprofunde. Confira na fonte.", 26, "#adbfcc")
box((67, 492, 260, 536), "#c6ff5e", radius=7)
text((86, 503), "14 ferramentas", 18, "#17230c", 750)
text((68, 570), "CONHEÇA O PROJETO NO GITHUB", 14, "#839baa", 650)
box((748, 139, 1207, 515), "#13232e", "#345867", 14)
text((778, 166), "DA PERGUNTA À PRÓXIMA LEITURA", 13, "#8faab9", 650)
for y, n, heading, caption in [(221, "01", "Seu assistente", "Uma pergunta de pesquisa"), (314, "02", "Seu conector MCP", "Acesso autorizado com Google"), (407, "03", "JurisprudênciaIA", "Referências para conferir")]:
    box((777, y, 1177, y + 75), "#0d1922", "#2f4c5a", 9)
    box((793, y + 17, 833, y + 57), "#1c3c45", radius=8)
    text((803, y + 27), n, 13, "#5edffa", 700)
    text((853, y + 12), heading, 20, "#eef3f5", 750)
    text((853, y + 43), caption, 13, "#8faab9")
text((779, 543), "CONVERSA  /  PESQUISA  /  FONTES", 13, "#7d9baa", 600)
image.resize((1280, 640), Image.Resampling.LANCZOS).save(root / "docs/assets/social-preview.png", optimize=True)
print("Rendered social preview: 1280 x 640.")
