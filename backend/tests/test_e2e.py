"""End-to-end tests through the HTTP API: masters CRUD, Excel import/export, SAP processing."""
import io

from openpyxl import load_workbook

from conftest import make_xlsx, xlsx_file

WORKBOOK = make_xlsx({
    "Material Desc": [["Material", "Material Description"], ["0000100", "Bolt M8"], ["200", "Nut M8"]],
    "Account Desc": [["Account Number", "Account Description"], ["400100", "Salary"], ["400200", "Freight"]],
    "D1 Fixed": [["Account", "Account Description", "Department"], ["400200", "Freight", "Logistics"]],
    "D1 Emp ID": [["EMP ID", "REVISED DEPT."], ["E77", "Assembly"]],
    "D1 ESI & PF": [],  # empty tab must not wipe or create anything
    "Unrelated": [["x"], ["y"]],
})

SAP_HEADER = ["Offst.acct", "Account", "Cost Ctr", "Order", "Material", "Assignment",
              "Year/month", "Amount in local cur.", "Text"]


def sap_file(rows):
    return make_xlsx({"SAP DATA": [SAP_HEADER, *rows]})


def test_01_masters_start_empty(client):
    r = client.get("/api/masters")
    assert r.status_code == 200
    masters = r.json()
    assert {m["type"] for m in masters} >= {"material", "account", "d1_fixed", "d1_esi_pf"}
    assert all(m["count"] == 0 for m in masters)


def test_02_upload_full_workbook(client):
    r = client.post("/api/upload-workbook?mode=merge", files=xlsx_file(WORKBOOK))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["results"]["material"]["inserted"] == 2
    assert body["results"]["account"]["inserted"] == 2
    assert body["results"]["d1_fixed"]["inserted"] == 1
    assert "D1 ESI & PF" in body["emptySheets"]


def test_03_list_search_and_paging(client):
    assert client.get("/api/masters/material?q=bolt").json()["total"] == 1
    r = client.get("/api/masters/material?size=1&page=2")
    assert r.json()["total"] == 2 and len(r.json()["rows"]) == 1
    assert client.get("/api/masters/nope").status_code == 404
    assert client.get("/api/masters/material?size=9999").status_code == 422


def test_04_row_crud(client):
    r = client.post("/api/masters/material", json={"code": "300", "description": "Washer"})
    assert r.status_code == 201
    rid = r.json()["id"]
    assert client.post("/api/masters/material", json={"code": "300", "description": "dup"}).status_code == 409
    assert client.post("/api/masters/material", json={"code": "", "description": "x"}).status_code == 400
    assert client.put(f"/api/masters/material/rows/{rid}", json={"code": "999", "description": "Washer 2"}).status_code == 200
    rows = client.get("/api/masters/material?q=washer").json()["rows"]
    assert rows[0]["description"] == "Washer 2" and rows[0]["code"] == "300"  # code is not editable
    assert client.put("/api/masters/material/rows/999999", json={}).status_code == 404
    assert client.delete(f"/api/masters/material/rows/{rid}").status_code == 200
    assert client.delete(f"/api/masters/material/rows/{rid}").status_code == 404


def test_05_single_master_upload_modes(client):
    f = make_xlsx({"Sheet1": [["Material", "Material Description"], ["200", "Nut M10"], ["500", "Screw"]]})
    r = client.post("/api/masters/material/upload?mode=merge", files=xlsx_file(f))
    assert r.json()["inserted"] == 1 and r.json()["updated"] == 1
    assert client.get("/api/masters/material").json()["total"] == 3
    r = client.post("/api/masters/material/upload?mode=replace", files=xlsx_file(f))
    assert r.status_code == 200
    assert client.get("/api/masters/material").json()["total"] == 2
    # Restore the original masters for the tests that follow.
    client.post("/api/upload-workbook?mode=replace", files=xlsx_file(WORKBOOK))


