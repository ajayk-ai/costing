"""Master data definitions.

Two kinds of master:
  * keyed  - one row per code (description masters). Upload "merge" updates rows by code.
  * rows   - mapping tables (D1 sheets) where the first column repeats, e.g. one Order
             under two Business Areas. Every distinct row is kept; exact duplicates are dropped.

`sheet` is a regex matched against tab names in the full expense-report workbook.
Column `aliases` are accepted header spellings (compared ignoring case, spaces and punctuation).
"""
import re
from dataclasses import dataclass, field


@dataclass
class Column:
    key: str
    label: str
    aliases: list[str] = field(default_factory=list)


@dataclass
class Master:
    type: str
    label: str
    group: str
    sheet: re.Pattern
    columns: list[Column] | None  # None = taken from the uploaded file's header row
    keyed: bool = False


def col(key, label, *aliases):
    return Column(key, label, [label, *aliases])


DESC = "Description Masters"
D1 = "D1 Department Mapping"
F1 = "F1 Mapping"

MASTERS: dict[str, Master] = {m.type: m for m in [
    Master("material", "Material Description", DESC, re.compile(r"material\s*desc", re.I),
           [col("code", "Material", "material code", "material no", "material number"),
            col("description", "Material Description", "material desc", "description")], keyed=True),
    Master("offsetting", "Offsetting Description", DESC, re.compile(r"offset\w*\s*desc", re.I),
           [col("code", "Offsetting Account", "offst.acct", "offset account", "offsetting"),
            col("description", "Offsetting Description", "offst.acct desc", "offset description", "description")], keyed=True),
    Master("order", "Order Description", DESC, re.compile(r"order\s*desc", re.I),
           [col("code", "Order (IO)", "io", "order", "internal order", "order no"),
            col("description", "Order Description", "io description", "io desc", "description")], keyed=True),
    Master("costcenter", "Cost Center Description", DESC, re.compile(r"cost\s*cent\w*\s*desc", re.I),
           [col("code", "Cost Center", "cost ctr", "cost centre", "cc"),
            col("description", "Cost Center Description", "cc description", "cc desc", "cost centre description", "description")], keyed=True),
    Master("account", "Account Description", DESC, re.compile(r"^\s*account\s*desc", re.I),
           [col("code", "Account Number", "account", "account no", "gl account"),
            col("description", "Account Description", "account desc", "description")], keyed=True),
    # Learned from the finished report: every row carries Account and its P&L Group.
    Master("pl_group", "P&L Group", DESC, re.compile(r"department\w*\s*expense\s*report", re.I),
           [col("code", "Account", "account number", "account no", "gl account"),
            col("description", "P&L Group", "pl group", "p and l group")], keyed=True),

    Master("d1_fixed", "D1 Fixed Expenses based Account", D1, re.compile(r"D1\s*Fixed", re.I),
           [col("account", "Account", "account number"),
            col("account_desc", "Account Description", "account desc"),
            col("department", "Department", "dept")]),
    Master("d1_salary", "D1 Salary based on Order", D1, re.compile(r"D1\s*Salary", re.I),
           [col("order", "Order", "io"),
            col("bus_area", "Bus. Area", "business area"),
            col("order_desc", "Order Desc.", "order description"),
            col("department", "Department", "dept")]),
    Master("d1_wages", "D1 Wages based on Cost Center", D1, re.compile(r"D1\s*Wages", re.I),
           [col("cost_center", "Cost Center", "cost ctr", "cost centre"),
            col("description", "Description", "cc description"),
            col("department", "Department", "dept")]),
    Master("d1_consulting", "D1 Consulting based on Offsetting Account", D1, re.compile(r"D1\s*Consult", re.I),
           [col("offset_acct", "Offst.acct", "offsetting account", "offset account"),
            col("vendor_name", "Vendor Name", "vendor"),
            col("department", "Department", "dept")]),
    Master("d1_consumable", "D1 Consumable", D1, re.compile(r"D1\s*Consumable", re.I),
           [col("cost_ctr", "Cost Ctr", "cost center", "cost centre"),
            col("cost_ctr_desc", "Cost Ctr Desc", "cost center description", "description"),
            col("department", "Department", "dept")]),
    Master("d1_field", "D1 Field Employees", D1, re.compile(r"D1\s*Field", re.I),
           [col("emp_code", "EMP CODE", "employee code", "emp id"),
            col("emp_name", "EMP NAME", "employee name"),
            col("cc", "CC", "cost center"),
            col("dept", "DEPT"),
            col("dept_region", "DEPARTMENT REGION", "department  region", "region")]),
    Master("d1_esi_pf", "D1 ESI & PF", D1, re.compile(r"D1\s*ESI", re.I), None),
    Master("d1_emp_id", "D1 Emp ID", D1, re.compile(r"D1\s*emp\s*id", re.I),
           [col("emp_id", "EMP ID", "emp code", "employee id"),
            col("revised_dept", "REVISED DEPT.", "revised department", "department")]),

    # F1: classify every line by its account (GL Nature) and by account description + department (Overhead).
    Master("f1_gl_nature", "F1 GL Nature", F1, re.compile(r"F1\s*GL\s*nature", re.I),
           [col("account", "Account", "account number", "account no", "gl account"),
            col("account_desc", "Account Description", "account desc", "description"),
            col("nature", "Nature"),  # Fixed / Variable
            col("gl_nature", "GL nature", "gl nature")], keyed=True),
    Master("f1_overhead", "F1 Overhead", F1, re.compile(r"F1\s*overhead", re.I),
           [col("gl_department", "GL + Department", "gl department", "gl and department", "key"),
            col("overhead", "Overhead")], keyed=True),
]}


def norm_header(s) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def slug(s: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_") or "col"
    k, i = base, 2
    while k in taken:
        k, i = f"{base}_{i}", i + 1
    taken.add(k)
    return k
