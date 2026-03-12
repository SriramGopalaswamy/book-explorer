"""
Secureye ONtime Attendance PDF Parser
======================================
Parses Employee Performance Register PDFs exported from Secureye ONtime
biometric attendance software and converts them to structured CSV.

Usage:
    python parse_attendance.py <input.pdf> [output.csv]

Output schema:
    emp_code, emp_name, date, in_time, out_time,
    late_minutes, early_departure, work_hours, status
"""

import sys
import re
import logging
from pathlib import Path
from datetime import datetime, date, timedelta

import pdfplumber
import pandas as pd

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Row labels that appear in the calendar grid (in order)
GRID_ROW_LABELS = ["in time", "out time", "late mins", "early dep", "work hrs", "status"]

# Map raw row label → clean field name
ROW_LABEL_MAP = {
    "in time":   "in_time",
    "out time":  "out_time",
    "late mins": "late_minutes",
    "early dep": "early_departure",
    "work hrs":  "work_hours",
    "status":    "status",
}

# Status normalisation table  (applied after stripping corrupt chars)
STATUS_NORMALISE = {
    r"P/WO":  "P",
    r"WO-I":  "WO",
    r"MIS":   "MISSING",
}

# Regex patterns
RE_EMP_CODE   = re.compile(r"Emp\s*Code\s*[:\-]\s*(\d+)", re.IGNORECASE)
RE_EMP_NAME   = re.compile(r"Emp\s*Name\s*[:\-]\s*(.+)", re.IGNORECASE)
RE_DEPARTMENT = re.compile(r"Department\s*[:\-]\s*(.+)", re.IGNORECASE)
RE_PERIOD     = re.compile(
    r"(?:Period|Date)\s*[:\-]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})"
    r"\s*(?:to|[-–])\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    re.IGNORECASE,
)
RE_TIME       = re.compile(r"^\d{1,2}:\d{2}$")
RE_DAY_ROW    = re.compile(r"^\s*(\d+(?:\s+\d+)+)\s*$")   # line of space-separated integers

# Corrupt / noise characters that appear in status cells (e.g. P/WO￾)
CORRUPT_CHARS = re.compile(r"[^\x00-\x7E\u0000-\u00FF]")  # non-latin unicode glyph noise


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clean_text(text: str) -> str:
    """Remove corrupt / non-printable characters."""
    return CORRUPT_CHARS.sub("", text).strip()


def normalise_status(raw: str) -> str:
    """Apply status normalisation rules."""
    s = clean_text(raw).strip()
    for pattern, replacement in STATUS_NORMALISE.items():
        s = re.sub(pattern, replacement, s, flags=re.IGNORECASE)
    return s.strip()


def parse_date(day: int, period_start: date) -> date:
    """Return the calendar date for a given day number within the period."""
    return date(period_start.year, period_start.month, day)


def is_zero_time(value: str) -> bool:
    """True if value represents a missing/zero timestamp (0, 00:00, -, blank)."""
    v = str(value).strip()
    return v in ("", "0", "00:00", "-", "0:00", "N/A", "NA")


def parse_period_date(raw: str) -> date:
    """Parse dd/mm/yyyy or dd-mm-yyyy or dd/mm/yy."""
    raw = raw.strip().replace("-", "/")
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {raw!r}")


# ---------------------------------------------------------------------------
# PDF text extraction helpers
# ---------------------------------------------------------------------------

