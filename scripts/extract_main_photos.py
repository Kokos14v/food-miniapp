import os
import fitz  # PyMuPDF
from PIL import Image

PDF_PATH = "data/recipes.pdf"
OUTPUT_DIR = "public/recipes"

os.makedirs(OUTPUT_DIR, exist_ok=True)

doc = fitz.open(PDF_PATH)
total_pages = len(doc)

print(f"Opened PDF with {total_pages} pages")

for page_index in range(total_pages):
    page_num = page_index + 1
    page = doc[page_index]

    images = page.get_images(full=True)
    if not images:
        print(f"[!] Page {page_num}: no images found")
        continue

    # обираємо найбільше зображення на сторінці (за площею width*height)
    max_area = 0
    max_xref = None

    for img in images:
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        area = pix.width * pix.height

        if area > max_area:
            max_area = area
            max_xref = xref

    if max_xref is None:
        print(f"[!] Page {page_num}: could not determine main image")
        continue

    pix = fitz.Pixmap(doc, max_xref)

    # конвертація в RGB якщо потрібно
    if pix.n > 4:  # CMYK та інші
        pix = fitz.Pixmap(fitz.csRGB, pix)

    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)

    out_path = os.path.join(OUTPUT_DIR, f"recipe_{page_num}.webp")
    img.save(out_path, "WEBP", quality=90)

    print(f"Saved main photo for page {page_num} -> {out_path}")

doc.close()
print("✅ Done: one main WEBP per page.")