def test_06_upload_validation(client):
    assert client.post("/api/masters/material/upload", files=xlsx_file(b"")).status_code == 400
    assert client.post("/api/masters/material/upload", files=xlsx_file(b"not an excel file")).status_code == 400
    assert client.post("/api/masters/material/upload?mode=bogus", files=xlsx_file(WORKBOOK)).status_code == 422


def test_07_export_and_template(client):
    r = client.get("/api/masters/account/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    ws = load_workbook(io.BytesIO(r.content)).active
    assert [c.value for c in ws[1]] == ["Account Number", "Account Description"]
    assert ws.max_row == 3
    t = client.get("/api/masters/account/template")
    assert load_workbook(io.BytesIO(t.content)).active.max_row == 1


def test_08_upload_history(client):
    logs = client.get("/api/masters/material/logs").json()
    assert logs
    assert client.delete(f"/api/masters/material/logs/{logs[0]['id']}").status_code == 200
    assert client.delete("/api/masters/material/logs/999999").status_code == 404
    assert client.delete("/api/masters/material/logs").status_code == 200
    assert client.get("/api/masters/material/logs").json() == []


def test_09_sap_processing_end_to_end(client):
    rows = [
        # Offst, Account, CostCtr, Order, Material, Assignment, Year/month, Amount, Text
        ["", "400200", "", "", "0000100", "", "2026/01", "-1,61,925.00", "freight"],  # fixed rule -> Logistics
        ["E77", "400100", "", "", "200", "", "2026/03", "1,000.50", "emp"],           # emp id rule -> Assembly
        ["", "999999", "", "", "", "", "2026/12", "5.00", "unmapped"],                # no department
    ]
    r = client.post("/api/sap/process", files=xlsx_file(sap_file(rows), "sap.xlsx"))
    assert r.status_code == 200, r.text
    run = r.json()
    assert run["summary"]["rows"] == 3
    assert run["summary"]["filled"] == 2 and run["summary"]["unfilled"] == 1

    dl = client.get(f"/api/sap/runs/{run['id']}/download")
    assert dl.status_code == 200
    wb = load_workbook(io.BytesIO(dl.content))
    ws = wb.worksheets[0]
    header = [c.value for c in ws[1]]
    assert header[0] == "Month" and header[-3:] == ["Department", "GL Nature", "Overhead"] and len(header) == 27
    acc, dep = header.index("Account") + 1, header.index("Department") + 1
    dept = {str(ws.cell(i, acc).value): ws.cell(i, dep).value for i in range(2, 5)}
    assert dept["400200"] == "Logistics"
    assert dept["400100"] == "Assembly"
    assert not dept["999999"]
    assert "Summary" in wb.sheetnames
    assert ws.cell(2, header.index("Amount in local cur.") + 1).value == -161925.0
    # Month is a real date; fiscal period 1 = April, so 2026/01 -> Apr 2026 and 2026/03 -> Jun 2026.
    assert (ws.cell(2, 1).value.year, ws.cell(2, 1).value.month) == (2026, 4)
    assert (ws.cell(3, 1).value.year, ws.cell(3, 1).value.month) == (2026, 6)

    assert client.get(f"/api/sap/runs/{run['id']}").json()["id"] == run["id"]
    assert any(x["id"] == run["id"] for x in client.get("/api/sap/runs").json())


def test_09b_sap_with_ai_columns(client, monkeypatch, tmp_path):
    """With a trained model the result gets 3 AI columns right after Department; Department is unchanged."""
    import pandas as pd

    from app.services import ai_dept

    hist = pd.DataFrame(
        [("E77", "400100", "Salary", "", "", "Assembly")] * 40
        + [("", "400200", "Freight", "", "", "Logistics")] * 40
        + [("", "999999", "Misc", "", "", "Finance")] * 40,
        columns=["Vendor Code", "Account", "Account Desc.", "Cost Ctr", "Order Des", "Main Department"])
    model = tmp_path / "m.joblib"
    ai_dept.train(hist, model, evaluate=False, log=lambda *_: None)
    monkeypatch.setattr(ai_dept, "AI_MODEL_FILE", model)

    rows = [
        ["", "400200", "", "", "0000100", "", "2026/01", "10.00", "a"],     # fixed rule -> Logistics, AI agrees
        ["E77", "400100", "", "", "200", "", "2026/03", "20.00", "b"],       # emp id -> Assembly, AI agrees
        ["", "999999", "", "", "", "", "2026/12", "5.00", "c"],              # no department, AI suggests Finance
        ["E77", "400200", "", "", "", "", "2026/02", "7.00", "d"],           # fixed rule says Logistics, vendor says Assembly
    ]
    r = client.post("/api/sap/process", files=xlsx_file(sap_file(rows), "sap_ai.xlsx"))
    assert r.status_code == 200, r.text
    run = r.json()
    h = run["summary"]["header"]
    d = h.index("Department")
    assert h[d + 1:d + 3] == ["GL Nature", "Overhead"]  # F1 columns right after Department
    assert h[-3:] == ["AI Suggested Department", "AI Flag", "AI Reason"] and len(h) == 30  # AI columns last
    ai = run["summary"]["ai"]
    assert ai["enabled"] and sum(ai["counts"].values()) == 4 and ai["counts"]["NO_DEPT"] == 1
    prev = run["preview"]
    fl = h.index("AI Flag")
    assert [x[fl] for x in prev["all"]][:3] == ["OK", "OK", "NO_DEPT"]
    assert prev["all"][2][h.index("AI Suggested Department")] == "Finance"
    assert all(x[fl] == "REVIEW" for x in prev["review"]) and all(x[fl] == "WATCH" for x in prev["watch"])

    wb = load_workbook(io.BytesIO(client.get(f"/api/sap/runs/{run['id']}/download").content))
    ws = wb.worksheets[0]
    head = [c.value for c in ws[1]]
    assert head[-3:] == h[-3:] and "AI Confidence" not in head
    assert ws.cell(2, d + 1).value == "Logistics"  # D1 department untouched
    assert ws.cell(4, fl + 1).value == "NO_DEPT" and ws.cell(4, fl + 1).fill.fgColor.rgb.endswith("D9D9D9")
    assert ws.auto_filter.ref
    assert any(c.value == "AI department check" for row in wb["Summary"].iter_rows() for c in row[:1])


def test_09c_sap_without_model_has_no_ai_columns(client):
    r = client.post("/api/sap/process", files=xlsx_file(sap_file([["", "400200", "", "", "", "", "2026/01", "1", "a"]]), "s.xlsx"))
    s = r.json()["summary"]
    assert len(s["header"]) == 27 and s["header"][-1] == "Overhead" and s["ai"]["enabled"] is False
    assert any("not trained" in n for n in s["notes"])


def test_10_sap_validation_and_cleanup(client):
    assert client.post("/api/sap/process", files=xlsx_file(make_xlsx({"S": [["a", "b"], [1, 2]]}))).status_code == 400
    assert client.get("/api/sap/runs/999999").status_code == 404
    assert client.get("/api/sap/runs/999999/download").status_code == 404
    runs = client.get("/api/sap/runs").json()
    assert client.delete(f"/api/sap/runs/{runs[0]['id']}").status_code == 200
    assert client.delete(f"/api/sap/runs/{runs[0]['id']}").status_code == 404
    client.delete("/api/sap/runs")
    assert client.get("/api/sap/runs").json() == []


def test_11_spa_and_docs(client):
    assert client.get("/docs").status_code == 200
    r = client.get("/")
    assert r.status_code == 200 and 'id="root"' in r.text
    assert client.get("/some/client/route").status_code == 200  # SPA fallback
    # Path traversal must not leak files outside the static folder.
    leak = client.get("/..%2f..%2f.env")
    assert "APP_HOST" not in leak.text
