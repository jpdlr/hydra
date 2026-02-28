#!/usr/bin/env python3
"""
Generate Hydra brand assets from source logo files:
- assets/hydra.png (white mark on transparent)
- assets/hydra_black.png (black mark on transparent)

Outputs:
- Desktop app icons (build/icon.png, build/icon@2x.png, build/icon.ico, build/icon.icns)
- Desktop renderer favicon (src/assets/favicon.png)
- PWA icons/favicons (hydra-remote/public/icons/*)
"""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WHITE_SOURCE = ROOT / "assets" / "hydra.png"
BLACK_SOURCE = ROOT / "assets" / "hydra_black.png"


def ensure_exists(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing required source file: {path}")


def fit_logo(source: Image.Image, size: int, pad_ratio: float, bg_rgba: tuple[int, int, int, int] | None = None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg_rgba if bg_rgba else (0, 0, 0, 0))

    max_dim = max(1, int(size * (1.0 - (2.0 * pad_ratio))))
    scale = min(max_dim / source.width, max_dim / source.height)
    target_w = max(1, int(source.width * scale))
    target_h = max(1, int(source.height * scale))

    logo = source.resize((target_w, target_h), Image.Resampling.LANCZOS)
    pos = ((size - target_w) // 2, (size - target_h) // 2)
    canvas.alpha_composite(logo, dest=pos)
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


def save_ico(base: Image.Image, path: Path, sizes: Iterable[int]) -> None:
    size_pairs = [(size, size) for size in sizes]
    path.parent.mkdir(parents=True, exist_ok=True)
    base.save(path, format="ICO", sizes=size_pairs)


def generate_icns(base_white: Image.Image, destination: Path) -> None:
    iconutil = shutil.which("iconutil")
    if not iconutil:
        print("[warn] iconutil not found; skipping build/icon.icns generation.")
        return

    with tempfile.TemporaryDirectory(prefix="hydra-iconset-") as temp_dir:
        iconset_dir = Path(temp_dir) / "Hydra.iconset"
        iconset_dir.mkdir(parents=True, exist_ok=True)

        sizes = [16, 32, 128, 256, 512]
        for size in sizes:
            normal = fit_logo(base_white, size, 0.14, bg_rgba=(17, 24, 34, 255))
            retina = fit_logo(base_white, size * 2, 0.14, bg_rgba=(17, 24, 34, 255))
            save_png(normal, iconset_dir / f"icon_{size}x{size}.png")
            save_png(retina, iconset_dir / f"icon_{size}x{size}@2x.png")

        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                [iconutil, "-c", "icns", str(iconset_dir), "-o", str(destination)],
                check=True
            )
        except subprocess.CalledProcessError:
            print("[warn] iconutil rejected generated iconset; keeping existing build/icon.icns.")


def main() -> None:
    ensure_exists(WHITE_SOURCE)
    ensure_exists(BLACK_SOURCE)

    white = Image.open(WHITE_SOURCE).convert("RGBA")
    black = Image.open(BLACK_SOURCE).convert("RGBA")

    # Keep source variants available inside renderer assets for easy reuse.
    save_png(white, ROOT / "src" / "assets" / "hydra-white.png")
    save_png(black, ROOT / "src" / "assets" / "hydra-black.png")

    # Desktop app icons (dark tile + white logo).
    app_icon_512 = fit_logo(white, 512, 0.14, bg_rgba=(17, 24, 34, 255))
    app_icon_1024 = fit_logo(white, 1024, 0.14, bg_rgba=(17, 24, 34, 255))
    save_png(app_icon_512, ROOT / "build" / "icon.png")
    save_png(app_icon_1024, ROOT / "build" / "icon@2x.png")
    save_ico(app_icon_1024, ROOT / "build" / "icon.ico", [16, 24, 32, 48, 64, 128, 256])
    generate_icns(white, ROOT / "build" / "icon.icns")

    # Desktop renderer favicon (black logo on transparent for tab clarity).
    desktop_favicon = fit_logo(black, 32, 0.08)
    save_png(desktop_favicon, ROOT / "src" / "assets" / "favicon.png")

    # Hydra Remote web app icons.
    remote_icons_dir = ROOT / "hydra-remote" / "public" / "icons"
    remote_icon_192 = fit_logo(white, 192, 0.14, bg_rgba=(17, 24, 34, 255))
    remote_icon_512 = fit_logo(white, 512, 0.14, bg_rgba=(17, 24, 34, 255))
    remote_maskable_512 = fit_logo(white, 512, 0.08, bg_rgba=(17, 24, 34, 255))
    remote_apple_touch = fit_logo(white, 180, 0.14, bg_rgba=(17, 24, 34, 255))
    remote_favicon_32 = fit_logo(black, 32, 0.10)
    remote_favicon_16 = fit_logo(black, 16, 0.10)

    save_png(remote_icon_192, remote_icons_dir / "icon-192.png")
    save_png(remote_icon_512, remote_icons_dir / "icon-512.png")
    save_png(remote_maskable_512, remote_icons_dir / "icon-maskable-512.png")
    save_png(remote_apple_touch, remote_icons_dir / "apple-touch-icon.png")
    save_png(remote_favicon_32, remote_icons_dir / "favicon-32.png")
    save_png(remote_favicon_16, remote_icons_dir / "favicon-16.png")

    print("[ok] Brand assets generated successfully.")


if __name__ == "__main__":
    main()
