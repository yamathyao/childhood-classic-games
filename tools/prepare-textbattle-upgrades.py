"""Extract the inspected GPT Image sheet, then tint and pack 24 transparent icons."""
from pathlib import Path
from PIL import Image, ImageOps, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / 'tmp/textbattle-upgrades/source.png').convert('RGB')
assert source.size == (1536, 1024), 'Inspect cells again for a different generation'
colors = ['#eef2f7', '#69b8ff', '#b394ff', '#ffca62']
atlas = Image.new('RGBA', (768, 512))
for index in range(6):
    cell = source.crop((index % 3 * 512, index // 3 * 512, index % 3 * 512 + 512, index // 3 * 512 + 512))
    luminance = ImageOps.grayscale(cell)
    # Keep the silhouette opaque; use luminance as relief, not as transparency.
    mask = luminance.point(lambda v: 255 if v > 38 else 0).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    bounds = mask.getbbox()
    assert bounds and bounds[0] > 0 and bounds[2] < 512 and bounds[1] > 0 and bounds[3] < 512
    alpha = ImageChops.lighter(mask, luminance.point(lambda v: min(255, max(0, (v - 8) * 8))))
    icon = luminance.crop(bounds)
    alpha = alpha.crop(bounds)
    factor = 104 / max(icon.size)
    size = (round(icon.width * factor), round(icon.height * factor))
    icon = icon.resize(size, Image.Resampling.LANCZOS)
    alpha = alpha.resize(size, Image.Resampling.LANCZOS)
    for row, color in enumerate(colors):
        image = ImageOps.colorize(icon, black='#192434', white=color).convert('RGBA')
        image.putalpha(alpha)
        atlas.alpha_composite(image, (index * 128 + (128 - image.width) // 2, row * 128 + (128 - image.height) // 2))
output = ROOT / 'assets/textbattle/upgrade-icons.png'
atlas.save(output, optimize=True)
print(f'{output}: {output.stat().st_size} bytes, {atlas.width}x{atlas.height}')
