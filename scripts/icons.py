# Draws the app icons from the shapes in public/icon.svg (kept in step by hand: it is
# five rounded rectangles). Needs Pillow:  python scripts/icons.py
#   build/icon.png          512, full rounded square: Windows and Linux installers
#   build/icon-mac.png      1024, on Apple's icon grid (824 square, margin and shadow): macOS Dock
#   public/icon-192.png     web app icons
#   public/icon-512.png
#   public/icon-maskable.png  512, edge to edge, artwork inside the safe zone: Android and Chrome
#   build/icon.ico, build/icon.icns  for the Java window's packages (jpackage wants these formats)
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PAPER, RULE, INK = (251, 250, 247, 255), (168, 67, 26, 255), (31, 29, 26, 255)
# (x, y, width, height, radius, colour) in the SVG's 512 units
MARKS = [(150, 96, 14, 320, 7, RULE)] + [(204, y, w, 22, 11, INK) for y, w in [(136, 200), (206, 156), (276, 184), (346, 112)]]
SS = 4   # draw large, then shrink, for smooth edges


def draw(size, square, offset, scale, radius, center=256):
    """square: side of the paper tile in px; offset: its top-left; scale: px per SVG unit for the marks."""
    big = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    o = offset * SS
    d.rounded_rectangle([o, o, o + square * SS - 1, o + square * SS - 1], radius=radius * SS, fill=PAPER)
    mid = size * SS / 2
    for x, y, w, h, r, c in MARKS:
        k = scale * SS
        x0, y0 = mid + (x - center) * k, mid + (y - center) * k
        d.rounded_rectangle([x0, y0, x0 + w * k, y0 + h * k], radius=r * k, fill=c)
    return big.resize((size, size), Image.LANCZOS)


def mac(size=1024):
    tile, margin = 824, 100
    art = draw(size, tile, margin, tile / 512, tile * 0.225)
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([margin, margin + 12, margin + tile, margin + tile + 12], radius=tile * 0.225, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    shadow.alpha_composite(art)
    return shadow


def save(img, path):
    img.save(ROOT / path, optimize=True)
    print(path, img.size)


full = draw(512, 512, 0, 1, 112)
save(full, 'build/icon.png')
save(full, 'public/icon-512.png')
save(draw(192, 192, 0, 192 / 512, 112 * 192 / 512), 'public/icon-192.png')
save(draw(512, 512, 0, 0.78, 0), 'public/icon-maskable.png')
dock = mac()
save(dock, 'build/icon-mac.png')
full.save(ROOT / 'build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
dock.save(ROOT / 'build/icon.icns')
print('build/icon.ico, build/icon.icns')
