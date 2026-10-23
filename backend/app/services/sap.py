"""SAP data processing.

1. Read the SAP export (tab named like "SAP DATA", else the first sheet).
2. Add Month (from the fiscal period in Year/month: period 1 = April).
3. Add descriptions from the description masters:
     Offst.acct -> Offst.acct Desc, Account -> Account Description, Cost Ctr -> CC Description,
     Order -> Order Desc, Material -> Material desc.
4. Fill Department by the D1 rules in RULES order. A row is filled by the first rule that
   matches; later rules only see rows that are still blank.
5. Write the columns in LAYOUT order (the REDIFINED DATA sheet), dates as dd-mm-yyyy without a time.
"""
import io
import re
from collections import Counter, defaultdict
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from ..db import master_repo
from ..domain.masters import MASTERS, norm_header
from . import sap_ai
from .excel import cell_text

# SAP columns used for lookups: key -> accepted header spellings.
SAP_FIELDS = {
    "offst": ["Offst.acct", "Offset account", "Offsetting account"],
    "account": ["Account", "G/L Account", "GL Account"],
    "costctr": ["Cost Ctr", "Cost Center", "Cost Centre"],
    "order": ["Order", "Internal Order", "IO"],
    "material": ["Material"],
    "assignment": ["Assignment"],
    "period": ["Year/month", "Period", "Fiscal period"],
    "amount": ["Amount in local cur.", "Amount in LC", "Amount"],
}

# Description columns added next to their key column.
DESCRIPTIONS = [  # (sap field, new column header, master type)
    ("offst", "Offst.acct Desc", "offsetting"),
    ("account", "Account Description", "account"),
    ("account", "P&L Group", "pl_group"),
    ("costctr", "CC Description", "costcenter"),
    ("order", "Order Desc", "order"),
    ("material", "Material desc", "material"),
]

# Department rules, applied one after another.
# (label, master type, SAP fields tried in order, master key column, master department column)
RULES = [
    ("D1 Fixed Expenses based Account", "d1_fixed", ["account"], "account", "department"),
    ("D1 Salary based on Order", "d1_salary", ["order"], "order", "department"),
    ("D1 Wages based on Cost Center", "d1_wages", ["costctr"], "cost_center", "department"),
    ("D1 Consulting based on Offsetting Account", "d1_consulting", ["offst"], "offset_acct", "department"),
    ("D1 Consumable", "d1_consumable", ["costctr"], "cost_ctr", "department"),
    ("D1 Field Employees", "d1_field", ["offst"], "emp_code", "dept_region"),
    # Columns come from the uploaded sheet: first column = employee ID, department = first column named like "dept".
    ("D1 ESI & PF", "d1_esi_pf", ["assignment"], None, None),
    ("D1 Emp ID", "d1_emp_id", ["offst", "assignment"], "emp_id", "revised_dept"),
]

