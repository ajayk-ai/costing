"""AI department check: train on a small synthetic history, then check the flags and reasons."""
import pytest

from app.services import ai_dept

# vendor, account, account desc, cost ctr, order desc, department
GOOD = [
    ("101", "40100", "Salary", "C1", "HR-Salary", "HUMAN RESOURCES"),
    ("102", "40100", "Salary", "C2", "HR-Salary", "HUMAN RESOURCES"),
    ("201", "40200", "Welding charges", "C3", "PRD-Welding", "PRODUCTION"),
    ("202", "40200", "Welding charges", "C3", "PRD-Welding", "PRODUCTION"),
    ("301", "40300", "Freight outward", "C4", "SAL-Freight", "Markeing"),  # typo that must be merged
    ("302", "40300", "Freight outward", "C4", "SAL-Freight", "Marketing"),
]
EXTRA = [("401", "40400", "Board fees", "C5", "MGT-Fees", "MANAGEMENT")] * 20 + \
        [("401", "40400", "Board fees", "C5", "MGT-Fees", "Management")]


@pytest.fixture(scope="module")
def model(tmp_path_factory):
    import pandas as pd
    path = tmp_path_factory.mktemp("ai") / "m.joblib"
    rows = GOOD * 60 + EXTRA
    df = pd.DataFrame(rows, columns=["Vendor Code", "Account", "Account Desc.", "Cost Ctr", "Order Des", "Main Department"])
    ai_dept.train(df, path, evaluate=False, log=lambda *_: None)
    return path


def line(assigned, vendor="101", account="40100", desc="Salary", cc="C1", order="HR-Salary"):
    return {"vendor": vendor, "account": account, "account_desc": desc, "cost_ctr": cc,
            "order_desc": order, "assigned": assigned}


def test_ok_when_assigned_matches(model):
    r = ai_dept.check([line("Human Resources")], known_depts=["Human Resources"], model_path=model)[0]
    assert r["flag"] == "OK" and r["suggested"] == "Human Resources" and r["reason"] == ""


def test_review_when_confident_disagreement(model):
    r = ai_dept.check([line("Production")], known_depts=["Human Resources", "Production"], model_path=model)[0]
    assert r["flag"] == "REVIEW"
    assert r["suggested"] == "Human Resources" and r["confidence"] >= 0.9
    assert "Assigned 'Production'" in r["reason"]


def test_no_dept_still_suggests(model):
    r = ai_dept.check([line("")], known_depts=["Human Resources"], model_path=model)[0]
    assert r["flag"] == "NO_DEPT" and r["suggested"] == "Human Resources"


def test_typo_is_merged_into_marketing(model):
    r = ai_dept.check([line("Marketing", "301", "40300", "Freight outward", "C4", "SAL-Freight")], model_path=model)[0]
    assert r["suggested"] == "Marketing" and r["flag"] == "OK"
    assert "Markeing" not in ai_dept.load_model(model)["departments"]


def test_case_variants_are_one_department(model):
    deps = ai_dept.load_model(model)["departments"]
    assert "MANAGEMENT" in deps and "Management" not in deps


def test_blank_cost_ctr_is_not_watched_as_new(model):
    r = ai_dept.check([line("Human Resources", cc="")], known_depts=["Human Resources"], model_path=model)[0]
    assert r["flag"] == "OK"


def test_unseen_cost_ctr_account_is_watched(model):
    r = ai_dept.check([line("Human Resources", cc="C9")], known_depts=["Human Resources"], model_path=model)[0]
    assert r["flag"] == "WATCH" and "combination is new" in r["reason"]


def test_codes_ignore_leading_zeros_and_decimals(model):
    a = ai_dept.check([line("Production", vendor="0000101", account="40100.0")], model_path=model)[0]
    assert a["suggested"].upper() == "HUMAN RESOURCES"


def test_output_matches_input_order_and_empty(model):
    rows = [line("Production"), line("Human Resources"), line("")]
    assert [r["flag"] for r in ai_dept.check(rows, model_path=model)] == ["REVIEW", "OK", "NO_DEPT"]
    assert ai_dept.check([], model_path=model) == []


def test_missing_model_is_reported(tmp_path):
    assert not ai_dept.available(tmp_path / "none.joblib")
    with pytest.raises(ai_dept.ModelNotFound):
        ai_dept.check([line("x")], model_path=tmp_path / "none.joblib")
