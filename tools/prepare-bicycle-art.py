"""Prepare inspected GPT Image 2.5 sources as compact offline game assets."""
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tmp/bicycle-art'
OUTPUT = ROOT / 'assets/bicycle'
OUTPUT.mkdir(parents=True, exist_ok=True)


def key_magenta(image):
    image = image.convert('RGBA')
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, _ = pixels[x, y]
            if min(r, b) > 180 and g < 100 and min(r, b) > g + 100:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            if r > g + 25 and b > g + 25 and min(r, b) > 90:
                alpha = min(255, max(0, 255 - min(r - g, b - g)))
                if alpha < 20:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    ratio = alpha / 255
                    pixels[x, y] = (round(max(0, min(255, (r - 255 + alpha) / ratio))),
                                    round(min(255, g / ratio)),
                                    round(max(0, min(255, (b - 255 + alpha) / ratio))), alpha)
    return image


rider_source = Image.open(SOURCE / 'alpine-rider-source.png')
assert rider_source.size == (1024, 1024), 'Re-inspect wheel coordinates for a different source'
# Level the inspected hubs (212,715) / (813,720) before registration.
rider_angle = math.degrees(math.atan2(5, 601))
leveled = key_magenta(rider_source).rotate(rider_angle, Image.Resampling.BICUBIC)
rider = leveled.resize((512, 512), Image.Resampling.LANCZOS)
rider.save(OUTPUT / 'rider.png', optimize=True)

props_source = Image.open(SOURCE / 'alpine-props-source.png')
assert props_source.size == (1024, 1024), 'Re-inspect atlas regions for a different source'
props = key_magenta(props_source)
atlas = Image.new('RGBA', (512, 512))
prop_bounds = []
for index in range(16):
    x = index % 4 * 256
    y = index // 4 * 256
    crop = props.crop((x, y, x + 256, y + 256))
    bounds = crop.getbbox()
    assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < crop.width and bounds[3] < crop.height
    item = crop.crop(bounds)
    factor = min(120 / item.width, 120 / item.height)
    item = item.resize((round(item.width * factor), round(item.height * factor)), Image.Resampling.LANCZOS)
    left = (128 - item.width) // 2
    top = 124 - item.height
    atlas.alpha_composite(item, (index % 4 * 128 + left, index // 4 * 128 + top))
    prop_bounds.append([index % 4 * 128 + left, index // 4 * 128 + top, item.width, item.height])
atlas.save(OUTPUT / 'props.png', optimize=True)
(ROOT / 'games/bicycle/atlas.js').write_text('module.exports = ' + json.dumps(prop_bounds) + '\n', encoding='utf-8')

# Mirror the panorama into a continuous loop: both seams have identical edges,
# so parallax scrolling cannot expose a hard color discontinuity.
landscape = Image.open(SOURCE / 'alpine-landscape-source.png').convert('RGB')
landscape = landscape.resize((768, 512), Image.Resampling.LANCZOS)
panorama = Image.new('RGB', (1536, 512))
panorama.paste(landscape, (0, 0))
panorama.paste(landscape.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (768, 0))
panorama.save(OUTPUT / 'panorama.jpg', quality=82, optimize=True)
earth = Image.open(SOURCE / 'alpine-earth-source.png').convert('RGB').resize((256, 256), Image.Resampling.LANCZOS)
earth.save(OUTPUT / 'earth.jpg', quality=82, optimize=True)

meta = {
    'model': 'gpt-image-2.5-sunburst',
    'method': 'image generation; magenta keying; inspected wheel registration; mirrored panorama; offline compression',
    'prompts': ['art-source/bicycle-rider.prompt.txt', 'art-source/bicycle-landscape.prompt.txt', 'art-source/bicycle-props.prompt.txt', 'art-source/bicycle-earth.prompt.txt'],
    'style': 'restrained alpine adventure; muted natural palette; adult rider with opaque full-face helmet',
    'riderRegistration': {'sourceSize': [1024, 1024], 'wheelHubs': [[213.704, 717.488], [814.725, 717.488]], 'wheelRadius': 186,
                          'sourceLevelRotation': rider_angle, 'riderScale': .78,
                          'localWheelHubs': [[-23.4, 6.24], [23.4, 6.24]], 'sourceOrigin': [514.2145, 637.352]},
    'props': '4x4 atlas, 128px cells; tree, rock, log, flowers, tent, gear, fire, sign, van, car, engine, carriage, barrier, crossing, ramp, flags',
    'atlasBounds': prop_bounds,
    'files': {},
    'decodedBytes': (512 * 512 * 2 + 1536 * 512 + 256 * 256) * 4
}
for name in ['rider.png', 'props.png', 'panorama.jpg', 'earth.jpg']:
    data = (OUTPUT / name).read_bytes()
    meta['files'][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
(OUTPUT / 'provenance.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# A local inspection sheet catches holes, key spill and registration errors.
review = Image.new('RGBA', (1024, 600), '#dce5d4')
review.alpha_composite(rider, (0, 36))
review.alpha_composite(atlas, (512, 36))
review.convert('RGB').save(SOURCE / 'cutout-review.jpg', quality=92)
print(json.dumps(meta['files'], indent=2))