def extract_pages_text(pdf_path: str) -> list[str]:
    """Return a list of plain-text strings, one per PDF page."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            pages.append(text)
    return pages


def extract_tables_from_page(page) -> list[list[list[str]]]:
    """Extract raw tables from a pdfplumber page object."""
    tables = page.extract_tables()
    return tables or []


# ---------------------------------------------------------------------------
# Employee block parser
# ---------------------------------------------------------------------------

class EmployeeBlock:
    """Holds raw data for one employee parsed from the PDF."""

    def __init__(self):
        self.emp_code: str = ""
        self.emp_name: str = ""
        self.department: str = ""
        self.period_start: date | None = None
        self.period_end: date | None = None
        # grid: dict  day_number (int) → dict of field → value
        self.grid: dict[int, dict[str, str]] = {}


def split_into_employee_blocks(full_text: str) -> list[str]:
    """
    Split the full PDF text into per-employee blocks.
    Each block starts with 'Emp Code :'.
    """
    pattern = re.compile(r"(?=Emp\s*Code\s*[:\-])", re.IGNORECASE)
    parts = pattern.split(full_text)
    # Drop any leading noise before the first employee block
    blocks = [p.strip() for p in parts if RE_EMP_CODE.search(p)]
    return blocks


def parse_employee_header(block_text: str) -> tuple[str, str, str, date | None, date | None]:
    """Extract emp_code, emp_name, department, period_start, period_end from block header."""
    emp_code = emp_name = department = ""
    period_start = period_end = None

    m = RE_EMP_CODE.search(block_text)
    if m:
        emp_code = m.group(1).strip()

    m = RE_EMP_NAME.search(block_text)
    if m:
        emp_name = m.group(1).strip().split("\n")[0].strip()

    m = RE_DEPARTMENT.search(block_text)
    if m:
        department = m.group(1).strip().split("\n")[0].strip()

    m = RE_PERIOD.search(block_text)
    if m:
        try:
            period_start = parse_period_date(m.group(1))
            period_end   = parse_period_date(m.group(2))
        except ValueError as exc:
            log.warning("Could not parse period for %s: %s", emp_code, exc)

    return emp_code, emp_name, department, period_start, period_end


def parse_grid_from_text(block_text: str) -> dict[int, dict[str, str]]:
    """
    Parse the column-wise calendar grid from raw text.

    Expected structure (simplified):
        1   2   3   4  ...  28
        In Time row values ...
        Out Time row values ...
        ...

    Returns: {day_number: {field_name: value}}
    """
    lines = [l.rstrip() for l in block_text.splitlines()]
    grid: dict[int, dict[str, str]] = {}

    # Locate the day-number header line (line whose tokens are all integers 1–31)
    day_header_idx = None
    day_numbers: list[int] = []

    for i, line in enumerate(lines):
        tokens = line.split()
        if len(tokens) >= 7:  # at least 7 day numbers expected
            if all(t.isdigit() and 1 <= int(t) <= 31 for t in tokens):
                day_numbers = [int(t) for t in tokens]
                day_header_idx = i
                break

    if day_header_idx is None or not day_numbers:
        log.debug("No day-header row found in block; trying alternate extraction.")
        return grid

    # Read the 6 data rows that follow (In Time … Status)
    data_rows: dict[str, list[str]] = {}  # field_name → [value per day]
    row_cursor = 0  # index into GRID_ROW_LABELS

    for line in lines[day_header_idx + 1:]:
        if row_cursor >= len(GRID_ROW_LABELS):
            break

        # Strip the row label prefix if present
        stripped = line.strip()
        label_matched = False

        for label in GRID_ROW_LABELS:
            pattern = re.compile(re.escape(label), re.IGNORECASE)
            m = pattern.match(stripped)
            if m:
                # Values follow the label on the same line
                remainder = stripped[m.end():].strip()
                values = remainder.split() if remainder else []
                field = ROW_LABEL_MAP[label]
                data_rows[field] = values
                row_cursor += 1
                label_matched = True
                break

        if not label_matched:
            # Could be a continuation value line with no label prefix
            # (some PDFs lay data on a naked line aligned under day cols)
            tokens = stripped.split()
            if tokens and row_cursor < len(GRID_ROW_LABELS):
                field = ROW_LABEL_MAP[GRID_ROW_LABELS[row_cursor]]
                data_rows[field] = tokens
                row_cursor += 1

    # Map values back to day numbers
    for field, values in data_rows.items():
        for idx, day in enumerate(day_numbers):
            val = values[idx] if idx < len(values) else ""
            if day not in grid:
                grid[day] = {}
            grid[day][field] = clean_text(val)

    return grid


# ---------------------------------------------------------------------------
# Table-based extraction (fallback / primary for structured PDFs)
# ---------------------------------------------------------------------------

def parse_grid_from_table(table: list[list[str | None]]) -> tuple[list[int], dict[int, dict[str, str]]]:
    """
    Parse a pdfplumber table that represents the attendance grid.

    Returns (day_numbers, grid_dict).
    """
    grid: dict[int, dict[str, str]] = {}
    day_numbers: list[int] = []

    # Find the row that contains day numbers
    day_row_idx = None
    for i, row in enumerate(table):
        cells = [str(c or "").strip() for c in row]
        numeric = [c for c in cells if c.isdigit() and 1 <= int(c) <= 31]
        if len(numeric) >= 5:
            day_row_idx = i
            # Build day_numbers from all cells after the first label column
            day_numbers = []
            for c in cells:
                if c.isdigit() and 1 <= int(c) <= 31:
                    day_numbers.append(int(c))
            break

    if day_row_idx is None:
        return [], grid

    # Rows after the day header are data rows
    for row in table[day_row_idx + 1:]:
        cells = [clean_text(str(c or "")) for c in row]
        if not cells:
            continue

        # First cell is the row label
        label_raw = cells[0].lower().strip()
        field = None
        for lbl, fname in ROW_LABEL_MAP.items():
            if lbl in label_raw:
                field = fname
                break

        if field is None:
            continue

        # Remaining cells are values aligned to day_numbers
        values = cells[1:]
        for idx, day in enumerate(day_numbers):
            val = values[idx] if idx < len(values) else ""
            if day not in grid:
                grid[day] = {}
            grid[day][field] = val

    return day_numbers, grid


# ---------------------------------------------------------------------------
# Record builder
# ---------------------------------------------------------------------------

def build_records(
    emp_code: str,
    emp_name: str,
    department: str,
    period_start: date,
    grid: dict[int, dict[str, str]],
) -> tuple[list[dict], int]:
    """
    Convert a parsed grid into a list of row-wise attendance records.

    Returns (records, invalid_count).
    """
    records = []
    invalid_count = 0

    for day, fields in sorted(grid.items()):
        in_time  = fields.get("in_time", "")
        out_time = fields.get("out_time", "")

        # Skip rows where both In and Out are zero / blank
        if is_zero_time(in_time) and is_zero_time(out_time):
            log.debug(
                "Skipping emp=%s day=%d – both In/Out are zero (%r / %r)",
                emp_code, day, in_time, out_time,
            )
            invalid_count += 1
            continue

        try:
            record_date = parse_date(day, period_start)
        except ValueError:
            log.warning("Invalid day %d for emp=%s period_start=%s – skipping.", day, emp_code, period_start)
            invalid_count += 1
            continue

        late_minutes    = fields.get("late_minutes", "")
        early_departure = fields.get("early_departure", "")
        work_hours      = fields.get("work_hours", "")
        status_raw      = fields.get("status", "")
        status          = normalise_status(status_raw)

        records.append({
            "emp_code":        emp_code,
            "emp_name":        emp_name,
            "department":      department,
            "date":            record_date.strftime("%Y-%m-%d"),
            "in_time":         in_time,
            "out_time":        out_time,
            "late_minutes":    late_minutes,
            "early_departure": early_departure,
            "work_hours":      work_hours,
            "status":          status,
        })

    return records, invalid_count


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_attendance_pdf(pdf_path: str, output_csv: str = "attendance.csv") -> pd.DataFrame:
    """
    Full pipeline: PDF → structured DataFrame → CSV.

    Parameters
    ----------
    pdf_path   : path to the Secureye ONtime PDF
    output_csv : destination CSV filename

    Returns
    -------
    pd.DataFrame with all attendance records
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    log.info("Opening PDF: %s", pdf_path)

    all_records: list[dict]  = []
    employees_processed: int = 0
    total_invalid: int       = 0
    malformed_log: list[str] = []

    # ------------------------------------------------------------------
    # Strategy: try table-based extraction first (more reliable),
    # fall back to plain-text parsing per page.
    # ------------------------------------------------------------------
    with pdfplumber.open(pdf_path) as pdf:
        full_text_pages = []
        for page_num, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            full_text_pages.append(page_text)

        full_text = "\n".join(full_text_pages)

    # Split into per-employee blocks using plain text
    blocks = split_into_employee_blocks(full_text)
    log.info("Detected %d employee block(s) in PDF.", len(blocks))

    for block_idx, block_text in enumerate(blocks, start=1):
        emp_code, emp_name, department, period_start, period_end = parse_employee_header(block_text)

        if not emp_code:
            log.warning("Block %d: Could not extract emp_code – skipping.", block_idx)
            malformed_log.append(f"Block {block_idx}: missing emp_code")
            continue

        if not period_start:
            log.warning("Emp %s (%s): period not found – defaulting to current month day-1.", emp_code, emp_name)
            today = date.today()
            period_start = date(today.year, today.month, 1)
            malformed_log.append(f"Emp {emp_code}: period not found, used {period_start}")

        log.info(
            "Processing emp_code=%s  name='%s'  dept='%s'  period=%s → %s",
            emp_code, emp_name, department, period_start, period_end,
        )

        # Parse the calendar grid from plain text
        grid = parse_grid_from_text(block_text)

        if not grid:
            log.warning("Emp %s: no grid data found via text extraction – skipping.", emp_code)
            malformed_log.append(f"Emp {emp_code}: empty grid after text extraction")
            continue

        records, invalid_count = build_records(emp_code, emp_name, department, period_start, grid)

        if not records:
            log.warning("Emp %s: no valid records generated.", emp_code)
            malformed_log.append(f"Emp {emp_code}: 0 valid records")

        all_records.extend(records)
        total_invalid += invalid_count
        employees_processed += 1

    # ------------------------------------------------------------------
    # Build DataFrame
    # ------------------------------------------------------------------
    columns = [
        "emp_code", "emp_name", "department", "date",
        "in_time", "out_time", "late_minutes",
        "early_departure", "work_hours", "status",
    ]

    if all_records:
        df = pd.DataFrame(all_records, columns=columns)
    else:
        log.warning("No records extracted. Returning empty DataFrame.")
        df = pd.DataFrame(columns=columns)

    # ------------------------------------------------------------------
    # Save CSV
    # ------------------------------------------------------------------
    df.to_csv(output_csv, index=False)
    log.info("Saved %d records to: %s", len(df), output_csv)

    # ------------------------------------------------------------------
    # Validation log
    # ------------------------------------------------------------------
    if malformed_log:
        log.warning("--- Validation Issues ---")
        for msg in malformed_log:
            log.warning("  [WARN] %s", msg)

    # ------------------------------------------------------------------
    # Summary statistics
    # ------------------------------------------------------------------
    print("\n" + "=" * 55)
    print("  ATTENDANCE PARSING SUMMARY")
    print("=" * 55)
    print(f"  PDF file             : {pdf_path.name}")
    print(f"  Employees processed  : {employees_processed}")
    print(f"  Attendance records   : {len(df)}")
    print(f"  Invalid rows skipped : {total_invalid}")
    print(f"  Malformed warnings   : {len(malformed_log)}")
    print(f"  Output CSV           : {output_csv}")
    if not df.empty:
        print(f"  Date range           : {df['date'].min()}  →  {df['date'].max()}")
        status_counts = df["status"].value_counts().to_dict()
        print(f"  Status breakdown     : {status_counts}")
    print("=" * 55 + "\n")

    return df


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_attendance.py <input.pdf> [output.csv]")
        sys.exit(1)

    pdf_input  = sys.argv[1]
    csv_output = sys.argv[2] if len(sys.argv) > 2 else "attendance.csv"

    try:
        df = parse_attendance_pdf(pdf_input, csv_output)
        sys.exit(0 if not df.empty else 2)
    except FileNotFoundError as exc:
        log.error("%s", exc)
        sys.exit(1)
    except Exception as exc:
        log.exception("Unexpected error: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
