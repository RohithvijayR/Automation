
import pyautogui
from PIL import Image
import sys

# Get Screen Size
screen_w, screen_h = pyautogui.size()
print(f"Screen: {screen_w}x{screen_h}")

# Get Image Size (if passed)
if len(sys.argv) > 1:
    try:
        img = Image.open(sys.argv[1])
        img_w, img_h = img.size
        print(f"Image: {img_w}x{img_h}")
        
        scale_x = img_w / screen_w
        scale_y = img_h / screen_h
        print(f"Scale: {scale_x:.2f}x{scale_y:.2f}")
    except Exception as e:
        print(f"Error opening image: {e}")
