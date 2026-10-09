"""Cut generated chroma-key art and build one small runtime fighter atlas."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tmp/textbattle-art/source.png'
OUTPUT = ROOT / 'assets/textbattle'
OUTPUT.mkdir(parents=True, exist_ok=True)

source = Image.open(SOURCE).convert('RGB')
assert source.size == (1536, 1536), 'Inspect and update crop coordinates for a different source size'
# Actual inspected bounds, rather than blindly cutting nominal grid lines.
regions = {
    'blue': (96, 45, 425, 450), 'red': (608, 45, 937, 450),
    'sword': (180, 480, 335, 1005), 'saber': (726, 483, 835, 1003),
    'spear': (1250, 475, 1317, 1010), 'dual': (199, 1106, 314, 1462),
    'hammer': (646, 1035, 890, 1500)
}
art = {}
bounds = {}
for name, region in regions.items():
    image = source.crop(region).convert('RGBA')
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, _ = pixels[x, y]
            # Magenta dominates only the key background and its antialiased edge.
            keyed = r > 90 and b > 90 and b > g + 35 and r > g - 20
            alpha = max(255 - r, 255 - b, g) if keyed else 255
            if alpha < 18:
                pixels[x, y] = (0, 0, 0, 0)
            elif keyed:
                factor = alpha / 255
                pixels[x, y] = (max(0, round((r - (255 - alpha)) / factor)),
                                min(255, round(g / factor)),
                                max(0, min(255, round((b - (255 - alpha)) / factor))), alpha)
    box = image.getbbox()
    bounds[name] = [region[0] + box[0], region[1] + box[1]]
    art[name] = image.crop(box)

# Weapons' actual grasp points in the inspected source (coordinates before cropping).
grasps = {'sword': (256, 912), 'saber': (773, 912), 'spear': (1280, 813),
          'dual': (256, 1380), 'hammer': (769, 1360)}
heights = {'sword': 112, 'saber': 112, 'spear': 151, 'dual': 75, 'hammer': 103}
weapons = ['sword', 'saber', 'spear', 'dual', 'hammer']
atlas = Image.new('RGBA', (1280, 512))
for row, color in enumerate(['blue', 'red']):
    body = art[color]
    factor = 160 / body.height
    body = body.resize((round(body.width * factor), 160), Image.Resampling.LANCZOS)
    # Body feet at 228; source forward hand at (398,168) / (910,168).
    body_x, body_y = 54, 68
    source_hand = (398 if color == 'blue' else 910, 168)
    hand = (round(body_x + (source_hand[0] - bounds[color][0]) * factor),
            round(body_y + (source_hand[1] - bounds[color][1]) * factor))
    for column, weapon in enumerate(weapons):
        tile = Image.new('RGBA', (256, 256))
        item = art[weapon]
        scale = heights[weapon] / item.height
        item = item.resize((round(item.width * scale), heights[weapon]), Image.Resampling.LANCZOS)
        grasp = grasps[weapon]
        anchor = ((grasp[0] - bounds[weapon][0]) * scale, (grasp[1] - bounds[weapon][1]) * scale)
        # Rotate around the grasp on a generously padded local canvas.
        layer = Image.new('RGBA', (384, 384))
        layer.alpha_composite(item, (round(192 - anchor[0]), round(192 - anchor[1])))
        layer = layer.rotate(-18, Image.Resampling.BICUBIC, center=(192, 192))
        tile.alpha_composite(layer, (hand[0] - 192, hand[1] - 192))
        if weapon == 'dual':
            rear = (round(body_x + (214 if color == 'blue' else 726) * factor - bounds[color][0] * factor),
                    round(body_y + (240 - bounds[color][1]) * factor))
            tile.alpha_composite(layer.rotate(55, Image.Resampling.BICUBIC, center=(192, 192)),
                                 (rear[0] - 192, rear[1] - 192))
        tile.alpha_composite(body, (body_x, body_y))
        atlas.alpha_composite(tile, (column * 256, row * 256))
atlas.save(OUTPUT / 'fighters.png', optimize=True)
for row in range(2):
    for column in range(5):
        alpha = atlas.crop((column * 256, row * 256, (column + 1) * 256, (row + 1) * 256)).getchannel('A')
        x0, y0, x1, y1 = alpha.getbbox()
        assert 0 < x0 < x1 < 256 and 0 < y0 < y1 < 256, 'Sprite touches tile boundary'
# Individual cutouts remain useful source assets, excluded from the game package.
cutouts = ROOT / 'tmp/textbattle-art/cutouts'
cutouts.mkdir(parents=True, exist_ok=True)
for name, item in art.items():
    item.save(cutouts / (name + '.png'), optimize=True)
(OUTPUT / 'provenance.json').write_text(json.dumps({
    'model': 'gpt-image-2.5-sunburst', 'method': 'local configured image API; inspected magenta cutout; offline assembly',
    'prompt': 'art-source/textbattle-sprites.prompt.txt', 'atlas': '5 columns × 2 rows; 256px tiles; blue then red',
    'weapons': weapons, 'decodedBytes': 1280 * 512 * 4
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Atlas:', atlas.size, 'PNG bytes:', (OUTPUT / 'fighters.png').stat().st_size)
