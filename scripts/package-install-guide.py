"""Build or verify the self-contained, reproducible installation guide ZIP."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

DOCS = Path(__file__).resolve().parents[1] / "docs"
ARCHIVE = DOCS / "assets/oauth-guide/guia-conexao-advogado.zip"
FILES = (
    "deploy-guide.html",
    "assets/site.css",
    "assets/guide.css",
    "assets/guide.js",
    "assets/favicon.svg",
    "assets/fonts/manrope.woff2",
    "assets/fonts/OFL.txt",
)


def contents(name: str) -> bytes:
    data = (DOCS / name).read_bytes()
    return data if name.endswith(".woff2") else data.replace(b"\r\n", b"\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the ZIP is stale")
    args = parser.parse_args()
    if args.check:
        with ZipFile(ARCHIVE) as archive:
            if sorted(archive.namelist()) != sorted(FILES):
                raise SystemExit("Offline guide file list is stale; rebuild the archive.")
            for name in FILES:
                if archive.read(name) != contents(name):
                    raise SystemExit(f"Offline guide differs from docs/{name}; rebuild the archive.")
        print(f"Offline guide verified: {len(FILES)} matching files.")
        return
    with ZipFile(ARCHIVE, "w", compression=ZIP_DEFLATED) as archive:
        for name in FILES:
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, contents(name))
    print(f"Built {ARCHIVE.name}: {len(FILES)} files, {ARCHIVE.stat().st_size} bytes.")


if __name__ == "__main__":
    main()
