"""
BK MOT Centre - Image Optimization Pipeline
Generates modern WebP formats and compresses fallback JPEGs/PNGs.
Preserves originals in .backup_images/
"""

import os
import shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT, 'assets')
IMAGES_DIR = os.path.join(ASSETS_DIR, 'images')
ICONS_DIR = os.path.join(ASSETS_DIR, 'icons')
BACKUP_DIR = os.path.join(ROOT, '.backup_images')

os.makedirs(BACKUP_DIR, exist_ok=True)

# Max display dimensions (2x retina quality)
LARGE_IMAGE_MAX_WIDTH = 1400
MEDIUM_IMAGE_MAX_WIDTH = 1000

stock_photos = [
    'AdobeStock_71143570.jpeg',
    'AdobeStock_273643099.jpeg',
    'AdobeStock_194137279-Copy-1.jpeg',
    'AdobeStock_216561757-flipped-3.jpg',
    'AdobeStock_165290661.jpeg',
    'AdobeStock_279110807.jpeg',
    'AdobeStock_273378961.jpg',
    'mechanic-05.jpg',
    'mechanic-58.jpg',
    'mechanic-87.jpg'
]

png_mechanics = [
    'mechanic-57-1.png',
    'mechanic-59.png',
    'mechanic-63.png',
    'mechanic-67.png',
    'mechanic-76.png',
    'mechanic-78-1.png',
    'mechanic-80.png'
]

total_orig = 0
total_opt = 0

print(f"{'Image':40} | {'Original':10} | {'Optimized':10} | {'WebP':10} | {'Reduction':10}")
print("-" * 90)

for filename in stock_photos:
    filepath = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(filepath):
        continue

    # Backup original
    backup_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(backup_path):
        shutil.copy2(filepath, backup_path)

    orig_size = os.path.getsize(backup_path)
    total_orig += orig_size

    base_name, ext = os.path.splitext(filename)
    webp_path = os.path.join(IMAGES_DIR, f"{base_name}.webp")

    with Image.open(backup_path) as img:
        # Convert CMYK/RGBA to RGB if needed
        if img.mode in ('RGBA', 'LA', 'P'):
            rgb_img = img.convert('RGB')
        else:
            rgb_img = img.copy()

        # Resize if wider than max width
        if rgb_img.width > LARGE_IMAGE_MAX_WIDTH:
            ratio = LARGE_IMAGE_MAX_WIDTH / rgb_img.width
            new_h = int(rgb_img.height * ratio)
            resized = rgb_img.resize((LARGE_IMAGE_MAX_WIDTH, new_h), Image.Resampling.LANCZOS)
        else:
            resized = rgb_img

        # Save WebP
        resized.save(webp_path, 'WEBP', quality=82)

        # Save optimized JPEG
        resized.save(filepath, 'JPEG', quality=82, optimize=True, progressive=True)

    opt_size = os.path.getsize(filepath)
    webp_size = os.path.getsize(webp_path)
    total_opt += webp_size
    reduction = (1 - (webp_size / orig_size)) * 100

    print(f"{filename:40} | {orig_size/1024:8.1f} KB | {opt_size/1024:8.1f} KB | {webp_size/1024:8.1f} KB | {reduction:8.1f}%")

# Process PNG cutouts to WebP
for filename in png_mechanics:
    filepath = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(filepath):
        continue

    backup_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(backup_path):
        shutil.copy2(filepath, backup_path)

    orig_size = os.path.getsize(backup_path)
    total_orig += orig_size

    base_name, _ = os.path.splitext(filename)
    webp_path = os.path.join(IMAGES_DIR, f"{base_name}.webp")

    with Image.open(backup_path) as img:
        img.save(webp_path, 'WEBP', quality=85, method=6)

    webp_size = os.path.getsize(webp_path)
    total_opt += webp_size
    reduction = (1 - (webp_size / orig_size)) * 100
    print(f"{filename:40} | {orig_size/1024:8.1f} KB | {'-':10} | {webp_size/1024:8.1f} KB | {reduction:8.1f}%")

print("=" * 90)
print(f"Total Original:  {total_orig / (1024 * 1024):.2f} MB")
print(f"Total Optimized: {total_opt / (1024 * 1024):.2f} MB")
print(f"Overall Savings: {(1 - total_opt / total_orig) * 100:.1f}%")
