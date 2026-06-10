# 학습 노티 GitHub Actions 설정 가이드

매일 오전 8시 텔레그램 학습 브리핑을 **GitHub 서버에서 자동 발송**하도록 옮기는 가이드다. 내 PC가 꺼져 있어도, 앱이 닫혀 있어도 정해진 시각에 동작한다.

> 이 문서 하나로 끝나게 만들었다. 워크플로 yml과 발송 스크립트 전문이 6, 7장에 들어 있으니 그대로 복사해 레포에 넣으면 된다. 직접 해야 할 1회 작업은 **노션 토큰 발급(2장) + GitHub Secrets 등록(4장)** 두 가지뿐이다.

---

## 0. 왜 옮기나 / 구조

기존 방식(`~/.claude/scheduled-tasks`)은 이 앱 안에서 도는 **로컬 스케줄**이라 PC가 켜져 있고 앱이 실행 중이어야만 동작했다. GitHub Actions는 GitHub 서버의 cron이 실행하므로 내 PC 상태와 무관하다.

```
[GitHub Actions cron]  --매일 08:00 KST-->  러너(Ubuntu, 클라우드)
        |
        |-- 1. 레포 체크아웃 (resources/study-noti/*/contents.md 확보)
        |-- 2. 노션 API로 "진행 중" 과목 조회 + Step/회차 파싱
        |-- 3. 진도율 노션에 갱신
        |-- 4. 텔레그램 API로 브리핑 + 과목별 안내 발송
```

세 가지 비밀값을 GitHub Secrets로 주입한다: 노션 토큰, 텔레그램 봇 토큰, 텔레그램 chat ID. 레포 파일은 공개 레포라 기본 `GITHUB_TOKEN`으로 체크아웃되니 별도 토큰이 필요 없다.

---

## 1. 사전 준비물 체크리스트

- [ ] 노션 토큰(PAT 또는 연결) 발급 (2장)
- [ ] 트래커 DB를 그 토큰에 연결 (2-2장, 필수)
- [ ] 텔레그램 봇 토큰 확인 (3장, 기존 학습 봇 토큰 재사용)
- [ ] 텔레그램 chat ID 확인 (3장)
- [ ] GitHub 레포에 Secrets 3개 등록 (4장)
- [ ] `.github/workflows/study-noti.yml` 추가 (6장)
- [ ] `.github/scripts/send-study-noti.mjs` 추가 (7장)
- [ ] 수동 실행으로 테스트 (8장)

---

## 2. 노션 개인 액세스 토큰(PAT) 발급

지금까지는 Claude가 노션에 OAuth(브라우저 로그인)로 접근했다. GitHub 서버는 브라우저 로그인을 할 수 없으므로 **정적 토큰**을 미리 발급해 둬야 한다. 노션의 정적 토큰은 두 종류인데, 본인 혼자 쓰는 개인 자동화에는 **개인 액세스 토큰(PAT)** 이 가장 간단하다.

> **PAT vs 연결(Internal connection) 차이**: PAT는 "내 계정 권한" 기반, "연결(액세스 토큰)"은 별도 봇이다. 둘 다 스크립트에서 동일하게 동작(`Authorization: Bearer` + Notion API)하고 발급 절차도 거의 같으니 어느 쪽이든 된다. **어느 쪽이든 트래커 DB를 그 토큰에 한 번 연결(Connect)해 둬야 404가 안 난다**(2-2 필수). OAuth 옵션은 브라우저 로그인이 필요해 헤드리스 실행에 안 맞으니 쓰지 않는다.

### 2-1. PAT 발급

1. https://www.notion.so/my-integrations 접속 (트래커가 있는 워크스페이스 계정으로 로그인).
2. **개인 액세스 토큰(Personal access tokens)** 화면에서 **+ 새 토큰(New token)** 클릭.
   - (화면이 "연결/Connections"로 열리면, 좌측/상단에서 **개인 액세스 토큰** 탭으로 이동한다.)
