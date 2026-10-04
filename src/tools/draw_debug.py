
from PIL import Image, ImageDraw
import sys

def draw_target(image_path, x, y, output_path):
    try:
        img = Image.open(image_path)
        draw = ImageDraw.Draw(img)
        
        # Draw Red Crosshair
        r = 20 # radius
        draw.line((x - r, y, x + r, y), fill="red", width=3)
        draw.line((x, y - r, x, y + r), fill="red", width=3)
        draw.ellipse((x - r, y - r, x + r, y + r), outline="red", width=3)
        
        img.save(output_path)
        print(f"Debug overlay saved to {output_path}")
    except Exception as e:
        print(f"Error drawing debug overlay: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python draw_debug.py <image_path> <x> <y>")
    else:
        draw_target(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), "debug_overlay.png")
