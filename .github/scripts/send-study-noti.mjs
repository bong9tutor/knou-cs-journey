// 학습 노티 발송 - GitHub Actions용 (Node 20, 의존성 없음)
import fs from "node:fs";
import path from "node:path";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST_MODE = process.env.TEST_MODE === "true";
const DRY_RUN = process.env.DRY_RUN === "true";

const DATABASE_ID = process.env.NOTION_DB_ID; // Secret으로 주입(공개 레포에 ID 비노출)
const NOTION_VERSION = "2022-06-28";
const CONTENTS_DIR = "resources/study-noti";

// 과목명 -> 사이트 슬러그 (완주 시 모의시험 링크용)
const SLUG = {
    "파이썬프로그래밍기초": "python",
    "데이터정보처리입문": "data",
    "유비쿼터스컴퓨팅개론": "ubicomp",
    "컴퓨터의이해": "computers",
    "대학영어": "english",
    "C프로그래밍": "c",
    "컴퓨터과학개론": "cs-intro",
    "AI리터러시": "ai-literacy"
};
const SITE = "https://bong9tutor.github.io/knou-cs-journey";

// ---- 노션 API 헬퍼 ----
function notion(method, urlPath, body) {
    return fetch("https://api.notion.com/v1" + urlPath, {
        method: method,
        headers: {
            "Authorization": "Bearer " + NOTION_TOKEN,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
        if (!r.ok) {
            return r.text().then(function (t) {
                throw new Error("Notion " + r.status + " " + urlPath + " :: " + t.slice(0, 300));
            });
        }
        return r.json();
    });
}

function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
}

// 블록의 자식 전부 가져오기(페이지네이션)
async function getChildren(blockId) {
    var out = [];
    var cursor = undefined;
    do {
        var qs = "?page_size=100" + (cursor ? "&start_cursor=" + cursor : "");
        var res = await notion("GET", "/blocks/" + blockId + "/children" + qs);
        out = out.concat(res.results);
        cursor = res.has_more ? res.next_cursor : undefined;
        await sleep(120); // 레이트리밋 여유(노션 ~3req/s)
    } while (cursor);
    return out;
}

function plainText(block) {
    var t = block[block.type];
    if (!t || !t.rich_text) return "";
    return t.rich_text.map(function (r) { return r.plain_text; }).join("");
}

// 한 블록이 "실제 내용"인지(빈 문단/공백은 내용 아님)
function isContentBlock(block) {
    var txt = plainText(block).trim();
    if (txt) return true;
    // 텍스트가 없어도 내용으로 치는 블록 타입(이미지·코드·표·체크 등)
    var rich = ["image", "code", "table", "to_do", "embed", "file", "video", "bookmark", "equation"];
    return rich.indexOf(block.type) !== -1;
}

// 회차 토글이 "기록됨"인지: 자식 중 실제 내용 블록이 1개 이상
async function roundHasRecord(roundBlock) {
    if (!roundBlock.has_children) return false;
    var kids = await getChildren(roundBlock.id);
    for (var i = 0; i < kids.length; i++) {
        if (isContentBlock(kids[i])) return true;
        if (kids[i].has_children) return true; // 중첩 내용도 기록으로 간주
    }
    return false;
}

// 페이지 본문에서 Step 토글 목록과 현재 진도 계산
async function parseProgress(pageId) {
    var top = await getChildren(pageId);
    var steps = []; // { n, title, block }
    top.forEach(function (b) {
        if (b.type !== "toggle") return;
        var txt = plainText(b);
        var m = txt.match(/Step\s+(\d+)\s*[·:]\s*(.*)/);
        if (m) steps.push({ n: parseInt(m[1], 10), title: m[2].trim(), block: b });
    });
    steps.sort(function (a, b) { return a.n - b.n; });

    var current = 0, currentRound = 0;
    for (var i = 0; i < steps.length; i++) {
        var rounds = await getChildren(steps[i].block.id); // N회차 토글들
        var maxRound = 0;
        for (var j = 0; j < rounds.length; j++) {
            if (rounds[j].type !== "toggle") continue;
            var rt = plainText(rounds[j]);
            var rm = rt.match(/(\d+)\s*회차/);
            if (!rm) continue;
            var recorded = await roundHasRecord(rounds[j]);
            if (recorded) maxRound = Math.max(maxRound, parseInt(rm[1], 10));
        }
        if (maxRound > 0) { current = steps[i].n; currentRound = maxRound; }
    }
    return { total: steps.length, current: current, currentRound: currentRound, steps: steps };
}

