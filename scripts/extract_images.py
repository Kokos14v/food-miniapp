import fitz  # PyMuPDF
from PIL import Image
import io
import os

PDF_PATH = "data/recipes.pdf"
OUTPUT_DIR = "public/recipes"

os.makedirs(OUTPUT_DIR, exist_ok=True)

doc = fitz.open(PDF_PATH)
image_index = 1

for page_num, page in enumerate(doc, start=1):
    images = page.get_images(full=True)
    for img_num, img in enumerate(images, start=1):
        xref = img[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        img_ext = base_image["ext"]

        # завантажуємо у Pillow
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # зберігаємо як WEBP
        out_name = f"recipe_{image_index}.webp"
        out_path = os.path.join(OUTPUT_DIR, out_name)

        pil_img.save(out_path, format="WEBP", quality=90, method=6)

        print(f"Saved {out_path} (from page {page_num}, image {img_num})")
        image_index += 1

doc.close()
print("✅ Done: all images exported to WEBP.")

