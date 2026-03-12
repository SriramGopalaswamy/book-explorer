"""
Unit tests for parse_attendance.py
Run with:  python -m pytest test_parse_attendance.py -v
"""

import pytest
from datetime import date
from parse_attendance import (
    clean_text,
    normalise_status,
    is_zero_time,
    parse_period_date,
    parse_employee_header,
    parse_grid_from_text,
    build_records,
    split_into_employee_blocks,
)


# ---------------------------------------------------------------------------
# clean_text
# ---------------------------------------------------------------------------

class TestCleanText:
    def test_removes_corrupt_unicode(self):
        assert clean_text("P/WO\ufffd") == "P/WO"
        assert clean_text("P/WO￾") == "P/WO"

    def test_strips_whitespace(self):
        assert clean_text("  hello  ") == "hello"

    def test_plain_ascii_unchanged(self):
        assert clean_text("09:00") == "09:00"


# ---------------------------------------------------------------------------
# normalise_status
# ---------------------------------------------------------------------------

class TestNormaliseStatus:
    def test_p_wo_normalised(self):
        assert normalise_status("P/WO") == "P"

    def test_p_wo_with_corrupt_char(self):
        assert normalise_status("P/WO\ufffd") == "P"

    def test_wo_i_normalised(self):
        assert normalise_status("WO-I") == "WO"

    def test_mis_normalised(self):
        assert normalise_status("MIS") == "MISSING"

    def test_present_unchanged(self):
        assert normalise_status("P") == "P"

    def test_absent_unchanged(self):
        assert normalise_status("A") == "A"

    def test_wo_unchanged(self):
        assert normalise_status("WO") == "WO"

    def test_case_insensitive(self):
        assert normalise_status("p/wo") == "P"
        assert normalise_status("mis") == "MISSING"


# ---------------------------------------------------------------------------
# is_zero_time
# ---------------------------------------------------------------------------

class TestIsZeroTime:
    @pytest.mark.parametrize("val", ["", "0", "00:00", "-", "0:00", "N/A", "NA"])
    def test_zero_values(self, val):
        assert is_zero_time(val) is True

    @pytest.mark.parametrize("val", ["09:00", "18:30", "8:05"])
    def test_real_times(self, val):
        assert is_zero_time(val) is False


# ---------------------------------------------------------------------------
# parse_period_date
# ---------------------------------------------------------------------------

class TestParsePeriodDate:
    def test_dd_mm_yyyy(self):
        assert parse_period_date("01/03/2024") == date(2024, 3, 1)

    def test_dd_mm_yy(self):
        assert parse_period_date("01/03/24") == date(2024, 3, 1)

    def test_dash_separator(self):
        assert parse_period_date("01-03-2024") == date(2024, 3, 1)

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            parse_period_date("not-a-date")


# ---------------------------------------------------------------------------
# parse_employee_header
# ---------------------------------------------------------------------------

SAMPLE_HEADER = """
Emp Code : 1042
Emp Name : Rajesh Kumar
Department : Operations
Period : 01/03/2024 to 31/03/2024
"""

class TestParseEmployeeHeader:
    def test_extracts_emp_code(self):
        code, *_ = parse_employee_header(SAMPLE_HEADER)
        assert code == "1042"

    def test_extracts_emp_name(self):
        _, name, *_ = parse_employee_header(SAMPLE_HEADER)
        assert name == "Rajesh Kumar"

    def test_extracts_department(self):
        _, _, dept, *_ = parse_employee_header(SAMPLE_HEADER)
        assert dept == "Operations"

    def test_extracts_period(self):
        _, _, _, start, end = parse_employee_header(SAMPLE_HEADER)
        assert start == date(2024, 3, 1)
        assert end   == date(2024, 3, 31)

    def test_missing_fields_return_empty(self):
        code, name, dept, start, end = parse_employee_header("nothing here")
        assert code == ""
        assert start is None


# ---------------------------------------------------------------------------
# split_into_employee_blocks
# ---------------------------------------------------------------------------

