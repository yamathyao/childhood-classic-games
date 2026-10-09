"""Cut inspected flat 2D generation and assemble four character groups offline."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tmp/textbattle-art-2d/isolated.png'
OUTPUT = ROOT / 'assets/textbattle'
OUTPUT.mkdir(parents=True, exist_ok=True)
source = Image.open(SOURCE).convert('RGB')
assert source.size == (1536, 1536), 'Inspect crop coordinates for a different generation'
regions = {
    'blue-male': (76, 76, 344, 452), 'blue-female': (454, 74, 728, 452),
    'red-male': (834, 76, 1111, 452), 'red-female': (1217, 74, 1495, 452),
    'sword': (142, 552, 256, 888), 'saber': (544, 555, 628, 888),
    'spear': (925, 474, 1001, 955), 'dual': (1304, 628, 1379, 827),
    'axe': (143, 1042, 292, 1441), 'halberd': (505, 991, 669, 1480)
}
art = {}; bounds = {}
for name, region in regions.items():
    image = source.crop(region).convert('RGBA'); pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, _ = pixels[x, y]
            keyed = r > 90 and b > 90 and b > g + 35 and r > g - 20
            alpha = max(255 - r, 255 - b, g) if keyed else 255
            if alpha < 18: pixels[x, y] = (0, 0, 0, 0)
            elif keyed:
                factor = alpha / 255
                pixels[x, y] = (max(0, min(255, round((r - (255 - alpha)) / factor))),
                                min(255, round(g / factor)),
                                max(0, min(255, round((b - (255 - alpha)) / factor))), alpha)
    box = image.getbbox(); bounds[name] = (region[0] + box[0], region[1] + box[1])
    art[name] = image.crop(box)

# Remove a small stray cyan hand remnant in the generated sword grip.
draw = ImageDraw.Draw(art['sword'])
draw.rectangle((47, 257, 61, 273), fill='#684827')
draw.line((47, 257, 47, 273), fill='#111c2c', width=3)
draw.line((61, 257, 61, 273), fill='#111c2c', width=3)

weapons = ['sword', 'saber', 'spear', 'dual', 'axe', 'halberd']
groups = ['blue-male', 'blue-female', 'red-male', 'red-female']
heights = {'sword': 118, 'saber': 118, 'spear': 212, 'dual': 76, 'axe': 152, 'halberd': 206}
grips = {'sword': .85, 'saber': .85, 'spear': .52, 'dual': .82, 'axe': .72, 'halberd': .52}
source_x = {'sword': 199, 'saber': 586, 'spear': 959, 'dual': 1342, 'axe': 175, 'halberd': 589}
atlas = Image.new('RGBA', (1536, 1024))
for row, group in enumerate(groups):
    original = art[group]; factor = 144 / original.height
    body = original.resize((round(original.width * factor), 144), Image.Resampling.LANCZOS)
    body_x, body_y = 65, 84
    hand = (round(body_x + (318 + row * 384 - bounds[group][0]) * factor),
            round(body_y + (198 - bounds[group][1]) * factor))
    rear = (round(body_x + (165 + row * 384 - bounds[group][0]) * factor),
            round(body_y + (270 - bounds[group][1]) * factor))
    for column, weapon in enumerate(weapons):
        tile = Image.new('RGBA', (256, 256))
        original_weapon = art[weapon]; scale = heights[weapon] / original_weapon.height
        item = original_weapon.resize((round(original_weapon.width * scale), heights[weapon]), Image.Resampling.LANCZOS)
        anchor = ((source_x[weapon] - bounds[weapon][0]) * scale, heights[weapon] * grips[weapon])
        layer = Image.new('RGBA', (512, 512))
        layer.alpha_composite(item, (round(256 - anchor[0]), round(256 - anchor[1])))
        layer = layer.rotate(-15, Image.Resampling.BICUBIC, center=(256, 256))
        tile.alpha_composite(layer, (hand[0] - 256, hand[1] - 256))
        if weapon == 'dual':
            tile.alpha_composite(layer.rotate(55, Image.Resampling.BICUBIC, center=(256, 256)),
                                 (rear[0] - 256, rear[1] - 256))
        tile.alpha_composite(body, (body_x, body_y))
        x0, y0, x1, y1 = tile.getchannel('A').getbbox()
        assert 0 < x0 < x1 < 256 and 0 < y0 < y1 < 256, f'{group}/{weapon} touches tile boundary'
        atlas.alpha_composite(tile, (column * 256, row * 256))
atlas.save(OUTPUT / 'fighters-2d.png', optimize=True)
cutouts = ROOT / 'tmp/textbattle-art-2d/cutouts'; cutouts.mkdir(parents=True, exist_ok=True)
for name, item in art.items(): item.save(cutouts / (name + '.png'), optimize=True)
(OUTPUT / 'provenance-2d.json').write_text(json.dumps({
    'model': 'gpt-image-2.5-sunburst', 'method': 'local image API generation + edit; chroma-key cutout; offline assembly',
    'prompts': ['art-source/textbattle-sprites-2d.prompt.txt', 'art-source/textbattle-sprites-2d-edit.prompt.txt'],
    'atlas': '6 columns × 4 rows; 256px tiles', 'groups': groups, 'weapons': weapons,
    'decodedBytes': 1536 * 1024 * 4
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Atlas:', atlas.size, 'PNG bytes:', (OUTPUT / 'fighters-2d.png').stat().st_size)
