#!/usr/bin/env python3
"""Generate simple PNG icons for the player2pip Chrome extension.
Uses only Python stdlib (struct, zlib) - no external dependencies."""

import struct
import zlib
import os

def make_png(width, height, pixels):
    """Create a PNG file from raw RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack('>I', len(data)) + c + crc

    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    ihdr = chunk(b'IHDR', ihdr_data)

    # IDAT - raw pixel data with filter bytes
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter: none
        for x in range(width):
            idx = (y * width + x) * 4
            raw += bytes(pixels[idx:idx+4])
    compressed = zlib.compress(raw)
    idat = chunk(b'IDAT', compressed)

    # IEND
    iend = chunk(b'IEND', b'')

    return sig + ihdr + idat + iend


def draw_icon(size):
    """Draw a simple icon: blue rounded-ish square with white 'P' letter."""
    pixels = [0] * (size * size * 4)

    cx, cy = size / 2, size / 2
    radius = size * 0.45

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            # Distance from center for rounded square effect
            dx = abs(x - cx + 0.5) / radius
            dy = abs(y - cy + 0.5) / radius
            # Squircle formula
            dist = (dx ** 4 + dy ** 4) ** 0.25

            if dist <= 1.0:
                # Blue background: #4285F4 (Google blue-ish)
                pixels[idx] = 66      # R
                pixels[idx+1] = 133   # G
                pixels[idx+2] = 244   # B
                pixels[idx+3] = 255   # A
            else:
                # Transparent
                pixels[idx] = 0
                pixels[idx+1] = 0
                pixels[idx+2] = 0
                pixels[idx+3] = 0

    # Draw "P" letter in white
    # Define P as a bitmap pattern scaled to the icon size
    # P letter grid (7x9 canonical)
    p_grid = [
        "XXXXX..",
        "X....X.",
        "X....X.",
        "X....X.",
        "XXXXX..",
        "X......",
        "X......",
        "X......",
        "X......",
    ]
    grid_h = len(p_grid)
    grid_w = max(len(r) for r in p_grid)

    # Scale and position
    letter_h = int(size * 0.55)
    letter_w = int(letter_h * grid_w / grid_h)
    start_x = int((size - letter_w) / 2)
    start_y = int((size - letter_h) / 2)

    for y in range(letter_h):
        gy = int(y * grid_h / letter_h)
        if gy >= grid_h:
            gy = grid_h - 1
        for x in range(letter_w):
            gx = int(x * grid_w / letter_w)
            if gx >= grid_w:
                gx = grid_w - 1
            if gx < len(p_grid[gy]) and p_grid[gy][gx] == 'X':
                px = start_x + x
                py = start_y + y
                if 0 <= px < size and 0 <= py < size:
                    idx = (py * size + px) * 4
                    # Only draw on non-transparent pixels
                    if pixels[idx+3] > 0:
                        pixels[idx] = 255     # R
                        pixels[idx+1] = 255   # G
                        pixels[idx+2] = 255   # B
                        pixels[idx+3] = 255   # A

    return make_png(size, size, pixels)


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for size in [16, 48, 128]:
        data = draw_icon(size)
        path = os.path.join(script_dir, f'icon{size}.png')
        with open(path, 'wb') as f:
            f.write(data)
        print(f'Created {path} ({len(data)} bytes)')
