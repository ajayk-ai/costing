"""AI department check.

A logistic regression model learns, from past correctly assigned lines, which department a line
belongs to. It sees only the vendor (Offst.acct), account, account description and order
description. The cost center is deliberately NOT a model input: the model has to stay independent
of the cost center, otherwise it would learn "cost center X -> department Y" and repeat a wrong
cost center instead of catching it.

For every line it returns:
    suggested   department the model expects
    confidence  0..1
    flag        REVIEW   model disagrees with the assigned department, confidence >= AI_REVIEW_CONF
                WATCH    weaker disagreement (>= AI_WATCH_CONF), or this Cost Ctr + Account was never
                         booked to the assigned department in the history
                NO_DEPT  the line has no department (the suggestion is still given)
                OK       consistent with history
    reason      one-line explanation (empty for OK)

The existing department rules (D1 masters) are not touched by this module.
"""
from __future__ import annotations

import os
import warnings
from datetime import datetime

import joblib
import numpy as np
import pandas as pd

from ..config import AI_MODEL_FILE, AI_REVIEW_CONF, AI_WATCH_CONF

# Column names of the training (history) file -> model input. Change here if the history file differs.
HISTORY_COLS = {
    "vendor": "Vendor Code",
    "account": "Account",
    "account_desc": "Account Desc.",
    "cost_ctr": "Cost Ctr",
    "order_desc": "Order Des",
    "department": "Main Department",
}

# Other headers accepted for the same field (the expense report tab uses these)
HISTORY_ALIASES = {
    "account_desc": ["Account Description"],
    "order_desc": ["Order Description", "Order Desc"],
    "vendor": ["Offst.acct"],
}

# Spelling variants merged into one department (key in upper case). Add only after finance confirms.
DEPT_ALIASES = {
    "MARKEING": "Marketing",
}

CAT_FEATURES = ["f_account", "f_vendor"]
TXT_FEATURES = ["f_acc_desc", "f_order_desc"]
FEATURES = CAT_FEATURES + TXT_FEATURES
FLAGS = ("REVIEW", "WATCH", "NO_DEPT", "OK")

_BLANKS = {"nan", "none", "null", "0", "nat", "#n/a"}
_cache: dict = {}


class ModelNotFound(FileNotFoundError):
    """The model file does not exist yet: run `uv run backend/train_ai.py <history file>`."""


# ---------------------------------------------------------------- preparation
def _clean_id(s: pd.Series) -> pd.Series:
    s = s.fillna("").astype(str).str.strip().str.replace(r"\.0+$", "", regex=True)
    s = s.str.replace(r"^0+(?=\d)", "", regex=True)  # 0000500458 == 500458
    return s.where(~s.str.lower().isin(_BLANKS), "")


NO_TEXT = "notext"  # stands in for a blank description, so a column that is blank everywhere cannot break training


def _clean_text(s: pd.Series) -> pd.Series:
    s = s.fillna("").astype(str).str.strip().str.lower().str.replace(r"\s+", " ", regex=True)
    return s.where(~s.isin(_BLANKS) & (s != ""), NO_TEXT)


def normalise_dept(s: pd.Series) -> pd.Series:
    s = s.fillna("").astype(str).str.strip().str.replace(r"\s+", " ", regex=True)
    s = s.where(~s.str.lower().isin(_BLANKS), "")
    return s.map(lambda x: DEPT_ALIASES.get(x.upper(), x))


def prepare(vendor, account, account_desc, cost_ctr, order_desc, department) -> pd.DataFrame:
    """Raw columns (any sequence) -> model-ready frame with f_* features, f_cc and label."""
    out = pd.DataFrame({
        "f_account": _clean_id(pd.Series(account, dtype=object)),
        "f_vendor": _clean_id(pd.Series(vendor, dtype=object)),
        "f_acc_desc": _clean_text(pd.Series(account_desc, dtype=object)),
        "f_order_desc": _clean_text(pd.Series(order_desc, dtype=object)),
        "f_cc": _clean_id(pd.Series(cost_ctr, dtype=object)).str.upper(),
        "label": normalise_dept(pd.Series(department, dtype=object)),
    })
    return out


# ---------------------------------------------------------------------- model
def _pipeline():
    from sklearn.compose import ColumnTransformer
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder

    tfidf = dict(ngram_range=(1, 2), sublinear_tf=True, token_pattern=r"[a-z0-9&]+")
    features = ColumnTransformer([
        ("acc_desc", TfidfVectorizer(**tfidf), "f_acc_desc"),
        ("ord_desc", TfidfVectorizer(**tfidf), "f_order_desc"),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
    ])
    return Pipeline([("features", features), ("clf", LogisticRegression(C=10, max_iter=1000))])


def _fit(prep: pd.DataFrame):
    """Fit on de-duplicated rows with their counts as weights (same result as all rows, much faster)."""
    prep = prep[prep["label"] != ""]
    g = prep.groupby(FEATURES + ["label"]).size().reset_index(name="w")
    pipe = _pipeline()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        pipe.fit(g[FEATURES], g["label"], clf__sample_weight=g["w"])
    return pipe


