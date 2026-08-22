"""
ZIP processor — extracts and indexes all readable text/code files from a zip archive.
Memory-efficient: reads files one at a time, never loads the whole zip into RAM.

Supported file types inside the zip:
  Code:    .py .js .ts .tsx .jsx .java .go .rs .cpp .c .h .cs .rb .php .swift .kt .scala
  Web:     .html .css .scss .sass .less .vue .svelte
  Data:    .json .yaml .yml .toml .xml .csv .env .ini .cfg .conf
  Docs:    .txt .md .mdx .rst .tex .log
  Shell:   .sh .bash .zsh .fish .ps1
  Other:   .sql .graphql .proto

Binary files, images, executables, lock files, and build output are skipped.
Nested zips are skipped (no recursion).
"""
import io
import logging
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Max size of the zip file itself on disk
MAX_ZIP_SIZE_BYTES = 50 * 1024 * 1024   # 50 MB

# Max size of any single file inside the zip (uncompressed)
MAX_FILE_SIZE_BYTES = 256 * 1024         # 256 KB — skip big minified / generated files

# Max number of files we'll process from a single zip
MAX_FILES_PER_ZIP = 300

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
    ".tf", ".tfvars",
}

# Directory/file names to always skip
SKIP_PATTERNS = {
    "__pycache__", ".git", "node_modules", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "coverage", ".DS_Store",
    "Thumbs.db", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Pipfile.lock", "composer.lock", "Cargo.lock",
    ".idea", ".vscode", "__MACOSX", ".pytest_cache", ".mypy_cache",
}

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
    ".proto": "Protocol Buffers", ".tf": "Terraform", ".env": "Environment Config",
}


@dataclass
class ZipEntry:
    relative_path: str   # e.g. "src/components/Button.tsx"
    language: str        # e.g. "TypeScript (React)"
    content: str         # raw file text
    size_bytes: int


def _should_skip(path: str) -> bool:
    """Return True if this path matches a skip pattern."""
    parts = Path(path).parts
    for part in parts:
        if part in SKIP_PATTERNS:
            return True
        # Skip hidden dirs (but allow .env files)
        if (part.startswith(".")
                and len(part) > 1
                and part not in {".env", ".bashrc", ".zshrc", ".gitignore", ".dockerignore"}):
            return True
    return False


def _get_language(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    basename = Path(filename).name.lower()
    if basename in ("dockerfile", "makefile", "gemfile", "rakefile", "procfile"):
        return basename.capitalize()
    return EXTENSION_LANGUAGE_MAP.get(ext, "Text")


def _read_entry_streaming(zf: zipfile.ZipFile, name: str, max_bytes: int) -> Optional[str]:
    """
    Read a single zip entry as text without loading the whole zip into RAM.
    Returns None if the file is binary or unreadable.
    Uses streaming read so only one file is in memory at a time.
    """
    try:
        with zf.open(name) as entry_file:
            # Read in small chunks, stop at max_bytes
            chunks = []
            total = 0
            while True:
                chunk = entry_file.read(32 * 1024)  # 32 KB at a time
                if not chunk:
                    break
                total += len(chunk)
                chunks.append(chunk)
                if total >= max_bytes:
                    logger.debug("Truncating large file %s at %d bytes", name, total)
                    break

            raw_bytes = b"".join(chunks)

        # Decode — try UTF-8 first, fall back to latin-1
        try:
            return raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                return raw_bytes.decode("latin-1")
            except UnicodeDecodeError:
                return None  # binary

    except Exception as e:
        logger.warning("Could not read %s from zip: %s", name, e)
        return None


def extract_zip_entries(zip_path: str) -> tuple[list[ZipEntry], dict]:
    """
    Open a zip file and extract all readable text/code entries.
    Memory-efficient: processes one file at a time.

    Returns:
        (entries, stats)
    """
    # Pre-flight: check zip size on disk
    zip_size = os.path.getsize(zip_path)
    if zip_size > MAX_ZIP_SIZE_BYTES:
        raise RuntimeError(
            f"Zip file is too large ({zip_size // (1024*1024)} MB). "
            f"Maximum allowed is {MAX_ZIP_SIZE_BYTES // (1024*1024)} MB."
        )

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
            all_names = zf.namelist()
            stats["total"] = len(all_names)

            processed = 0
            for name in all_names:
                if processed >= MAX_FILES_PER_ZIP:
                    logger.info("Reached MAX_FILES_PER_ZIP (%d), stopping", MAX_FILES_PER_ZIP)
                    break

                # Skip directories
                if name.endswith("/"):
                    continue

                # Skip nested zips
                if name.lower().endswith(".zip"):
                    stats["skipped_nested_zip"] += 1
                    continue

                # Skip ignored patterns
                if _should_skip(name):
                    stats["skipped_pattern"] += 1
                    continue

                # Check extension
                ext = Path(name).suffix.lower()
                basename = Path(name).name.lower()
                is_known_text = (
                    ext in TEXT_EXTENSIONS
                    or basename in {
                        "dockerfile", "makefile", "gemfile", "rakefile",
                        "procfile", ".env", ".gitignore", ".dockerignore",
                    }
                )

                if not is_known_text:
                    stats["skipped_type"] += 1
                    continue

                # Check uncompressed size before reading
                info = zf.getinfo(name)
                if info.file_size > MAX_FILE_SIZE_BYTES:
                    logger.info("Skipping large file %s (%d bytes)", name, info.file_size)
                    stats["skipped_size"] += 1
                    continue

                # Stream-read the entry
                content = _read_entry_streaming(zf, name, MAX_FILE_SIZE_BYTES)

                if content is None:
                    stats["skipped_type"] += 1  # binary
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
                processed += 1

    except zipfile.BadZipFile as e:
        raise RuntimeError(f"Invalid or corrupted zip file: {e}") from e
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Could not process zip file: {e}") from e

    return entries, stats


def format_entry_for_chunking(entry: ZipEntry) -> str:
    """
    Prefix each file's content with a header so the LLM knows which file
    the chunk came from and what language it is.
    """
    header = f"File: {entry.relative_path}\nLanguage: {entry.language}\n"
    return f"{header}\n{entry.content}"
