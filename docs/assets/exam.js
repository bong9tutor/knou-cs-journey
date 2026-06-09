/* ==========================================================================
   KNOU 모의시험 엔진 (바닐라 JS, 의존성 없음)
   - <body data-exam="과목" data-exam-src="./data/xxx.json"> 페이지에서만 동작
   - #exam 요소 안에 시작화면 -> 응시 -> 채점/리뷰를 렌더한다
   - 유형: single, multi, ox, short, cloze, code-output, match, order
   - 타이머 / 자동 채점 / 해설 리뷰 / localStorage 진행·기록
   - 자가진단·연습용(정답이 클라이언트에 포함되므로 감독시험용 아님)
   ========================================================================== */
(function () {
    "use strict";

    var root = null;
    var data = null;
    var qs = [];
    var qById = {};
    var answers = {};
    var phase = "idle"; // idle | running | review
    var deadline = 0;
    var startedAt = 0;
    var timer = null;
    var KEY = "";
    var subject = "";

    /* ---------- 유틸 ---------- */
    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }
    function norm(s) {
        return (s == null ? "" : String(s))
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[.,!?;:]+$/, "");
    }
    function cmp(userVal, accept, caseInsensitive) {
        var a = norm(userVal);
        var b = norm(accept);
        if (caseInsensitive) {
            a = a.toLowerCase();
            b = b.toLowerCase();
        }
        return a !== "" && a === b;
    }
    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
        return a;
    }
    function cssEsc(s) {
        return String(s).replace(/(["\\])/g, "\\$1");
    }
    function lsGet(suffix) {
        try {
            return JSON.parse(localStorage.getItem(KEY + suffix));
        } catch (e) {
            return null;
        }
    }
    function lsSet(suffix, val) {
        try {
            localStorage.setItem(KEY + suffix, JSON.stringify(val));
        } catch (e) {
            /* 무시 */
        }
    }
    function lsDel(suffix) {
        try {
            localStorage.removeItem(KEY + suffix);
        } catch (e) {
            /* 무시 */
        }
    }
    function callout(kind, title, lines) {
        var c = el("div", "callout " + kind);
        if (title) c.appendChild(el("p", "callout__title", title));
        (lines || []).forEach(function (ln) {
            if (ln != null) c.appendChild(el("p", null, ln));
        });
        return c;
    }
    function typeLabel(t) {
        return (
            {
                single: "객관식",
                multi: "복수선택",
                ox: "OX",
                short: "단답",
                cloze: "빈칸",
                "code-output": "코드출력",
                match: "매칭",
                order: "순서"
            }[t] || t
        );
    }
    function validQ(q) {
        return !!(q && q.id && q.type && q.stem);
    }

    /* ---------- 초기화 / 로드 ---------- */
    function init() {
        root = document.getElementById("exam");
        if (!root) return;
        subject = document.body.getAttribute("data-exam") || "exam";
        KEY = "knou-exam-" + subject + "-";
        var src = document.body.getAttribute("data-exam-src");
        if (!src) {
            root.appendChild(callout("warn", null, ["data-exam-src 속성이 없어 문항을 불러올 수 없습니다."]));
            return;
        }
        root.addEventListener("click", onClick);
        root.addEventListener("change", onChange);
        root.addEventListener("input", onChange);
        root.appendChild(el("p", "exam__loading", "문항을 불러오는 중..."));
        fetch(src, { cache: "no-store" })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function (json) {
                data = json || {};
                renderStart();
            })
            .catch(function (e) {
                root.innerHTML = "";
                root.appendChild(
                    callout("warn", "문항을 불러오지 못했습니다", [
                        e.message,
                        "file:// 로 직접 열면 브라우저가 fetch를 막습니다. 정적 서버(예: GitHub Pages)나 로컬 서버로 여세요."
                    ])
                );
            });
    }

    function uniqueUnits() {
        var seen = {};
        var out = [];
        (data.questions || []).forEach(function (q) {
            if (q.unit && !seen[q.unit]) {
                seen[q.unit] = 1;
                out.push(q.unit);
            }
        });
        return out;
    }

    /* ---------- 시작 화면 ---------- */
    function renderStart() {
        stopTimer();
        phase = "idle";
        root.innerHTML = "";
        var cfg = data.config || {};
        var total = (data.questions || []).filter(validQ).length;

        var box = el("div", "exam__panel");
        box.appendChild(el("h2", null, (data.subject || "") + " 모의시험"));
        box.appendChild(
            el(
                "p",
                "exam__meta",
                "총 " +
                    total +
                    "문항 · 문항당 " +
                    (cfg.secPerQuestion || 60) +
                    "초 · 합격선 " +
                    (cfg.passPct || 60) +
                    "%"
            )
        );

        var row = el("div", "exam__row");
        var lab = el("label", null, "범위 ");
        lab.setAttribute("for", "exam-unit");
        var sel = el("select", "exam__select");
        sel.id = "exam-unit";
        var oAll = el("option", null, "전체 단원");
        oAll.value = "__all__";
        sel.appendChild(oAll);
        uniqueUnits().forEach(function (u) {
            var o = el("option", null, u);
            o.value = u;
            sel.appendChild(o);
        });
        row.appendChild(lab);
        row.appendChild(sel);
        box.appendChild(row);

        var sLab = el("label", "exam__row");
        var sCb = el("input");
        sCb.type = "checkbox";
        sCb.id = "exam-shuffle";
        sCb.checked = cfg.shuffle !== false;
        sLab.appendChild(sCb);
        sLab.appendChild(document.createTextNode(" 문항·보기 순서 섞기"));
        box.appendChild(sLab);

        var cRow = el("div", "exam__row");
        var cLab = el("label", null, "문항 수 ");
        cLab.setAttribute("for", "exam-count-sel");
        var cSel = el("select", "exam__select");
        cSel.id = "exam-count-sel";
        [
            ["25", "25문항 (실제 기말 형식)"],
            ["50", "50문항"],
            ["100", "100문항"],
            ["__all__", "전체 (" + total + "문항)"]
        ].forEach(function (opt) {
            var o = el("option", null, opt[1]);
            o.value = opt[0];
            cSel.appendChild(o);
        });
        cRow.appendChild(cLab);
        cRow.appendChild(cSel);
        box.appendChild(cRow);

        var startBtn = el("button", "exam__btn exam__btn--primary", "시험 시작");
        startBtn.type = "button";
        startBtn.setAttribute("data-exam-start", "");
        box.appendChild(startBtn);

        var prog = lsGet("progress");
        if (prog && prog.answers && prog.deadline > Date.now() && prog.order) {
            var rBtn = el("button", "exam__btn", "이어서 응시(저장된 진행)");
            rBtn.type = "button";
            rBtn.setAttribute("data-exam-resume", "");
            box.appendChild(rBtn);
        }
        root.appendChild(box);
        renderHistory();
    }

    function renderHistory() {
        var hist = lsGet("history") || [];
        if (!hist.length) return;
        var d = el("details", "section exam__history");
        d.appendChild(el("summary", null, "지난 응시 기록 (" + hist.length + "회)"));
        var body = el("div", "section__body");
        var wrap = el("div", "table-wrap");
        var tb = el("table");
        var thead = el("thead");
        var htr = el("tr");
        ["일시", "점수", "정답률", "소요"].forEach(function (h) {
            htr.appendChild(el("th", null, h));
        });
        thead.appendChild(htr);
        tb.appendChild(thead);
        var tbody = el("tbody");
        hist.slice().reverse().forEach(function (h) {
            var tr = el("tr");
            [
                h.date,
                h.score + "/" + h.total,
                h.pct + "%",
                Math.round((h.durationSec || 0) / 60) + "분"
            ].forEach(function (c) {
                tr.appendChild(el("td", null, c));
            });
            tbody.appendChild(tr);
        });
        tb.appendChild(tbody);
        wrap.appendChild(tb);
        body.appendChild(wrap);
        var clr = el("button", "exam__btn", "기록 지우기");
        clr.type = "button";
        clr.setAttribute("data-exam-clear", "");
        body.appendChild(clr);
        d.appendChild(body);
        root.appendChild(d);
    }

    /* ---------- 문항 표시 데이터 준비 ---------- */
    function prepareQ(q, doShuffle, saved) {
        if (q.type === "ox") {
            q._choices = [
                { id: "O", text: "참 (O)" },
                { id: "X", text: "거짓 (X)" }
            ];
        } else if (q.choices && q.choices.length) {
            var ch = q.choices.slice();
            if (saved && saved.choiceOrder) {
                var byId = {};
                ch.forEach(function (c) {
                    byId[c.id] = c;
                });
                ch = saved.choiceOrder
                    .map(function (id) {
                        return byId[id];
                    })
                    .filter(Boolean);
            } else if (doShuffle) {
                ch = shuffle(ch);
            }
            q._choices = ch;
        }
        if (q.type === "match" && q.pairs) {
            var rights = q.pairs.map(function (p) {
                return p.right;
            });
            q._lefts = q.pairs.map(function (p) {
                return p.left;
            });
            q._rights = saved && saved.rightOrder ? saved.rightOrder.slice() : doShuffle ? shuffle(rights) : rights.slice();
        }
        if (q.type === "order" && q.items) {
            q._display = saved && saved.itemOrder ? saved.itemOrder.slice() : doShuffle ? shuffle(q.items) : q.items.slice();
        }
    }

    function prepSnapshot(q) {
        var s = {};
        if (q._choices && q.type !== "ox") {
            s.choiceOrder = q._choices.map(function (c) {
                return c.id;
            });
        }
        if (q._rights) s.rightOrder = q._rights.slice();
        if (q._display) s.itemOrder = q._display.slice();
        return s;
    }

    /* ---------- 시작 ---------- */
    function start(resume) {
        var cfg = data.config || {};
        var prog = resume ? lsGet("progress") : null;
        var doShuffle, scope;
        if (resume && prog && prog.order) {
            doShuffle = false;
            scope = "__all__";
        } else {
            var us = document.getElementById("exam-unit");
            var ss = document.getElementById("exam-shuffle");
            scope = us ? us.value : "__all__";
            doShuffle = ss ? ss.checked : cfg.shuffle !== false;
        }
        var pool = (data.questions || []).filter(validQ).filter(function (q) {
            return scope === "__all__" || q.unit === scope;
        });
        if (!pool.length) {
            window.alert("선택한 범위에 문항이 없습니다.");
            return;
        }

        if (resume && prog && prog.order) {
            var byId = {};
            pool.forEach(function (q) {
                byId[q.id] = q;
            });
            qs = prog.order
                .map(function (id) {
                    return byId[id];
                })
                .filter(Boolean);
            qs.forEach(function (q) {
                prepareQ(q, false, (prog.prep && prog.prep[q.id]) || null);
            });
            answers = prog.answers || {};
            deadline = prog.deadline;
        } else {
            var ordered = doShuffle ? shuffle(pool) : pool.slice();
            var csel = document.getElementById("exam-count-sel");
            var want = csel ? csel.value : "__all__";
            var count =
                want === "__all__"
                    ? ordered.length
                    : Math.min(parseInt(want, 10) || ordered.length, ordered.length);
            qs = ordered.slice(0, count);
            qs.forEach(function (q) {
                prepareQ(q, doShuffle, null);
            });
            answers = {};
            deadline = Date.now() + qs.length * (cfg.secPerQuestion || 60) * 1000;
        }
        qById = {};
        qs.forEach(function (q) {
            qById[q.id] = q;
        });
        startedAt = Date.now();
        phase = "running";
        renderExam();
        saveProgress();
        startTimer();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    /* ---------- 응시 화면 렌더 ---------- */
    function renderExam() {
        root.innerHTML = "";

        var bar = el("div", "exam__bar");
        var timeChip = el("span", "chip exam__timer");
        timeChip.id = "exam-timer";
        var cntChip = el("span", "chip exam__count");
        cntChip.id = "exam-count";
        var submit = el("button", "exam__btn exam__btn--primary", "제출");
        submit.type = "button";
        submit.setAttribute("data-exam-submit", "");
        bar.appendChild(timeChip);
        bar.appendChild(cntChip);
        bar.appendChild(submit);
        root.appendChild(bar);

        var list = el("div", "exam__list");
        qs.forEach(function (q, i) {
            list.appendChild(renderCard(q, i));
        });
        root.appendChild(list);

        var foot = el("div", "exam__foot");
        var submit2 = el("button", "exam__btn exam__btn--primary", "제출하고 채점");
        submit2.type = "button";
        submit2.setAttribute("data-exam-submit", "");
        foot.appendChild(submit2);
        root.appendChild(foot);

        qs.forEach(function (q) {
            applyAnswer(q);
        });
        updateCount();
        updateTimerDisplay();
    }

    function renderCard(q, i) {
        var card = el("div", "exam__q");
        card.setAttribute("data-qid", q.id);
        var head = el("div", "exam__q-head");
        head.appendChild(el("span", "exam__num", "Q" + (i + 1)));
        if (q.unit) head.appendChild(el("span", "chip", q.unit));
        if (q.difficulty) head.appendChild(el("span", "chip", q.difficulty));
        head.appendChild(el("span", "chip", (q.points || 1) + "점"));
        head.appendChild(el("span", "chip exam__type", typeLabel(q.type)));
        card.appendChild(head);

        if (q.type === "cloze") {
            card.appendChild(renderCloze(q));
        } else {
            card.appendChild(el("p", "exam__stem", q.stem));
        }
        if (q.stemCode) {
            var code = el("div", "code");
            var pre = el("pre");
            var cd = el("code");
            cd.textContent = q.stemCode;
            pre.appendChild(cd);
            code.appendChild(pre);
            card.appendChild(code);
        }
        card.appendChild(renderInput(q));

        var fb = el("div", "exam__fb");
        fb.setAttribute("data-fb", q.id);
        card.appendChild(fb);
        return card;
    }

    function renderCloze(q) {
        var p = el("p", "exam__stem");
        var parts = String(q.stem || "").split(/\{\{(\d+)\}\}/);
        parts.forEach(function (seg, idx) {
            if (idx % 2 === 0) {
                if (seg) p.appendChild(document.createTextNode(seg));
            } else {
                var inp = el("input", "exam__text exam__blank");
                inp.type = "text";
                inp.setAttribute("data-blank", seg);
                inp.setAttribute("autocomplete", "off");
                inp.setAttribute("aria-label", "빈칸 " + seg);
                p.appendChild(inp);
            }
        });
        return p;
    }

    function renderInput(q) {
        var wrap = el("div", "exam__input");
        var t = q.type;
        if (t === "single" || t === "ox" || t === "code-output") {
            (q._choices || []).forEach(function (c) {
                var lab = el("label", "exam__choice");
                var inp = el("input");
                inp.type = "radio";
                inp.name = q.id;
                inp.value = c.id;
                lab.appendChild(inp);
                lab.appendChild(document.createTextNode(" " + c.text));
                wrap.appendChild(lab);
            });
        } else if (t === "multi") {
            (q._choices || []).forEach(function (c) {
                var lab = el("label", "exam__choice");
                var inp = el("input");
                inp.type = "checkbox";
                inp.name = q.id;
                inp.value = c.id;
                lab.appendChild(inp);
                lab.appendChild(document.createTextNode(" " + c.text));
                wrap.appendChild(lab);
            });
        } else if (t === "short") {
            var inp2 = el("input", "exam__text");
            inp2.type = "text";
            inp2.setAttribute("autocomplete", "off");
            inp2.setAttribute("aria-label", "단답 입력");
            wrap.appendChild(inp2);
        } else if (t === "match") {
            (q._lefts || []).forEach(function (left) {
                var rowm = el("div", "exam__pair");
                rowm.appendChild(el("span", "exam__pair-left", left));
                var sel = el("select", "exam__select");
                sel.setAttribute("data-left", left);
                sel.setAttribute("aria-label", left + " 짝 선택");
                sel.appendChild(el("option", null, "- 선택 -"));
                (q._rights || []).forEach(function (r) {
                    var o = el("option", null, r);
                    o.value = r;
                    sel.appendChild(o);
                });
                rowm.appendChild(sel);
                wrap.appendChild(rowm);
            });
        } else if (t === "order") {
            var n = (q._display || []).length;
            (q._display || []).forEach(function (it) {
                var rowm = el("div", "exam__pair");
                var sel = el("select", "exam__select exam__order-sel");
                sel.setAttribute("data-item", it);
                sel.setAttribute("aria-label", it + " 순서 선택");
                sel.appendChild(el("option", null, "-"));
                for (var k = 1; k <= n; k++) {
                    var o = el("option", null, String(k));
                    o.value = String(k);
                    sel.appendChild(o);
                }
                rowm.appendChild(sel);
                rowm.appendChild(el("span", "exam__pair-left", it));
                wrap.appendChild(rowm);
            });
        }
        return wrap;
    }

    /* ---------- 답 읽기/적용 ---------- */
    function cardOf(qid) {
        return root.querySelector('[data-qid="' + cssEsc(qid) + '"]');
    }
    function readAnswer(q) {
        var card = cardOf(q.id);
        if (!card) return undefined;
        var t = q.type;
        if (t === "single" || t === "ox" || t === "code-output") {
            var r = card.querySelector("input:checked");
            return r ? r.value : undefined;
        }
        if (t === "multi") {
            var cs = card.querySelectorAll("input:checked");
            if (!cs.length) return undefined;
            return Array.prototype.map.call(cs, function (c) {
                return c.value;
            });
        }
        if (t === "short") {
            var inp = card.querySelector('input[type="text"]');
            return inp && inp.value.trim() ? inp.value : undefined;
        }
        if (t === "cloze") {
            var bl = card.querySelectorAll("input[data-blank]");
            var arr = Array.prototype.map.call(bl, function (b) {
                return b.value;
            });
            return arr.some(function (v) {
                return v && v.trim();
            })
                ? arr
                : undefined;
        }
        if (t === "match") {
            var sels = card.querySelectorAll("select[data-left]");
            var map = {};
            var any = false;
            Array.prototype.forEach.call(sels, function (s) {
                if (s.value) {
                    map[s.getAttribute("data-left")] = s.value;
                    any = true;
                }
            });
            return any ? map : undefined;
        }
        if (t === "order") {
            var os = card.querySelectorAll("select[data-item]");
            var m = {};
            var any2 = false;
            Array.prototype.forEach.call(os, function (s) {
                if (s.value) {
                    m[s.getAttribute("data-item")] = s.value;
                    any2 = true;
                }
            });
            return any2 ? m : undefined;
        }
        return undefined;
    }
    function applyAnswer(q) {
        var a = answers[q.id];
        if (a === undefined) return;
        var card = cardOf(q.id);
        if (!card) return;
        var t = q.type;
        if (t === "single" || t === "ox" || t === "code-output") {
            var r = card.querySelector('input[value="' + cssEsc(a) + '"]');
            if (r) r.checked = true;
        } else if (t === "multi") {
            (a || []).forEach(function (v) {
                var c = card.querySelector('input[value="' + cssEsc(v) + '"]');
                if (c) c.checked = true;
            });
        } else if (t === "short") {
            var inp = card.querySelector('input[type="text"]');
            if (inp) inp.value = a;
        } else if (t === "cloze") {
            var bl = card.querySelectorAll("input[data-blank]");
            (a || []).forEach(function (v, i) {
                if (bl[i]) bl[i].value = v;
            });
        } else if (t === "match") {
            Array.prototype.forEach.call(card.querySelectorAll("select[data-left]"), function (s) {
                var v = a[s.getAttribute("data-left")];
                if (v) s.value = v;
            });
        } else if (t === "order") {
            Array.prototype.forEach.call(card.querySelectorAll("select[data-item]"), function (s) {
                var v = a[s.getAttribute("data-item")];
                if (v) s.value = v;
            });
        }
    }

    /* ---------- 채점 ---------- */
    function grade(q) {
        var a = answers[q.id];
        if (a === undefined) return false;
        var t = q.type;
        if (t === "single" || t === "ox" || t === "code-output") {
            return !!(q.answer && q.answer.length && a === q.answer[0]);
        }
        if (t === "multi") {
            if (!q.answer || !q.answer.length) return false;
            var want = q.answer.slice().sort().join("");
            var got = (a || []).slice().sort().join("");
            return want === got;
        }
        if (t === "short") {
            var ci = q.acceptCaseInsensitive !== false;
            return (q.answer || []).some(function (acc) {
                return cmp(a, acc, ci);
            });
        }
        if (t === "cloze") {
            if (!q.blanks || !q.blanks.length) return false;
            var ci2 = q.acceptCaseInsensitive !== false;
            return q.blanks.every(function (b, i) {
                var v = (a && a[i]) || "";
                return (b.accept || []).some(function (acc) {
                    return cmp(v, acc, ci2);
                });
            });
        }
        if (t === "match") {
            if (!q.pairs || !q.pairs.length) return false;
            return q.pairs.every(function (p) {
                return a && a[p.left] === p.right;
            });
        }
        if (t === "order") {
            if (!q.items || !q.items.length) return false;
            return q.items.every(function (it, i) {
                return a && String(a[it]) === String(i + 1);
            });
        }
        return false;
    }

    function correctText(q) {
        var t = q.type;
        if (t === "single" || t === "code-output") {
            var id = q.answer && q.answer[0];
            var found = (q._choices || []).filter(function (c) {
                return c.id === id;
            })[0];
            return found ? found.text : String(id);
        }
        if (t === "ox") {
            return q.answer && q.answer[0] === "O" ? "참 (O)" : "거짓 (X)";
        }
        if (t === "multi") {
            var map = {};
            (q._choices || []).forEach(function (c) {
                map[c.id] = c.text;
            });
            return (q.answer || [])
                .map(function (id) {
                    return map[id] || id;
                })
                .join(", ");
        }
        if (t === "short") {
            return (q.answer || []).join(" / ");
        }
        if (t === "cloze") {
            return (q.blanks || [])
                .map(function (b, i) {
                    return i + 1 + ") " + (b.accept || []).join(" / ");
                })
                .join("  ");
        }
        if (t === "match") {
            return (q.pairs || [])
                .map(function (p) {
                    return p.left + " -> " + p.right;
                })
                .join(" ; ");
        }
        if (t === "order") {
            return (q.items || [])
                .map(function (it, i) {
                    return i + 1 + ". " + it;
                })
                .join("  ");
        }
        return "";
    }

    /* ---------- 제출 / 결과 ---------- */
    function captureAll() {
        qs.forEach(function (q) {
            var a = readAnswer(q);
            if (a === undefined) delete answers[q.id];
            else answers[q.id] = a;
        });
    }

    function submit(auto) {
        if (phase !== "running") return;
        captureAll();
        var unanswered = qs.filter(function (q) {
            return answers[q.id] === undefined;
        }).length;
        if (!auto && unanswered > 0) {
            if (!window.confirm("미응답 " + unanswered + "문항이 있습니다. 제출할까요?")) return;
        }
        stopTimer();
        phase = "review";

        var earned = 0;
        var totalPts = 0;
        var correctCnt = 0;
        var byUnit = {};
        qs.forEach(function (q) {
            var pts = q.points || 1;
            totalPts += pts;
            var ok = grade(q);
            if (ok) {
                earned += pts;
                correctCnt += 1;
            }
            var u = q.unit || "기타";
            if (!byUnit[u]) byUnit[u] = { ok: 0, n: 0 };
            byUnit[u].n += 1;
            if (ok) byUnit[u].ok += 1;
            reviewCard(q, ok);
        });
        var pct = totalPts ? Math.round((earned / totalPts) * 100) : 0;
        var durationSec = Math.round((Date.now() - startedAt) / 1000);

        // 기록 저장
        var hist = lsGet("history") || [];
        hist.push({
            date: dateStr(),
            score: earned,
            total: totalPts,
            pct: pct,
            correct: correctCnt,
            questions: qs.length,
            durationSec: durationSec
        });
        lsSet("history", hist);
        lsDel("progress");

        renderResult(earned, totalPts, pct, correctCnt, durationSec, byUnit, auto);
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    function dateStr() {
        var d = new Date();
        function p(n) {
            return n < 10 ? "0" + n : "" + n;
        }
        return (
            d.getFullYear() +
            "-" +
            p(d.getMonth() + 1) +
            "-" +
            p(d.getDate()) +
            " " +
            p(d.getHours()) +
            ":" +
            p(d.getMinutes())
        );
    }

    function reviewCard(q, ok) {
        var card = cardOf(q.id);
        if (!card) return;
        card.classList.add(ok ? "exam__q--correct" : "exam__q--wrong");
        Array.prototype.forEach.call(card.querySelectorAll("input, select"), function (x) {
            x.disabled = true;
        });
        var fb = card.querySelector('[data-fb="' + cssEsc(q.id) + '"]');
        if (!fb) return;
        fb.innerHTML = "";
        var lines = ["정답: " + correctText(q)];
        if (q.explanation) lines.push("해설: " + q.explanation);
        if (q.source) lines.push("(" + q.source + ")");
        fb.appendChild(callout(ok ? "tip" : "warn", ok ? "정답" : "오답", lines));
    }

    function renderResult(earned, totalPts, pct, correctCnt, durationSec, byUnit, auto) {
        var cfg = data.config || {};
        var pass = pct >= (cfg.passPct || 60);
        var panel = el("div", "exam__result");
        panel.appendChild(el("h2", null, "채점 결과" + (auto ? " (시간 종료 자동 제출)" : "")));
        panel.appendChild(
            el(
                "p",
                "exam__score",
                earned + " / " + totalPts + "점  ·  정답 " + correctCnt + "/" + qs.length + "문항  ·  " + pct + "%"
            )
        );
        panel.appendChild(
            callout(pass ? "tip" : "warn", pass ? "합격선 통과" : "합격선 미달", [
                "합격선 " + (cfg.passPct || 60) + "% · 소요 시간 " + Math.floor(durationSec / 60) + "분 " + (durationSec % 60) + "초"
            ])
        );

        // 단원별 정답률
        var units = Object.keys(byUnit);
        if (units.length > 1) {
            var wrap = el("div", "table-wrap");
            var tb = el("table");
            var thead = el("thead");
            var htr = el("tr");
            ["단원", "정답/문항", "정답률"].forEach(function (h) {
                htr.appendChild(el("th", null, h));
            });
            thead.appendChild(htr);
            tb.appendChild(thead);
            var tbody = el("tbody");
            units.forEach(function (u) {
                var b = byUnit[u];
                var tr = el("tr");
                tr.appendChild(el("td", null, u));
                tr.appendChild(el("td", null, b.ok + "/" + b.n));
                tr.appendChild(el("td", null, Math.round((b.ok / b.n) * 100) + "%"));
                tbody.appendChild(tr);
            });
            tb.appendChild(tbody);
            wrap.appendChild(tb);
            panel.appendChild(wrap);
        }

        var retry = el("button", "exam__btn exam__btn--primary", "다시 풀기");
        retry.type = "button";
        retry.setAttribute("data-exam-retry", "");
        panel.appendChild(retry);
        panel.appendChild(el("p", "exam__hint", "아래에서 문항별 정답·해설을 확인하세요."));

        root.insertBefore(panel, root.firstChild);
    }

    /* ---------- 진행 저장 ---------- */
    function saveProgress() {
        if (phase !== "running") return;
        var prep = {};
        qs.forEach(function (q) {
            prep[q.id] = prepSnapshot(q);
        });
        lsSet("progress", {
            answers: answers,
            deadline: deadline,
            order: qs.map(function (q) {
                return q.id;
            }),
            prep: prep
        });
    }

    function updateCount() {
        var c = document.getElementById("exam-count");
        if (!c) return;
        var answered = qs.filter(function (q) {
            return answers[q.id] !== undefined;
        }).length;
        c.textContent = "응답 " + answered + "/" + qs.length;
    }

    /* ---------- 타이머 ---------- */
    function startTimer() {
        stopTimer();
        timer = window.setInterval(function () {
            updateTimerDisplay();
        }, 1000);
    }
    function stopTimer() {
        if (timer) {
            window.clearInterval(timer);
            timer = null;
        }
    }
    function updateTimerDisplay() {
        var t = document.getElementById("exam-timer");
        if (!t) return;
        var remain = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        var m = Math.floor(remain / 60);
        var s = remain % 60;
        t.textContent = "남은 시간 " + m + ":" + (s < 10 ? "0" + s : s);
        if (remain <= 60) t.classList.add("warn");
        else t.classList.remove("warn");
        if (remain <= 0 && phase === "running") {
            submit(true);
        }
    }

    /* ---------- 이벤트 ---------- */
    function onClick(e) {
        var t = e.target;
        if (t.closest("[data-exam-start]")) {
            start(false);
            return;
        }
        if (t.closest("[data-exam-resume]")) {
            start(true);
            return;
        }
        if (t.closest("[data-exam-submit]")) {
            submit(false);
            return;
        }
        if (t.closest("[data-exam-retry]")) {
            lsDel("progress");
            renderStart();
            return;
        }
        if (t.closest("[data-exam-clear]")) {
            if (window.confirm("응시 기록을 모두 지울까요?")) {
                lsDel("history");
                renderStart();
            }
            return;
        }
    }
    function onChange(e) {
        if (phase !== "running") return;
        var card = e.target.closest ? e.target.closest("[data-qid]") : null;
        if (!card) return;
        var qid = card.getAttribute("data-qid");
        var q = qById[qid];
        if (!q) return;
        var a = readAnswer(q);
        if (a === undefined) delete answers[qid];
        else answers[qid] = a;
        updateCount();
        saveProgress();
    }

    /* ---------- 부트스트랩 ---------- */
    function boot() {
        if (!document.getElementById("exam")) return;
        if (!("fetch" in window) || !document.body.getAttribute("data-exam")) {
            var r = document.getElementById("exam");
            if (r) r.appendChild(callout("warn", null, ["이 브라우저에서는 모의시험을 실행할 수 없습니다."]));
            return;
        }
        init();
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
