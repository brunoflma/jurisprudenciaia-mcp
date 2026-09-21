"""Build or verify the self-contained, reproducible installation guide ZIP."""

import argparse
from html.parser import HTMLParser
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

DOCS = Path(__file__).resolve().parents[1] / "docs"
ARCHIVE = DOCS / "assets/oauth-guide/guia-conexao-advogado.zip"
FILES = (
    "deploy-guide.html",
    "agent-setup-prompt.txt",
    "assets/site.css",
    "assets/guide.css",
    "assets/guide.js",
    "assets/favicon.svg",
    "assets/fonts/manrope.woff2",
    "assets/fonts/OFL.txt",
)


class PromptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.active = False
        self.matches = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "pre" and dict(attrs).get("id") == "agent-setup-prompt":
            self.active = True
            self.matches += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "pre":
            self.active = False

    def handle_data(self, data: str) -> None:
        if self.active:
            self.parts.append(data)


def agent_prompt() -> bytes:
    parser = PromptParser()
    parser.feed((DOCS / "deploy-guide.html").read_text(encoding="utf-8"))
    text = "".join(parser.parts).strip()
    if parser.matches != 1 or not text:
        raise SystemExit("The guide must contain exactly one nonempty agent setup prompt.")
    return (text + "\n").encode("utf-8")


def contents(name: str) -> bytes:
    data = (DOCS / name).read_bytes()
    return data if name.endswith(".woff2") else data.replace(b"\r\n", b"\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the ZIP is stale")
    args = parser.parse_args()
    prompt_path = DOCS / "agent-setup-prompt.txt"
    prompt = agent_prompt()
    if args.check:
        if not prompt_path.exists() or contents("agent-setup-prompt.txt") != prompt:
            raise SystemExit("Downloadable agent prompt differs from the guide; rebuild the archive.")
        with ZipFile(ARCHIVE) as archive:
            if sorted(archive.namelist()) != sorted(FILES):
                raise SystemExit("Offline guide file list is stale; rebuild the archive.")
            for name in FILES:
                if archive.read(name) != contents(name):
                    raise SystemExit(f"Offline guide differs from docs/{name}; rebuild the archive.")
        print(f"Offline guide verified: {len(FILES)} matching files; agent prompt matches the page.")
        return
    prompt_path.write_bytes(prompt)
    with ZipFile(ARCHIVE, "w", compression=ZIP_DEFLATED) as archive:
        for name in FILES:
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, contents(name))
    print(f"Built {ARCHIVE.name}: {len(FILES)} files, {ARCHIVE.stat().st_size} bytes.")


if __name__ == "__main__":
    main()
