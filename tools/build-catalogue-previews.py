"""Extract a small, lossless product selection from each original catalogue.

Requires PyMuPDF only when regenerating previews. Normal site builds use the
checked-in PDFs and have no Python package dependencies.
"""

from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

import fitz

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public/assets"
SELECTIONS = {"solar": [1, 2, 5, 13, 28, 39, 45], "storage": [1, 9, 16]}


def fingerprint(file):
    return sha256(file.read_bytes()).hexdigest()


def main():
    products = json.loads((ROOT / "src/data/products.json").read_text())
    (ASSETS / "previews").mkdir(parents=True, exist_ok=True)
    manifest = []
    with TemporaryDirectory(prefix="gulai-catalogue-") as staging:
        pending = []
        for category in products["categories"]:
            selection = SELECTIONS[category["id"]]
            if len(selection) != category["previewPages"]:
                raise ValueError("Preview page count does not match product data")
            for locale in ["es", "en"]:
                source_name = urlsplit(category["catalogues"][locale]).path.removeprefix("/assets/")
                preview_name = category["cataloguePreviews"][locale].removeprefix("/assets/")
                source = ASSETS / source_name
                destination = ASSETS / preview_name
                staged = Path(staging) / destination.name
                original_hash = fingerprint(source)
                with fitz.open(source) as original, fitz.open() as preview:
                    if len(original) != category["cataloguePages"]:
                        raise ValueError(f"Unexpected source page count: {source_name}")
                    for page in selection:
                        preview.insert_pdf(original, from_page=page - 1, to_page=page - 1)
                    preview.set_metadata({
                        "title": f"GULAI {category['id']} - {'Vista rápida' if locale == 'es' else 'Quick preview'}",
                        "author": "GULAI",
                        "subject": "Selected pages from the original product catalogue",
                    })
                    preview.save(staged, garbage=4, deflate=True)
                with fitz.open(staged) as check:
                    if len(check) != len(selection):
                        raise ValueError(f"Unexpected preview page count: {preview_name}")
                if fingerprint(source) != original_hash:
                    raise ValueError(f"Original catalogue changed: {source_name}")
                if staged.stat().st_size >= source.stat().st_size * 0.35:
                    raise ValueError(f"Preview is too large: {preview_name}")
                pending.append((staged, destination))
                manifest.append({
                    "category": category["id"], "locale": locale,
                    "source": source_name, "preview": preview_name,
                    "sourcePages": selection,
                    "sourceSha256": original_hash, "previewSha256": fingerprint(staged),
                    "sourceBytes": source.stat().st_size, "previewBytes": staged.stat().st_size,
                })
        for staged, destination in pending:
            destination.write_bytes(staged.read_bytes())
    (ASSETS / "previews/manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    for item in manifest:
        print(f"{item['preview']}: {len(item['sourcePages'])} pages, "
              f"{item['previewBytes']:,} bytes "
              f"({100 * (1 - item['previewBytes'] / item['sourceBytes']):.0f}% smaller)")


if __name__ == "__main__":
    main()