def _predict(pipe, prep: pd.DataFrame) -> pd.DataFrame:
    """Adds sug1/conf1/sug2/conf2; the row order of `prep` is kept."""
    prep = prep.reset_index(drop=True)
    uniq = prep[FEATURES].drop_duplicates().reset_index(drop=True)
    P = pipe.predict_proba(uniq)
    cls = pipe.classes_
    k = min(2, P.shape[1])
    top = np.argsort(-P, axis=1)[:, :k]
    r = np.arange(len(P))
    uniq["sug1"], uniq["conf1"] = cls[top[:, 0]], P[r, top[:, 0]]
    uniq["sug2"] = cls[top[:, 1]] if k > 1 else ""
    uniq["conf2"] = P[r, top[:, 1]] if k > 1 else 0.0
    return prep.merge(uniq, on=FEATURES, how="left")


def _history_table(prep: pd.DataFrame) -> pd.DataFrame:
    prep = prep[(prep["label"] != "") & (prep["f_cc"] != "")]
    return prep.groupby(["f_cc", "f_account", "label"]).size().reset_index(name="n")


def _evaluate(prep: pd.DataFrame, seed: int = 1) -> dict:
    """80/20 hold-out: accuracy, and what each REVIEW threshold would flag / catch."""
    rng = np.random.RandomState(seed)
    mask = rng.rand(len(prep)) < 0.8
    tr, te = prep[mask], prep[~mask]
    pipe = _fit(tr)
    g = te.groupby(FEATURES + ["label"]).size().reset_index(name="w")
    P = pipe.predict_proba(g[FEATURES])
    cls = pipe.classes_
    pred, conf, w, y = cls[P.argmax(1)], P.max(1), g["w"].values, g["label"].values
    acc = float(np.average(pred == y, weights=w))

    # simulate 5% wrongly assigned lines and see how many each threshold catches
    r = np.random.RandomState(7)
    wrong = r.rand(len(g)) < 0.05
    lab = y.copy()
    for i in np.where(wrong)[0]:
        lab[i] = r.choice([c for c in cls if c != lab[i]])
    rows = []
    for th in (0.6, 0.7, 0.8, 0.9, 0.95):
        rows.append({
            "threshold": th,
            "pct_correct_lines_flagged": round(float(np.average((pred != y) & (conf >= th), weights=w)) * 100, 2),
            "pct_injected_errors_caught": round(float(np.average(((pred != lab) & (conf >= th))[wrong], weights=w[wrong])) * 100, 1),
        })
    return {"holdout_accuracy": round(acc, 4), "thresholds": rows}


