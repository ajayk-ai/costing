"""F1 mapping: fills two columns of the SAP result from the F1 masters.

  GL Nature  the "GL nature" of the line's Account (F1 GL Nature master), e.g. "Finance Charge".
  Overhead   looked up with the key  <account description><department>  in the F1 Overhead master
             ("GL + Department"). The account description is the one in the F1 GL Nature master, which
             covers every account; the Department is the one found by the D1 rules.

A line that cannot be matched keeps a blank cell. The unmatched combinations are returned so they can
be added to the F1 Overhead master.
"""
import re
from collections import Counter

from ..db import master_repo
from ..domain.masters import MASTERS

GL_NATURE, OVERHEAD = "GL Nature", "Overhead"
COLUMNS = [GL_NATURE, OVERHEAD]


def norm_key(s) -> str:
    """Overhead keys compare ignoring case and repeated spaces."""
    return re.sub(r"\s+", " ", str(s or "")).strip().casefold()


def load_maps(code):
    """({account: (description, gl nature)}, {normalised GL + Department: overhead}). First row of a key wins."""
    gl, oh = {}, {}
    for r in master_repo.all_rows(MASTERS["f1_gl_nature"]):
        k = code(r.get("account"))
        if k and k not in gl:
            gl[k] = ((r.get("account_desc") or "").strip(), (r.get("gl_nature") or "").strip())
    for r in master_repo.all_rows(MASTERS["f1_overhead"]):
        k, v = norm_key(r.get("gl_department")), (r.get("overhead") or "").strip()
        if k and v and k not in oh:
            oh[k] = v
    return gl, oh


def fill(header: list, rows: list[list], code) -> dict:
    """Fill GL Nature and Overhead in `rows` (in place). Returns the summary for the screen and the Summary sheet."""
    gl_map, oh_map = load_maps(code)
    notes = []
    if not gl_map:
        notes.append("F1 GL Nature master is empty: GL Nature and Overhead are left blank (load it with Upload full workbook).")
    elif not oh_map:
        notes.append("F1 Overhead master is empty: Overhead is left blank (load it with Upload full workbook).")

    gi, oi = header.index(GL_NATURE), header.index(OVERHEAD)
    ai, di = header.index("Account"), header.index("Department")
    gl_ok = gl_blank = oh_ok = oh_nodept = oh_noacct = 0
    gl_missing, oh_missing = Counter(), Counter()
    for r in rows:
        acc = code(r[ai])
        info = gl_map.get(acc) if acc else None
        if not acc:
            gl_blank += 1
        elif info and info[1]:
            r[gi] = info[1]
            gl_ok += 1
        else:
            gl_missing[acc] += 1

        dept = str(r[di] or "").strip()
        if not dept:
            oh_nodept += 1
        elif not info or not info[0]:
            oh_noacct += 1  # account not in the F1 GL Nature master: no key can be built
        else:
            v = oh_map.get(norm_key(info[0] + dept))
            if v:
                r[oi] = v
                oh_ok += 1
            else:
                oh_missing[(info[0], dept)] += 1

    return {
        "notes": notes,
        "glNature": {
            "masterRows": len(gl_map), "matched": gl_ok, "blank": gl_blank,
            "missingRows": sum(gl_missing.values()), "missingAccountCount": len(gl_missing),
            "missing": [{"account": a, "rows": n} for a, n in gl_missing.most_common(30)],
        },
        "overhead": {
            "masterRows": len(oh_map), "matched": oh_ok, "noDepartment": oh_nodept, "noGlAccount": oh_noacct,
            "missingRows": sum(oh_missing.values()), "missingKeyCount": len(oh_missing),
            "missing": [{"description": d, "department": p, "key": d + p, "rows": n}
                        for (d, p), n in oh_missing.most_common(200)],
        },
    }
