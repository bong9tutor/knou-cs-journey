/* ==========================================================================
   KNOU 학습 노트 공용 스크립트 (바닐라 JS, 의존성 없음)
   - 테마 토글(localStorage 저장)
   - 목차 드로어 열기/닫기
   - scrollspy(현재 섹션 목차 하이라이트)
   - 읽기 진행바
   - 맨위로 버튼
   - 코드 복사 버튼(.copy)
   - 플래시카드 탭 뒤집기(.flashcard -> .flipped)
   - 발음 듣기(.speak-btn, Web Speech API; <body data-tts="en"> 어학 페이지 전용)
   예상출력(.output)/자가점검(.quiz)은 네이티브 <details>로 동작한다.
   ========================================================================== */
(function () {
    "use strict";

    var THEME_KEY = "knou-theme";
    var root = document.documentElement;

    /* ----------------------------------------------------------------------
       1. 테마 토글 (라이트/다크), localStorage 저장
       ---------------------------------------------------------------------- */
    function applyTheme(theme) {
        if (theme === "dark" || theme === "light") {
            root.setAttribute("data-theme", theme);
        } else {
            root.removeAttribute("data-theme"); // OS 설정 따름
        }
    }

    function currentTheme() {
        var saved = root.getAttribute("data-theme");
        if (saved === "dark" || saved === "light") {
            return saved;
        }
        // 저장값이 없으면 OS 설정을 현재값으로 본다
        return window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    // 초기 적용 (깜빡임을 줄이려면 head 인라인 스크립트로 옮길 수 있음)
    try {
        var stored = localStorage.getItem(THEME_KEY);
        if (stored) {
            applyTheme(stored);
        }
    } catch (e) {
        /* localStorage 불가 환경 무시 */
    }

    function toggleTheme() {
        var next = currentTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch (e) {
            /* 무시 */
        }
        updateThemeButton(next);
    }

    function updateThemeButton(theme) {
        var btn = document.querySelector("[data-theme-toggle]");
        if (!btn) return;
        var dark = theme === "dark";
        btn.textContent = dark ? "☀️" : "🌙"; // 해 / 달
        btn.setAttribute(
            "aria-label",
            dark ? "라이트 모드로 전환" : "다크 모드로 전환"
        );
        btn.setAttribute("aria-pressed", dark ? "true" : "false");
    }

    /* ----------------------------------------------------------------------
       2. 목차 드로어 열기/닫기
       ---------------------------------------------------------------------- */
    var toc = document.querySelector(".toc");
    var overlay = document.querySelector(".toc-overlay");

    function openToc() {
        if (!toc) return;
        toc.classList.add("open");
        if (overlay) overlay.classList.add("open");
        var tBtn = document.querySelector("[data-toc-toggle]");
        if (tBtn) tBtn.setAttribute("aria-expanded", "true");
    }

    function closeToc() {
        if (!toc) return;
        toc.classList.remove("open");
        if (overlay) overlay.classList.remove("open");
        var tBtn = document.querySelector("[data-toc-toggle]");
        if (tBtn) tBtn.setAttribute("aria-expanded", "false");
    }

    function isDesktop() {
        return window.matchMedia("(min-width: 1024px)").matches;
    }

    /* ----------------------------------------------------------------------
       3. 읽기 진행바
       ---------------------------------------------------------------------- */
    var progress = document.querySelector(".progress");

    function updateProgress() {
        if (!progress) return;
        var doc = document.documentElement;
        var scrollTop = window.scrollY || doc.scrollTop;
        var height = doc.scrollHeight - doc.clientHeight;
        var pct = height > 0 ? (scrollTop / height) * 100 : 0;
        progress.style.width = pct + "%";
    }

    /* ----------------------------------------------------------------------
       4. 맨위로 버튼
       ---------------------------------------------------------------------- */
    var toTop = document.querySelector(".to-top");

    function updateToTop() {
        if (!toTop) return;
        if ((window.scrollY || 0) > 480) {
            toTop.classList.add("show");
        } else {
            toTop.classList.remove("show");
        }
    }

    /* ----------------------------------------------------------------------
       5. scrollspy - 현재 보이는 섹션의 목차 항목 하이라이트
       ---------------------------------------------------------------------- */
    var tocLinks = Array.prototype.slice.call(
        document.querySelectorAll(".toc__nav a[href^='#']")
    );
    var linkById = {};
    var targets = [];

    tocLinks.forEach(function (a) {
        var id = decodeURIComponent(a.getAttribute("href").slice(1));
        var el = document.getElementById(id);
        if (el) {
            linkById[id] = a;
            targets.push(el);
        }
    });

    var spyObserver = null;

    function setupScrollspy() {
        if (!("IntersectionObserver" in window) || targets.length === 0) {
            return;
        }
        var visible = {};
        spyObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        visible[entry.target.id] = entry.intersectionRatio;
                    } else {
                        delete visible[entry.target.id];
                    }
                });
                highlightTopMost();
            },
            {
                // 상단바 높이만큼 위를 죽여 현재 위치를 더 정확히 잡는다
                rootMargin: "-64px 0px -65% 0px",
                threshold: [0, 0.25, 0.5, 1]
            }
        );
        targets.forEach(function (t) {
            spyObserver.observe(t);
        });
    }

    function highlightTopMost() {
        // 화면에 들어와 있는 대상 중 문서 순서상 가장 위(가장 먼저)인 것 선택
        var chosen = null;
        for (var i = 0; i < targets.length; i++) {
            if (targets[i].id in linkById) {
                var rect = targets[i].getBoundingClientRect();
                // 상단바 아래로 지나간 마지막 헤딩을 현재 위치로 본다
                if (rect.top <= 90) {
                    chosen = targets[i].id;
                } else if (!chosen) {
                    chosen = targets[i].id;
                    break;
                } else {
                    break;
                }
            }
        }
        setActive(chosen);
    }

    function setActive(id) {
        tocLinks.forEach(function (a) {
            a.classList.remove("active");
            a.removeAttribute("aria-current");
        });
        if (id && linkById[id]) {
            linkById[id].classList.add("active");
            linkById[id].setAttribute("aria-current", "true");
        }
    }

    /* ----------------------------------------------------------------------
       6. 코드 복사 버튼 (.copy)
       복사 대상: 같은 .code 블록 안의 <pre>(없으면 <code>) 텍스트
       ---------------------------------------------------------------------- */
    function copyText(text, btn) {
        var done = function () {
            var original = btn.getAttribute("data-label") || btn.textContent;
            btn.setAttribute("data-label", original);
            btn.textContent = "복사됨";
            btn.classList.add("copied");
            window.setTimeout(function () {
                btn.textContent = btn.getAttribute("data-label") || "복사";
                btn.classList.remove("copied");
            }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () {
                fallbackCopy(text, done);
            });
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            done();
        } catch (e) {
            /* 무시 */
        }
        document.body.removeChild(ta);
    }

    function onCopyClick(btn) {
        var block = btn.closest(".code");
        if (!block) return;
        var source = block.querySelector("pre") || block.querySelector("code");
        if (!source) return;
        copyText(source.innerText, btn);
    }

    /* ----------------------------------------------------------------------
       7. 플래시카드 탭 뒤집기 (.flashcard -> .flipped)
       ---------------------------------------------------------------------- */
    function flipCard(card) {
        card.classList.toggle("flipped");
        var flipped = card.classList.contains("flipped");
        card.setAttribute("aria-pressed", flipped ? "true" : "false");
    }

    function initFlashcards() {
        var cards = document.querySelectorAll(".flashcard");
        Array.prototype.forEach.call(cards, function (card) {
            // 키보드 접근성
            if (!card.hasAttribute("tabindex")) {
                card.setAttribute("tabindex", "0");
            }
            card.setAttribute("role", "button");
            card.setAttribute("aria-pressed", "false");
            card.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                    e.preventDefault();
                    flipCard(card);
                }
            });
        });
    }

    /* ----------------------------------------------------------------------
       8. 발음 듣기 (Web Speech API TTS)
       - <body data-tts="en"> 인 어학 과목 페이지에서만 활성화한다.
         (CS 과목 페이지에서 코드/한국어를 영어 음성으로 읽는 일을 막기 위함)
       - 표는 헤더 텍스트로 영어 열을 자동 감지하고, 셀에서 영어만 추출해 읽는다.
       - 플래시카드 앞면(.front), <pre> 예문, 인라인 <span class="en">도 대상.
       - 미지원 브라우저(예: Firefox for Android)는 버튼을 만들지 않는다.
       ---------------------------------------------------------------------- */
    var TTS = (function () {
        var supported =
            "speechSynthesis" in window &&
            typeof window.SpeechSynthesisUtterance === "function";
        var lang = "en-US";
        var voice = null;
        var inited = false;

        // 영어 음성 선택: 이름 하드코딩 대신 lang 접두사 'en' + 점수화
        function pickVoice() {
            if (!supported) return;
            var list = window.speechSynthesis.getVoices() || [];
            if (!list.length) return;
            var norm = function (v) {
                return (v.lang || "").replace("_", "-").toLowerCase();
            };
            var en = [];
            for (var i = 0; i < list.length; i++) {
                if (norm(list[i]).indexOf("en") === 0) en.push(list[i]);
            }
            if (!en.length) return; // 영어 음성 없음 -> utterance.lang 만으로 시도
            var want = lang.toLowerCase();
            var score = function (v) {
                var l = norm(v),
                    s = 0;
                if (l === want) s += 6;
                if (l === "en-us") s += 5;
                else if (l === "en-gb") s += 4;
                if (v.localService) s += 2; // 오프라인 음성이 더 안정적
                if (v.default) s += 1;
                return s;
            };
            en.sort(function (a, b) {
                return score(b) - score(a);
            });
            voice = en[0];
        }

        // 셀/줄에서 영어 부분만 추출한다(한국어 해석은 버린다)
        function extractEnglish(text) {
            text = (text || "").replace(/\s+/g, " ").trim();
            if (!text) return "";
            var d = text.search(/\s[-–]\s/); // ' - ' / ' – ' 해석 구분자
            if (d !== -1) text = text.slice(0, d);
            var h = text.search(/[가-힣]/); // 첫 한글 이전까지
            if (h !== -1) text = text.slice(0, h);
            text = text.replace(/[\s\-–·/(\[]+$/g, "").trim();
            return text;
        }

        // <pre> 한 줄에서 '라벨:' 접두사를 떼고 영어만 추출
        function preLineEnglish(line) {
            var s = (line || "").trim();
            if (!s) return "";
            var ci = s.indexOf(":");
            if (ci !== -1 && /[가-힣]/.test(s.slice(0, ci))) {
                s = s.slice(ci + 1).trim();
            }
            return extractEnglish(s);
        }

        // 발음 자격: 영문자 2개 이상 + 한글이 남아있지 않을 것(이중 안전장치)
        function isSpeakable(en) {
            return (
                !!en &&
                /[A-Za-z]/.test(en) &&
                en.replace(/[^A-Za-z]/g, "").length >= 2 &&
                !/[가-힣]/.test(en)
            );
        }

        function clearActive() {
            var on = document.querySelectorAll(".speak-btn.speaking");
            Array.prototype.forEach.call(on, function (b) {
                b.classList.remove("speaking");
                b.setAttribute("aria-pressed", "false");
            });
        }

        // 클릭 핸들러 안에서 동기 호출되어야 한다(특히 iOS)
        function speak(text, btn) {
            if (!supported || !text) return;
            var synth = window.speechSynthesis;
            try {
                synth.cancel(); // 빠른 연타 시 겹침/큐 누적 방지
            } catch (e) {
                /* 무시 */
            }
            var u = new SpeechSynthesisUtterance(text);
            if (!voice) pickVoice();
            if (voice) {
                u.voice = voice;
                u.lang = (voice.lang || lang).replace("_", "-");
            } else {
                u.lang = lang; // 음성 미선택이어도 lang으로 시도
            }
            u.rate = 0.9; // 학습용으로 약간 느리게
            u.pitch = 1;
            u.volume = 1;
            clearActive();
            if (btn) {
                btn.classList.add("speaking");
                btn.setAttribute("aria-pressed", "true");
                var clear = function () {
                    btn.classList.remove("speaking");
                    btn.setAttribute("aria-pressed", "false");
                };
                u.onend = clear;
                u.onerror = clear; // cancel()의 interrupted/canceled는 정상 흐름
            }
            try {
                synth.speak(u);
            } catch (e) {
                clearActive();
            }
        }

        function makeBtn(text) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "speak-btn";
            b.setAttribute("aria-label", "발음 듣기");
            b.setAttribute("title", "발음 듣기");
            b.setAttribute("aria-pressed", "false");
            b.setAttribute("data-speak-text", text);
            b.innerHTML = '<span aria-hidden="true">🔊</span>';
            return b;
        }

        function appendBtn(parent, raw) {
            var en = extractEnglish(raw);
            if (!isSpeakable(en)) return;
            if (parent.querySelector && parent.querySelector(".speak-btn")) return;
            parent.appendChild(document.createTextNode(" "));
            parent.appendChild(makeBtn(en));
        }

        function afterBtn(el, raw) {
            var en = extractEnglish(raw);
            if (!isSpeakable(en)) return;
            var b = makeBtn(en);
            if (el.nextSibling) {
                el.parentNode.insertBefore(b, el.nextSibling);
            } else {
                el.parentNode.appendChild(b);
            }
        }

        // 표 헤더에 이 단어가 들어 있으면 그 열을 영어로 본다
        var COL_KEYS = [
            "영단어",
            "영어",
            "영문",
            "예문",
            "예시",
            "표현",
            "조동사",
            "전치사",
            "관계부사"
        ];

        function speakableCols(table) {
            var ths = table.querySelectorAll("thead th");
            var idx = [];
            Array.prototype.forEach.call(ths, function (th, i) {
                var t = th.textContent;
                for (var k = 0; k < COL_KEYS.length; k++) {
                    if (t.indexOf(COL_KEYS[k]) !== -1) {
                        idx.push(i);
                        break;
                    }
                }
            });
            return idx;
        }

        function initTables(scope) {
            var tables = scope.querySelectorAll("table");
            Array.prototype.forEach.call(tables, function (table) {
                var cols = speakableCols(table);
                if (!cols.length) return;
                var rows = table.querySelectorAll("tbody tr");
                Array.prototype.forEach.call(rows, function (tr) {
                    for (var j = 0; j < cols.length; j++) {
                        var cell = tr.children[cols[j]];
                        if (cell && cell.tagName === "TD") {
                            appendBtn(cell, cell.textContent);
                        }
                    }
                });
            });
        }

        function initFronts(scope) {
            var fronts = scope.querySelectorAll(".flashcard .front");
            Array.prototype.forEach.call(fronts, function (fr) {
                appendBtn(fr, fr.textContent);
            });
        }

        function initEnSpans(scope) {
            var ens = scope.querySelectorAll(".en");
            Array.prototype.forEach.call(ens, function (sp) {
                afterBtn(sp, sp.textContent);
            });
        }

        function initPre(scope) {
            var pres = scope.querySelectorAll("pre");
            Array.prototype.forEach.call(pres, function (pre) {
                if (pre.closest(".code")) return; // 코드 블록 제외
                if (pre.querySelector(".speak-btn")) return;
                var lines = pre.textContent.split("\n");
                var frag = document.createDocumentFragment();
                var hit = false;
                for (var i = 0; i < lines.length; i++) {
                    if (i > 0) frag.appendChild(document.createTextNode("\n"));
                    frag.appendChild(document.createTextNode(lines[i]));
                    var en = preLineEnglish(lines[i]);
                    if (isSpeakable(en)) {
                        hit = true;
                        frag.appendChild(document.createTextNode(" "));
                        frag.appendChild(makeBtn(en));
                    }
                }
                if (hit) {
                    pre.textContent = "";
                    pre.appendChild(frag);
                }
            });
        }

        function init() {
            if (!supported || inited) return;
            var flag = document.body.getAttribute("data-tts");
            if (!flag) return; // 어학 과목 페이지에서만 동작
            inited = true;
            if (flag !== "en" && /^[a-z]{2}(-[A-Za-z]+)?$/.test(flag)) {
                lang = flag; // 예: data-tts="en-GB"
            }
            pickVoice();
            if ("onvoiceschanged" in window.speechSynthesis) {
                // 음성 목록은 비동기로 로드된다(첫 호출은 비어 있을 수 있음)
                window.speechSynthesis.onvoiceschanged = pickVoice;
            }
            var scope = document.querySelector(".content") || document.body;
            initTables(scope);
            initFronts(scope);
            initEnSpans(scope);
            initPre(scope);
            window.addEventListener("pagehide", function () {
                try {
                    window.speechSynthesis.cancel();
                } catch (e) {
                    /* 무시 */
                }
            });
        }

        return { supported: supported, init: init, speak: speak };
    })();

    /* ----------------------------------------------------------------------
       9. 이벤트 위임 + 초기화
       ---------------------------------------------------------------------- */
    document.addEventListener("click", function (e) {
        var t = e.target;

        // 발음 듣기 버튼(TTS) - 가장 먼저 처리(카드 뒤집힘 등과 분리)
        var spk = t.closest(".speak-btn");
        if (spk) {
            e.preventDefault();
            e.stopPropagation();
            TTS.speak(spk.getAttribute("data-speak-text"), spk);
            return;
        }

        // 테마 토글
        if (t.closest("[data-theme-toggle]")) {
            toggleTheme();
            return;
        }
        // 목차 토글 버튼
        if (t.closest("[data-toc-toggle]")) {
            if (toc && toc.classList.contains("open")) {
                closeToc();
            } else {
                openToc();
            }
            return;
        }
        // 목차 닫기 버튼 / 오버레이
        if (t.closest("[data-toc-close]") || t.classList.contains("toc-overlay")) {
            closeToc();
            return;
        }
        // 목차 링크 클릭 시(모바일) 닫기
        if (t.closest(".toc__nav a") && !isDesktop()) {
            closeToc();
            return;
        }
        // 복사 버튼
        var copyBtn = t.closest(".copy");
        if (copyBtn) {
            onCopyClick(copyBtn);
            return;
        }
        // 맨위로
        if (t.closest(".to-top")) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        // 플래시카드 뒤집기 (복사/링크 등 내부 인터랙티브 요소는 제외)
        var card = t.closest(".flashcard");
        if (card && !t.closest("a, button, .copy")) {
            flipCard(card);
            return;
        }
    });

    // ESC로 목차 닫기
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && toc && toc.classList.contains("open")) {
            closeToc();
        }
    });

    // 스크롤 핸들러(진행바 + 맨위로) - rAF로 스로틀
    var ticking = false;
    window.addEventListener(
        "scroll",
        function () {
            if (!ticking) {
                window.requestAnimationFrame(function () {
                    updateProgress();
                    updateToTop();
                    highlightTopMost(); // 현재 위치 하이라이트를 스크롤마다 갱신
                    ticking = false;
                });
                ticking = true;
            }
        },
        { passive: true }
    );

    window.addEventListener("resize", updateProgress, { passive: true });

    // 아코디언(.section details)을 펼치거나 접으면 헤딩 위치가 바뀌므로
    // 진행바와 현재 위치 하이라이트를 다시 계산한다(toggle은 버블되지 않아 캡처 사용).
    document.addEventListener(
        "toggle",
        function () {
            updateProgress();
            highlightTopMost();
        },
        true
    );

    // 데스크톱에서 고정 목차가 있으면 본문 여백 클래스 부여
    function syncDesktopToc() {
        if (!toc) return;
        document.body.classList.toggle("has-fixed-toc", isDesktop());
    }
    window.addEventListener("resize", syncDesktopToc, { passive: true });

    // DOM 준비 후 초기화
    function init() {
        updateThemeButton(currentTheme());
        updateProgress();
        updateToTop();
        setupScrollspy();
        highlightTopMost();
        initFlashcards();
        TTS.init();
        syncDesktopToc();

        // OS 테마 변경 실시간 반영(사용자가 수동 저장 안 했을 때만)
        if (window.matchMedia) {
            var mq = window.matchMedia("(prefers-color-scheme: dark)");
            var onChange = function () {
                var saved = null;
                try {
                    saved = localStorage.getItem(THEME_KEY);
                } catch (e) {
                    /* 무시 */
                }
                if (!saved) updateThemeButton(currentTheme());
            };
            if (mq.addEventListener) {
                mq.addEventListener("change", onChange);
            } else if (mq.addListener) {
                mq.addListener(onChange);
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