def read_history(path) -> pd.DataFrame:
    """Read a history .csv/.xlsx as text. For a workbook the sheet named like "expense report" is used,
    else the first sheet. Alternative headers (HISTORY_ALIASES) are renamed to the standard ones."""
    p = str(path).lower()
    if p.endswith(".csv"):
        df = pd.read_csv(path, dtype=str)
    else:
        names = pd.ExcelFile(path).sheet_names
        sheet = next((n for n in names if "expense report" in n.lower()), names[0])
        df = pd.read_excel(path, sheet_name=sheet, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    for key, alts in HISTORY_ALIASES.items():
        if HISTORY_COLS[key] not in df.columns:
            hit = next((a for a in alts if a in df.columns), None)
            if hit:
                df = df.rename(columns={hit: HISTORY_COLS[key]})
    need = [HISTORY_COLS[k] for k in ("vendor", "account", "account_desc", "order_desc", "department")]
    missing = [c for c in need if c not in df.columns]
    if missing:
        raise ValueError(f"{path}: missing column(s) {missing}. Found: {list(df.columns)}. Adjust HISTORY_COLS in ai_dept.py.")
    keep = [c for c in HISTORY_COLS.values() if c in df.columns]
    return df[keep]


def train(history, model_path=None, evaluate: bool = True, log=print) -> dict:
    """Train from a history DataFrame, a file path or a list of file paths, and save the model. Returns the metrics."""
    model_path = model_path or AI_MODEL_FILE
    if isinstance(history, (str, os.PathLike)):
        history = [history]
    if isinstance(history, (list, tuple)):  # several files: they are simply stacked
        df = pd.concat([read_history(h) for h in history], ignore_index=True)
    else:
        df = history
    col = lambda k: df[HISTORY_COLS[k]] if HISTORY_COLS[k] in df.columns else [None] * len(df)
    prep = prepare(col("vendor"), col("account"), col("account_desc"), col("cost_ctr"),
                   col("order_desc"), col("department"))
    prep = prep[prep["label"] != ""].reset_index(drop=True)
    # spellings that differ only by case (MANAGEMENT / Management) are one department: keep the most common
    best: dict = {}
    for name in prep["label"].value_counts().index:  # most frequent first
        best.setdefault(name.upper(), name)
    prep["label"] = prep["label"].map(lambda x: best[x.upper()])
    if prep["label"].nunique() < 2:
        raise ValueError("The history needs at least two different departments to learn from.")
    log(f"{len(prep):,} labelled lines, {prep['label'].nunique()} departments")

    metrics = _evaluate(prep) if evaluate else {}
    if metrics:
        log(f"Hold-out accuracy: {metrics['holdout_accuracy']:.1%}")
    pipe = _fit(prep)
    bundle = {
        "pipeline": pipe, "history": _history_table(prep),
        "trained_on": datetime.now().isoformat(timespec="seconds"),
        "n_lines": int(len(prep)), "departments": sorted(prep["label"].unique()), "metrics": metrics,
    }
    os.makedirs(os.path.dirname(model_path) or ".", exist_ok=True)
    joblib.dump(bundle, model_path)
    _cache.clear()
    log(f"Saved {model_path}")
    return {k: bundle[k] for k in ("trained_on", "n_lines", "metrics")}


def load_model(model_path=None) -> dict:
    path = str(model_path or AI_MODEL_FILE)
    if not os.path.exists(path):
        raise ModelNotFound(f"{path} not found. Train it first: uv run backend/train_ai.py <history file>")
    key = (path, os.path.getmtime(path))
    if key not in _cache:
        _cache.clear()
        _cache[key] = joblib.load(path)
    return _cache[key]


def available(model_path=None) -> bool:
    return os.path.exists(str(model_path or AI_MODEL_FILE))


def model_info(model_path=None) -> dict | None:
    if not available(model_path):
        return None
    b = load_model(model_path)
    return {"trainedOn": b["trained_on"], "lines": b["n_lines"], "departments": len(b["departments"]),
            "accuracy": (b.get("metrics") or {}).get("holdout_accuracy")}


# ---------------------------------------------------------------------- check
def check(rows: list[dict], known_depts=None, model_path=None,
          review_conf: float = AI_REVIEW_CONF, watch_conf: float = AI_WATCH_CONF) -> list[dict]:
    """Check lines. Each row: vendor, account, account_desc, cost_ctr, order_desc, assigned.

    `known_depts` (the department names used by the D1 masters) sets the spelling of the
    suggestion, e.g. the model learned "HUMAN RESOURCES", the report says "Human Resources".
    Returns one dict per row, same order: suggested, confidence, flag, reason.
    """
    if not rows:
        return []
    b = load_model(model_path)
    get = lambda k: [r.get(k) for r in rows]
    p = prepare(get("vendor"), get("account"), get("account_desc"), get("cost_ctr"),
                get("order_desc"), get("assigned"))
    p = _predict(b["pipeline"], p)

    canon = {d.strip().upper(): d.strip() for d in (known_depts or []) if d and d.strip()}
    spell = lambda d: canon.get(d.upper(), d) if d else d
    p["assigned"] = p["label"].map(spell)
    p["sug1"] = p["sug1"].map(spell)

    # how often was this Cost Ctr + Account booked to the assigned department in the history
    hist = b["history"].assign(assigned_u=lambda h: h["label"].map(lambda x: spell(x).upper()))
    p["assigned_u"] = p["assigned"].str.upper()
    tot = hist.groupby(["f_cc", "f_account"])["n"].sum().rename("n_total").reset_index()
    this = (hist.groupby(["f_cc", "f_account", "assigned_u"])["n"].sum().rename("n_this").reset_index())
    p = (p.merge(tot, on=["f_cc", "f_account"], how="left")
          .merge(this, on=["f_cc", "f_account", "assigned_u"], how="left"))
    p["n_total"] = p["n_total"].fillna(0).astype(int)
    p["n_this"] = p["n_this"].fillna(0).astype(int)
    share = np.where(p["n_total"] > 0, p["n_this"] / p["n_total"].clip(lower=1), np.nan)

    has = p["assigned"] != ""
    mismatch = has & (p["assigned_u"] != p["sug1"].str.upper())
    review = mismatch & (p["conf1"] >= review_conf)
    # "never seen" needs a cost center; without one it would flag every such line
    unseen = has & (p["f_cc"] != "") & (p["n_this"] == 0)
    watch = has & ~review & ((mismatch & (p["conf1"] >= watch_conf)) | unseen)
    flag = np.select([~has, review, watch], ["NO_DEPT", "REVIEW", "WATCH"], default="OK")

    out = []
    for i in range(len(p)):
        f = flag[i]
        conf = float(p["conf1"].iat[i])
        sug = p["sug1"].iat[i]
        reason = ""
        if f == "NO_DEPT":
            reason = f"No department assigned. Model suggests '{sug}'."
        elif f != "OK":
            parts = []
            if mismatch.iat[i]:
                parts.append(f"Assigned '{p['assigned'].iat[i]}' but model suggests '{sug}' "
                             "based on account, vendor and order description")
            if unseen.iat[i]:
                parts.append("this Cost Ctr + Account was never booked to the assigned department before"
                             if p["n_total"].iat[i] else "this Cost Ctr + Account combination is new")
            elif p["n_total"].iat[i] and p["f_cc"].iat[i] and share[i] < 0.10:
                parts.append(f"only {p['n_this'].iat[i]} of {p['n_total'].iat[i]} past lines for this Cost Ctr + Account went here")
            reason = "; ".join(parts) + "."
        out.append({"suggested": sug, "confidence": round(conf, 3), "flag": f, "reason": reason})
    return out