FIELD_LABEL = {"offst": "Offst.acct", "account": "Account", "costctr": "Cost Ctr", "order": "Order",
               "material": "Material", "assignment": "Assignment"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Output columns and their order, exactly as the REDIFINED DATA sheet of the expense report.
# Other SAP columns (Vendor, Reference, ...) are left out.
LAYOUT = ["Month", "Offst.acct", "Offst.acct Desc", "Account", "Account Description", "P&L Group",
          "Cost Ctr", "CC Description", "Order", "Order Desc", "DocumentNo", "Material", "Material desc",
          "Doc. Date", "Pstng Date", "Plnt", "BusA", "Type", "PK", "Profit Ctr", "Assignment",
          "Year/month", "Amount in local cur.", "Text", "Department"]
LAYOUT_FIELD = {"Offst.acct": "offst", "Account": "account", "Cost Ctr": "costctr", "Order": "order",
                "Material": "material", "Assignment": "assignment", "Year/month": "period",
                "Amount in local cur.": "amount"}

DATE_TEXT = re.compile(r"(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})")  # dd-mm-yyyy, dd.mm.yyyy
ISO_TEXT = re.compile(r"(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00(?::00)?)?")


def code(v) -> str:
    """Normalise a code for lookups: '0000500458', 500458.0 and '500458' all become '500458'."""
    s = cell_text(v)
    if s.isdigit():
        s = s.lstrip("0") or "0"
    return s.upper()


def fiscal_month(v) -> date | None:
    """Year/month holds the fiscal year and period (period 1 = April).

    Accepts a date whose month is the period (as Excel/Sheets stores 2026/06),
    or text such as 2026/06, 06.2026, 2026-06, 202606.
    """
    if v is None or v == "":
        return None
    if isinstance(v, (datetime, date)):
        fy, p = v.year, v.month
    else:
        s = str(v).strip()
        m = re.fullmatch(r"(\d{4})\s*[/.\-]\s*(\d{1,2})", s) or re.fullmatch(r"(\d{4})(\d{2})", s)
        if m:
            fy, p = int(m[1]), int(m[2])
        else:
            m = re.fullmatch(r"(\d{1,2})\s*[/.\-]\s*(\d{4})", s)
            if not m:
                return None
            p, fy = int(m[1]), int(m[2])
    if not 1 <= p <= 16:
        return None
    p = min(p, 12)  # special periods 13-16 belong to March
    month = (p + 2) % 12 + 1  # 1 -> Apr ... 9 -> Dec, 10 -> Jan
    return date(fy + (1 if p >= 10 else 0), month, 1)


def to_number(v):
    """Amounts arrive as numbers or text like '-1,61,925.00'."""
    if isinstance(v, (int, float)) or v is None:
        return v
    s = str(v).strip().replace(",", "")
    neg = s.endswith("-")  # SAP style trailing minus: 1,234.00-
    s = s.rstrip("-")
    try:
        n = float(s)
    except ValueError:
        return v
    return -n if neg else n


def day_first_swapped(values) -> bool:
    """True when a date column's real dates were read month-first.

    SAP exports dates as dd-mm-yyyy text. Excel or Sheets turns the ones with a day of 12 or
    less into real dates with day and month swapped (12-10-2026 becomes 10 Dec), and leaves the
    rest (13-10-2026) as text. That mix, with no real date past the 12th, is the sign.
    """
    has_text = any(isinstance(v, str) and DATE_TEXT.fullmatch(v.strip()) for v in values)
    dates = [v for v in values if isinstance(v, (datetime, date))]
    return has_text and bool(dates) and all(v.day <= 12 for v in dates)


def to_date(v, swapped: bool = False):
    """Turn a date cell (real date or dd-mm-yyyy text) into a date without a time part."""
    if isinstance(v, (datetime, date)):
        d = v.date() if isinstance(v, datetime) else v
        return date(d.year, d.day, d.month) if swapped else d
    if isinstance(v, str):
        s = v.strip()
        try:
            if m := DATE_TEXT.fullmatch(s):
                return date(int(m[3]), int(m[2]), int(m[1]))
            if m := ISO_TEXT.fullmatch(s):
                return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            pass
    return v


# ---------- lookups from the masters ----------

def _description_maps():
    out = {}
    for _, _, t in DESCRIPTIONS:
        m = MASTERS[t]
        out[t] = {code(r["code"]): r.get("description", "") for r in master_repo.all_rows(m) if _usable(r.get("description"))}
    return out


def _usable(desc) -> bool:
    """A description of 0 or a formula error (#N/A) counts as missing, so the code is reported."""
    s = str(desc or "").strip()
    return bool(s) and s != "0" and not s.startswith("#")


def _rule_maps():
    """For each rule: {code: department}. Where a code repeats in a D1 sheet, the first row wins."""
    maps, notes = [], []
    for label, t, fields, key, dept in RULES:
        m = MASTERS[t]
        cols = master_repo.columns_for(m)
        if key is None:  # dynamic columns (ESI & PF)
            dept_col = next((c.key for c in cols if "dept" in c.key or "department" in c.label.lower()), None)
            key = cols[0].key if cols else None
            dept = dept_col
        lookup, conflicts = {}, 0
        if key and dept:
            for r in master_repo.all_rows(m):
                k, d = code(r.get(key)), (r.get(dept) or "").strip()
                if not k or not d:
                    continue
                if k in lookup:
                    conflicts += lookup[k] != d
                    continue
                lookup[k] = d
        elif cols or master_repo.stats().get(t):
            notes.append(f"{label}: no department column found, step skipped")
        maps.append(lookup)
        if conflicts:
            notes.append(f"{label}: {conflicts} code(s) listed with more than one department; the first row is used")
    return maps, notes


# ---------- reading the SAP file ----------

def _find_sap_sheet(wb):
    return next((n for n in wb.sheetnames if re.search(r"sap\s*data", n, re.I)), wb.sheetnames[0])


def _read(data: bytes):
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as e:
        raise ValueError(f"Could not read the Excel file ({e.__class__.__name__}). Please upload a .xlsx file.") from e
    try:
        sheet = _find_sap_sheet(wb)
        rows = [list(r) for r in wb[sheet].iter_rows(values_only=True)]
    finally:
        wb.close()
    # Header row: the first row (within 10) that names Account and at least one other SAP key column.
    wanted = {k: {norm_header(a) for a in v} for k, v in SAP_FIELDS.items()}
    for h, row in enumerate(rows[:10]):
        heads = [norm_header(v) for v in row]
        found = {k: heads.index(n) for k, names in wanted.items() for n in names if n in heads}
        if "account" in found and len(found) >= 3:
            break
    else:
        raise ValueError(f'Sheet "{sheet.strip()}" has no SAP header row (expected columns such as Offst.acct, Account, Cost Ctr, Order).')
    header = [cell_text(v) for v in rows[h]]
    body = [r for r in rows[h + 1:] if any(v not in (None, "") for v in r)]
    # Drop trailing columns with neither a header nor data.
    last_used = lambda row: max((i + 1 for i, v in enumerate(row) if v not in (None, "")), default=0)
    width = max([last_used(header)] + [last_used(r) for r in body])
    header = (header + [""] * width)[:width]
    body = [(list(r) + [None] * width)[:width] for r in body]
    return sheet.strip(), header, body, found


# ---------- processing ----------

def process(data: bytes, file_name: str = ""):
    sheet, header, body, f = _read(data)
    desc_maps = _description_maps()
    rule_maps, notes = _rule_maps()

    # Output layout: the LAYOUT columns only. A description already present in the file is
    # copied, not looked up; a SAP column missing from the file stays blank.
    by_name = {}
    for i, h in enumerate(header):
        by_name.setdefault(norm_header(h), i)
    desc_for = {title: (k, t) for k, title, t in DESCRIPTIONS}
    out_header, plan = list(LAYOUT), []  # plan: ("src", i) | ("desc", key_i, master) | (kind,)
    for name in LAYOUT:
        if name == "Month":
            plan.append(("month",))
        elif name == "Department":
            plan.append(("dept",))
        elif name in desc_for and norm_header(name) not in by_name:
            k, t = desc_for[name]
            plan.append(("desc", f[k], t) if k in f else ("blank",))
        else:
            i = f.get(LAYOUT_FIELD[name]) if name in LAYOUT_FIELD else by_name.get(norm_header(name))
            plan.append(("src", i) if i is not None else ("blank",))

    # Date columns (Doc. Date, Pstng Date, ...): real dates, day/month fixed where they were swapped.
    date_cols = {i: day_first_swapped([r[i] for r in body])
                 for i, h in enumerate(header) if norm_header(h).endswith("date")}

    step_counts = Counter()
    desc_stats = {t: {"matched": 0, "missing": Counter(), "blank": 0} for _, _, t in DESCRIPTIONS}
    unmatched_accounts = Counter()
    out_rows = []
    amount_i, period_i = f.get("amount"), f.get("period")

    for r in body:
        dept = None
        for (label, _, fields, _, _), lookup in zip(RULES, rule_maps):
            for fld in fields:
                if fld in f:
                    k = code(r[f[fld]])
                    if k and k in lookup:
                        dept = lookup[k]
                        break
            if dept:
                step_counts[label] += 1
                break
        if not dept:
            unmatched_accounts[cell_text(r[f["account"]]) or "(blank)"] += 1

        rec = []
        for p in plan:
            if p[0] == "month":
                rec.append(fiscal_month(r[period_i]) if period_i is not None else None)
            elif p[0] == "dept":
                rec.append(dept)
            elif p[0] == "blank":
                rec.append(None)
            elif p[0] == "src":
                v = r[p[1]]
                if p[1] == amount_i:
                    v = to_number(v)
                elif p[1] in date_cols:
                    v = to_date(v, date_cols[p[1]])
                elif p[1] == period_i and isinstance(v, datetime):
                    v = v.date()  # fiscal year/period, shown as yyyy/mm
                rec.append(v)
            else:
                k = code(r[p[1]])
                st = desc_stats[p[2]]
                if not k:
                    st["blank"] += 1
                    rec.append(None)
                elif k in desc_maps[p[2]]:
                    st["matched"] += 1
                    rec.append(desc_maps[p[2]][k] or None)
                else:
                    st["missing"][cell_text(r[p[1]])] += 1
                    rec.append(None)
        out_rows.append(rec)

    # AI department check: three extra columns after Department (the D1 result is not changed)
    known_depts = {d for lookup in rule_maps for d in lookup.values()}
    out_header, out_rows, ai_info = sap_ai.add_columns(out_header, out_rows, known_depts)
    if ai_info and ai_info.get("note"):
        notes.append(ai_info["note"])

    # ---------- summary ----------
    total = len(out_rows)
    remaining, steps = total, []
    for (label, t, fields, _, _), lookup in zip(RULES, rule_maps):
        n = step_counts[label]
        remaining -= n
        steps.append({
            "label": label, "master": t, "matchOn": " / ".join(FIELD_LABEL[x] for x in fields),
            "masterRows": len(lookup), "filled": n, "remaining": remaining,
            "skipped": not lookup,
        })
    acc_desc = desc_maps["account"]
    summary = {
        "fileName": file_name, "sheet": sheet, "rows": total,
        "filled": total - remaining, "unfilled": remaining,
        "steps": steps,
        "descriptions": [{
            "column": title, "master": t, "label": MASTERS[t].label, "keyColumn": FIELD_LABEL[k],
            "present": k in f,
            "matched": desc_stats[t]["matched"], "blank": desc_stats[t]["blank"],
            "missingRows": sum(desc_stats[t]["missing"].values()),
            "missingCodes": [{"code": c, "rows": n} for c, n in desc_stats[t]["missing"].most_common(50)],
            "missingCodeCount": len(desc_stats[t]["missing"]),
        } for k, title, t in DESCRIPTIONS],
        "unmatchedAccounts": [{"account": a, "description": acc_desc.get(code(a), ""), "rows": n}
                              for a, n in unmatched_accounts.most_common(30)],
        "notes": notes + ([f"No {FIELD_LABEL[k]} column in the file" for k in ("offst", "costctr", "order", "material") if k not in f]),
        "header": out_header,
        "ai": ai_info,
    }
    return summary, out_header, out_rows


def _date_formats(out_header):
    """Per column: (Excel number format, strftime pattern) for date values."""
    fmts = []
    for h in out_header:
        n = norm_header(h)
        if h == "Month":
            fmts.append(("mmm-yy", None))
        elif n in {norm_header(a) for a in SAP_FIELDS["period"]}:
            fmts.append(("yyyy/mm", "%Y/%m"))
        else:
            fmts.append(("dd-mm-yyyy", "%d-%m-%Y"))
    return fmts


def preview(out_header, out_rows, limit=100):
    fmts = _date_formats(out_header)

    def show(v, j):
        if isinstance(v, (datetime, date)):
            if fmts[j][1] is None:  # the Month column
                return f"{MONTHS[v.month - 1]}-{v.year % 100:02d}"
            return v.strftime(fmts[j][1])
        return cell_text(v)
    dep = out_header.index("Department")
    pick = lambda rows: [[show(v, j) for j, v in enumerate(r)] for r in rows[:limit]]
    out = {"all": pick(out_rows), "unfilled": pick([r for r in out_rows if not r[dep]])}
    if sap_ai.FLAG in out_header:
        fl = out_header.index(sap_ai.FLAG)
        for key, name in (("review", "REVIEW"), ("watch", "WATCH")):
            out[key] = pick([r for r in out_rows if r[fl] == name])
    return out


def build_output(summary, out_header, out_rows) -> bytes:
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("REDEFINED DATA")
    ws.freeze_panes = "A2"
    bold, fill = Font(bold=True), PatternFill("solid", fgColor="DDE6F3")
    added = {"Month", "Department", *(d[1] for d in DESCRIPTIONS), *sap_ai.column_names()}
    flag_fill = {"REVIEW": PatternFill("solid", fgColor="F8CBAD"), "WATCH": PatternFill("solid", fgColor="FFF2CC"),
                 "NO_DEPT": PatternFill("solid", fgColor="D9D9D9")}
    ai_cols = {out_header.index(c) for c in sap_ai.column_names() if c in out_header}
    flag_i = out_header.index(sap_ai.FLAG) if sap_ai.FLAG in out_header else None
    added_fill = PatternFill("solid", fgColor="FCE9C6")
    fmts = _date_formats(out_header)
    hdr = []
    for h in out_header:
        c = WriteOnlyCell(ws, value=h)
        c.font, c.fill = bold, (added_fill if h in added else fill)
        hdr.append(c)
    ws.append(hdr)
    for r in out_rows:
        row = []
        mark = flag_fill.get(r[flag_i]) if flag_i is not None else None  # REVIEW / WATCH / NO_DEPT rows
        for i, v in enumerate(r):
            if i in ai_cols and mark and v is not None:
                c = WriteOnlyCell(ws, value=v)
                c.fill = mark
                row.append(c)
            elif isinstance(v, (datetime, date)):
                c = WriteOnlyCell(ws, value=v)
                c.number_format = fmts[i][0]  # no 0:00:00 time part
                row.append(c)
            elif isinstance(v, str) and v.isdigit() and len(v) < 16:
                row.append(int(v))  # keep codes numeric so Excel lookups work
            else:
                row.append(v)
        ws.append(row)
    if flag_i is not None:  # filter buttons on the header, e.g. AI Flag = REVIEW
        ws.auto_filter.ref = f"A1:{get_column_letter(len(out_header))}{len(out_rows) + 1}"

    s = wb.create_sheet("Summary")
    s.append([WriteOnlyCell(s, value="Department fill steps")])
    s.append(["Step", "D1 master", "Matched on", "Rows filled", "Rows still blank"])
    for i, st in enumerate(summary["steps"], 1):
        s.append([i, st["label"], st["matchOn"], st["filled"], st["remaining"]])
    s.append([])
    s.append(["Total rows", summary["rows"]])
    s.append(["Department filled", summary["filled"]])
    s.append(["Department blank", summary["unfilled"]])
    s.append([])
    s.append(["Descriptions", "Master", "Matched rows", "Code not in master (rows)", "Distinct missing codes"])
    for d in summary["descriptions"]:
        s.append([d["column"], d["label"], d["matched"], d["missingRows"], d["missingCodeCount"]])
    if summary["unmatchedAccounts"]:
        s.append([])
        s.append(["Accounts with no department", "Description", "Rows"])
        for a in summary["unmatchedAccounts"]:
            s.append([a["account"], a["description"], a["rows"]])
    ai = summary.get("ai")
    if ai and ai.get("enabled"):
        m = ai.get("model") or {}
        s.append([])
        s.append([WriteOnlyCell(s, value="AI department check")])
        s.append(["Model trained on", m.get("trainedOn"), f"{m.get('lines', 0):,} lines"])
        s.append(["REVIEW when confidence is at least", ai["reviewConf"], "WATCH from", ai["watchConf"]])
        s.append(["AI Flag", "Rows", "% of rows"])
        for f in ("REVIEW", "WATCH", "NO_DEPT", "OK"):
            n = ai["counts"].get(f, 0)
            s.append([f, n, round(n / max(summary["rows"], 1), 4)])
        if ai["pairs"]:
            s.append([])
            s.append(["REVIEW: assigned department", "AI suggested department", "Rows"])
            for p in ai["pairs"]:
                s.append([p["assigned"], p["suggested"], p["rows"]])
        s.append([])
        s.append(["By assigned department", "Rows", "REVIEW", "WATCH"])
        for d in ai["byDept"]:
            s.append([d["department"], d["rows"], d["review"], d["watch"]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