3. 설정:
   - 토큰 이름: `KNOU 학습 노티` (자유)
   - 워크스페이스: **학습 트래커가 있는 워크스페이스** 선택 (예: `BONG JAE KIM의 Notion`)
   - 기능(Capabilities): **Notion API** 체크(기본값). 이게 콘텐츠 읽기/쓰기/검색 권한이라 진도율 갱신까지 가능하다. `Workers`는 체크 안 함.
4. **토큰 생성하기** 클릭 -> 나오는 토큰을 복사한다(`ntn_` 등으로 시작하는 긴 문자열). 이게 `NOTION_TOKEN`이 된다.

> 토큰은 생성 직후에만 전체가 보이니 바로 4장의 GitHub Secret에 넣어 둔다. 노출되면 같은 화면에서 폐기(revoke) 후 재발급한다. PAT는 내 계정 권한 전체를 쓰므로 절대 코드/커밋에 직접 넣지 않는다.

### 2-2. 트래커 DB를 토큰에 연결 (필수)

토큰을 만든 직후에는 그 토큰이 트래커 DB를 볼 수 없어, 안 하면 실행 시 `404 object_not_found: Make sure the relevant pages and databases are shared with your integration` 오류가 난다. 한 번만 연결해 두면 된다.

1. 노션에서 **방송대 컴퓨터과학과 학습 트래커** 데이터베이스를 연다(풀페이지 DB면 DB 제목 우측 상단, 인라인이면 그 페이지 우측 상단).
2. **...(더보기) -> 연결(Connections) -> 연결 추가** 클릭.
3. 검색창에 `KNOU` 입력 -> 만든 토큰(`KNOU 학습 노티`) 선택해 연결.
4. DB에 연결하면 그 안의 모든 과목 페이지(하위 페이지)도 함께 접근 가능해진다. 과목 페이지를 일일이 연결할 필요는 없다.

### 2-3. 데이터베이스 ID 확인

공개 레포에 ID를 박지 않으려고, DB ID도 Secret(`NOTION_DB_ID`)으로 넣는다(4장). ID는 트래커 DB를 브라우저로 열었을 때 URL에서 확인한다: `notion.so/.../<32자리 ID>?v=...` 의 `<32자리 ID>` 부분(하이픈 없는 32자 16진수).

- 상태 속성 이름: `상태` (select: 시작 전 / 진행 중 / 완료) - 스크립트에 고정
- 진도율 속성 이름: `진도율` (number, percent 형식. 0.07 = 7%) - 스크립트에 고정
- (신버전 API 전환 시) 데이터소스 ID는 10장 트러블슈팅 참고

---

## 3. 텔레그램 봇 토큰 / chat ID

기존 노티에서 쓰던 값을 그대로 재사용한다. **이 문서는 공개 레포에 들어가므로 실제 토큰/chat ID는 여기 적지 말고 4장의 GitHub Secret에만 넣는다.**

- 봇 토큰: 로컬 `~/.claude/scheduled-tasks/knou-daily-study-noti/SKILL.md` 안의 `https://api.telegram.org/bot<토큰>/sendMessage` 부분에서 `bot` 과 `/sendMessage` 사이 문자열이 토큰이다(`숫자:문자열` 형태). 이 값을 Secret `TELEGRAM_BOT_TOKEN`에 넣는다.
- chat ID: 내 텔레그램 사용자 ID(숫자). 같은 SKILL.md 안 임시 JSON 형식 `{"chat_id":"..."}` 의 값이거나, 텔레그램 `@userinfobot` 에게 말을 걸면 알려준다. 이 값을 Secret `TELEGRAM_CHAT_ID`에 넣는다.

> 토큰을 새로 만들고 싶으면 텔레그램 `@BotFather` -> `/token` 으로 재발급할 수 있다(기존 토큰은 무효화됨).

> **보안 메모**: 진짜 비밀은 봇 토큰뿐이다. chat ID와 노션 ID는 토큰 없이는 무용지물이라 단독 위험은 낮지만, 공개 레포에 개인 식별자를 남기지 않도록 전부 Secret으로 주입한다(아래 4장). 봇 username은 텔레그램에서 검색으로 누구나 찾을 수 있는 공개 정보라 비밀이 아니다.

---

## 4. GitHub Secrets 등록

GitHub 레포 `bong9tutor/knou-cs-journey` 에서:

1. **Settings -> Secrets and variables -> Actions -> New repository secret**
2. 아래 3개를 등록한다 (이름 정확히):

| Secret 이름 | 값 |
|---|---|
| `NOTION_TOKEN` | 2장에서 복사한 개인 액세스 토큰(PAT) |
| `NOTION_DB_ID` | 트래커 DB의 32자리 ID (2-3장) |
| `TELEGRAM_BOT_TOKEN` | 3장의 봇 토큰 (`숫자:문자열`) |
| `TELEGRAM_CHAT_ID` | 내 텔레그램 chat ID (3장) |

> Secret 값은 등록 후 다시 볼 수 없고 로그에도 마스킹된다. 토큰·chat ID·DB ID를 코드나 커밋에 직접 쓰지 않고 전부 여기 Secret으로만 둔다.

---

## 5. 디렉토리 배치

```
.github/
  workflows/
    study-noti.yml        <- 6장
  scripts/
    send-study-noti.mjs   <- 7장
resources/
  study-noti/
    {과목명}/contents.md   <- 이미 있음(스크립트가 읽음)
```

스크립트는 의존성이 없다(Node 20 내장 fetch 사용). 그래서 `npm install` 단계도 필요 없다.

---

## 6. 워크플로 파일 `.github/workflows/study-noti.yml`

```yaml
name: 학습 노티

on:
    schedule:
        # GitHub Actions cron은 UTC 기준. 08:00 KST = 전날 23:00 UTC.
        - cron: "0 23 * * *"
    workflow_dispatch:
        # 수동 실행(테스트)용. test 모드면 제목에 [테스트] 표시, dry_run이면 발송 대신 로그만.
        inputs:
            test:
                description: "테스트 모드 (제목에 [테스트] 표시)"
                type: boolean
                default: false
            dry_run:
                description: "발송하지 않고 로그만 출력"
                type: boolean
                default: false

# 동시 실행 방지(겹쳐 도는 것 차단)
concurrency:
    group: study-noti
    cancel-in-progress: false

jobs:
    notify:
        runs-on: ubuntu-latest
        steps:
            - name: 레포 체크아웃
              uses: actions/checkout@v4

            - name: Node 설정
              uses: actions/setup-node@v4
              with:
                  node-version: "20"

            - name: 학습 노티 발송
              env:
                  NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
                  NOTION_DB_ID: ${{ secrets.NOTION_DB_ID }}
                  TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
                  TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
                  TEST_MODE: ${{ inputs.test }}
                  DRY_RUN: ${{ inputs.dry_run }}
              run: node .github/scripts/send-study-noti.mjs
```

---

## 7. 발송 스크립트 `.github/scripts/send-study-noti.mjs`

Node 20 내장 `fetch`만 쓴다(외부 패키지 없음). 로직은 기존 SKILL.md와 동일하다: 진행 중 과목 조회 -> Step/회차 파싱(빈 토글 제외) -> 진도율 갱신 -> 텔레그램 발송.

```javascript
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
        if (!DRY_RUN) await send("⚠️ 학습 노티 생성 실패: " + e.message.slice(0, 200));
    } catch (e2) { /* 무시 */ }
    process.exit(1);
});
```

---

## 8. 테스트

실제 8시까지 기다리지 않고 수동으로 돌려 본다.

1. 6, 7장 파일을 레포에 추가하고 `master`에 푸시한다.
2. GitHub 레포 -> **Actions** 탭 -> 왼쪽 **학습 노티** 워크플로 선택.
3. **Run workflow** 버튼 -> 옵션 선택:
   - 먼저 **dry_run = true** 로 한 번 돌려 로그(메시지 미리보기)만 확인 -> 발송 없이 파싱/구성이 맞는지 점검.
   - 그다음 **test = true** 로 돌려 실제 텔레그램에 `[테스트]` 표시로 발송되는지 확인.
4. Actions 실행 로그에서 초록 체크(성공) 확인. 빨간 X면 9장 참고.
5. 잘 되면 옵션 없이(=실서비스 형식) 한 번 더 확인하고 끝. 이후 매일 자동 실행된다.

---

## 9. 운영 메모