// ---- contents.md에서 Step 본문 추출 ----
function extractStep(md, n) {
    var lines = md.replace(/\r\n/g, "\n").split("\n");
    var startRe = new RegExp("^##\\s*Step\\s+" + n + "\\s*:\\s*(.*)$");
    var title = null, body = [], inStep = false;
    for (var i = 0; i < lines.length; i++) {
        if (!inStep) {
            var m = lines[i].match(startRe);
            if (m) { title = m[1].trim(); inStep = true; }
        } else {
            if (/^##\s*Step\s+\d+\s*:/.test(lines[i]) || /^---\s*$/.test(lines[i])) break;
            if (/^✅\s*마치면 텔레그램에서/.test(lines[i])) continue; // 옛 잔재 방어
            body.push(lines[i]);
        }
    }
    if (title === null) return null;
    while (body.length && body[0].trim() === "") body.shift();
    while (body.length && body[body.length - 1].trim() === "") body.pop();
    return { title: title, body: body.join("\n") };
}

// ---- 텔레그램 ----
async function send(text) {
    if (DRY_RUN) { console.log("---- (dry-run) ----\n" + text + "\n"); return; }
    var res = await fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: text })
    });
    var j = await res.json();
    if (!j.ok) throw new Error("Telegram 발송 실패: " + (j.description || res.status));
}

function kstDateStr() {
    var fmt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", weekday: "short"
    });
    var parts = {};
    fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return parts.month + "-" + parts.day + " (" + parts.weekday + ")";
}

// ---- 메인 ----
async function main() {
    if (!NOTION_TOKEN || !DATABASE_ID || !TG_TOKEN || !CHAT_ID) {
        throw new Error("필수 환경변수 누락(NOTION_TOKEN/NOTION_DB_ID/TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID). GitHub Secrets를 확인하세요.");
    }

    var dateStr = kstDateStr();
    var tag = TEST_MODE ? " [테스트]" : "";

    // 1. 진행 중 과목 조회
    var query = await notion("POST", "/databases/" + DATABASE_ID + "/query", {
        filter: { property: "상태", select: { equals: "진행 중" } }
    });
    var pages = query.results;
    if (pages.length === 0) {
        console.log("진행 중 과목 없음 - 발송 생략");
        return;
    }

    // 2. 과목별 진도 파싱
    var subjects = [];
    for (var i = 0; i < pages.length; i++) {
        var page = pages[i];
        var titleProp = page.properties["과목명"].title;
        var name = titleProp.map(function (t) { return t.plain_text; }).join("");
        var prog = await parseProgress(page.id);
        var contentsPath = path.join(CONTENTS_DIR, name, "contents.md");
        var md = fs.existsSync(contentsPath) ? fs.readFileSync(contentsPath, "utf8") : "";
        subjects.push({ name: name, page: page, url: page.url, md: md, prog: prog });
    }

    // 3. 요약 브리핑
    var lines = ["📅 " + dateStr + " 학습 브리핑" + tag, "", "📊 진행 현황"];
    subjects.forEach(function (s) {
        var p = s.prog;
        if (p.total > 0 && p.current >= p.total) {
            lines.push("· " + s.name + " 완주! (" + p.total + "/" + p.total + ")");
        } else if (p.current === 0) {
            lines.push("· " + s.name + " 시작 전 - 오늘 Step 1부터!");
        } else {
            var pct = Math.round(p.current / p.total * 100);
            lines.push("· " + s.name + " Step " + p.current + "/" + p.total +
                " (" + p.currentRound + "회차) " + pct + "%");
        }
    });
    await send(lines.join("\n"));

    // 4. 과목별 안내 + 진도율 갱신
    for (var k = 0; k < subjects.length; k++) {
        var s = subjects[k];
        var p = s.prog;
        var next = p.current + 1;

        // 진도율 갱신(percent 형식: 0~1)
        if (p.total > 0) {
            var ratio = Math.round(p.current / p.total * 100) / 100;
            try {
                await notion("PATCH", "/pages/" + s.page.id, {
                    properties: { "진도율": { number: ratio } }
                });
            } catch (e) { console.log("진도율 갱신 실패(" + s.name + "): " + e.message); }
        }

        if (p.total > 0 && p.current >= p.total) {
            var slug = SLUG[s.name];
            await send("🎉 " + s.name + " 전 단계 완주!\n\n" +
                "모의시험으로 마무리 점검: " + SITE + "/" + slug + "-exam.html\n" +
                "노션에서 상태를 '완료'로 바꿔 주세요.");
            continue;
        }

        var step = extractStep(s.md, next);
        // 제목은 노션 토글 제목 우선, 없으면 contents.md 제목
        var stepMeta = p.steps.filter(function (x) { return x.n === next; })[0];
        var title = stepMeta ? stepMeta.title : (step ? step.title : "");
        if (!step) { console.log(s.name + ": Step " + next + " 콘텐츠 없음 - 안내 생략"); continue; }

        var msg = "📖 [" + s.name + "] 오늘 할 일: Step " + next + " - " + title +
            "\n\n" + step.body +
            "\n\n📝 학습 후 노션 해당 Step 토글 안 회차 토글에 정리: " + s.url;
        await send(msg);
        await sleep(400);
    }
    console.log("완료");
}

main().catch(async function (e) {
    console.error("오류:", e.message);
    // 침묵 실패 방지: 텔레그램으로 오류 알림 시도
    try {
        if (!DRY_RUN && TG_TOKEN && CHAT_ID) await send("⚠️ 학습 노티 생성 실패: " + e.message.slice(0, 200));
    } catch (e2) { /* 무시 */ }
    process.exit(1);
});