MULTI_EMP_TEXT = """
Emp Code : 101
Emp Name : Alice
Department : HR
Period : 01/03/2024 to 28/03/2024

1  2  3
In Time 09:00 09:05 09:10
Out Time 18:00 18:00 18:00
Late Mins 0 5 10
Early Dep 0 0 0
Work Hrs 9:00 8:55 8:50
Status P P P

Emp Code : 102
Emp Name : Bob
Department : IT
Period : 01/03/2024 to 28/03/2024

1  2  3
In Time 10:00 10:00 0
Out Time 19:00 19:00 0
Late Mins 60 60 0
Early Dep 0 0 0
Work Hrs 9:00 9:00 0
Status P P A
"""

class TestSplitIntoEmployeeBlocks:
    def test_splits_two_employees(self):
        blocks = split_into_employee_blocks(MULTI_EMP_TEXT)
        assert len(blocks) == 2

    def test_each_block_has_emp_code(self):
        import re
        blocks = split_into_employee_blocks(MULTI_EMP_TEXT)
        for b in blocks:
            assert re.search(r"Emp\s*Code", b, re.IGNORECASE)


# ---------------------------------------------------------------------------
# parse_grid_from_text
# ---------------------------------------------------------------------------

GRID_BLOCK = """
1  2  3
In Time   09:00 09:05 09:10
Out Time  18:00 18:00 18:00
Late Mins 0 5 10
Early Dep 0 0 0
Work Hrs  9:00 8:55 8:50
Status    P P/WO A
"""

class TestParseGridFromText:
    def test_day_keys_present(self):
        grid = parse_grid_from_text(GRID_BLOCK)
        assert 1 in grid and 2 in grid and 3 in grid

    def test_in_time_extracted(self):
        grid = parse_grid_from_text(GRID_BLOCK)
        assert grid[1]["in_time"] == "09:00"
        assert grid[2]["in_time"] == "09:05"

    def test_status_extracted(self):
        grid = parse_grid_from_text(GRID_BLOCK)
        assert grid[1]["status"] == "P"

    def test_empty_block_returns_empty_dict(self):
        assert parse_grid_from_text("no grid here") == {}


# ---------------------------------------------------------------------------
# build_records
# ---------------------------------------------------------------------------

SAMPLE_GRID = {
    1: {"in_time": "09:00", "out_time": "18:00", "late_minutes": "0",
        "early_departure": "0", "work_hours": "9:00", "status": "P"},
    2: {"in_time": "0",     "out_time": "0",     "late_minutes": "0",
        "early_departure": "0", "work_hours": "0",    "status": "WO"},
    3: {"in_time": "09:30", "out_time": "18:00", "late_minutes": "30",
        "early_departure": "0", "work_hours": "8:30", "status": "P/WO"},
}

class TestBuildRecords:
    def test_skips_both_zero_times(self):
        records, invalid = build_records("101", "Alice", "HR", date(2024, 3, 1), SAMPLE_GRID)
        assert invalid == 1   # day 2 skipped

    def test_record_count(self):
        records, _ = build_records("101", "Alice", "HR", date(2024, 3, 1), SAMPLE_GRID)
        assert len(records) == 2  # day 1 and day 3

    def test_date_formatted_correctly(self):
        records, _ = build_records("101", "Alice", "HR", date(2024, 3, 1), SAMPLE_GRID)
        assert records[0]["date"] == "2024-03-01"
        assert records[1]["date"] == "2024-03-03"

    def test_status_normalised_in_record(self):
        records, _ = build_records("101", "Alice", "HR", date(2024, 3, 1), SAMPLE_GRID)
        # day 3 has status P/WO → should become "P"
        day3_record = next(r for r in records if r["date"] == "2024-03-03")
        assert day3_record["status"] == "P"

    def test_emp_fields_propagated(self):
        records, _ = build_records("101", "Alice", "HR", date(2024, 3, 1), SAMPLE_GRID)
        assert all(r["emp_code"] == "101" for r in records)
        assert all(r["emp_name"] == "Alice" for r in records)
        assert all(r["department"] == "HR" for r in records)