- **발송 시각 오차**: GitHub Actions의 schedule cron은 부하에 따라 보통 몇 분 ~ 길게는 15분 이상 늦게 뜰 수 있다(빨라지지는 않는다). "정각 8시"가 아니라 "8시 무렵"으로 보면 된다. 더 이르게 받고 싶으면 cron을 `45 22 * * *`(07:45 KST 목표) 식으로 당겨 둔다.
- **60일 비활성 시 자동 비활성화**: 레포에 60일간 커밋이 없으면 GitHub이 schedule 워크플로를 자동으로 끈다. 학습 기록을 꾸준히 커밋하면 문제없고, 멈췄다면 Actions 탭에서 다시 켜면 된다.
- **진도 동작**: 노션 해당 Step 토글 안 "N회차" 토글에 내용을 적으면 그게 곧 진도다. 빈 토글(자식 없음 / 빈 문단만 있음)은 집계하지 않는다. 다음 발송 때 자동으로 다음 Step을 안내하고 진도율도 갱신한다.
- **새 과목 시작**: 노션 상태판에서 과목을 "진행 중"으로 옮기면 다음 발송부터 포함된다. 슬러그가 새로 필요하면 7장 스크립트의 `SLUG` 맵에 한 줄 추가한다.
- **기존 로컬 스케줄 정리**: GitHub Actions가 안정적으로 돌기 시작하면, 로컬 `knou-daily-study-noti` 스케줄 작업은 꺼서 이중 발송을 막는다(앱 설정 또는 스케줄 작업 비활성화).

---

## 10. 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| Notion 401 Unauthorized | 토큰 오타 또는 잘못된 토큰. PAT가 학습 트래커 워크스페이스에서 발급됐는지 확인. |
| Notion 404 (DB/페이지) | PAT라면 본인이 그 DB의 소유자/편집자인지 확인(접근 권한이 없으면 안 보임). "연결(액세스 토큰)"로 만들었다면 DB를 그 연결에 Connect 했는지 확인. DB ID 오타도 점검. |
| "is a data source" 류 오류 | 신버전 API 전환된 경우. `NOTION_VERSION`을 `2025-09-03`으로 바꾸고, DB 대신 데이터소스를 쿼리한다(엔드포인트 `/data_sources/<데이터소스 ID>/query`). 데이터소스 ID는 노션 DB의 `... -> Manage data sources` 또는 `notion-fetch` 출력의 `collection://` 뒤 UUID에서 확인하고, 필요하면 Secret으로 추가한다. |
| 진행 중인데 "시작 전"으로 나옴 | 회차 토글이 비어 있음(정상). 토글 안에 실제 내용을 적으면 다음 발송에 반영. |
| 회차가 잘못 셈 | 빈 문단만 있는 토글은 제외되어야 정상. 내용이 없으면 미집계가 맞음. |
| Telegram 발송 실패 | 봇 토큰 오타, 또는 chat_id 오류. 해당 봇과 한 번이라도 대화를 시작한 적 있어야 함. |
| schedule이 안 돔 | 60일 비활성으로 꺼졌거나, 워크플로 파일이 기본 브랜치(master)에 있어야 schedule이 동작함. |
| 진도율이 % 이상하게 표시 | `진도율`은 percent 형식이라 0~1 값을 넣어야 한다(0.07 = 7%). 스크립트는 이미 그렇게 넣는다. |

---

## 부록: 로컬 방식과 비교

| | 로컬 scheduled-tasks (기존) | GitHub Actions (이 문서) |
|---|---|---|
| 실행 위치 | 내 PC의 앱 | GitHub 클라우드 |
| PC 꺼져 있어도 | X (다음 앱 실행 때 뒤늦게) | O |
| 노션 접근 | OAuth(브라우저 로그인) | 개인 액세스 토큰(PAT) |
| 비용 | 앱 크레딧 | 공개 레포는 무료 |
| 진도 파싱 주체 | Claude 에이전트(SKILL.md) | 스크립트(send-study-noti.mjs) |

기능과 메시지 형식은 동일하다. 차이는 "어디서 도는가"와 "노션을 토큰으로 접근한다"는 점뿐이다.
