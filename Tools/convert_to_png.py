
from PIL import Image
from pathlib import Path
import sys

# Use dragged folder, or folder containing this script
folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent

# Create PNG output folder
output = folder / "PNG"
output.mkdir(parents=True, exist_ok=True)

extensions = {".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}

converted = 0

for file in folder.iterdir():
    if not file.is_file() or file.suffix.lower() not in extensions:
        continue

    try:
        with Image.open(file) as img:
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA")

            destination = output / f"{file.stem}.png"
            img.save(destination, "PNG")

            print(f"Converted: {file.name}")
            converted += 1

    except Exception as e:
        print(f"Error: {file.name} - {e}")

print(f"\nFinished! Converted {converted} images.")
print(f"Saved to: {output}")
