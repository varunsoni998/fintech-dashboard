"""
ZIP processor — extracts and indexes all readable text/code files from a zip archive.

Supported file types inside the zip:
  Code:    .py .js .ts .tsx .jsx .java .go .rs .cpp .c .h .cs .rb .php .swift .kt .scala
  Web:     .html .css .scss .sass .less .vue .svelte
  Data:    .json .yaml .yml .toml .xml .csv .env .ini .cfg .conf
  Docs:    .txt .md .mdx .rst .tex .log
  Shell:   .sh .bash .zsh .fish .ps1
  Other:   .sql .graphql .proto

Binary files (images, executables, etc.) are skipped automatically.
Nested zips are skipped (no recursion).
"""
import io
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# All extensions we'll try to read as text
TEXT_EXTENSIONS = {
    # Code
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs",
    ".cpp", ".c", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
    ".kt", ".scala", ".r", ".m", ".mm", ".lua", ".pl", ".ex", ".exs",
    ".erl", ".clj", ".cljs", ".hs", ".ml", ".fs", ".fsx", ".dart",
    ".elm", ".nim", ".zig", ".v", ".sol",
    # Web
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte",
    # Data / config
    ".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".env",
    ".ini", ".cfg", ".conf", ".config", ".properties",
    # Docs
    ".txt", ".md", ".mdx", ".rst", ".tex", ".log", ".readme",
    # Shell
    ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
    # DB / API
    ".sql", ".graphql", ".gql", ".proto",
    # Misc
    ".tf", ".tfvars", ".dockerfile", ".makefile",
}

# Files to always skip even if they have a text extension
SKIP_PATTERNS = {
    "__pycache__", ".git", "node_modules", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "coverage", ".DS_Store",
    "Thumbs.db", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Pipfile.lock", "composer.lock", "Cargo.lock",
}

MAX_FILE_SIZE_BYTES = 512 * 1024   # 512 KB per file — skip huge minified files
MAX_FILES_PER_ZIP  = 500           # safety cap


@dataclass
class ZipEntry:
    """A single text file extracted from a zip."""
    relative_path: str     # e.g. "src/components/Button.tsx"
    language: str          # e.g. "TypeScript" (derived from extension)
    content: str           # raw file text
    size_bytes: int


EXTENSION_LANGUAGE_MAP = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
    ".tsx": "TypeScript (React)", ".jsx": "JavaScript (React)",
    ".java": "Java", ".go": "Go", ".rs": "Rust", ".cpp": "C++",
    ".c": "C", ".h": "C/C++ Header", ".cs": "C#", ".rb": "Ruby",
    ".php": "PHP", ".swift": "Swift", ".kt": "Kotlin", ".scala": "Scala",
    ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".vue": "Vue",
    ".svelte": "Svelte", ".json": "JSON", ".yaml": "YAML", ".yml": "YAML",
    ".toml": "TOML", ".xml": "XML", ".csv": "CSV", ".sql": "SQL",
    ".sh": "Shell", ".bash": "Bash", ".md": "Markdown", ".mdx": "MDX",
    ".txt": "Text", ".rst": "reStructuredText", ".graphql": "GraphQL",
    ".proto": "Protocol Buffers", ".tf": "Terraform",
}


def _should_skip(path: str) -> bool:
    """Return True if this path should be skipped."""
    parts = Path(path).parts
    for part in parts:
        if part in SKIP_PATTERNS:
            return True
        # Skip hidden directories
        if part.startswith(".") and len(part) > 1 and part not in {".env", ".bashrc", ".zshrc"}:
            return True
    return False


def _get_language(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    # Handle extensionless files like Dockerfile, Makefile
    basename = Path(filename).name.lower()
    if basename in ("dockerfile", "makefile", "gemfile", "rakefile", "procfile"):
        return basename.capitalize()
    return EXTENSION_LANGUAGE_MAP.get(ext, "Text")


def extract_zip_entries(zip_path: str) -> tuple[list[ZipEntry], dict]:
    """
    Open a zip file and extract all readable text/code entries.

    Returns:
        (entries, stats) where stats has counts for skipped/extracted/failed files.
    """
    entries: list[ZipEntry] = []
    stats = {
        "total": 0,
        "extracted": 0,
        "skipped_type": 0,
        "skipped_pattern": 0,
        "skipped_size": 0,
        "skipped_nested_zip": 0,
        "failed": 0,
    }

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            stats["total"] = len(names)

            for name in names[:MAX_FILES_PER_ZIP]:
                # Skip directories
                if name.endswith("/"):
                    continue

                # Skip nested zips
                if name.lower().endswith(".zip"):
                    stats["skipped_nested_zip"] += 1
                    continue

                # Skip ignored patterns (node_modules, .git, etc.)
                if _should_skip(name):
                    stats["skipped_pattern"] += 1
                    continue

                # Check extension
                ext = Path(name).suffix.lower()
                basename = Path(name).name.lower()
                is_known_text = (
                    ext in TEXT_EXTENSIONS
                    or basename in ("dockerfile", "makefile", "gemfile", "rakefile", "procfile", ".env")
                    or (not ext)  # extensionless — try to read as text
                )

                if not is_known_text:
                    stats["skipped_type"] += 1
                    continue

                # Check file size
                info = zf.getinfo(name)
                if info.file_size > MAX_FILE_SIZE_BYTES:
                    logger.info("Skipping large file %s (%d bytes)", name, info.file_size)
                    stats["skipped_size"] += 1
                    continue

                # Read content
                try:
                    raw_bytes = zf.read(name)
                    # Try UTF-8 first, fall back to latin-1
                    try:
                        content = raw_bytes.decode("utf-8")
                    except UnicodeDecodeError:
                        try:
                            content = raw_bytes.decode("latin-1")
                        except UnicodeDecodeError:
                            # Binary file masquerading as text — skip
                            stats["skipped_type"] += 1
                            continue

                    if not content.strip():
                        continue  # empty file

                    entries.append(ZipEntry(
                        relative_path=name,
                        language=_get_language(name),
                        content=content,
                        size_bytes=info.file_size,
                    ))
                    stats["extracted"] += 1

                except Exception as e:
                    logger.warning("Failed to read %s from zip: %s", name, e)
                    stats["failed"] += 1

    except zipfile.BadZipFile as e:
        raise RuntimeError(f"Invalid or corrupted zip file: {e}") from e
    except Exception as e:
        raise RuntimeError(f"Could not open zip file: {e}") from e

    return entries, stats


def format_entry_for_chunking(entry: ZipEntry) -> str:
    """
    Format a zip entry's content with a header so the LLM knows which file
    it came from and what language it is. This improves citation quality.
    """
    header = f"File: {entry.relative_path}\nLanguage: {entry.language}\n"
    return f"{header}\n{entry.content}"
