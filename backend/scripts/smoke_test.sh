#!/usr/bin/env bash
# 接口连通性测试 (backend spec §2): 上传校验 → 任务状态机 → result → health → QA JSON+SSE
# 前置: 服务已启动 (uv run uvicorn rag_server.app:create_app --factory --port 8100)
set -u
BASE="http://127.0.0.1:8100"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
contains(){ echo "$2" | grep -q "$3" && ok "$1" || bad "$1 (missing: $3)"; }

FIXTURE_PDF="rag_server/fixtures/sample_report/full.md"
TMP=$(mktemp -d)
# 构造一个"合法 PDF 头"的测试文件 (mock MinerU 不校验内容, 只走接口契约)
printf '%%PDF-1.4\n%% test fixture\n' > "$TMP/sample_report.pdf"
printf 'not-pdf' > "$TMP/virus.exe"

echo "=== check1 health / config ==="
check "health status" "$(curl -s $BASE/api/v1/health | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')" "ok"
contains "config has formats" "$(curl -s $BASE/api/v1/config)" '"formats"'

echo "=== check2 批量上传 (部分成功语义) ==="
UP=$(curl -s -X POST $BASE/api/v1/documents \
  -F "files=@$TMP/sample_report.pdf" -F "files=@$TMP/virus.exe")
contains "accepted 1 个" "$UP" '"job_id"'
contains "rejected .exe" "$UP" 'E_UPLOAD_UNSUPPORTED_FORMAT'
check "http 202" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/documents -F "files=@$TMP/sample_report.pdf")" "202"
JOB_ID=$(echo "$UP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accepted"][0]["job_id"])')
DOC_ID=$(echo "$UP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accepted"][0]["document_id"])')
echo "  job=$JOB_ID doc=$DOC_ID"

echo "=== check2b html 强制 MinerU-HTML 冲突拒绝 ==="
printf '<html></html>' > "$TMP/page.html"
contains "html 冲突拒绝" "$(curl -s -X POST $BASE/api/v1/documents -F "files=@$TMP/page.html" -F "model_version=vlm")" 'E_UPLOAD_MODEL_VERSION_CONFLICT'

echo "=== check3 任务状态机轮询至 done ==="
STATUS=""
for i in $(seq 1 60); do
  J=$(curl -s $BASE/api/v1/jobs/$JOB_ID)
  STATUS=$(echo "$J" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')
  echo "  [$i] status=$STATUS"
  [ "$STATUS" = "done" ] && break
  [ "$STATUS" = "failed" ] && { echo "$J"; break; }
  sleep 2
done
check "job done" "$STATUS" "done"
J=$(curl -s $BASE/api/v1/jobs/$JOB_ID)
contains "steps detail n_triples" "$J" '"n_triples"'
contains "steps detail stats" "$J" '"stats"'

echo "=== check4 文档管理 ==="
contains "文档列表含 doc" "$(curl -s "$BASE/api/v1/documents?status=done")" "$DOC_ID"
R=$(curl -s "$BASE/api/v1/documents/$DOC_ID/result")
contains "result 有 t_000001" "$R" '"t_000001"'
contains "result 有 char_interval_fullmd" "$R" '"char_interval_fullmd"'
contains "result 有 provenance.path" "$R" '"provenance"'
check "artifact kg_triples 下载" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/documents/$DOC_ID/artifacts/kg_triples.jsonl)" "200"
check "artifact 404" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/documents/$DOC_ID/artifacts/nope.jsonl)" "404"

echo "=== check5 QA JSON (引用复核: exists_in_kg + fullmd_verbatim==text_span) ==="
A=$(curl -s -X POST $BASE/api/v1/qa/ask -H 'Content-Type: application/json' \
  -d "{\"question\": \"Q3 的总收入是多少？同比增长了多少？\", \"doc_ids\": [\"$DOC_ID\"]}")
echo "$A" | python3 -c '
import sys, json
d = json.load(sys.stdin)
assert d["answer"], "empty answer"
assert d["citations"], "no citations"
ok_all = True
for c in d["citations"]:
    if not c["triple_id"].startswith("t_"): ok_all = False
    if c.get("fullmd_verbatim") is not None and c["fullmd_verbatim"] != c["text_span"]:
        ok_all = False  # 数学契约 (narrative 路径)
    print("  citation", c["triple_id"], "doc=", c.get("doc_id"),
          "verbatim_ok=", c.get("fullmd_verbatim") is None or c["fullmd_verbatim"] == c["text_span"])
print("CITATIONS_OK" if ok_all else "CITATIONS_BAD")' | tee /tmp/qa_check.txt
contains "引用复核通过" "$(cat /tmp/qa_check.txt)" "CITATIONS_OK"
SESSION_ID=$(echo "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["session_id"])')

echo "=== check5b QA 错误路径 (未索引文档 → 409 / 不存在文档 → 404) ==="
# 先上传一份不等待索引完成的文档 → status=queued → 409 E_DOC_NOT_INDEXED
PEND=$(curl -s -X POST $BASE/api/v1/documents -F "files=@$TMP/sample_report.pdf")
PEND_DOC=$(echo "$PEND" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accepted"][0]["document_id"])')
check "E_DOC_NOT_INDEXED(queued)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/qa/ask -H 'Content-Type: application/json' -d "{\"question\":\"x\",\"doc_ids\":[\"$PEND_DOC\"]}")" "409"
check "E_DOC_NOT_FOUND(unknown)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/qa/ask -H 'Content-Type: application/json' -d '{"question":"x","doc_ids":["not_exist_doc"]}')" "404"

echo "=== check6 QA SSE 流 (事件序列契约) ==="
curl -s -N -X POST $BASE/api/v1/qa/ask/stream -H 'Content-Type: application/json' \
  -d "{\"question\": \"Q3 的总收入是多少？\", \"doc_ids\": [\"$DOC_ID\"], \"session_id\": null}" > "$TMP/sse.txt"
EV=$(grep '^event:' "$TMP/sse.txt" | awk '{print $2}' | tr '\n' ' ')
echo "  events: $EV"
for e in session status tool_call tool_result answer_delta citations done; do
  contains "SSE 含 $e" "$EV" "$e"
done
FIRST=$(grep -m1 '^event:' "$TMP/sse.txt" | awk '{print $2}')
check "首事件为 session" "$FIRST" "session"

echo "=== check7 会话 CRUD ==="
contains "会话列表" "$(curl -s $BASE/api/v1/qa/sessions)" "$SESSION_ID"
check "会话详情" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/qa/sessions/$SESSION_ID)" "200"
check "删除会话" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/v1/qa/sessions/$SESSION_ID)" "204"
check "删除后 404" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/qa/sessions/$SESSION_ID)" "404"

echo "=== check8 任务列表 / 状态机前置条件 ==="
contains "任务列表" "$(curl -s "$BASE/api/v1/jobs")" "$JOB_ID"
# 主任务已 done: retry/cancel 均应 409 (spec §2.2)
check "done 任务不可重试 409" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/jobs/$JOB_ID/retry)" "409"
check "done 任务不可取消 409" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/jobs/$JOB_ID/cancel)" "409"
# 失败任务语义: retry 应 202 (断点续跑), cancel 应 409
FAILED_JOB=$(curl -s "$BASE/api/v1/jobs?status=failed" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["items"][0]["job_id"] if d["items"] else "")')
if [ -n "$FAILED_JOB" ]; then
  check "failed 任务可重试 202" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/jobs/$FAILED_JOB/retry)" "202"
fi

rm -rf "$TMP"
echo "=== summary: PASS=$PASS FAIL=$FAIL ==="
[ $FAIL -eq 0 ]
