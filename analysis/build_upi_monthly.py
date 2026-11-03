#!/usr/bin/env python3
"""Audit NPCI UPI workbooks and build data/processed/upi_monthly.csv.

Uses only the Python standard library. Raw files are opened read-only and never
modified. Run from any directory with: python analysis/build_upi_monthly.py
"""

from __future__ import annotations

import csv
import hashlib
import re
import sys
import zipfile
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from xml.etree import ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
RAW = PROJECT / "data" / "raw"
OUTPUT = PROJECT / "data" / "processed" / "upi_monthly.csv"
REPORT = PROJECT / "outputs" / "data_quality_report.txt"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = ["Month", "No. of Banks live on UPI", "Volume (In Mn.)", "Value (In Cr.)"]
OUT_HEADERS = ["month", "banks_live", "volume_million", "value_crore"]


def xml_root(book: zipfile.ZipFile, member: str) -> ET.Element:
    return ET.fromstring(book.read(member))


def cell_text(cell: ET.Element) -> str:
    value = cell.find("m:v", NS)
    if value is not None:
        return (value.text or "").strip()
    inline = cell.find("m:is/m:t", NS)
    return (inline.text or "").strip() if inline is not None else ""


def parse_number(raw: str, field: str, source: str, issues: list[str]) -> Decimal | None:
    value = raw.strip()
    if not value:
        issues.append(f"Nonnumeric/blank {field}: {source}")
        return None
    cleaned = value.replace(",", "")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        issues.append(f"Nonnumeric {field} {value!r}: {source}")
        return None


def valid_indian_grouping(raw: str) -> bool:
    integer = raw.strip().split(".", 1)[0]
    if "," not in integer:
        return True
    return bool(re.fullmatch(r"\d{1,3}(?:,\d{2})*,\d{3}", integer))


def read_workbook(path: Path, issues: list[str]) -> tuple[list[dict], dict]:
    with zipfile.ZipFile(path) as book:
        workbook = xml_root(book, "xl/workbook.xml")
        sheets = [node.attrib["name"] for node in workbook.findall("m:sheets/m:sheet", NS)]
        sheet = xml_root(book, "xl/worksheets/sheet1.xml")
        rows = sheet.findall("m:sheetData/m:row", NS)
        matrix = [[cell_text(c) for c in row.findall("m:c", NS)] for row in rows]

    metadata = {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "sheets": sheets,
        "headers": matrix[0] if matrix else [],
        "records": max(0, len(matrix) - 1),
    }
    if metadata["headers"] != HEADERS:
        issues.append(f"Unexpected headers in {path.name}: {metadata['headers']}")

    records = []
    for row_number, row in enumerate(matrix[1:], start=2):
        source = f"{path.name}, Product Statistics row {row_number}"
        if len(row) != 4:
            issues.append(f"Unexpected column count ({len(row)}): {source}")
            continue
        try:
            month = datetime.strptime(row[0].strip(), "%B-%Y").strftime("%Y-%m")
        except ValueError:
            issues.append(f"Unparseable month {row[0]!r}: {source}")
            continue
        banks = parse_number(row[1], "banks_live", source, issues)
        volume = parse_number(row[2], "volume_million", source, issues)
        value = parse_number(row[3], "value_crore", source, issues)
        for field, raw in (("volume_million", row[2]), ("value_crore", row[3])):
            if not valid_indian_grouping(raw):
                issues.append(f"Malformed comma grouping in {field} {raw!r}: {source}")
        if None in (banks, volume, value):
            continue
        records.append({
            "month": month,
            "banks_live": int(banks),
            "volume_million": volume,
            "value_crore": value,
            "source": source,
            "raw": row,
        })
    return records, metadata


def month_range(first: str, last: str) -> list[str]:
    y, m = map(int, first.split("-"))
    end_y, end_m = map(int, last.split("-"))
    result = []
    while (y, m) <= (end_y, end_m):
        result.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return result


def decimal_text(value: Decimal) -> str:
    return format(value, "f")


def main() -> int:
    issues: list[str] = []
    all_records: list[dict] = []
    inventory: list[dict] = []
    files = sorted(RAW.glob("*.xlsx"))
    if not files:
        print(f"No XLSX files found in {RAW}", file=sys.stderr)
        return 1

    for path in files:
        records, metadata = read_workbook(path, issues)
        all_records.extend(records)
        inventory.append(metadata)

    exact_seen = set()
    unique_records = []
    exact_duplicates = []
    for record in all_records:
        key = tuple(record[col] for col in OUT_HEADERS)
        if key in exact_seen:
            exact_duplicates.append(record)
        else:
            exact_seen.add(key)
            unique_records.append(record)

    by_month: dict[str, list[dict]] = defaultdict(list)
    for record in unique_records:
        by_month[record["month"]].append(record)
    conflicts = {month: rows for month, rows in by_month.items() if len(rows) > 1}
    if conflicts:
        for month, rows in conflicts.items():
            issues.append(f"Conflicting records for {month}: " + "; ".join(r["source"] for r in rows))

    clean = sorted((rows[0] for rows in by_month.values() if len(rows) == 1), key=lambda r: r["month"])
    missing = sorted(set(month_range(clean[0]["month"], clean[-1]["month"])) - set(by_month)) if clean else []
    nonpositive = [r for r in clean if r["banks_live"] <= 0 or r["volume_million"] <= 0 or r["value_crore"] <= 0]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUT_HEADERS)
        writer.writeheader()
        for row in clean:
            writer.writerow({
                "month": row["month"],
                "banks_live": row["banks_live"],
                "volume_million": decimal_text(row["volume_million"]),
                "value_crore": decimal_text(row["value_crore"]),
            })

    notes_path = RAW / "source_notes.txt"
    notes = notes_path.read_text(encoding="utf-8").strip() if notes_path.exists() else "Not found"
    checks = [clean[0], clean[len(clean) // 2], clean[-1]] if clean else []
    report = [
        "NPCI UPI monthly data audit",
        "===========================",
        f"Raw workbooks: {len(files)}",
        f"Covered period: {clean[0]['month']} to {clean[-1]['month']}" if clean else "Covered period: none",
        f"Monthly observations written: {len(clean)}",
        f"Exact duplicate records removed: {len(exact_duplicates)}",
        f"Conflicting months excluded: {len(conflicts)}",
        f"Missing months: {', '.join(missing) if missing else 'none'}",
        f"Nonnumeric values: {sum('Nonnumeric' in issue for issue in issues)}",
        f"Nonpositive totals: {len(nonpositive)}",
        "",
        "Workbook inventory",
        "------------------",
    ]
    for item in inventory:
        report.append(f"{item['file']}: sheets={item['sheets']}; rows={item['records']}; headers={item['headers']}; sha256={item['sha256']}")
    report += ["", "Issues and inconsistencies", "--------------------------"]
    report += issues or ["none"]
    report += ["", "Source notes", "------------", notes, "", "Cleaned-row verification", "------------------------"]
    for row in checks:
        report.append(f"{row['source']}: raw={row['raw']} -> cleaned={[row[c] for c in OUT_HEADERS]}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))
    return 2 if conflicts else 0


if __name__ == "__main__":
    raise SystemExit(main())
