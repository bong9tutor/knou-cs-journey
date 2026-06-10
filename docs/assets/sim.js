/* ==========================================================================
   KNOU 인터랙티브 학습 위젯 (sim.js)
   - 마운트: <div data-sim="위젯이름"></div> 이 있는 페이지에서 sim.css와 함께 로드.
   - 등록: window.SIM.register(name, { title, build }) - build(root)는 root 안에만
     DOM을 만들고 이벤트도 root 내부 요소에만 단다(전역 위임 금지).
   - 위젯 하나의 오류가 페이지 전체를 깨지 않도록 부트에서 격리한다.
   - 색은 style.css 공용 토큰(var(--...))만 사용해 다크모드 자동 대응.
   ========================================================================== */
(function () {
    "use strict";
    window.SIM = {
        widgets: {},
        register: function (name, def) {
            this.widgets[name] = def;
        }
    };
})();

/* sim:base-converter - 진법 변환기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */
    var logic = {
        /* 0~4095 정수로 클램프. 숫자가 아니면 null */
        clamp: function (n) {
            if (typeof n !== "number" || isNaN(n)) return null;
            n = Math.floor(n);
            if (n < 0) n = 0;
            if (n > 4095) n = 4095;
            return n;
        },
        /* n을 base 진법 문자열로 (16진수는 대문자) */
        convert: function (n, base) {
            var s = n.toString(base);
            return base === 16 ? s.toUpperCase() : s;
        },
        /* 2로 나눈 몫/나머지 단계 목록 (n=0이면 빈 배열) */
        divSteps: function (n) {
            var steps = [];
            var cur = n;
            while (cur > 0) {
                steps.push({
                    value: cur,
                    quotient: Math.floor(cur / 2),
                    remainder: cur % 2
                });
                cur = Math.floor(cur / 2);
            }
            return steps;
        },
        /* 2진수 문자열 검증 + 자리값 펼침 */
        parseBin: function (str) {
            if (typeof str !== "string" || str.length === 0) {
                return { ok: false, error: "empty" };
            }
            if (!/^[01]+$/.test(str)) {
                return { ok: false, error: "invalid" };
            }
            if (str.length > 12) {
                return { ok: false, error: "length" };
            }
            var value = 0;
            var terms = [];
            var parts = [];
            for (var i = 0; i < str.length; i++) {
                var bit = str.charCodeAt(i) - 48;
                var place = Math.pow(2, str.length - 1 - i);
                value += bit * place;
                terms.push({ bit: bit, place: place });
                parts.push(bit + "x" + place);
            }
            return {
                ok: true,
                value: value,
                terms: terms,
                expansion: parts.join(" + ")
            };
        }
    };

    window.SIM.register("base-converter", {
        title: "진법 변환기",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__tabs" role="tablist">'
                +     '<button type="button" class="sim__tab active" data-tab="dec" role="tab" aria-selected="true">10진 → 2/8/16진</button>'
                +     '<button type="button" class="sim__tab" data-tab="bin" role="tab" aria-selected="false">2진 → 10진</button>'
                + '</div>'
                + '<div class="bc-panel" data-panel="dec" role="tabpanel" aria-label="10진수를 2진, 8진, 16진으로 변환">'
                +     '<div class="sim__row">'
                +         '<label class="bc-field">10진수 '
                +             '<input type="number" class="sim__input sim__input--num bc-dec-input" min="0" max="4095" step="1" value="13" aria-label="10진수 입력, 0부터 4095까지">'
                +         '</label>'
                +         '<button type="button" class="sim__btn bc-steps-btn" aria-expanded="false">풀이 보기</button>'
                +     '</div>'
                +     '<div class="bc-results" aria-live="polite">'
                +         '<div class="bc-result-row"><span class="sim__chip">2진수</span><div class="sim__out bc-out" data-base="2"></div></div>'
                +         '<div class="bc-result-row"><span class="sim__chip">8진수</span><div class="sim__out bc-out" data-base="8"></div></div>'
                +         '<div class="bc-result-row"><span class="sim__chip">16진수</span><div class="sim__out bc-out" data-base="16"></div></div>'
                +     '</div>'
                +     '<div class="bc-steps" hidden></div>'
                + '</div>'
                + '<div class="bc-panel" data-panel="bin" role="tabpanel" aria-label="2진수를 10진수로 변환" hidden>'
                +     '<div class="sim__row">'
                +         '<label class="bc-field">2진수 '
                +             '<input type="text" class="sim__input bc-bin-input" maxlength="12" inputmode="numeric" autocomplete="off" spellcheck="false" value="1101" aria-label="2진수 입력, 0과 1만 최대 12자리">'
                +         '</label>'
                +     '</div>'
                +     '<div class="sim__out bc-bin-out" aria-live="polite"></div>'
                +     '<p class="sim__note">각 자리의 자리값(2의 거듭제곱)에 그 자리의 비트를 곱해서 모두 더하면 10진수가 됩니다.</p>'
                + '</div>';

            var tabs = root.querySelectorAll(".sim__tab");
            var panels = root.querySelectorAll(".bc-panel");
            var decInput = root.querySelector(".bc-dec-input");
            var stepsBtn = root.querySelector(".bc-steps-btn");
            var outs = root.querySelectorAll(".bc-out");
            var stepsBox = root.querySelector(".bc-steps");
            var binInput = root.querySelector(".bc-bin-input");
            var binOut = root.querySelector(".bc-bin-out");

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            /* 풀이 영역(나눗셈 표 + 읽는 방향 안내)을 다시 그린다 */
            function renderSteps(n) {
                clearNode(stepsBox);
                var note = document.createElement("p");
                note.className = "sim__note bc-read";
                if (n === null) {
                    note.textContent = "10진수를 입력하면 2로 나눈 풀이 과정이 표시됩니다.";
                    stepsBox.appendChild(note);
                    return;
                }
                if (n === 0) {
                    note.textContent = "0은 나눗셈 과정 없이 모든 진법에서 그대로 0입니다.";
                    stepsBox.appendChild(note);
                    return;
                }
                var steps = logic.divSteps(n);
                var table = document.createElement("table");
                var thead = document.createElement("thead");
                var headRow = document.createElement("tr");
                var headers = ["나눗셈", "몫", "나머지"];
                for (var h = 0; h < headers.length; h++) {
                    var th = document.createElement("th");
                    th.textContent = headers[h];
                    headRow.appendChild(th);
                }
                thead.appendChild(headRow);
                table.appendChild(thead);
                var tbody = document.createElement("tbody");
                for (var i = 0; i < steps.length; i++) {
                    var tr = document.createElement("tr");
                    var tdDiv = document.createElement("td");
                    tdDiv.textContent = steps[i].value + " ÷ 2";
                    var tdQ = document.createElement("td");
                    tdQ.textContent = String(steps[i].quotient);
                    var tdR = document.createElement("td");
                    tdR.className = "bc-rem";
                    tdR.textContent = String(steps[i].remainder);
                    tr.appendChild(tdDiv);
                    tr.appendChild(tdQ);
                    tr.appendChild(tdR);
                    tbody.appendChild(tr);
                }
                table.appendChild(tbody);
                stepsBox.appendChild(table);

                note.appendChild(document.createTextNode("나머지를 아래에서 위로 읽으면 2진수 "));
                var strong = document.createElement("strong");
                strong.textContent = logic.convert(n, 2);
                note.appendChild(strong);
                note.appendChild(document.createTextNode("이 됩니다."));
                stepsBox.appendChild(note);
            }

            /* 10진 탭 갱신 */
            function renderDec() {
                var raw = decInput.value;
                var n = null;
                if (raw !== "") {
                    n = logic.clamp(Number(raw));
                    if (n !== null && String(n) !== raw) {
                        decInput.value = String(n);
                    }
                }
                for (var i = 0; i < outs.length; i++) {
                    var base = parseInt(outs[i].getAttribute("data-base"), 10);
                    outs[i].textContent = n === null ? "-" : logic.convert(n, base);
                }
                renderSteps(n);
            }

            /* 2진 탭 갱신 */
            function renderBin() {
                clearNode(binOut);
                var res = logic.parseBin(binInput.value);
                if (!res.ok) {
                    if (res.error === "empty") {
                        binOut.textContent = "2진수를 입력하세요. 예: 1101";
                        return;
                    }
                    var err = document.createElement("span");
                    err.className = "bc-error";
                    err.textContent = res.error === "invalid"
                        ? "0과 1만 입력할 수 있습니다."
                        : "최대 12자리까지만 입력할 수 있습니다.";
                    binOut.appendChild(err);
                    return;
                }
                binOut.textContent = binInput.value + " = " + res.expansion + " = " + res.value;
            }

            function selectTab(name) {
                var i;
                for (i = 0; i < tabs.length; i++) {
                    var active = tabs[i].getAttribute("data-tab") === name;
                    if (active) {
                        tabs[i].classList.add("active");
                    } else {
                        tabs[i].classList.remove("active");
                    }
                    tabs[i].setAttribute("aria-selected", active ? "true" : "false");
                }
                for (i = 0; i < panels.length; i++) {
                    if (panels[i].getAttribute("data-panel") === name) {
                        panels[i].removeAttribute("hidden");
                    } else {
                        panels[i].setAttribute("hidden", "");
                    }
                }
            }

            function onTabClick() {
                selectTab(this.getAttribute("data-tab"));
            }
            for (var t = 0; t < tabs.length; t++) {
                tabs[t].addEventListener("click", onTabClick);
            }

            stepsBtn.addEventListener("click", function () {
                if (stepsBox.hasAttribute("hidden")) {
                    stepsBox.removeAttribute("hidden");
                    stepsBtn.textContent = "풀이 닫기";
                    stepsBtn.setAttribute("aria-expanded", "true");
                } else {
                    stepsBox.setAttribute("hidden", "");
                    stepsBtn.textContent = "풀이 보기";
                    stepsBtn.setAttribute("aria-expanded", "false");
                }
            });

            decInput.addEventListener("input", renderDec);
            binInput.addEventListener("input", renderBin);

            renderDec();
            renderBin();
        }
    });
})();

/* sim:bit-explorer - 8비트 정수 해석기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ------------------------------------------------------------------
       순수 계산 로직 (DOM 비의존, node 테스트 대상)
       bits: MSB가 앞에 오는 길이 8의 0/1 숫자 배열
       ------------------------------------------------------------------ */
    var LOGIC = {
        parseBits: function (str) {
            var bits = [];
            var i;
            for (i = 0; i < 8; i++) {
                bits.push(str.charAt(i) === "1" ? 1 : 0);
            }
            return bits;
        },

        toStr: function (bits) {
            return bits.join("");
        },

        toHex: function (bits) {
            var v = LOGIC.interpret(bits).unsigned;
            return ("0" + v.toString(16).toUpperCase()).slice(-2);
        },

        /* 같은 비트열을 4가지 방식으로 해석 */
        interpret: function (bits) {
            var unsigned = 0;
            var i;
            for (i = 0; i < 8; i++) {
                unsigned = unsigned * 2 + bits[i];
            }
            var sign = bits[0];
            var mag = unsigned % 128;
            var signMag = sign === 1 ? -mag : mag;
            var ones = sign === 1 ? unsigned - 255 : unsigned;
            var twos = sign === 1 ? unsigned - 256 : unsigned;
            return {
                unsigned: unsigned,
                signMag: signMag,
                ones: ones,
                twos: twos,
                signMagText: (sign === 1 && mag === 0) ? "-0" : String(signMag),
                onesText: (sign === 1 && unsigned === 255) ? "-0" : String(ones),
                twosText: String(twos)
            };
        },

        /* 2의 보수 부호 반전: 1단계 비트 반전 -> 2단계 +1 */
        negateSteps: function (bits) {
            var inverted = [];
            var result = [];
            var carry = 1;
            var sum;
            var i;
            for (i = 0; i < 8; i++) {
                inverted.push(bits[i] === 1 ? 0 : 1);
            }
            for (i = 0; i < 8; i++) {
                result.push(inverted[i]);
            }
            for (i = 7; i >= 0; i--) {
                sum = result[i] + carry;
                result[i] = sum % 2;
                carry = sum >= 2 ? 1 : 0;
            }
            return {
                original: bits.slice(),
                inverted: inverted,
                result: result,
                carryOut: carry
            };
        },

        /* 양수에 + 기호를 붙여 표시 */
        fmtSigned: function (n) {
            return n > 0 ? "+" + n : String(n);
        }
    };

    var WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];

    window.SIM.register("bit-explorer", {
        title: "8비트 정수 해석기",
        _logic: LOGIC,
        build: function (root) {
            var bits = LOGIC.parseBits("11111011");
            var html = "";
            var cols = "";
            var i;

            for (i = 0; i < 8; i++) {
                cols += '<div class="bx-col">'
                    + '<button type="button" class="bx-bit'
                    + (i === 0 ? " bx-bit--msb" : "")
                    + '" data-idx="' + i + '" aria-pressed="false" aria-label="비트 '
                    + (7 - i) + (i === 0 ? " (부호 비트)" : "") + ' 토글">0</button>'
                    + '<span class="bx-weight">' + WEIGHTS[i] + "</span>"
                    + (i === 0 ? '<span class="bx-signlabel">부호 비트</span>' : "")
                    + "</div>";
            }

            html += '<p class="sim__note">비트를 탭해서 0과 1을 바꿔 보세요. '
                + "같은 비트열이라도 해석 방식에 따라 값이 달라집니다.</p>";
            html += '<div class="bx-bits" role="group" aria-label="8비트 토글 (왼쪽이 MSB)">' + cols + "</div>";
            html += '<div class="bx-current">'
                + '<span class="sim__chip">현재 비트열</span> '
                + '<span class="bx-binstr"></span> '
                + '<span class="bx-hex"></span>'
                + "</div>";
            html += '<div class="bx-tablewrap" aria-live="polite">'
                + "<table>"
                + "<thead><tr><th>해석 방식</th><th>10진 값</th><th>표현 범위</th></tr></thead>"
                + "<tbody>"
                + '<tr><td>부호 없는</td><td class="bx-val" data-kind="unsigned"></td><td>0 ~ 255</td></tr>'
                + '<tr><td>부호화-크기</td><td class="bx-val" data-kind="signmag"></td><td>-127 ~ +127</td></tr>'
                + '<tr><td>1의 보수</td><td class="bx-val" data-kind="ones"></td><td>-127 ~ +127</td></tr>'
                + '<tr class="bx-row--twos"><td>2의 보수</td><td class="bx-val" data-kind="twos"></td><td>-128 ~ +127</td></tr>'
                + "</tbody></table>"
                + "</div>";
            html += '<div class="sim__row" role="group" aria-label="프리셋">'
                + '<span class="bx-grouplabel">프리셋</span>'
                + '<button type="button" class="sim__btn bx-preset" data-bits="00000000" aria-label="프리셋 0 (00000000)">0</button>'
                + '<button type="button" class="sim__btn bx-preset" data-bits="00000101" aria-label="프리셋 +5 (00000101)">+5</button>'
                + '<button type="button" class="sim__btn bx-preset" data-bits="11111011" aria-label="프리셋 -5, 2의 보수 (11111011)">-5</button>'
                + '<button type="button" class="sim__btn bx-preset" data-bits="01111111" aria-label="프리셋 127 (01111111)">127</button>'
                + '<button type="button" class="sim__btn bx-preset" data-bits="10000000" aria-label="프리셋 -128 (10000000)">-128</button>'
                + "</div>";
            html += '<div class="sim__row">'
                + '<button type="button" class="sim__btn sim__btn--primary bx-negate" '
                + 'aria-label="현재 비트열의 2의 보수 부호 반전 과정 보기">부호 반전 과정 (2의 보수)</button>'
                + "</div>";
            html += '<div class="sim__out bx-steps" aria-live="polite" hidden></div>';
            html += '<p class="sim__note">부호가 있는 세 방식은 MSB(가장 왼쪽 비트)가 1이면 음수입니다. '
                + "현대 컴퓨터는 2의 보수를 사용합니다.</p>";

            root.innerHTML = html;

            var bitBtns = root.querySelectorAll(".bx-bit");
            var binstrEl = root.querySelector(".bx-binstr");
            var hexEl = root.querySelector(".bx-hex");
            var valEls = {
                unsigned: root.querySelector('[data-kind="unsigned"]'),
                signmag: root.querySelector('[data-kind="signmag"]'),
                ones: root.querySelector('[data-kind="ones"]'),
                twos: root.querySelector('[data-kind="twos"]')
            };
            var presetBtns = root.querySelectorAll(".bx-preset");
            var negateBtn = root.querySelector(".bx-negate");
            var stepsEl = root.querySelector(".bx-steps");

            function render() {
                var info = LOGIC.interpret(bits);
                var j;
                for (j = 0; j < bitBtns.length; j++) {
                    bitBtns[j].textContent = String(bits[j]);
                    bitBtns[j].setAttribute("aria-pressed", bits[j] === 1 ? "true" : "false");
                    if (bits[j] === 1) {
                        bitBtns[j].classList.add("on");
                    } else {
                        bitBtns[j].classList.remove("on");
                    }
                }
                binstrEl.textContent = LOGIC.toStr(bits);
                hexEl.textContent = "(16진수 0x" + LOGIC.toHex(bits) + ")";
                valEls.unsigned.textContent = String(info.unsigned);
                valEls.signmag.textContent = info.signMagText;
                valEls.ones.textContent = info.onesText;
                valEls.twos.textContent = info.twosText;
                /* 비트가 바뀌면 이전 반전 과정 표시는 더 이상 맞지 않으므로 숨긴다 */
                stepsEl.hidden = true;
            }

            function onBitClick() {
                var idx = parseInt(this.getAttribute("data-idx"), 10);
                bits[idx] = bits[idx] === 1 ? 0 : 1;
                render();
            }

            function onPresetClick() {
                bits = LOGIC.parseBits(this.getAttribute("data-bits"));
                render();
            }

            function onNegateClick() {
                var steps = LOGIC.negateSteps(bits);
                var before = LOGIC.interpret(steps.original);
                var after = LOGIC.interpret(steps.result);
                var text = "대상 비트열          : " + LOGIC.toStr(steps.original)
                    + " (2의 보수 해석 " + LOGIC.fmtSigned(before.twos) + ")\n"
                    + "1단계 - 모든 비트 반전: " + LOGIC.toStr(steps.inverted) + "\n"
                    + "2단계 - 1을 더함      : " + LOGIC.toStr(steps.result)
                    + " (2의 보수 해석 " + LOGIC.fmtSigned(after.twos) + ")";
                if (steps.carryOut === 1) {
                    text += "\n참고: 덧셈에서 나온 올림 1은 8비트 범위를 벗어나 버려집니다.";
                }
                if (before.unsigned === 128) {
                    text += "\n주의: +128은 8비트 2의 보수로 표현할 수 없어 -128의 부호 반전 결과가 다시 -128이 됩니다.";
                }
                stepsEl.textContent = text;
                stepsEl.hidden = false;
            }

            for (i = 0; i < bitBtns.length; i++) {
                bitBtns[i].addEventListener("click", onBitClick);
            }
            for (i = 0; i < presetBtns.length; i++) {
                presetBtns[i].addEventListener("click", onPresetClick);
            }
            negateBtn.addEventListener("click", onNegateClick);

            render();
        }
    });
})();

/* sim:float-demo - 부동소수점 오차 체험 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 무관) ---------------------------------- */

    /* "0.1", ".5", "3" 같은 0 이상의 10진 소수 문자열을
       { digits: 정수 자릿수 문자열, scale: 소수점 아래 자릿수 } 로 파싱.
       값 = digits / 10^scale. 잘못된 입력이면 null. */
    function parseDecimal(str) {
        var s = String(str).trim();
        if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
        var dot = s.indexOf(".");
        var intPart = dot < 0 ? s : s.slice(0, dot);
        var fracPart = dot < 0 ? "" : s.slice(dot + 1);
        if (intPart === "") intPart = "0";
        var digits = (intPart + fracPart).replace(/^0+(?=\d)/, "");
        return { digits: digits, scale: fracPart.length };
    }

    function zeros(n) {
        return new Array(n + 1).join("0");
    }

    /* 음이 아닌 정수 문자열끼리의 자릿수 덧셈 (오버플로 없음) */
    function addDigits(a, b) {
        var res = "";
        var i = a.length - 1;
        var j = b.length - 1;
        var carry = 0;
        var sum;
        while (i >= 0 || j >= 0 || carry > 0) {
            sum = carry;
            if (i >= 0) sum += a.charCodeAt(i) - 48;
            if (j >= 0) sum += b.charCodeAt(j) - 48;
            res = String(sum % 10) + res;
            carry = sum >= 10 ? 1 : 0;
            i -= 1;
            j -= 1;
        }
        return res === "" ? "0" : res;
    }

    /* 음이 아닌 정수 문자열끼리의 자릿수 곱셈 (오버플로 없음) */
    function mulDigits(a, b) {
        if (a === "0" || b === "0") return "0";
        var result = [];
        var k;
        for (k = 0; k < a.length + b.length; k += 1) result[k] = 0;
        var i;
        var j;
        var p;
        for (i = a.length - 1; i >= 0; i -= 1) {
            for (j = b.length - 1; j >= 0; j -= 1) {
                p = (a.charCodeAt(i) - 48) * (b.charCodeAt(j) - 48) +
                    result[i + j + 1];
                result[i + j + 1] = p % 10;
                result[i + j] += Math.floor(p / 10);
            }
        }
        return result.join("").replace(/^0+(?=\d)/, "");
    }

    /* 10진수 그대로의 정확한 덧셈/곱셈 (스케일 정렬 후 정수 연산) */
    function exactAdd(p, q) {
        var scale = Math.max(p.scale, q.scale);
        var a = p.digits + zeros(scale - p.scale);
        var b = q.digits + zeros(scale - q.scale);
        return { digits: addDigits(a, b), scale: scale };
    }

    function exactMul(p, q) {
        return { digits: mulDigits(p.digits, q.digits), scale: p.scale + q.scale };
    }

    /* { digits, scale } 를 "0.3" 같은 10진 문자열로 (불필요한 0 제거) */
    function formatDecimal(d) {
        var digits = d.digits;
        var scale = d.scale;
        if (scale === 0) return digits.replace(/^0+(?=\d)/, "");
        while (digits.length <= scale) digits = "0" + digits;
        var intPart = digits.slice(0, digits.length - scale).replace(/^0+(?=\d)/, "");
        var fracPart = digits.slice(digits.length - scale).replace(/0+$/, "");
        return fracPart === "" ? intPart : intPart + "." + fracPart;
    }

    /* 두 입력과 연산자("+", "*")를 받아 부동소수점 결과와
       10진 기대값을 비교한 결과를 돌려준다. 입력이 잘못되면 null. */
    function compute(aStr, bStr, op) {
        var p = parseDecimal(aStr);
        var q = parseDecimal(bStr);
        if (!p || !q) return null;
        var fa = Number(String(aStr).trim());
        var fb = Number(String(bStr).trim());
        var fres = op === "*" ? fa * fb : fa + fb;
        var expected = formatDecimal(op === "*" ? exactMul(p, q) : exactAdd(p, q));
        return {
            display: String(fres),
            stored: fres.toPrecision(20),
            expected: expected,
            equal: fres === Number(expected)
        };
    }

    /* 숫자 끝자리 발음(이·사·오·구는 모음)에 맞는 비교 조사 선택 */
    function diffParticle(numStr) {
        var last = numStr.charAt(numStr.length - 1);
        return "2459".indexOf(last) >= 0 ? "와" : "과";
    }

    /* ---- 위젯 등록 ---------------------------------------------------- */

    window.SIM.register("float-demo", {
        title: "부동소수점 오차 체험",
        /* node 테스트에서 순수 로직만 따로 실행하기 위한 노출 */
        logic: {
            parseDecimal: parseDecimal,
            formatDecimal: formatDecimal,
            addDigits: addDigits,
            mulDigits: mulDigits,
            compute: compute,
            diffParticle: diffParticle
        },
        build: function (root) {
            root.innerHTML = "" +
                "<div class=\"sim__row\">" +
                "<input type=\"text\" class=\"sim__input sim__input--num fd-a\"" +
                " inputmode=\"decimal\" maxlength=\"12\" value=\"0.1\"" +
                " aria-label=\"첫 번째 소수\">" +
                "<select class=\"sim__select fd-op\" aria-label=\"연산 선택\">" +
                "<option value=\"+\">+</option>" +
                "<option value=\"*\">×</option>" +
                "</select>" +
                "<input type=\"text\" class=\"sim__input sim__input--num fd-b\"" +
                " inputmode=\"decimal\" maxlength=\"12\" value=\"0.2\"" +
                " aria-label=\"두 번째 소수\">" +
                "<button type=\"button\" class=\"sim__btn sim__btn--primary fd-run\"" +
                " aria-label=\"계산 실행\">계산</button>" +
                "</div>" +
                "<div class=\"sim__row\">" +
                "<span class=\"sim__chip\">프리셋</span>" +
                "<button type=\"button\" class=\"sim__btn fd-preset\"" +
                " data-a=\"0.1\" data-op=\"+\" data-b=\"0.2\">0.1 + 0.2</button>" +
                "<button type=\"button\" class=\"sim__btn fd-preset\"" +
                " data-a=\"0.25\" data-op=\"+\" data-b=\"0.5\">0.25 + 0.5</button>" +
                "<button type=\"button\" class=\"sim__btn fd-preset\"" +
                " data-a=\"0.1\" data-op=\"*\" data-b=\"3\">0.1 × 3</button>" +
                "</div>" +
                "<div class=\"sim__out\" aria-live=\"polite\">" +
                "<div class=\"fd-line\">" +
                "<span class=\"fd-label\">화면 표시값</span>" +
                "<span class=\"fd-value fd-display\"></span></div>" +
                "<div class=\"fd-line\">" +
                "<span class=\"fd-label\">실제 저장값</span>" +
                "<span class=\"fd-value fd-stored\"></span></div>" +
                "<div class=\"fd-line\">" +
                "<span class=\"fd-label\">10진 기대값</span>" +
                "<span class=\"fd-value fd-expected\"></span></div>" +
                "<span class=\"fd-badge\"></span>" +
                "</div>" +
                "<p class=\"sim__note\">10진 소수 0.1은 2진법으로는 무한소수" +
                "(0.000110011...)라서 64비트 안에 잘린 채 저장됩니다. 그래서 금액" +
                " 계산에는 부동소수점 대신 정수(원 단위)나 십진 전용 타입을 쓰는" +
                " 것이 안전합니다.</p>";

            var inA = root.querySelector(".fd-a");
            var inB = root.querySelector(".fd-b");
            var selOp = root.querySelector(".fd-op");
            var btnRun = root.querySelector(".fd-run");
            var outDisplay = root.querySelector(".fd-display");
            var outStored = root.querySelector(".fd-stored");
            var outExpected = root.querySelector(".fd-expected");
            var badge = root.querySelector(".fd-badge");
            var presets = root.querySelectorAll(".fd-preset");

            function update() {
                var r = compute(inA.value, inB.value, selOp.value);
                if (!r) {
                    outDisplay.textContent = "-";
                    outStored.textContent = "-";
                    outExpected.textContent = "-";
                    badge.textContent = "0 이상의 소수를 입력하세요 (예: 0.1)";
                    badge.className = "fd-badge fd-badge--warn";
                    return;
                }
                outDisplay.textContent = r.display;
                outStored.textContent = r.stored;
                outExpected.textContent = r.expected;
                if (r.equal) {
                    badge.textContent = "오차 없음: 기대값과 정확히 같습니다";
                    badge.className = "fd-badge fd-badge--ok";
                } else {
                    badge.textContent = r.expected + diffParticle(r.expected) +
                        " 다름! 2진 변환 오차가 남았습니다";
                    badge.className = "fd-badge fd-badge--warn";
                }
            }

            btnRun.addEventListener("click", update);
            inA.addEventListener("input", update);
            inB.addEventListener("input", update);
            selOp.addEventListener("change", update);

            Array.prototype.forEach.call(presets, function (btn) {
                btn.addEventListener("click", function () {
                    inA.value = btn.getAttribute("data-a");
                    inB.value = btn.getAttribute("data-b");
                    selOp.value = btn.getAttribute("data-op");
                    update();
                });
            });

            update();
        }
    });
})();

/* sim:text-encoder - 문자 인코딩 들여다보기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    var DEFAULT_TEXT = "A1한글";
    var MAX_LEN = 12;
    var ENCODER = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */

    /* 문자열을 코드포인트 단위로 분해한다. 서로게이트 쌍(이모지)을 한 글자로 묶고,
       짝이 깨진 단독 서로게이트가 와도 그대로 한 단위로 처리해 깨지지 않는다. */
    function codePoints(text) {
        var out = [];
        var i = 0;
        var cp;
        while (i < text.length) {
            cp = text.codePointAt(i);
            if (cp > 0xFFFF) {
                out.push({ ch: text.slice(i, i + 2), cp: cp });
                i += 2;
            } else {
                out.push({ ch: text.charAt(i), cp: cp });
                i += 1;
            }
        }
        return out;
    }

    function formatCp(cp) {
        var hex = cp.toString(16).toUpperCase();
        while (hex.length < 4) {
            hex = "0" + hex;
        }
        return "U+" + hex;
    }

    function byteHex(b) {
        var h = b.toString(16).toUpperCase();
        return h.length < 2 ? "0" + h : h;
    }

    /* 글자별 UTF-8 인코딩 결과와 합계를 계산한다. */
    function analyze(text) {
        var pts = codePoints(text);
        var rows = [];
        var total = 0;
        var k;
        var j;
        var bytes;
        var hexes;
        for (k = 0; k < pts.length; k++) {
            bytes = ENCODER.encode(pts[k].ch);
            hexes = [];
            for (j = 0; j < bytes.length; j++) {
                hexes.push(byteHex(bytes[j]));
            }
            rows.push({
                ch: pts[k].ch,
                code: formatCp(pts[k].cp),
                bytes: hexes,
                byteLen: bytes.length
            });
            total += bytes.length;
        }
        return { rows: rows, charCount: pts.length, totalBytes: total };
    }

    /* 표에 보여줄 문자 표현 (공백류는 눈에 보이게 치환) */
    function displayChar(ch) {
        if (ch === " " || ch === "　") {
            return "(공백)";
        }
        if (ch === "\t") {
            return "(탭)";
        }
        return ch;
    }

    function summaryText(result) {
        return "글자 수 " + result.charCount + "개, UTF-8 총 " +
            result.totalBytes + "바이트";
    }

    /* ---- 위젯 등록 ---- */

    window.SIM.register("text-encoder", {
        title: "문자 인코딩 들여다보기",
        /* node 테스트용 순수 함수 노출 (브라우저 동작에는 영향 없음) */
        _test: {
            codePoints: codePoints,
            formatCp: formatCp,
            byteHex: byteHex,
            analyze: analyze,
            displayChar: displayChar,
            summaryText: summaryText
        },
        build: function (root) {
            if (!ENCODER) {
                var na = document.createElement("p");
                na.className = "sim__note";
                na.textContent = "이 브라우저는 TextEncoder를 지원하지 않아 위젯을 사용할 수 없습니다.";
                root.appendChild(na);
                return;
            }

            root.innerHTML = "" +
                "<div class=\"sim__row\">" +
                "<input type=\"text\" class=\"sim__input sim-te__input\"" +
                " maxlength=\"" + MAX_LEN + "\" autocomplete=\"off\"" +
                " aria-label=\"인코딩할 텍스트 입력 (최대 " + MAX_LEN + "자)\">" +
                "<button type=\"button\" class=\"sim__btn\"" +
                " data-role=\"reset\" aria-label=\"입력을 기본값으로 초기화\">초기화</button>" +
                "</div>" +
                "<div class=\"sim-te__scroll\">" +
                "<table class=\"sim-te__table\" aria-label=\"글자별 UTF-8 인코딩 표\">" +
                "<thead><tr>" +
                "<th scope=\"col\">문자</th>" +
                "<th scope=\"col\">유니코드</th>" +
                "<th scope=\"col\">UTF-8 바이트</th>" +
                "<th scope=\"col\">바이트 수</th>" +
                "</tr></thead>" +
                "<tbody data-role=\"tbody\"></tbody>" +
                "</table>" +
                "</div>" +
                "<div class=\"sim__out sim-te__sum\" data-role=\"summary\"" +
                " aria-live=\"polite\"></div>" +
                "<p class=\"sim__note\">영문자와 숫자(ASCII 범위)는 1바이트, 한글은 3바이트로" +
                " 저장됩니다. 같은 글자 수라도 어떤 문자인지에 따라 차지하는 용량이 달라지고," +
                " 이모지는 4바이트가 되기도 합니다.</p>";

            var input = root.querySelector(".sim-te__input");
            var resetBtn = root.querySelector("[data-role=reset]");
            var tbody = root.querySelector("[data-role=tbody]");
            var summary = root.querySelector("[data-role=summary]");

            function render() {
                var text = input.value;
                if (text.length > MAX_LEN) {
                    text = text.slice(0, MAX_LEN);
                }
                var result = analyze(text);
                var k;
                var j;
                var tr;
                var td;
                var box;
                var row;

                tbody.textContent = "";

                if (result.rows.length === 0) {
                    tr = document.createElement("tr");
                    td = document.createElement("td");
                    td.colSpan = 4;
                    td.className = "sim-te__empty";
                    td.textContent = "글자를 입력하면 인코딩 결과가 나타납니다.";
                    tr.appendChild(td);
                    tbody.appendChild(tr);
                } else {
                    for (k = 0; k < result.rows.length; k++) {
                        row = result.rows[k];
                        tr = document.createElement("tr");

                        td = document.createElement("td");
                        td.className = "sim-te__char";
                        td.textContent = displayChar(row.ch);
                        tr.appendChild(td);

                        td = document.createElement("td");
                        td.className = "sim-te__code";
                        td.textContent = row.code;
                        tr.appendChild(td);

                        td = document.createElement("td");
                        td.className = "sim-te__bytes";
                        for (j = 0; j < row.bytes.length; j++) {
                            box = document.createElement("span");
                            box.className = "sim-te__byte";
                            box.textContent = row.bytes[j];
                            td.appendChild(box);
                        }
                        tr.appendChild(td);

                        td = document.createElement("td");
                        box = document.createElement("span");
                        box.className = "sim-te__count is-b" +
                            Math.min(row.byteLen, 4);
                        box.textContent = row.byteLen + "바이트";
                        td.appendChild(box);
                        tr.appendChild(td);

                        tbody.appendChild(tr);
                    }
                }

                summary.textContent = summaryText(result);
            }

            input.addEventListener("input", render);
            resetBtn.addEventListener("click", function () {
                input.value = DEFAULT_TEXT;
                render();
                input.focus();
            });

            input.value = DEFAULT_TEXT;
            render();
        }
    });
})();

/* sim:logic-lab - 논리 게이트 실험실 */
(function () {
    "use strict";

    /* ---- 순수 로직 (DOM 무관, node 검증 대상) ---- */
    var GATE_ORDER = ["AND", "OR", "NOT", "NAND", "NOR", "XOR"];
    var GATES = {
        AND: { arity: 2, expr: "A AND B", fn: function (a, b) { return a & b; } },
        OR: { arity: 2, expr: "A OR B", fn: function (a, b) { return a | b; } },
        NOT: { arity: 1, expr: "NOT A", fn: function (a) { return a ? 0 : 1; } },
        NAND: { arity: 2, expr: "NOT (A AND B)", fn: function (a, b) { return (a & b) ? 0 : 1; } },
        NOR: { arity: 2, expr: "NOT (A OR B)", fn: function (a, b) { return (a | b) ? 0 : 1; } },
        XOR: { arity: 2, expr: "A XOR B", fn: function (a, b) { return a ^ b; } }
    };

    function evalGate(name, a, b) {
        var g = GATES[name];
        if (!g) return 0;
        return g.arity === 1 ? g.fn(a) : g.fn(a, b);
    }

    function truthRows(name) {
        var g = GATES[name];
        var rows = [];
        var combos, i;
        if (!g) return rows;
        if (g.arity === 1) {
            for (i = 0; i < 2; i++) {
                rows.push([i, evalGate(name, i, 0)]);
            }
        } else {
            combos = [[0, 0], [0, 1], [1, 0], [1, 1]];
            for (i = 0; i < combos.length; i++) {
                rows.push([combos[i][0], combos[i][1], evalGate(name, combos[i][0], combos[i][1])]);
            }
        }
        return rows;
    }

    function currentRow(name, a, b) {
        var g = GATES[name];
        if (!g) return 0;
        return g.arity === 1 ? a : a * 2 + b;
    }

    function halfAdder(a, b) {
        return { s: a ^ b, c: a & b };
    }

    function adderComment(a, b) {
        var r = halfAdder(a, b);
        var bin = r.c ? "10" : String(r.s);
        var line = a + " + " + b + " = " + bin + "(2진)";
        if (r.c) {
            line += " : 합 S는 0이 되고 자리올림 C=1이 윗자리로 넘어갑니다.";
        } else if (r.s) {
            line += " : 합 S=1, 자리올림은 없습니다 (C=0).";
        } else {
            line += " : 둘 다 0이므로 합도 자리올림도 0입니다.";
        }
        return line;
    }

    function gateExpr(name, a, b) {
        var g = GATES[name];
        var x = evalGate(name, a, b);
        if (!g) return "";
        if (g.arity === 1) {
            return "X = NOT A → NOT " + a + " = " + x;
        }
        return "X = " + g.expr + " → " + a + " " + name + " " + b + " = " + x;
    }

    /* node 테스트용 내보내기 (브라우저에서는 건너뜀) */
    if (typeof module === "object" && module !== null && module.exports) {
        module.exports = {
            GATE_ORDER: GATE_ORDER,
            evalGate: evalGate,
            truthRows: truthRows,
            currentRow: currentRow,
            halfAdder: halfAdder,
            adderComment: adderComment,
            gateExpr: gateExpr
        };
    }

    if (typeof window === "undefined" || !window.SIM) return;

    /* ---- 정적 골격용 HTML 조각 (내부 고정 문자열만 사용) ---- */
    function switchHTML(key) {
        var name = key.toUpperCase();
        return '<button type="button" class="lab-switch" data-sw="' + key +
            '" aria-pressed="false" aria-label="입력 ' + name + ' 스위치">' +
            '<span class="lab-switch__name">입력 ' + name + '</span>' +
            '<span class="lab-switch__val">0</span>' +
            '</button>';
    }

    function lampHTML(key, label) {
        return '<span class="lab-lamp" data-lamp="' + key + '">' +
            '<span class="lab-lamp__bulb">0</span>' +
            '<span class="lab-lamp__name">' + label + '</span>' +
            '</span>';
    }

    function tableHTML(headers, rows) {
        var html = "<table><thead><tr>";
        var i, j;
        for (i = 0; i < headers.length; i++) {
            html += "<th>" + headers[i] + "</th>";
        }
        html += "</tr></thead><tbody>";
        for (i = 0; i < rows.length; i++) {
            html += "<tr>";
            for (j = 0; j < rows[i].length; j++) {
                html += "<td>" + rows[i][j] + "</td>";
            }
            html += "</tr>";
        }
        html += "</tbody></table>";
        return html;
    }

    window.SIM.register("logic-lab", {
        title: "논리 게이트 실험실",
        build: function (root) {
            var state = { tab: "gate", gate: "AND", a: 0, b: 0 };
            var gateBtnsHTML = "";
            var i;

            for (i = 0; i < GATE_ORDER.length; i++) {
                gateBtnsHTML += '<button type="button" class="sim__tab lab-gate-btn' +
                    (GATE_ORDER[i] === state.gate ? " active" : "") +
                    '" data-gate="' + GATE_ORDER[i] +
                    '" aria-label="' + GATE_ORDER[i] + ' 게이트 선택">' +
                    GATE_ORDER[i] + "</button>";
            }

            root.innerHTML =
                '<div class="sim__tabs" role="tablist" aria-label="실험 선택">' +
                    '<button type="button" class="sim__tab active" role="tab" aria-selected="true" data-tab="gate">게이트 체험</button>' +
                    '<button type="button" class="sim__tab" role="tab" aria-selected="false" data-tab="adder">반가산기</button>' +
                '</div>' +
                '<div class="lab-panel" data-panel="gate">' +
                    '<div class="sim__row lab-gates" role="group" aria-label="게이트 선택">' + gateBtnsHTML + '</div>' +
                    '<div class="lab-board">' +
                        switchHTML("a") +
                        switchHTML("b") +
                        '<span class="lab-arrow" aria-hidden="true">→</span>' +
                        '<span class="sim__chip lab-gate-name">AND</span>' +
                        '<span class="lab-arrow" aria-hidden="true">→</span>' +
                        lampHTML("x", "출력 X") +
                    '</div>' +
                    '<p class="lab-expr" data-expr="gate" aria-live="polite"></p>' +
                    '<div class="lab-table" data-table="gate"></div>' +
                    '<p class="sim__note">스위치 A, B를 눌러 0/1을 바꿔 보세요. 진리표에서 현재 입력에 해당하는 행이 강조됩니다. NOT 게이트는 입력이 A 하나뿐이라 B 스위치가 비활성화됩니다.</p>' +
                '</div>' +
                '<div class="lab-panel" data-panel="adder" hidden>' +
                    '<div class="lab-board">' +
                        switchHTML("a") +
                        switchHTML("b") +
                        '<span class="lab-arrow" aria-hidden="true">→</span>' +
                        lampHTML("s", "합 S") +
                        lampHTML("c", "올림 C") +
                    '</div>' +
                    '<div class="sim__row">' +
                        '<span class="sim__chip">S = A XOR B</span>' +
                        '<span class="sim__chip">C = A AND B</span>' +
                    '</div>' +
                    '<p class="lab-expr" data-expr="adder" aria-live="polite"></p>' +
                    '<div class="lab-table" data-table="adder"></div>' +
                    '<p class="sim__note">반가산기는 1비트 두 개를 더해 합(S)과 자리올림(C)을 만듭니다. 1+1처럼 결과가 2가 되면 자리올림 C=1이 윗자리로 올라갑니다.</p>' +
                '</div>';

            var gatePanel = root.querySelector('[data-panel="gate"]');
            var adderPanel = root.querySelector('[data-panel="adder"]');
            var gateSwB = gatePanel.querySelector('[data-sw="b"]');
            var gateTableBox = root.querySelector('[data-table="gate"]');
            var adderTableBox = root.querySelector('[data-table="adder"]');
            var gateExprEl = root.querySelector('[data-expr="gate"]');
            var adderExprEl = root.querySelector('[data-expr="adder"]');
            var gateNameChip = root.querySelector(".lab-gate-name");
            var tabBtns = root.querySelectorAll('.sim__tabs [data-tab]');
            var gateBtns = root.querySelectorAll(".lab-gate-btn");
            var swBtns = root.querySelectorAll(".lab-switch");
            var lampX = root.querySelector('[data-lamp="x"]');
            var lampS = root.querySelector('[data-lamp="s"]');
            var lampC = root.querySelector('[data-lamp="c"]');

            function buildGateTable() {
                var g = GATES[state.gate];
                var headers = g.arity === 1 ? ["A", "X"] : ["A", "B", "X"];
                gateTableBox.innerHTML = tableHTML(headers, truthRows(state.gate));
            }

            function buildAdderTable() {
                var combos = [[0, 0], [0, 1], [1, 0], [1, 1]];
                var rows = [];
                var k, r;
                for (k = 0; k < combos.length; k++) {
                    r = halfAdder(combos[k][0], combos[k][1]);
                    rows.push([combos[k][0], combos[k][1], r.s, r.c]);
                }
                adderTableBox.innerHTML = tableHTML(["A", "B", "합 S", "올림 C"], rows);
            }

            function setLamp(el, val) {
                if (val) {
                    el.classList.add("on");
                } else {
                    el.classList.remove("on");
                }
                el.querySelector(".lab-lamp__bulb").textContent = String(val);
            }

            function highlight(box, idx) {
                var trs = box.querySelectorAll("tbody tr");
                var k;
                for (k = 0; k < trs.length; k++) {
                    if (k === idx) {
                        trs[k].classList.add("is-now");
                    } else {
                        trs[k].classList.remove("is-now");
                    }
                }
            }

            function update() {
                var g = GATES[state.gate];
                var k, btn, key, val, on, r;

                /* 탭과 패널 */
                for (k = 0; k < tabBtns.length; k++) {
                    on = tabBtns[k].getAttribute("data-tab") === state.tab;
                    if (on) {
                        tabBtns[k].classList.add("active");
                    } else {
                        tabBtns[k].classList.remove("active");
                    }
                    tabBtns[k].setAttribute("aria-selected", on ? "true" : "false");
                }
                gatePanel.hidden = state.tab !== "gate";
                adderPanel.hidden = state.tab !== "adder";

                /* 게이트 선택 버튼 */
                for (k = 0; k < gateBtns.length; k++) {
                    on = gateBtns[k].getAttribute("data-gate") === state.gate;
                    if (on) {
                        gateBtns[k].classList.add("active");
                    } else {
                        gateBtns[k].classList.remove("active");
                    }
                    gateBtns[k].setAttribute("aria-pressed", on ? "true" : "false");
                }

                /* 스위치 (두 패널 공유 상태) */
                for (k = 0; k < swBtns.length; k++) {
                    btn = swBtns[k];
                    key = btn.getAttribute("data-sw");
                    val = state[key];
                    if (val) {
                        btn.classList.add("on");
                    } else {
                        btn.classList.remove("on");
                    }
                    btn.setAttribute("aria-pressed", val ? "true" : "false");
                    btn.querySelector(".lab-switch__val").textContent = String(val);
                }
                gateSwB.disabled = g.arity === 1;

                /* 게이트 체험 결과 */
                gateNameChip.textContent = state.gate;
                setLamp(lampX, evalGate(state.gate, state.a, state.b));
                gateExprEl.textContent = gateExpr(state.gate, state.a, state.b);
                highlight(gateTableBox, currentRow(state.gate, state.a, state.b));

                /* 반가산기 결과 */
                r = halfAdder(state.a, state.b);
                setLamp(lampS, r.s);
                setLamp(lampC, r.c);
                adderExprEl.textContent = adderComment(state.a, state.b);
                highlight(adderTableBox, state.a * 2 + state.b);
            }

            for (i = 0; i < tabBtns.length; i++) {
                tabBtns[i].addEventListener("click", function (e) {
                    state.tab = e.currentTarget.getAttribute("data-tab");
                    update();
                });
            }
            for (i = 0; i < gateBtns.length; i++) {
                gateBtns[i].addEventListener("click", function (e) {
                    state.gate = e.currentTarget.getAttribute("data-gate");
                    buildGateTable();
                    update();
                });
            }
            for (i = 0; i < swBtns.length; i++) {
                swBtns[i].addEventListener("click", function (e) {
                    var key = e.currentTarget.getAttribute("data-sw");
                    state[key] = state[key] ? 0 : 1;
                    update();
                });
            }

            buildGateTable();
            buildAdderTable();
            update();
        }
    });
})();

/* sim:cpu-cycle - 명령어 실행 사이클 시뮬레이터 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ------------------------------------------------------------------
       순수 상태 전이 로직 (DOM 비의존, node 테스트 가능)
       - 폰 노이만 미니 머신: 레지스터 PC/IR/ACC, 메모리 8칸(주소 0~7)
       - 모든 명령은 인출 -> 해독 -> 실행 -> 저장 4단계를 거친다.
         해당 없는 단계는 "할 일이 없다"로 설명한다.
       ------------------------------------------------------------------ */
    var PHASES = ["fetch", "decode", "execute", "store"];
    var PHASE_LABELS = { fetch: "인출", decode: "해독", execute: "실행", store: "저장" };
    var TOTAL_STEPS = 16; /* 명령 4개 x 단계 4개 */

    /* 숫자(0~9) 뒤에 붙는 조사 "로/으로" - 영(0)/삼(3)/육(6)만 으로 */
    function roParticle(n) {
        return (n === 0 || n === 3 || n === 6) ? "으로" : "로";
    }

    function parseInstr(text) {
        var parts = String(text).split(" ");
        return {
            op: parts[0],
            arg: parts.length > 1 ? parseInt(parts[1], 10) : -1
        };
    }

    function nextPhase(phase) {
        var i = PHASES.indexOf(phase);
        if (i === -1 || i === PHASES.length - 1) return "fetch";
        return PHASES[i + 1];
    }

    function createState() {
        return {
            pc: 0,
            ir: "",
            acc: 0,
            mem: ["LOAD 5", "ADD 6", "STORE 7", "HALT", null, 3, 4, 0],
            op: "",
            arg: -1,
            phase: "",
            stepCount: 0,
            done: false,
            narration: "아직 시작 전이다. '다음 단계' 버튼을 누르면 0번지 명령의 인출부터 시작한다.",
            hot: { mem: [], reg: [], chip: "" }
        };
    }

    /* 마이크로 단계 1개를 진행한다. state를 직접 갱신하고 그대로 돌려준다. */
    function step(state) {
        if (state.done) return state;

        var phase = nextPhase(state.phase);
        state.phase = phase;
        state.stepCount += 1;
        state.hot = { mem: [], reg: [], chip: phase };

        if (phase === "fetch") {
            var addr = state.pc;
            state.ir = String(state.mem[addr]);
            state.pc = addr + 1;
            state.op = "";
            state.arg = -1;
            state.hot.mem = [addr];
            state.hot.reg = ["pc", "ir"];
            state.narration = "인출: PC(" + addr + ")가 가리키는 " + addr +
                "번지에서 '" + state.ir + "' 명령을 가져와 IR에 담고, PC를 " +
                state.pc + roParticle(state.pc) + " 올린다.";
        } else if (phase === "decode") {
            var parsed = parseInstr(state.ir);
            state.op = parsed.op;
            state.arg = parsed.arg;
            state.hot.reg = ["ir"];
            if (parsed.op === "LOAD") {
                state.narration = "해독: 제어장치가 IR의 'LOAD " + parsed.arg +
                    "'를 해석한다 - " + parsed.arg + "번지의 값을 ACC에 읽어 오라는 명령이다.";
            } else if (parsed.op === "ADD") {
                state.narration = "해독: 제어장치가 IR의 'ADD " + parsed.arg +
                    "'을 해석한다 - ACC에 " + parsed.arg + "번지의 값을 더하라는 명령이다.";
            } else if (parsed.op === "STORE") {
                state.narration = "해독: 제어장치가 IR의 'STORE " + parsed.arg +
                    "'을 해석한다 - ACC의 값을 " + parsed.arg + "번지에 기록하라는 명령이다.";
            } else {
                state.narration = "해독: 제어장치가 IR의 'HALT'를 해석한다 - 프로그램 실행을 멈추라는 명령이다.";
            }
        } else if (phase === "execute") {
            if (state.op === "LOAD") {
                state.acc = state.mem[state.arg];
                state.hot.mem = [state.arg];
                state.hot.reg = ["acc"];
                state.narration = "실행: " + state.arg + "번지의 값 " +
                    state.acc + "을 읽어 ACC에 담는다. ACC = " + state.acc + ".";
            } else if (state.op === "ADD") {
                var before = state.acc;
                var operand = state.mem[state.arg];
                state.acc = before + operand;
                state.hot.mem = [state.arg];
                state.hot.reg = ["acc"];
                state.narration = "실행: ACC(" + before + ")에 " + state.arg +
                    "번지의 값 " + operand + "를 더한다. ACC = " + state.acc + ".";
            } else if (state.op === "STORE") {
                state.hot.reg = ["acc"];
                state.narration = "실행: 기록할 값 ACC(" + state.acc +
                    ")를 확인한다. 실제 메모리 기록은 저장 단계에서 한다.";
            } else {
                state.narration = "실행: HALT - CPU가 더 이상 다음 명령을 가져오지 않는다.";
            }
        } else { /* store */
            if (state.op === "STORE") {
                state.mem[state.arg] = state.acc;
                state.hot.mem = [state.arg];
                state.hot.reg = ["acc"];
                state.narration = "저장: ACC의 값 " + state.acc + "을 " +
                    state.arg + "번지에 기록한다. 메모리[" + state.arg + "] = " + state.acc + ".";
            } else if (state.op === "HALT") {
                state.done = true;
                state.narration = "저장: HALT는 이 단계에서 할 일이 없다. 프로그램 종료 - 7번지에 " +
                    state.mem[5] + "+" + state.mem[6] + "=" + state.mem[7] + "이 저장되었다.";
            } else {
                state.narration = "저장: " + state.op +
                    "는 실행 단계에서 이미 ACC에 결과를 담았으므로, 이 단계에서 따로 할 일이 없다.";
            }
        }
        return state;
    }

    /* ------------------------------------------------------------------
       위젯 등록
       ------------------------------------------------------------------ */
    window.SIM.register("cpu-cycle", {
        title: "명령어 실행 사이클 시뮬레이터",
        /* node 테스트에서 순수 로직에 접근하기 위한 노출 */
        logic: {
            PHASES: PHASES,
            TOTAL_STEPS: TOTAL_STEPS,
            createState: createState,
            step: step,
            parseInstr: parseInstr,
            nextPhase: nextPhase
        },
        build: function (root) {
            var state = createState();
            var html = "";
            var i;

            /* 단계 칩 4개 */
            html += '<div class="cyc__chips" role="list" aria-label="명령어 사이클 4단계">';
            for (i = 0; i < PHASES.length; i++) {
                html += '<span class="cyc__phase" role="listitem" data-phase="' +
                    PHASES[i] + '">' + (i + 1) + " " + PHASE_LABELS[PHASES[i]] + "</span>";
            }
            html += "</div>";

            /* 레지스터 패널 + 메모리 8칸 */
            html += '<div class="cyc__layout">';
            html += '<div class="cyc__regs" role="group" aria-label="레지스터">';
            html += '<p class="cyc__panel-title">레지스터</p>';
            html += '<div class="cyc__reg" data-reg="pc" aria-label="PC 프로그램 카운터">' +
                '<span class="cyc__reg-name">PC</span>' +
                '<span class="cyc__reg-val" data-val="pc">-</span></div>';
            html += '<div class="cyc__reg" data-reg="ir" aria-label="IR 명령어 레지스터">' +
                '<span class="cyc__reg-name">IR</span>' +
                '<span class="cyc__reg-val" data-val="ir">-</span></div>';
            html += '<div class="cyc__reg" data-reg="acc" aria-label="ACC 누산기">' +
                '<span class="cyc__reg-name">ACC</span>' +
                '<span class="cyc__reg-val" data-val="acc">-</span></div>';
            html += "</div>";
            html += '<div class="cyc__memwrap">';
            html += '<p class="cyc__panel-title">메모리 (주소 0~7)</p>';
            html += '<div class="cyc__mem" role="group" aria-label="메모리 8칸">';
            for (i = 0; i < 8; i++) {
                html += '<div class="cyc__cell" data-addr="' + i + '">' +
                    '<span class="cyc__cell-addr">' + i + "</span>" +
                    '<span class="cyc__cell-val">-</span></div>';
            }
            html += "</div></div></div>";

            /* 내레이션 + 컨트롤 */
            html += '<p class="cyc__narr" role="status" aria-live="polite"></p>';
            html += '<div class="sim__row">' +
                '<button type="button" class="sim__btn sim__btn--primary" data-act="step" aria-label="다음 단계 진행">다음 단계</button>' +
                '<button type="button" class="sim__btn" data-act="reset" aria-label="처음부터 다시 시작">처음부터</button>' +
                '<span class="cyc__count" aria-hidden="true"></span>' +
                "</div>";
            html += '<p class="sim__note">고정 프로그램: 0번지 LOAD 5 / 1번지 ADD 6 / 2번지 STORE 7 / 3번지 HALT. ' +
                "데이터: 5번지 = 3, 6번지 = 4. 실행 결과는 7번지에 저장된다.</p>";

            root.innerHTML = html;

            var stepBtn = root.querySelector('[data-act="step"]');
            var resetBtn = root.querySelector('[data-act="reset"]');
            var narrEl = root.querySelector(".cyc__narr");
            var countEl = root.querySelector(".cyc__count");
            var chipEls = root.querySelectorAll(".cyc__phase");
            var regEls = root.querySelectorAll(".cyc__reg");
            var cellEls = root.querySelectorAll(".cyc__cell");
            var valEls = {
                pc: root.querySelector('[data-val="pc"]'),
                ir: root.querySelector('[data-val="ir"]'),
                acc: root.querySelector('[data-val="acc"]')
            };
            var cellValEls = [];
            for (i = 0; i < cellEls.length; i++) {
                cellValEls.push(cellEls[i].querySelector(".cyc__cell-val"));
            }

            function setClass(el, cls, on) {
                if (on) {
                    el.classList.add(cls);
                } else {
                    el.classList.remove(cls);
                }
            }

            function cellText(v) {
                return (v === null || v === "") ? "-" : String(v);
            }

            function render() {
                var j;
                valEls.pc.textContent = String(state.pc);
                valEls.ir.textContent = state.ir === "" ? "-" : state.ir;
                valEls.acc.textContent = String(state.acc);
                for (j = 0; j < regEls.length; j++) {
                    setClass(regEls[j], "is-hot",
                        state.hot.reg.indexOf(regEls[j].getAttribute("data-reg")) !== -1);
                }
                for (j = 0; j < cellEls.length; j++) {
                    cellValEls[j].textContent = cellText(state.mem[j]);
                    setClass(cellEls[j], "is-hot", state.hot.mem.indexOf(j) !== -1);
                    setClass(cellEls[j], "is-pc", state.pc === j);
                }
                for (j = 0; j < chipEls.length; j++) {
                    setClass(chipEls[j], "active",
                        chipEls[j].getAttribute("data-phase") === state.hot.chip);
                }
                narrEl.textContent = state.narration;
                setClass(narrEl, "is-done", state.done);
                countEl.textContent = "단계 " + state.stepCount + "/" + TOTAL_STEPS;
                stepBtn.disabled = state.done;
            }

            stepBtn.addEventListener("click", function () {
                step(state);
                render();
            });
            resetBtn.addEventListener("click", function () {
                state = createState();
                render();
            });

            render();
        }
    });
})();

/* sim:os-schedule - CPU 스케줄링 시뮬레이터 */
(function () {
    "use strict";

    /* ---- 순수 스케줄링 로직 (DOM 비의존, node로 단독 테스트 가능) ----
       입력: [{ id, arrival, burst }]
       출력: { slices: [{ id, start, end }], finish: { id: 완료시간 } }
       slices의 id가 null이면 CPU 유휴 구간이다. */

    function prepare(procs) {
        var list = [];
        var i;
        for (i = 0; i < procs.length; i++) {
            list.push({
                id: procs[i].id,
                arrival: procs[i].arrival,
                burst: procs[i].burst,
                order: i
            });
        }
        list.sort(function (a, b) {
            if (a.arrival !== b.arrival) {
                return a.arrival - b.arrival;
            }
            return a.order - b.order;
        });
        return list;
    }

    function mergeSlices(slices) {
        var out = [];
        var i, s, last;
        for (i = 0; i < slices.length; i++) {
            s = slices[i];
            last = out.length > 0 ? out[out.length - 1] : null;
            if (last && last.id === s.id && last.end === s.start) {
                last.end = s.end;
            } else {
                out.push({ id: s.id, start: s.start, end: s.end });
            }
        }
        return out;
    }

    function scheduleFCFS(procs) {
        var list = prepare(procs);
        var slices = [];
        var finish = {};
        var time = 0;
        var i, p;
        for (i = 0; i < list.length; i++) {
            p = list[i];
            if (p.arrival > time) {
                slices.push({ id: null, start: time, end: p.arrival });
                time = p.arrival;
            }
            slices.push({ id: p.id, start: time, end: time + p.burst });
            time += p.burst;
            finish[p.id] = time;
        }
        return { slices: slices, finish: finish };
    }

    function scheduleSJF(procs) {
        var list = prepare(procs);
        var slices = [];
        var finish = {};
        var done = {};
        var doneCount = 0;
        var time = 0;
        var i, p, best, nextArrival;
        while (doneCount < list.length) {
            best = null;
            for (i = 0; i < list.length; i++) {
                p = list[i];
                if (done[p.id] || p.arrival > time) {
                    continue;
                }
                /* list가 도착순 정렬이므로 burst 동률이면 먼저 도착한 쪽이 유지된다 */
                if (!best || p.burst < best.burst) {
                    best = p;
                }
            }
            if (!best) {
                /* 아직 아무도 도착하지 않음: 다음 도착까지 유휴 */
                nextArrival = Infinity;
                for (i = 0; i < list.length; i++) {
                    p = list[i];
                    if (!done[p.id] && p.arrival < nextArrival) {
                        nextArrival = p.arrival;
                    }
                }
                slices.push({ id: null, start: time, end: nextArrival });
                time = nextArrival;
                continue;
            }
            slices.push({ id: best.id, start: time, end: time + best.burst });
            time += best.burst;
            finish[best.id] = time;
            done[best.id] = true;
            doneCount++;
        }
        return { slices: slices, finish: finish };
    }

    function scheduleRR(procs, quantum) {
        var list = prepare(procs);
        var n = list.length;
        var slices = [];
        var finish = {};
        var remaining = {};
        var queue = [];
        var nextIdx = 0;
        var time = 0;
        var doneCount = 0;
        var i, p, run;

        for (i = 0; i < n; i++) {
            remaining[list[i].id] = list[i].burst;
        }

        function enqueueArrived(t) {
            while (nextIdx < n && list[nextIdx].arrival <= t) {
                queue.push(list[nextIdx]);
                nextIdx++;
            }
        }

        enqueueArrived(time);
        while (doneCount < n) {
            if (queue.length === 0) {
                /* 큐가 비었으면 다음 도착까지 유휴 */
                slices.push({ id: null, start: time, end: list[nextIdx].arrival });
                time = list[nextIdx].arrival;
                enqueueArrived(time);
                continue;
            }
            p = queue.shift();
            run = Math.min(quantum, remaining[p.id]);
            slices.push({ id: p.id, start: time, end: time + run });
            time += run;
            remaining[p.id] -= run;
            /* 실행 중(끝나는 순간 포함) 도착한 프로세스가 큐에 먼저 들어가고 */
            enqueueArrived(time);
            /* 선점된 프로세스는 그 뒤에 들어간다 */
            if (remaining[p.id] > 0) {
                queue.push(p);
            } else {
                finish[p.id] = time;
                doneCount++;
            }
        }
        return { slices: mergeSlices(slices), finish: finish };
    }

    /* 반환시간 = 완료 - 도착, 대기시간 = 반환 - 실행 */
    function computeStats(procs, finish) {
        var rows = [];
        var sumTurn = 0;
        var sumWait = 0;
        var i, p, turn, wait;
        for (i = 0; i < procs.length; i++) {
            p = procs[i];
            turn = finish[p.id] - p.arrival;
            wait = turn - p.burst;
            rows.push({
                id: p.id,
                arrival: p.arrival,
                burst: p.burst,
                finish: finish[p.id],
                turnaround: turn,
                waiting: wait
            });
            sumTurn += turn;
            sumWait += wait;
        }
        return {
            rows: rows,
            avgTurnaround: procs.length > 0 ? sumTurn / procs.length : 0,
            avgWaiting: procs.length > 0 ? sumWait / procs.length : 0
        };
    }

    /* ---- node 테스트용 내보내기 (브라우저에서는 건너뜀) ---- */
    if (typeof module === "object" && module !== null && module.exports) {
        module.exports = {
            scheduleFCFS: scheduleFCFS,
            scheduleSJF: scheduleSJF,
            scheduleRR: scheduleRR,
            computeStats: computeStats,
            mergeSlices: mergeSlices
        };
        return;
    }

    if (!window.SIM) return;
    window.SIM.register("os-schedule", {
        title: "CPU 스케줄링 시뮬레이터",
        build: function (root) {
            var COUNT = 4;
            var QUANTUM = 2;
            var ARRIVAL_MAX = 20;
            var BURST_MAX = 20;
            var DEFAULTS = [
                { arrival: 0, burst: 5 },
                { arrival: 1, burst: 3 },
                { arrival: 2, burst: 8 },
                { arrival: 3, burst: 2 }
            ];
            var html = "";
            var i;

            html += '<table class="os-procs"><thead><tr>'
                + '<th scope="col">프로세스</th>'
                + '<th scope="col">도착시간</th>'
                + '<th scope="col">실행시간</th>'
                + '</tr></thead><tbody>';
            for (i = 0; i < COUNT; i++) {
                html += '<tr><th scope="row">P' + (i + 1) + '</th>'
                    + '<td><input type="number" class="sim__input sim__input--num os-num"'
                    + ' data-kind="arrival" data-idx="' + i + '"'
                    + ' min="0" max="' + ARRIVAL_MAX + '" step="1"'
                    + ' value="' + DEFAULTS[i].arrival + '"'
                    + ' aria-label="P' + (i + 1) + ' 도착시간"></td>'
                    + '<td><input type="number" class="sim__input sim__input--num os-num"'
                    + ' data-kind="burst" data-idx="' + i + '"'
                    + ' min="1" max="' + BURST_MAX + '" step="1"'
                    + ' value="' + DEFAULTS[i].burst + '"'
                    + ' aria-label="P' + (i + 1) + ' 실행시간"></td></tr>';
            }
            html += '</tbody></table>';

            html += '<div class="sim__row">'
                + '<label class="os-algo">알고리즘'
                + ' <select class="sim__select" data-ref="algo" aria-label="스케줄링 알고리즘 선택">'
                + '<option value="fcfs">FCFS (선입선출)</option>'
                + '<option value="sjf">SJF (비선점)</option>'
                + '<option value="rr">RR (시간 할당량 ' + QUANTUM + ')</option>'
                + '</select></label>'
                + '<button type="button" class="sim__btn" data-ref="random"'
                + ' aria-label="프로세스 도착시간과 실행시간 무작위 생성">무작위</button>'
                + '<button type="button" class="sim__btn sim__btn--primary" data-ref="run"'
                + ' aria-label="선택한 알고리즘으로 스케줄링 실행">실행</button>'
                + '</div>';

            html += '<p class="os-summary" data-ref="summary" aria-live="polite"></p>'
                + '<div class="os-result" data-ref="result" hidden>'
                + '<p class="os-subhead">간트 차트</p>'
                + '<div class="os-gantt" data-ref="gantt"></div>'
                + '<p class="os-subhead">프로세스별 결과</p>'
                + '<div data-ref="stats"></div>'
                + '</div>'
                + '<p class="sim__note">반환시간 = 완료시간 - 도착시간, 대기시간 = 반환시간 - 실행시간. '
                + 'FCFS는 도착 순서대로, SJF는 도착한 프로세스 중 실행시간이 가장 짧은 것부터(비선점), '
                + 'RR은 시간 할당량 ' + QUANTUM + '만큼씩 번갈아 실행합니다.</p>';

            root.innerHTML = html;

            var refs = {
                algo: root.querySelector('[data-ref="algo"]'),
                random: root.querySelector('[data-ref="random"]'),
                run: root.querySelector('[data-ref="run"]'),
                summary: root.querySelector('[data-ref="summary"]'),
                result: root.querySelector('[data-ref="result"]'),
                gantt: root.querySelector('[data-ref="gantt"]'),
                stats: root.querySelector('[data-ref="stats"]'),
                procTable: root.querySelector(".os-procs")
            };

            function clampInt(value, min, max, fallback) {
                var v = parseInt(value, 10);
                if (isNaN(v)) {
                    v = fallback;
                }
                if (v < min) {
                    v = min;
                }
                if (v > max) {
                    v = max;
                }
                return v;
            }

            function getInput(kind, idx) {
                return root.querySelector(
                    'input[data-kind="' + kind + '"][data-idx="' + idx + '"]'
                );
            }

            function readProcs() {
                var procs = [];
                var k, arrivalEl, burstEl, a, b;
                for (k = 0; k < COUNT; k++) {
                    arrivalEl = getInput("arrival", k);
                    burstEl = getInput("burst", k);
                    a = clampInt(arrivalEl.value, 0, ARRIVAL_MAX, DEFAULTS[k].arrival);
                    b = clampInt(burstEl.value, 1, BURST_MAX, DEFAULTS[k].burst);
                    arrivalEl.value = a;
                    burstEl.value = b;
                    procs.push({ id: "P" + (k + 1), arrival: a, burst: b });
                }
                return procs;
            }

            function fmt(x) {
                return String(Math.round(x * 100) / 100);
            }

            function renderGantt(slices) {
                var j, s, dur, cell, name, range, pNum;
                refs.gantt.innerHTML = "";
                for (j = 0; j < slices.length; j++) {
                    s = slices[j];
                    dur = s.end - s.start;
                    cell = document.createElement("div");
                    if (s.id) {
                        pNum = parseInt(s.id.substring(1), 10);
                        cell.className = "os-slice os-slice--c" + ((pNum - 1) % COUNT);
                    } else {
                        cell.className = "os-slice os-slice--idle";
                    }
                    cell.style.flexGrow = String(dur);
                    cell.style.flexBasis = (dur * 14) + "px";
                    name = document.createElement("span");
                    name.className = "os-slice__name";
                    name.textContent = s.id ? s.id : "유휴";
                    range = document.createElement("span");
                    range.className = "os-slice__range";
                    range.textContent = s.start + "-" + s.end;
                    cell.appendChild(name);
                    cell.appendChild(range);
                    refs.gantt.appendChild(cell);
                }
            }

            function appendCell(row, tag, text) {
                var cell = document.createElement(tag);
                cell.textContent = text;
                row.appendChild(cell);
                return cell;
            }

            function renderStats(stats) {
                var table = document.createElement("table");
                var thead = document.createElement("thead");
                var tbody = document.createElement("tbody");
                var headRow = document.createElement("tr");
                var heads = ["프로세스", "도착", "실행", "완료", "반환시간", "대기시간"];
                var j, r, row, avgRow, avgTh;

                table.className = "os-stats";
                for (j = 0; j < heads.length; j++) {
                    appendCell(headRow, "th", heads[j]);
                }
                thead.appendChild(headRow);
                table.appendChild(thead);

                for (j = 0; j < stats.rows.length; j++) {
                    r = stats.rows[j];
                    row = document.createElement("tr");
                    appendCell(row, "th", r.id);
                    appendCell(row, "td", String(r.arrival));
                    appendCell(row, "td", String(r.burst));
                    appendCell(row, "td", String(r.finish));
                    appendCell(row, "td", String(r.turnaround));
                    appendCell(row, "td", String(r.waiting));
                    tbody.appendChild(row);
                }

                avgRow = document.createElement("tr");
                avgRow.className = "os-avg";
                avgTh = appendCell(avgRow, "th", "평균");
                avgTh.colSpan = 4;
                appendCell(avgRow, "td", fmt(stats.avgTurnaround));
                appendCell(avgRow, "td", fmt(stats.avgWaiting));
                tbody.appendChild(avgRow);

                table.appendChild(tbody);
                refs.stats.innerHTML = "";
                refs.stats.appendChild(table);
            }

            function onRun() {
                var procs = readProcs();
                var algo = refs.algo.value;
                var res, label, stats;
                if (algo === "sjf") {
                    res = scheduleSJF(procs);
                    label = "SJF(비선점)";
                } else if (algo === "rr") {
                    res = scheduleRR(procs, QUANTUM);
                    label = "RR(할당량 " + QUANTUM + ")";
                } else {
                    res = scheduleFCFS(procs);
                    label = "FCFS";
                }
                stats = computeStats(procs, res.finish);
                renderGantt(res.slices);
                renderStats(stats);
                refs.result.hidden = false;
                refs.summary.textContent = label + " 결과: 평균 대기시간 "
                    + fmt(stats.avgWaiting) + ", 평균 반환시간 "
                    + fmt(stats.avgTurnaround);
            }

            function onRandom() {
                var k, a, b;
                for (k = 0; k < COUNT; k++) {
                    a = k === 0 ? 0 : Math.floor(Math.random() * 5);
                    b = 1 + Math.floor(Math.random() * 8);
                    getInput("arrival", k).value = a;
                    getInput("burst", k).value = b;
                }
                refs.result.hidden = true;
                refs.summary.textContent = "프로세스를 무작위로 바꿨습니다. 실행을 누르면 결과가 나옵니다.";
            }

            refs.run.addEventListener("click", onRun);
            refs.random.addEventListener("click", onRandom);
            refs.procTable.addEventListener("input", function () {
                /* 입력이 바뀌면 이전 결과는 무효이므로 숨긴다 */
                refs.result.hidden = true;
                refs.summary.textContent = "";
            });
        }
    });
})();

/* sim:bigo-curve - 빅오 증가율 비교 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 무관, node 테스트는 calc로 접근) ---- */

    var FUNCS = [
        { key: "c", label: "O(1)" },
        { key: "log", label: "O(log n)" },
        { key: "lin", label: "O(n)" },
        { key: "nlogn", label: "O(n log n)" },
        { key: "quad", label: "O(n^2)" },
        { key: "exp", label: "O(2^n)" }
    ];

    function log2(x) {
        return Math.log(x) / Math.LN2;
    }

    function rawValue(key, n) {
        if (key === "c") return 1;
        if (key === "log") return log2(n);
        if (key === "lin") return n;
        if (key === "nlogn") return n * log2(n);
        if (key === "quad") return n * n;
        return Math.pow(2, n);
    }

    /* 연산 횟수 표기: 100만 이하는 반올림 정수(천 단위 콤마),
       100만 초과는 "1.07e+09" 형태의 지수 표기 */
    function formatCount(v) {
        var parts;
        if (v > 1000000) {
            parts = v.toExponential(2).split("e+");
            if (parts[1].length < 2) {
                parts[1] = "0" + parts[1];
            }
            return parts[0] + "e+" + parts[1];
        }
        return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    /* n에 대한 각 복잡도의 연산 횟수와 막대 폭(%)을 계산한다.
       막대 스케일 기준은 n^2. n^2를 넘으면(사실상 2^n뿐) 100%로 캡하고
       capped=true로 "폭발!" 칩을 띄운다. */
    function computeRows(n) {
        var base = n * n;
        var rows = [];
        var i;
        var v;
        for (i = 0; i < FUNCS.length; i++) {
            v = rawValue(FUNCS[i].key, n);
            rows.push({
                key: FUNCS[i].key,
                label: FUNCS[i].label,
                value: v,
                text: formatCount(v),
                pct: Math.min(100, (v / base) * 100),
                capped: v > base
            });
        }
        return rows;
    }

    window.SIM.register("bigo-curve", {
        title: "빅오 증가율 비교",
        calc: { rows: computeRows, format: formatCount },
        build: function (root) {
            var rowsHtml = "";
            var i;

            for (i = 0; i < FUNCS.length; i++) {
                rowsHtml +=
                    "<tr>" +
                    '<td class="bc-fn">' + FUNCS[i].label + "</td>" +
                    '<td class="bc-count" data-role="count">-</td>' +
                    '<td class="bc-barcell">' +
                    '<div class="bc-barbox">' +
                    '<div class="bc-track">' +
                    '<div class="bc-bar" data-role="bar"></div>' +
                    "</div>" +
                    '<span class="bc-boom" data-role="boom" hidden>폭발!</span>' +
                    "</div>" +
                    "</td>" +
                    "</tr>";
            }

            root.innerHTML =
                '<div class="sim__row">' +
                '<label class="bc-sliderwrap">' +
                '<span class="bc-slidertext">입력 크기 n</span>' +
                '<input class="bc-slider" data-role="slider" type="range"' +
                ' min="1" max="30" step="1" value="10"' +
                ' aria-label="입력 크기 n (1에서 30)">' +
                "</label>" +
                '<span class="sim__chip bc-nval" data-role="nval">n = 10</span>' +
                "</div>" +
                '<div data-role="live" aria-live="polite">' +
                "<table>" +
                "<thead><tr>" +
                '<th scope="col">복잡도</th>' +
                '<th scope="col" class="bc-count-head">연산 횟수</th>' +
                '<th scope="col" class="bc-barhead">증가율 막대</th>' +
                "</tr></thead>" +
                '<tbody data-role="tbody">' + rowsHtml + "</tbody>" +
                "</table>" +
                "</div>" +
                '<p class="sim__note">막대는 n^2 기준 상대 길이, ' +
                "2^n은 그래프를 뚫고 나가 캡 표시</p>" +
                '<p class="bc-hint">n=30일 때 2^n은 약 10억 - ' +
                "입력이 조금 커져도 지수 알고리즘은 못 쓴다</p>";

            var slider = root.querySelector('[data-role="slider"]');
            var nval = root.querySelector('[data-role="nval"]');
            var counts = root.querySelectorAll('[data-role="count"]');
            var bars = root.querySelectorAll('[data-role="bar"]');
            var booms = root.querySelectorAll('[data-role="boom"]');

            function render(n) {
                var rows = computeRows(n);
                var i;
                var w;
                nval.textContent = "n = " + n;
                for (i = 0; i < rows.length; i++) {
                    counts[i].textContent = rows[i].text;
                    /* 0이 아닌 값은 최소 2% 폭으로 보이게 한다 (시각 보정) */
                    w = rows[i].value <= 0 ? 0 : Math.max(rows[i].pct, 2);
                    bars[i].style.width = w + "%";
                    if (rows[i].capped) {
                        bars[i].className = "bc-bar bc-bar--capped";
                        booms[i].hidden = false;
                    } else {
                        bars[i].className = "bc-bar";
                        booms[i].hidden = true;
                    }
                }
            }

            slider.addEventListener("input", function () {
                render(parseInt(slider.value, 10) || 1);
            });

            render(10);
        }
    });
})();

/* sim:sort-visual - 정렬 알고리즘 시각화 */
(function () {
    "use strict";
    if (!window.SIM) return;

    var SIZE = 12;
    var MIN_VALUE = 5;
    var MAX_VALUE = 60;
    var TICK_MS = 350;

    /* ------------------------------------------------------------------
       순수 로직 (DOM 비의존, node 테스트 대상)
       정렬 전체 단계를 미리 배열로 기록해 두고 인덱스로 재생한다.
       step = {
           type: "compare" | "swap" | "lock" | "done",
           i, j: 대상 인덱스 (없으면 -1),
           a: 이 단계 직후의 배열 스냅샷,
           locked: 정렬 확정(또는 정렬 구간) 여부 스냅샷,
           comparisons, swaps: 누적 횟수
       }
       ------------------------------------------------------------------ */
    function makeSteps(input, algo) {
        var a = input.slice();
        var n = a.length;
        var locked = [];
        var steps = [];
        var comparisons = 0;
        var swaps = 0;
        var i, j, k, m;

        for (k = 0; k < n; k++) {
            locked.push(false);
        }

        function snap(type, x, y) {
            steps.push({
                type: type,
                i: x,
                j: y,
                a: a.slice(),
                locked: locked.slice(),
                comparisons: comparisons,
                swaps: swaps
            });
        }

        function compare(x, y) {
            comparisons++;
            snap("compare", x, y);
        }

        function swap(x, y) {
            var t = a[x];
            a[x] = a[y];
            a[y] = t;
            swaps++;
            snap("swap", x, y);
        }

        if (algo === "selection") {
            for (i = 0; i < n - 1; i++) {
                m = i;
                for (j = i + 1; j < n; j++) {
                    compare(m, j);
                    if (a[j] < a[m]) m = j;
                }
                if (m !== i) swap(i, m);
                locked[i] = true;
                snap("lock", i, -1);
            }
        } else if (algo === "insertion") {
            for (i = 1; i < n; i++) {
                j = i;
                while (j > 0) {
                    compare(j - 1, j);
                    if (a[j - 1] > a[j]) {
                        swap(j - 1, j);
                        j--;
                    } else {
                        break;
                    }
                }
                for (k = 0; k <= i; k++) {
                    locked[k] = true;
                }
                snap("lock", i, -1);
            }
        } else {
            /* bubble (기본값) */
            for (i = 0; i < n - 1; i++) {
                for (j = 0; j < n - 1 - i; j++) {
                    compare(j, j + 1);
                    if (a[j] > a[j + 1]) swap(j, j + 1);
                }
                locked[n - 1 - i] = true;
                snap("lock", n - 1 - i, -1);
            }
        }

        for (k = 0; k < n; k++) {
            locked[k] = true;
        }
        snap("done", -1, -1);
        return steps;
    }

    function randomArray(size, min, max) {
        var out = [];
        var k;
        for (k = 0; k < size; k++) {
            out.push(min + Math.floor(Math.random() * (max - min + 1)));
        }
        return out;
    }

    /* ------------------------------------------------------------------
       위젯 UI
       ------------------------------------------------------------------ */
    window.SIM.register("sort-visual", {
        title: "정렬 알고리즘 시각화",
        build: function (root) {
            root.innerHTML =
                '<div class="sim__row">' +
                    '<select class="sim__select" data-role="algo" aria-label="정렬 알고리즘 선택">' +
                        '<option value="bubble">버블 정렬</option>' +
                        '<option value="selection">선택 정렬</option>' +
                        '<option value="insertion">삽입 정렬</option>' +
                    '</select>' +
                    '<button type="button" class="sim__btn" data-role="shuffle" aria-label="배열을 무작위로 섞기">섞기</button>' +
                '</div>' +
                '<div class="sv-stage" aria-hidden="true"></div>' +
                '<div class="sv-labels" aria-hidden="true"></div>' +
                '<div class="sim__row">' +
                    '<button type="button" class="sim__btn sim__btn--primary" data-role="step" aria-label="정렬을 한 단계 진행">한 단계</button>' +
                    '<button type="button" class="sim__btn" data-role="play">자동 재생</button>' +
                    '<button type="button" class="sim__btn" data-role="reset" aria-label="같은 배열로 처음부터 다시 시작">처음부터</button>' +
                    '<span class="sim__chip sv-count" data-role="cmp">비교 0회</span>' +
                    '<span class="sim__chip sv-count" data-role="swp">교환 0회</span>' +
                '</div>' +
                '<div class="sim__out sv-status" data-role="status" aria-live="polite"></div>' +
                '<p class="sim__note">' +
                    '<span class="sv-dot sv-dot--cmp"></span>비교 중 ' +
                    '<span class="sv-dot sv-dot--swap"></span>교환 발생 ' +
                    '<span class="sv-dot sv-dot--done"></span>정렬 확정 구간' +
                '</p>';

            var algoSel = root.querySelector('[data-role="algo"]');
            var shuffleBtn = root.querySelector('[data-role="shuffle"]');
            var stepBtn = root.querySelector('[data-role="step"]');
            var playBtn = root.querySelector('[data-role="play"]');
            var resetBtn = root.querySelector('[data-role="reset"]');
            var cmpChip = root.querySelector('[data-role="cmp"]');
            var swpChip = root.querySelector('[data-role="swp"]');
            var statusEl = root.querySelector('[data-role="status"]');
            var stage = root.querySelector(".sv-stage");
            var labels = root.querySelector(".sv-labels");

            var bars = [];
            var vals = [];
            var k;
            for (k = 0; k < SIZE; k++) {
                var bar = document.createElement("div");
                bar.className = "sv-bar";
                stage.appendChild(bar);
                bars.push(bar);
                var val = document.createElement("span");
                val.className = "sv-val";
                labels.appendChild(val);
                vals.push(val);
            }

            var state = {
                base: [],
                steps: [],
                idx: -1,
                timer: null
            };

            function stopPlay() {
                if (state.timer !== null) {
                    clearInterval(state.timer);
                    state.timer = null;
                }
                playBtn.textContent = "자동 재생";
            }

            function statusText(f) {
                if (!f) {
                    return "준비 완료. '한 단계' 또는 '자동 재생'을 눌러 보세요.";
                }
                if (f.type === "compare") {
                    return "비교: " + f.i + "번(" + f.a[f.i] + ")과 " +
                        f.j + "번(" + f.a[f.j] + ") 크기 비교";
                }
                if (f.type === "swap") {
                    return "교환: " + f.i + "번 <-> " + f.j + "번 자리 바꿈";
                }
                if (f.type === "lock") {
                    if (algoSel.value === "insertion") {
                        return "0번 ~ " + f.i + "번 구간이 정렬 상태가 되었습니다.";
                    }
                    return f.i + "번 위치 값이 확정되었습니다.";
                }
                return "정렬 완료! 비교 " + f.comparisons + "회, 교환 " +
                    f.swaps + "회가 걸렸습니다.";
            }

            function render() {
                var f = state.idx >= 0 ? state.steps[state.idx] : null;
                var arr = f ? f.a : state.base;
                var lockedArr = f ? f.locked : null;
                var i, cls, pct;
                for (i = 0; i < SIZE; i++) {
                    pct = Math.round(arr[i] / MAX_VALUE * 100);
                    bars[i].style.height = pct + "%";
                    cls = "";
                    if (lockedArr && lockedArr[i]) cls = "is-done";
                    if (f && f.type === "compare" && (i === f.i || i === f.j)) {
                        cls = "is-cmp";
                    }
                    if (f && f.type === "swap" && (i === f.i || i === f.j)) {
                        cls = "is-swap";
                    }
                    bars[i].className = "sv-bar" + (cls ? " " + cls : "");
                    vals[i].className = "sv-val" + (cls ? " " + cls : "");
                    vals[i].textContent = String(arr[i]);
                }
                cmpChip.textContent = "비교 " + (f ? f.comparisons : 0) + "회";
                swpChip.textContent = "교환 " + (f ? f.swaps : 0) + "회";
                statusEl.textContent = statusText(f);

                var atEnd = state.idx >= state.steps.length - 1;
                stepBtn.disabled = atEnd || state.timer !== null;
                playBtn.disabled = atEnd;
            }

            function rebuild() {
                stopPlay();
                state.steps = makeSteps(state.base, algoSel.value);
                state.idx = -1;
                render();
            }

            function stepOnce() {
                if (state.idx >= state.steps.length - 1) {
                    stopPlay();
                    render();
                    return;
                }
                state.idx++;
                if (state.idx >= state.steps.length - 1) {
                    stopPlay();
                }
                render();
            }

            algoSel.addEventListener("change", function () {
                rebuild();
            });

            shuffleBtn.addEventListener("click", function () {
                state.base = randomArray(SIZE, MIN_VALUE, MAX_VALUE);
                rebuild();
            });

            stepBtn.addEventListener("click", function () {
                if (state.timer !== null) return;
                stepOnce();
            });

            playBtn.addEventListener("click", function () {
                if (state.timer !== null) {
                    stopPlay();
                    render();
                    return;
                }
                if (state.idx >= state.steps.length - 1) return;
                state.timer = setInterval(stepOnce, TICK_MS);
                playBtn.textContent = "정지";
                render();
            });

            resetBtn.addEventListener("click", function () {
                stopPlay();
                state.idx = -1;
                render();
            });

            state.base = randomArray(SIZE, MIN_VALUE, MAX_VALUE);
            rebuild();
        }
    });

    /* node 테스트에서 순수 로직에 접근하기 위한 노출 (브라우저에서는 무시됨) */
    if (window.SIM_TEST) {
        window.SIM_TEST["sort-visual"] = {
            makeSteps: makeSteps,
            randomArray: randomArray
        };
    }
})();

/* sim:search-race - 순차 탐색 vs 이진 탐색 */
(function () {
    "use strict";
    if (!window.SIM) return;

    var DATA = [2, 5, 8, 12, 16, 23, 38, 42, 45, 56, 72, 77, 81, 90, 99];
    var DEFAULT_TARGET = 81;

    /* ---- 순수 함수: 탐색 단계 기록 ---- */

    /* 순차 탐색: 각 단계 = { index, found } */
    function linearSteps(arr, target) {
        var steps = [];
        var i;
        for (i = 0; i < arr.length; i++) {
            steps.push({ index: i, found: arr[i] === target });
            if (arr[i] === target) break;
        }
        return steps;
    }

    /* 이진 탐색: 각 단계 = { lo, hi, mid, found } (비교 시점의 범위) */
    function binarySteps(arr, target) {
        var steps = [];
        var lo = 0;
        var hi = arr.length - 1;
        var mid;
        while (lo <= hi) {
            mid = Math.floor((lo + hi) / 2);
            steps.push({ lo: lo, hi: hi, mid: mid, found: arr[mid] === target });
            if (arr[mid] === target) break;
            if (arr[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return steps;
    }

    /* 승자 판정: "linear" | "binary" | "tie" */
    function judge(linCount, binCount) {
        if (linCount < binCount) return "linear";
        if (binCount < linCount) return "binary";
        return "tie";
    }

    /* ---- 위젯 ---- */

    window.SIM.register("search-race", {
        title: "순차 탐색 vs 이진 탐색",
        _test: {
            data: DATA,
            linearSteps: linearSteps,
            binarySteps: binarySteps,
            judge: judge
        },
        build: function (root) {
            root.innerHTML =
                '<div class="sim__row">' +
                '<label class="pick">목표값 ' +
                '<select class="sim__select" data-ref="target" aria-label="목표값 선택"></select>' +
                '</label>' +
                '<button type="button" class="sim__btn sim__btn--primary" data-ref="step" aria-label="두 탐색을 한 단계씩 진행">한 단계</button>' +
                '<button type="button" class="sim__btn" data-ref="reset" aria-label="탐색 처음부터 다시">다시</button>' +
                '</div>' +
                '<div class="lane">' +
                '<div class="lane__head">' +
                '<span class="sim__chip">순차 탐색</span>' +
                '<span class="count" data-ref="lin-count">비교 0회</span>' +
                '<span class="badge" data-ref="lin-badge" hidden></span>' +
                '</div>' +
                '<div class="cells" data-ref="lin-cells"></div>' +
                '</div>' +
                '<div class="lane">' +
                '<div class="lane__head">' +
                '<span class="sim__chip">이진 탐색</span>' +
                '<span class="count" data-ref="bin-count">비교 0회</span>' +
                '<span class="badge" data-ref="bin-badge" hidden></span>' +
                '</div>' +
                '<div class="cells" data-ref="bin-cells"></div>' +
                '</div>' +
                '<p class="status" data-ref="status" aria-live="polite"></p>' +
                '<p class="sim__note">같은 정렬 배열을 두 방법이 동시에 탐색합니다. ' +
                '이진 탐색은 매번 범위를 절반으로 줄여 거의 항상 먼저 찾지만, ' +
                '목표값이 앞쪽(2, 5 같은 값)이면 순차 탐색이 이길 수도 있습니다.</p>';

            var sel = root.querySelector('[data-ref="target"]');
            var btnStep = root.querySelector('[data-ref="step"]');
            var btnReset = root.querySelector('[data-ref="reset"]');
            var linCount = root.querySelector('[data-ref="lin-count"]');
            var binCount = root.querySelector('[data-ref="bin-count"]');
            var linBadge = root.querySelector('[data-ref="lin-badge"]');
            var binBadge = root.querySelector('[data-ref="bin-badge"]');
            var linCells = root.querySelector('[data-ref="lin-cells"]');
            var binCells = root.querySelector('[data-ref="bin-cells"]');
            var status = root.querySelector('[data-ref="status"]');

            /* 목표값 select 채우기 */
            (function () {
                var i;
                var opt;
                for (i = 0; i < DATA.length; i++) {
                    opt = document.createElement("option");
                    opt.value = String(DATA[i]);
                    opt.textContent = String(DATA[i]);
                    if (DATA[i] === DEFAULT_TARGET) {
                        opt.selected = true;
                    }
                    sel.appendChild(opt);
                }
            })();

            /* 두 줄의 칸 만들기 */
            function makeCells(holder) {
                var list = [];
                var i;
                var c;
                for (i = 0; i < DATA.length; i++) {
                    c = document.createElement("span");
                    c.className = "cell";
                    c.textContent = String(DATA[i]);
                    holder.appendChild(c);
                    list.push(c);
                }
                return list;
            }
            var linCellEls = makeCells(linCells);
            var binCellEls = makeCells(binCells);

            var st = { linSteps: [], binSteps: [], linPos: 0, binPos: 0 };

            function setup() {
                var target = parseInt(sel.value, 10);
                st.linSteps = linearSteps(DATA, target);
                st.binSteps = binarySteps(DATA, target);
                st.linPos = 0;
                st.binPos = 0;
                render();
            }

            function laneDone(pos, steps) {
                return pos >= steps.length;
            }

            function render() {
                var i;
                var cls;
                var s;

                /* 순차 줄: 지나간 칸 done, 현재 비교 칸 cur, 발견 칸 hit */
                for (i = 0; i < linCellEls.length; i++) {
                    cls = "cell";
                    if (st.linPos > 0 && i === st.linPos - 1) {
                        cls += st.linSteps[st.linPos - 1].found ? " hit" : " cur";
                    } else if (i < st.linPos) {
                        cls += " done";
                    }
                    linCellEls[i].className = cls;
                }

                /* 이진 줄: 범위 밖 dim, 현재 mid는 cur 또는 hit */
                s = st.binPos > 0 ? st.binSteps[st.binPos - 1] : null;
                for (i = 0; i < binCellEls.length; i++) {
                    cls = "cell";
                    if (s) {
                        if (i === s.mid) {
                            cls += s.found ? " hit" : " cur";
                        } else if (i < s.lo || i > s.hi) {
                            cls += " dim";
                        }
                    }
                    binCellEls[i].className = cls;
                }

                /* 카운터 */
                linCount.textContent = "비교 " + st.linPos + "회";
                binCount.textContent = "비교 " + st.binPos + "회";

                /* 발견 배지 */
                var linDone = laneDone(st.linPos, st.linSteps);
                var binDone = laneDone(st.binPos, st.binSteps);
                if (linDone) {
                    linBadge.textContent = "발견! " + st.linSteps.length + "번 비교";
                    linBadge.hidden = false;
                } else {
                    linBadge.hidden = true;
                }
                if (binDone) {
                    binBadge.textContent = "발견! " + st.binSteps.length + "번 비교";
                    binBadge.hidden = false;
                } else {
                    binBadge.hidden = true;
                }

                /* 상태 안내 (aria-live) */
                if (linDone && binDone) {
                    var who = judge(st.linSteps.length, st.binSteps.length);
                    if (who === "binary") {
                        status.textContent = "이진 탐색 승리! 이진 " +
                            st.binSteps.length + "회 vs 순차 " +
                            st.linSteps.length + "회";
                    } else if (who === "linear") {
                        status.textContent = "순차 탐색 승리! 순차 " +
                            st.linSteps.length + "회 vs 이진 " +
                            st.binSteps.length + "회";
                    } else {
                        status.textContent = "무승부! 둘 다 " +
                            st.linSteps.length + "회 비교";
                    }
                } else if (st.linPos > 0 || st.binPos > 0) {
                    status.textContent = "진행 중 - 순차 " + st.linPos +
                        "회, 이진 " + st.binPos + "회 비교";
                } else {
                    status.textContent = "한 단계 버튼을 눌러 두 탐색을 동시에 진행해 보세요.";
                }

                btnStep.disabled = linDone && binDone;
            }

            btnStep.addEventListener("click", function () {
                var moved = false;
                if (st.linPos < st.linSteps.length) {
                    st.linPos += 1;
                    moved = true;
                }
                if (st.binPos < st.binSteps.length) {
                    st.binPos += 1;
                    moved = true;
                }
                if (moved) {
                    render();
                }
            });

            btnReset.addEventListener("click", setup);
            sel.addEventListener("change", setup);

            setup();
        }
    });
})();

/* sim:stack-queue - 스택 vs 큐 체험 */
(function () {
    "use strict";

    var MAX_SIZE = 6;

    /* ---- 순수 로직 (DOM 비의존, node로 테스트 가능) ---- */
    var LOGIC = {
        /* 자동 라벨: 0 -> A, 1 -> B, ... 25 -> Z, 26 -> A (순환) */
        autoLabel: function (idx) {
            return String.fromCharCode(65 + (idx % 26));
        },
        /* 입력값 정리: 앞뒤 공백 제거 + 최대 4글자 */
        normalizeValue: function (raw) {
            var s = (raw === null || raw === undefined) ? "" : String(raw);
            s = s.replace(/^\s+|\s+$/g, "");
            return s.slice(0, 4);
        },
        /* 맨 뒤에 추가 (push / enqueue 공용). 원본 배열은 바꾸지 않는다. */
        insert: function (items, autoIdx, raw, maxSize) {
            if (items.length >= maxSize) {
                return { ok: false, reason: "full", items: items.slice(), autoIdx: autoIdx };
            }
            var label = LOGIC.normalizeValue(raw);
            var nextIdx = autoIdx;
            if (label === "") {
                label = LOGIC.autoLabel(autoIdx);
                nextIdx = autoIdx + 1;
            }
            var next = items.slice();
            next.push(label);
            return { ok: true, label: label, items: next, autoIdx: nextIdx };
        },
        /* 맨 뒤에서 제거 (pop) */
        removeLast: function (items) {
            if (items.length === 0) {
                return { ok: false, reason: "empty", items: items.slice() };
            }
            var next = items.slice();
            var label = next.pop();
            return { ok: true, label: label, items: next };
        },
        /* 맨 앞에서 제거 (dequeue) */
        removeFirst: function (items) {
            if (items.length === 0) {
                return { ok: false, reason: "empty", items: items.slice() };
            }
            var next = items.slice();
            var label = next.shift();
            return { ok: true, label: label, items: next };
        }
    };

    /* node 테스트용 내보내기 (브라우저에는 module이 없어 건너뜀) */
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { LOGIC: LOGIC, MAX_SIZE: MAX_SIZE };
        return;
    }

    if (!window.SIM) return;
    window.SIM.register("stack-queue", {
        title: "스택 vs 큐 체험",
        build: function (root) {
            root.innerHTML = "" +
                '<div class="sim__tabs">' +
                '<button type="button" class="sim__tab active" data-tab="stack" aria-pressed="true">스택 (LIFO)</button>' +
                '<button type="button" class="sim__tab" data-tab="queue" aria-pressed="false">큐 (FIFO)</button>' +
                '</div>' +
                '<p class="sim__note sq-desc" data-ref="desc"></p>' +
                '<div class="sim__row">' +
                '<input type="text" class="sim__input sq-input" data-ref="input" maxlength="4"' +
                ' placeholder="값 (비우면 자동)" aria-label="추가할 값 (최대 4글자, 비우면 A, B, C 자동 라벨)">' +
                '<button type="button" class="sim__btn sim__btn--primary" data-ref="addBtn" aria-label="값 추가 연산 실행">push</button>' +
                '<button type="button" class="sim__btn" data-ref="removeBtn" aria-label="값 제거 연산 실행">pop</button>' +
                '<button type="button" class="sim__btn" data-ref="clearBtn" aria-label="모두 비우기">비우기</button>' +
                '</div>' +
                '<div class="sq-view" data-ref="stackView" aria-label="스택 상태">' +
                '<div class="sq-stage sq-stage--stack" data-ref="stackBox">' +
                '<p class="sq-empty" data-ref="stackEmpty">(비어 있음)</p>' +
                '</div>' +
                '</div>' +
                '<div class="sq-view" data-ref="queueView" aria-label="큐 상태" hidden>' +
                '<p class="sq-flow" aria-hidden="true"><span>&#8592; front (나감)</span><span>(들어옴) rear &#8594;</span></p>' +
                '<div class="sq-stage sq-stage--queue" data-ref="queueBox">' +
                '<p class="sq-empty" data-ref="queueEmpty">(비어 있음)</p>' +
                '</div>' +
                '</div>' +
                '<p class="sim__out sq-log" data-ref="log" role="status" aria-live="polite"></p>' +
                '<p class="sim__note">스택 = 접시 쌓기 (나중에 올린 접시를 먼저 꺼냄, LIFO) &#183; ' +
                '큐 = 줄 서기 (먼저 선 사람이 먼저 나감, FIFO)</p>';

            var tabs = root.querySelectorAll(".sim__tab");
            var descEl = root.querySelector('[data-ref="desc"]');
            var input = root.querySelector('[data-ref="input"]');
            var addBtn = root.querySelector('[data-ref="addBtn"]');
            var removeBtn = root.querySelector('[data-ref="removeBtn"]');
            var clearBtn = root.querySelector('[data-ref="clearBtn"]');
            var stackView = root.querySelector('[data-ref="stackView"]');
            var queueView = root.querySelector('[data-ref="queueView"]');
            var stackBox = root.querySelector('[data-ref="stackBox"]');
            var queueBox = root.querySelector('[data-ref="queueBox"]');
            var stackEmpty = root.querySelector('[data-ref="stackEmpty"]');
            var queueEmpty = root.querySelector('[data-ref="queueEmpty"]');
            var logEl = root.querySelector('[data-ref="log"]');

            var TEXT = {
                stack: {
                    desc: "스택(LIFO): 나중에 들어간 것이 먼저 나옵니다. push는 맨 위에 쌓고, pop은 맨 위에서 꺼냅니다.",
                    addOp: "push",
                    removeOp: "pop",
                    addMsg: " - 맨 위에 쌓임",
                    removeMsg: " - 나중에 쌓인 것이 먼저 나감 (LIFO)",
                    fullMsg: "스택이 가득 찼습니다 (최대 " + MAX_SIZE + "개)",
                    emptyMsg: "스택이 비어 있습니다",
                    clearMsg: "스택을 모두 비웠습니다."
                },
                queue: {
                    desc: "큐(FIFO): 먼저 들어간 것이 먼저 나옵니다. enqueue는 맨 뒤(rear)에 서고, dequeue는 맨 앞(front)에서 나갑니다.",
                    addOp: "enqueue",
                    removeOp: "dequeue",
                    addMsg: " - 맨 뒤(rear)에 줄을 섬",
                    removeMsg: " - 먼저 온 것이 먼저 나감 (FIFO)",
                    fullMsg: "큐가 가득 찼습니다 (최대 " + MAX_SIZE + "개)",
                    emptyMsg: "큐가 비어 있습니다",
                    clearMsg: "큐를 모두 비웠습니다."
                }
            };

            var state = {
                stack: { items: [], nodes: [], autoIdx: 0 },
                queue: { items: [], nodes: [], autoIdx: 0 }
            };
            var mode = "stack";

            function setLog(msg) {
                logEl.textContent = msg;
            }

            function updateMarkers() {
                var sn = state.stack.nodes;
                var qn = state.queue.nodes;
                var i;
                for (i = 0; i < sn.length; i++) {
                    if (i === sn.length - 1) {
                        sn[i].classList.add("is-top");
                    } else {
                        sn[i].classList.remove("is-top");
                    }
                }
                for (i = 0; i < qn.length; i++) {
                    if (i === 0) {
                        qn[i].classList.add("is-front");
                    } else {
                        qn[i].classList.remove("is-front");
                    }
                    if (i === qn.length - 1) {
                        qn[i].classList.add("is-rear");
                    } else {
                        qn[i].classList.remove("is-rear");
                    }
                }
                stackEmpty.hidden = sn.length > 0;
                queueEmpty.hidden = qn.length > 0;
            }

            function makeNode(label) {
                var el = document.createElement("div");
                el.className = "sq-item sq-item--in";
                el.textContent = label; /* 사용자 입력은 textContent로만 */
                return el;
            }

            function doAdd() {
                var t = TEXT[mode];
                var s = state[mode];
                var res = LOGIC.insert(s.items, s.autoIdx, input.value, MAX_SIZE);
                if (!res.ok) {
                    setLog(t.addOp + " 실패 - " + t.fullMsg + ". 먼저 " + t.removeOp + " 버튼으로 꺼내 주세요.");
                    return;
                }
                s.items = res.items;
                s.autoIdx = res.autoIdx;
                var el = makeNode(res.label);
                s.nodes.push(el);
                (mode === "stack" ? stackBox : queueBox).appendChild(el);
                window.setTimeout(function () {
                    el.classList.remove("sq-item--in");
                }, 30);
                updateMarkers();
                input.value = "";
                setLog(t.addOp + "(" + res.label + ")" + t.addMsg);
            }

            function doRemove() {
                var t = TEXT[mode];
                var s = state[mode];
                var res = mode === "stack" ? LOGIC.removeLast(s.items) : LOGIC.removeFirst(s.items);
                if (!res.ok) {
                    setLog(t.removeOp + "() 실패 - " + t.emptyMsg);
                    return;
                }
                s.items = res.items;
                var el = mode === "stack" ? s.nodes.pop() : s.nodes.shift();
                el.classList.remove("is-top");
                el.classList.remove("is-front");
                el.classList.remove("is-rear");
                el.classList.add("sq-item--out");
                window.setTimeout(function () {
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                }, 200);
                updateMarkers();
                setLog(t.removeOp + "() -> " + res.label + t.removeMsg);
            }

            function doClear() {
                var s = state[mode];
                var i;
                var el;
                for (i = 0; i < s.nodes.length; i++) {
                    el = s.nodes[i];
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                }
                s.nodes = [];
                s.items = [];
                s.autoIdx = 0;
                updateMarkers();
                setLog(TEXT[mode].clearMsg);
            }

            function setMode(next) {
                if (mode === next) {
                    return;
                }
                mode = next;
                var t = TEXT[mode];
                var i;
                var on;
                for (i = 0; i < tabs.length; i++) {
                    on = tabs[i].getAttribute("data-tab") === mode;
                    if (on) {
                        tabs[i].classList.add("active");
                    } else {
                        tabs[i].classList.remove("active");
                    }
                    tabs[i].setAttribute("aria-pressed", on ? "true" : "false");
                }
                addBtn.textContent = t.addOp;
                removeBtn.textContent = t.removeOp;
                descEl.textContent = t.desc;
                stackView.hidden = mode !== "stack";
                queueView.hidden = mode !== "queue";
                setLog(t.addOp + " / " + t.removeOp + " 버튼으로 연산을 실행해 보세요.");
            }

            Array.prototype.forEach.call(tabs, function (tab) {
                tab.addEventListener("click", function () {
                    setMode(tab.getAttribute("data-tab"));
                });
            });
            addBtn.addEventListener("click", doAdd);
            removeBtn.addEventListener("click", doRemove);
            clearBtn.addEventListener("click", doClear);
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    doAdd();
                }
            });

            descEl.textContent = TEXT.stack.desc;
            setLog("push / pop 버튼으로 연산을 실행해 보세요.");
            updateMarkers();
        }
    });
})();

/* sim:bst-builder - 이진 탐색 트리 만들기 */
(function () {
    "use strict";

    var MAX_DEPTH = 5;
    var MAX_NODES = 15;
    var VIEW_W = 320;
    var VIEW_H = 200;
    var NODE_R = 12;
    var SVGNS = "http://www.w3.org/2000/svg";

    /* ---------- 순수 로직 (DOM 비의존) ---------- */

    function countNodes(node) {
        if (!node) return 0;
        return 1 + countNodes(node.l) + countNodes(node.r);
    }

    function treeDepth(node) {
        var l, r;
        if (!node) return 0;
        l = treeDepth(node.l);
        r = treeDepth(node.r);
        return 1 + (l > r ? l : r);
    }

    /* 값을 비교하며 내려간 경로를 기록하고, 새 트리를 돌려준다.
       status: inserted | duplicate | full(노드 수 초과) | deep(깊이 초과) */
    function insertWithPath(root, value, maxDepth, maxNodes) {
        var path = [];
        var depth = 1;
        var cur = root;
        while (cur) {
            if (value === cur.v) {
                return { status: "duplicate", root: root, path: path };
            }
            path.push({ from: cur.v, dir: value < cur.v ? "left" : "right" });
            cur = value < cur.v ? cur.l : cur.r;
            depth += 1;
        }
        if (countNodes(root) >= maxNodes) {
            return { status: "full", root: root, path: path };
        }
        if (depth > maxDepth) {
            return { status: "deep", root: root, path: path };
        }
        return { status: "inserted", root: insertNode(root, value), path: path };
    }

    function insertNode(node, value) {
        if (!node) return { v: value, l: null, r: null };
        if (value < node.v) return { v: node.v, l: insertNode(node.l, value), r: node.r };
        if (value > node.v) return { v: node.v, l: node.l, r: insertNode(node.r, value) };
        return node;
    }

    function inorder(node) {
        if (!node) return [];
        return inorder(node.l).concat([node.v], inorder(node.r));
    }

    /* 중위 순회 순서 = x좌표, 깊이 = y좌표 */
    function layoutTree(root, width, height) {
        var padX = 18;
        var topY = 26;
        var rowH = (height - topY - 18) / (MAX_DEPTH - 1);
        var list = [];
        var nodes = [];
        var edges = [];
        var byValue = {};
        var i, item, node, parent;

        function walk(n, depth, parentV) {
            if (!n) return;
            walk(n.l, depth + 1, n.v);
            list.push({ v: n.v, depth: depth, parentV: parentV });
            walk(n.r, depth + 1, n.v);
        }
        walk(root, 1, null);

        for (i = 0; i < list.length; i++) {
            item = list[i];
            node = {
                v: item.v,
                depth: item.depth,
                parentV: item.parentV,
                x: Math.round((padX + ((i + 0.5) / list.length) * (width - padX * 2)) * 10) / 10,
                y: Math.round((topY + (item.depth - 1) * rowH) * 10) / 10
            };
            nodes.push(node);
            byValue[item.v] = node;
        }
        for (i = 0; i < nodes.length; i++) {
            if (nodes[i].parentV !== null) {
                parent = byValue[nodes[i].parentV];
                edges.push({
                    from: parent.v,
                    to: nodes[i].v,
                    x1: parent.x,
                    y1: parent.y,
                    x2: nodes[i].x,
                    y2: nodes[i].y
                });
            }
        }
        return { nodes: nodes, edges: edges };
    }

    /* 1~99 숫자 읽기의 받침 유무로 조사를 고른다 (예: 45 -> 사십오 -> 받침 없음) */
    function josa(num, withBatchim, withoutBatchim) {
        var d = num % 10;
        var hasBatchim = (d === 0 || d === 1 || d === 3 || d === 6 || d === 7 || d === 8);
        return String(num) + (hasBatchim ? withBatchim : withoutBatchim);
    }

    function narrate(value, result) {
        var parts = [];
        var i, step;
        if (result.status === "full") {
            return "노드는 최대 " + MAX_NODES + "개까지만 표시할 수 있어 더 넣을 수 없습니다. 초기화 후 다시 해보세요.";
        }
        if (result.status === "deep") {
            return josa(value, "을", "를") + " 넣으면 깊이가 " + MAX_DEPTH + "를 넘어 표시할 수 없습니다. 다른 값을 넣어 보세요.";
        }
        if (result.status === "duplicate") {
            return josa(value, "은", "는") + " 이미 있는 값입니다. 이진 탐색 트리는 중복 값을 넣지 않습니다.";
        }
        if (result.path.length === 0) {
            return josa(value, "이", "가") + " 첫 노드(루트)가 되었습니다.";
        }
        for (i = 0; i < result.path.length; i++) {
            step = result.path[i];
            parts.push(step.from + "보다 " + (step.dir === "left" ? "작으니 왼쪽" : "크니 오른쪽") + "으로");
        }
        return josa(value, "은", "는") + " " + parts.join(", ") + " 가서 빈 자리에 들어갔습니다.";
    }

    /* 순서대로 전부 삽입 가능한지(깊이/개수 제한 통과) 검사 */
    function canInsertAll(values) {
        var root = null;
        var i, res;
        for (i = 0; i < values.length; i++) {
            res = insertWithPath(root, values[i], MAX_DEPTH, MAX_NODES);
            if (res.status !== "inserted") return false;
            root = res.root;
        }
        return true;
    }

    /* ---------- 위젯 등록 ---------- */

    if (!window.SIM) return;
    window.SIM.register("bst-builder", {
        title: "이진 탐색 트리 만들기",
        logic: {
            countNodes: countNodes,
            treeDepth: treeDepth,
            insertWithPath: insertWithPath,
            inorder: inorder,
            layoutTree: layoutTree,
            josa: josa,
            narrate: narrate,
            canInsertAll: canInsertAll
        },
        build: function (root) {
            var state = { root: null };
            var timer = null;
            var input, insertBtn, randomBtn, resetBtn;
            var msgEl, stageEl, inorderEl, countEl, depthEl;

            root.innerHTML = "" +
                '<div class="sim__row">' +
                '<input class="sim__input sim__input--num bst-input" type="number" min="1" max="99" step="1" inputmode="numeric" placeholder="1~99" aria-label="삽입할 값 (1부터 99까지)">' +
                '<button type="button" class="sim__btn sim__btn--primary bst-insert" aria-label="입력한 값 삽입">삽입</button>' +
                '<button type="button" class="sim__btn bst-random" aria-label="중복 없는 랜덤 값 7개를 차례로 삽입">랜덤 7개</button>' +
                '<button type="button" class="sim__btn bst-reset" aria-label="트리 초기화">초기화</button>' +
                '</div>' +
                '<p class="bst-msg" role="status" aria-live="polite"></p>' +
                '<div class="bst-stage" aria-hidden="true"></div>' +
                '<div class="bst-stats">' +
                '<span class="sim__chip bst-count"></span>' +
                '<span class="sim__chip bst-depth"></span>' +
                '</div>' +
                '<div class="sim__out bst-inorder" aria-live="polite"></div>' +
                '<p class="sim__note">왼쪽 자식 &lt; 부모 &lt; 오른쪽 자식 규칙 덕분에, 중위 순회(왼쪽-부모-오른쪽) 결과는 항상 오름차순 정렬이 됩니다.</p>';

            input = root.querySelector(".bst-input");
            insertBtn = root.querySelector(".bst-insert");
            randomBtn = root.querySelector(".bst-random");
            resetBtn = root.querySelector(".bst-reset");
            msgEl = root.querySelector(".bst-msg");
            stageEl = root.querySelector(".bst-stage");
            inorderEl = root.querySelector(".bst-inorder");
            countEl = root.querySelector(".bst-count");
            depthEl = root.querySelector(".bst-depth");

            function showMsg(text, warn) {
                msgEl.textContent = text;
                msgEl.className = "bst-msg" + (warn ? " is-warn" : "");
            }

            function buildHighlight(result, value) {
                var visited = {};
                var chain = {};
                var i;
                if (result.status !== "inserted" && result.status !== "duplicate") return null;
                for (i = 0; i < result.path.length; i++) {
                    visited[result.path[i].from] = true;
                    chain[result.path[i].from] = true;
                }
                chain[value] = true;
                return {
                    visited: visited,
                    chain: chain,
                    newV: result.status === "inserted" ? value : null,
                    dupV: result.status === "duplicate" ? value : null
                };
            }

            function render(hl) {
                var svg = document.createElementNS(SVGNS, "svg");
                var i, lay, edge, node, line, g, circle, label, cls, vals;
                svg.setAttribute("viewBox", "0 0 " + VIEW_W + " " + VIEW_H);
                svg.setAttribute("class", "bst-svg");
                svg.setAttribute("focusable", "false");
                if (!state.root) {
                    label = document.createElementNS(SVGNS, "text");
                    label.setAttribute("x", String(VIEW_W / 2));
                    label.setAttribute("y", String(VIEW_H / 2));
                    label.setAttribute("text-anchor", "middle");
                    label.setAttribute("class", "bst-empty");
                    label.textContent = "아직 비어 있어요. 값을 삽입해 보세요!";
                    svg.appendChild(label);
                } else {
                    lay = layoutTree(state.root, VIEW_W, VIEW_H);
                    for (i = 0; i < lay.edges.length; i++) {
                        edge = lay.edges[i];
                        line = document.createElementNS(SVGNS, "line");
                        line.setAttribute("x1", String(edge.x1));
                        line.setAttribute("y1", String(edge.y1));
                        line.setAttribute("x2", String(edge.x2));
                        line.setAttribute("y2", String(edge.y2));
                        line.setAttribute("class", "bst-edge" +
                            (hl && hl.chain[edge.from] && hl.chain[edge.to] ? " is-path" : ""));
                        svg.appendChild(line);
                    }
                    for (i = 0; i < lay.nodes.length; i++) {
                        node = lay.nodes[i];
                        cls = "bst-node";
                        if (hl) {
                            if (hl.visited[node.v]) cls += " is-visited";
                            if (hl.newV === node.v) cls += " is-new";
                            if (hl.dupV === node.v) cls += " is-dup";
                        }
                        g = document.createElementNS(SVGNS, "g");
                        g.setAttribute("class", cls);
                        circle = document.createElementNS(SVGNS, "circle");
                        circle.setAttribute("cx", String(node.x));
                        circle.setAttribute("cy", String(node.y));
                        circle.setAttribute("r", String(NODE_R));
                        label = document.createElementNS(SVGNS, "text");
                        label.setAttribute("x", String(node.x));
                        label.setAttribute("y", String(node.y));
                        label.setAttribute("dy", "3.5");
                        label.setAttribute("text-anchor", "middle");
                        label.textContent = String(node.v);
                        g.appendChild(circle);
                        g.appendChild(label);
                        svg.appendChild(g);
                    }
                }
                stageEl.innerHTML = "";
                stageEl.appendChild(svg);

                vals = inorder(state.root);
                inorderEl.textContent = "중위 순회: " + (vals.length ? vals.join(", ") : "(비어 있음)");
                countEl.textContent = "노드 " + countNodes(state.root) + " / " + MAX_NODES;
                depthEl.textContent = "깊이 " + treeDepth(state.root) + " / " + MAX_DEPTH;
            }

            function setRunning(on) {
                insertBtn.disabled = on;
                randomBtn.disabled = on;
                input.disabled = on;
            }

            function stopTimer() {
                if (timer !== null) {
                    clearInterval(timer);
                    timer = null;
                }
                setRunning(false);
            }

            function doInsert(value) {
                var res = insertWithPath(state.root, value, MAX_DEPTH, MAX_NODES);
                state.root = res.root;
                render(buildHighlight(res, value));
                showMsg(narrate(value, res), res.status !== "inserted");
            }

            function onInsertClick() {
                var num = Number(input.value);
                if (input.value === "" || !isFinite(num) || num !== Math.floor(num) || num < 1 || num > 99) {
                    showMsg("1부터 99까지의 정수를 입력하세요.", true);
                    return;
                }
                doInsert(num);
                input.value = "";
                input.focus();
            }

            function pickRandomSeven() {
                var tries, i, k, j, pool, values, tmp;
                for (tries = 0; tries < 50; tries++) {
                    pool = [];
                    for (i = 1; i <= 99; i++) pool.push(i);
                    values = [];
                    for (k = 0; k < 7; k++) {
                        j = k + Math.floor(Math.random() * (pool.length - k));
                        tmp = pool[k];
                        pool[k] = pool[j];
                        pool[j] = tmp;
                        values.push(pool[k]);
                    }
                    if (canInsertAll(values)) return values;
                }
                /* 50번 모두 깊이 제한에 걸린 극단적 경우의 대비책 */
                return [50, 25, 75, 12, 40, 60, 90];
            }

            function onRandomClick() {
                var values = pickRandomSeven();
                var idx = 0;
                stopTimer();
                state.root = null;
                setRunning(true);
                doInsert(values[idx]);
                idx += 1;
                timer = setInterval(function () {
                    doInsert(values[idx]);
                    idx += 1;
                    if (idx >= values.length) {
                        stopTimer();
                    }
                }, 700);
            }

            function onResetClick() {
                stopTimer();
                state.root = null;
                input.value = "";
                render(null);
                showMsg("트리를 초기화했습니다. 처음부터 다시 만들어 보세요.", false);
            }

            insertBtn.addEventListener("click", onInsertClick);
            randomBtn.addEventListener("click", onRandomClick);
            resetBtn.addEventListener("click", onResetClick);
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.keyCode === 13) {
                    e.preventDefault();
                    onInsertClick();
                }
            });

            render(null);
            showMsg("1~99 사이의 값을 넣어 이진 탐색 트리를 만들어 보세요. 같은 값을 두 번 넣으면 어떻게 될까요?", false);
        }
    });
})();

/* sim:net-journey - 웹 페이지가 도착하기까지 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존, 테스트 대상) ---- */

    /* 노드 중심의 가로 위치(%). 3개 노드가 같은 폭으로 나란히 설 때의 중심값. */
    var NODE_POS = {
        browser: 16.667,
        dns: 50,
        web: 83.333
    };

    /* 단계 시나리오 데이터 */
    var STEPS = [
        {
            name: "DNS 질의",
            from: "browser",
            to: "dns",
            packet: "질의",
            layers: [
                { label: "응용 계층 (DNS)", kind: "app" },
                { label: "전송 계층 (UDP)", kind: "transport" },
                { label: "인터넷 계층 (IP)", kind: "internet" }
            ],
            text: "브라우저가 DNS 서버에 묻습니다: \"www.knou.ac.kr의 IP 주소는?\" 사람이 쓰는 이름을 컴퓨터가 쓰는 주소로 바꾸는 첫 관문입니다."
        },
        {
            name: "DNS 응답",
            from: "dns",
            to: "browser",
            packet: "203.232.x.x",
            layers: [
                { label: "응용 계층 (DNS)", kind: "app" },
                { label: "전송 계층 (UDP)", kind: "transport" },
                { label: "인터넷 계층 (IP)", kind: "internet" }
            ],
            text: "DNS 서버가 답합니다: \"203.232.x.x 입니다.\" 이제 브라우저는 웹 서버가 어디 있는지 알게 되었습니다."
        },
        {
            name: "TCP 연결",
            from: "browser",
            to: "web",
            handshake: true,
            layers: [
                { label: "전송 계층 (TCP)", kind: "transport" },
                { label: "인터넷 계층 (IP)", kind: "internet" }
            ],
            text: "본격적인 대화 전에 연결부터 맺습니다. 3-way 핸드셰이크 3단계: (1) SYN \"연결할까요?\" -> (2) SYN-ACK \"좋아요, 당신도 준비됐나요?\" -> (3) ACK \"네, 시작합시다!\""
        },
        {
            name: "HTTP 요청",
            from: "browser",
            to: "web",
            packet: "GET /",
            layers: [
                { label: "응용 계층 (HTTP)", kind: "app" },
                { label: "전송 계층 (TCP)", kind: "transport" },
                { label: "인터넷 계층 (IP)", kind: "internet" }
            ],
            text: "브라우저가 웹 서버에 요청을 보냅니다: \"GET / - 첫 페이지를 주세요.\" 무엇을 원하는지 적은 주문서가 날아갑니다."
        },
        {
            name: "HTTP 응답",
            from: "web",
            to: "browser",
            packet: "200 OK",
            layers: [
                { label: "응용 계층 (HTTP)", kind: "app" },
                { label: "전송 계층 (TCP)", kind: "transport" },
                { label: "인터넷 계층 (IP)", kind: "internet" }
            ],
            text: "웹 서버가 응답합니다: \"200 OK + HTML 문서.\" 요청한 페이지의 내용물이 브라우저에 도착했습니다."
        },
        {
            name: "렌더링",
            from: "browser",
            to: "browser",
            self: true,
            layers: [
                { label: "브라우저 내부 처리", kind: "app" }
            ],
            text: "브라우저가 받은 HTML/CSS/JS를 해석해 화면에 그립니다. 네트워크 여행 끝, 페이지 완성!"
        }
    ];

    /* 단계 -> 패킷 이동 목록. 핸드셰이크는 3회 왕복, 렌더링은 이동 없음. */
    function getMoves(step) {
        if (step.self) return [];
        if (step.handshake) {
            return [
                { from: step.from, to: step.to, label: "SYN" },
                { from: step.to, to: step.from, label: "SYN-ACK" },
                { from: step.from, to: step.to, label: "ACK" }
            ];
        }
        return [{ from: step.from, to: step.to, label: step.packet }];
    }

    /* 다음 단계로 갈 수 있는가 (index는 현재 단계, -1은 시작 전) */
    function canAdvance(index, total) {
        return index < total - 1;
    }

    /* 진행 상태 문구 */
    function progressText(index, total) {
        var cur = index < 0 ? 0 : index + 1;
        return "단계 " + cur + " / " + total;
    }

    window.SIM.register("net-journey", {
        title: "웹 페이지가 도착하기까지",
        logic: {
            NODE_POS: NODE_POS,
            STEPS: STEPS,
            getMoves: getMoves,
            canAdvance: canAdvance,
            progressText: progressText
        },
        build: function (root) {
            root.innerHTML =
                '<div class="nj-steps" aria-hidden="true"></div>' +
                '<div class="nj-stage">' +
                '    <div class="nj-wire" aria-hidden="true"></div>' +
                '    <div class="nj-packet" aria-hidden="true">' +
                '        <span class="nj-packet-label"></span>' +
                '        <span class="nj-packet-dot"></span>' +
                '    </div>' +
                '    <div class="nj-nodes">' +
                '        <div class="nj-node" data-node="browser">' +
                '            <span class="nj-badge">PC</span>' +
                '            <span class="nj-name">내 브라우저</span>' +
                '        </div>' +
                '        <div class="nj-node" data-node="dns">' +
                '            <span class="nj-badge">DNS</span>' +
                '            <span class="nj-name">DNS 서버</span>' +
                '        </div>' +
                '        <div class="nj-node" data-node="web">' +
                '            <span class="nj-badge">WEB</span>' +
                '            <span class="nj-name">웹 서버</span>' +
                '        </div>' +
                '    </div>' +
                '</div>' +
                '<div class="nj-narr" aria-live="polite">' +
                '    <p class="nj-narr-title"></p>' +
                '    <p class="nj-narr-text"></p>' +
                '    <div class="nj-layers"></div>' +
                '</div>' +
                '<div class="sim__row">' +
                '    <button type="button" class="sim__btn sim__btn--primary" data-act="next" aria-label="다음 단계로 진행">다음 단계</button>' +
                '    <button type="button" class="sim__btn" data-act="reset" aria-label="처음부터 다시 시작">처음부터</button>' +
                '    <span class="nj-progress sim__note"></span>' +
                '</div>' +
                '<p class="sim__note">www.knou.ac.kr에 접속할 때 보이지 않는 곳에서 벌어지는 일을 단계별로 따라가 봅니다.</p>';

            var stepsBar = root.querySelector(".nj-steps");
            var packet = root.querySelector(".nj-packet");
            var packetLabel = root.querySelector(".nj-packet-label");
            var narrTitle = root.querySelector(".nj-narr-title");
            var narrText = root.querySelector(".nj-narr-text");
            var layersBox = root.querySelector(".nj-layers");
            var progress = root.querySelector(".nj-progress");
            var nextBtn = root.querySelector('[data-act="next"]');
            var resetBtn = root.querySelector('[data-act="reset"]');

            var nodes = {
                browser: root.querySelector('[data-node="browser"]'),
                dns: root.querySelector('[data-node="dns"]'),
                web: root.querySelector('[data-node="web"]')
            };

            /* 상단 단계 칩 생성 */
            var chips = [];
            var i;
            for (i = 0; i < STEPS.length; i++) {
                var chip = document.createElement("span");
                chip.className = "nj-step";
                chip.textContent = (i + 1) + ". " + STEPS[i].name;
                stepsBar.appendChild(chip);
                chips.push(chip);
            }

            var stepIndex = -1;
            var timers = [];

            function clearTimers() {
                var t;
                while (timers.length) {
                    t = timers.pop();
                    clearTimeout(t);
                }
            }

            function placePacket(node) {
                packet.classList.add("nj-packet--still");
                packet.style.left = NODE_POS[node] + "%";
            }

            function slidePacket(node) {
                packet.classList.remove("nj-packet--still");
                packet.style.left = NODE_POS[node] + "%";
            }

            /* 이동 목록을 순서대로 재생 (핸드셰이크 왕복 포함) */
            function runMoves(moves, idx) {
                if (idx >= moves.length) return;
                var mv = moves[idx];
                placePacket(mv.from);
                packetLabel.textContent = mv.label;
                timers.push(setTimeout(function () {
                    slidePacket(mv.to);
                    timers.push(setTimeout(function () {
                        runMoves(moves, idx + 1);
                    }, 760));
                }, 40));
            }

            function setActiveNodes(step) {
                var key;
                for (key in nodes) {
                    if (nodes.hasOwnProperty(key)) {
                        nodes[key].classList.remove("active", "rendering");
                    }
                }
                if (!step) return;
                nodes[step.from].classList.add("active");
                nodes[step.to].classList.add("active");
                if (step.self) nodes.browser.classList.add("rendering");
            }

            function setLayers(layers) {
                layersBox.textContent = "";
                var j, span;
                for (j = 0; j < layers.length; j++) {
                    span = document.createElement("span");
                    span.className = "nj-layer nj-layer--" + layers[j].kind;
                    span.textContent = layers[j].label;
                    layersBox.appendChild(span);
                }
            }

            function syncChips() {
                var j;
                for (j = 0; j < chips.length; j++) {
                    if (j === stepIndex) {
                        chips[j].classList.add("active");
                    } else {
                        chips[j].classList.remove("active");
                    }
                    if (j < stepIndex) {
                        chips[j].classList.add("done");
                    } else {
                        chips[j].classList.remove("done");
                    }
                }
            }

            function showStep(idx) {
                clearTimers();
                stepIndex = idx;
                var step = STEPS[idx];
                syncChips();
                setActiveNodes(step);
                narrTitle.textContent = "단계 " + (idx + 1) + ". " + step.name;
                narrText.textContent = step.text;
                setLayers(step.layers);
                progress.textContent = progressText(idx, STEPS.length);
                nextBtn.disabled = !canAdvance(idx, STEPS.length);

                var moves = getMoves(step);
                if (moves.length) {
                    packet.classList.add("on");
                    runMoves(moves, 0);
                } else {
                    packet.classList.remove("on");
                }
            }

            function reset() {
                clearTimers();
                stepIndex = -1;
                syncChips();
                setActiveNodes(null);
                packet.classList.remove("on");
                placePacket("browser");
                packetLabel.textContent = "";
                narrTitle.textContent = "준비";
                narrText.textContent = "\"다음 단계\" 버튼을 눌러 주소창에 www.knou.ac.kr를 입력한 뒤 일어나는 일을 따라가 보세요.";
                setLayers([]);
                progress.textContent = progressText(-1, STEPS.length);
                nextBtn.disabled = false;
            }

            nextBtn.addEventListener("click", function () {
                if (canAdvance(stepIndex, STEPS.length)) {
                    showStep(stepIndex + 1);
                }
            });

            resetBtn.addEventListener("click", reset);

            reset();
        }
    });
})();

/* sim:sql-playground - SQL 쿼리 놀이터 */
(function () {
    "use strict";

    /* ---- 고정 데이터: 학생 테이블 8행 ---- */
    var STUDENTS = [
        { name: "김민준", dept: "컴퓨터과학", year: 1, gpa: 3.8 },
        { name: "이서연", dept: "경영학", year: 2, gpa: 4.2 },
        { name: "박지호", dept: "영문학", year: 3, gpa: 2.9 },
        { name: "최수아", dept: "컴퓨터과학", year: 4, gpa: 4.4 },
        { name: "정도윤", dept: "경영학", year: 1, gpa: 3.1 },
        { name: "강하은", dept: "영문학", year: 2, gpa: 3.6 },
        { name: "윤시우", dept: "컴퓨터과학", year: 3, gpa: 2.7 },
        { name: "한유진", dept: "경영학", year: 4, gpa: 3.9 }
    ];

    /* ---- 순수 함수: SQL 문장 생성 ----
       dept: "" 또는 학과명, gpa: "" 또는 "3.0" 같은 문자열,
       order: "" | "gpa_desc" | "gpa_asc" | "name_asc" */
    function buildSqlParts(dept, gpa, order) {
        var conds = [];
        if (dept) {
            conds.push("학과 = '" + dept + "'");
        }
        if (gpa) {
            conds.push("학점 >= " + gpa);
        }
        var orderClause = null;
        if (order === "gpa_desc") {
            orderClause = "ORDER BY 학점 DESC";
        } else if (order === "gpa_asc") {
            orderClause = "ORDER BY 학점 ASC";
        } else if (order === "name_asc") {
            orderClause = "ORDER BY 이름 ASC";
        }
        return {
            select: "SELECT * FROM 학생",
            where: conds.length ? "WHERE " + conds.join(" AND ") : null,
            order: orderClause
        };
    }

    function buildSql(dept, gpa, order) {
        var p = buildSqlParts(dept, gpa, order);
        var sql = p.select;
        if (p.where) {
            sql += " " + p.where;
        }
        if (p.order) {
            sql += " " + p.order;
        }
        return sql + ";";
    }

    /* ---- 순수 함수: 필터 + 정렬 (안정 정렬) ---- */
    function runQuery(rows, dept, gpa, order) {
        var min = gpa ? parseFloat(gpa) : null;
        var out = [];
        var i;
        for (i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (dept && r.dept !== dept) {
                continue;
            }
            if (min !== null && r.gpa < min) {
                continue;
            }
            out.push(r);
        }
        if (order) {
            var dec = [];
            for (i = 0; i < out.length; i++) {
                dec.push({ r: out[i], i: i });
            }
            dec.sort(function (a, b) {
                var c = 0;
                if (order === "gpa_desc") {
                    c = b.r.gpa - a.r.gpa;
                } else if (order === "gpa_asc") {
                    c = a.r.gpa - b.r.gpa;
                } else if (order === "name_asc") {
                    c = a.r.name < b.r.name ? -1 : (a.r.name > b.r.name ? 1 : 0);
                }
                return c !== 0 ? c : a.i - b.i;
            });
            out = [];
            for (i = 0; i < dec.length; i++) {
                out.push(dec[i].r);
            }
        }
        return out;
    }

    /* ---- node 테스트용 노출 (브라우저 동작에는 영향 없음) ---- */
    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            STUDENTS: STUDENTS,
            buildSqlParts: buildSqlParts,
            buildSql: buildSql,
            runQuery: runQuery
        };
    }

    if (typeof window === "undefined" || !window.SIM) {
        return;
    }

    window.SIM.register("sql-playground", {
        title: "SQL 쿼리 놀이터",
        build: function (root) {
            root.innerHTML = "" +
                "<details class=\"sqlp-src\">" +
                "    <summary>원본 테이블: 학생 (8행) 펼쳐 보기</summary>" +
                "    <table>" +
                "        <thead><tr><th>이름</th><th>학과</th><th>학년</th><th>학점</th></tr></thead>" +
                "        <tbody data-ref=\"src-body\"></tbody>" +
                "    </table>" +
                "</details>" +
                "<div class=\"sim__row sqlp-controls\">" +
                "    <label class=\"sqlp-field\">" +
                "        <span class=\"sqlp-label\">WHERE 학과 =</span>" +
                "        <select class=\"sim__select\" data-ref=\"dept\" aria-label=\"WHERE 학과 조건 선택\">" +
                "            <option value=\"\">전체 (조건 없음)</option>" +
                "            <option value=\"컴퓨터과학\">컴퓨터과학</option>" +
                "            <option value=\"경영학\">경영학</option>" +
                "            <option value=\"영문학\">영문학</option>" +
                "        </select>" +
                "    </label>" +
                "    <label class=\"sqlp-field\">" +
                "        <span class=\"sqlp-label\">AND 학점 &gt;=</span>" +
                "        <select class=\"sim__select\" data-ref=\"gpa\" aria-label=\"WHERE 학점 조건 선택\">" +
                "            <option value=\"\">없음</option>" +
                "            <option value=\"3.0\">3.0</option>" +
                "            <option value=\"3.5\">3.5</option>" +
                "            <option value=\"4.0\">4.0</option>" +
                "        </select>" +
                "    </label>" +
                "    <label class=\"sqlp-field\">" +
                "        <span class=\"sqlp-label\">ORDER BY</span>" +
                "        <select class=\"sim__select\" data-ref=\"order\" aria-label=\"ORDER BY 정렬 기준 선택\">" +
                "            <option value=\"\">없음</option>" +
                "            <option value=\"gpa_desc\">학점 DESC (높은 순)</option>" +
                "            <option value=\"gpa_asc\">학점 ASC (낮은 순)</option>" +
                "            <option value=\"name_asc\">이름 ASC (가나다순)</option>" +
                "        </select>" +
                "    </label>" +
                "    <button type=\"button\" class=\"sim__btn sqlp-reset\" data-ref=\"reset\" aria-label=\"조건 초기화\">초기화</button>" +
                "</div>" +
                "<div class=\"sim__out sqlp-sql\" data-ref=\"sql\" aria-label=\"생성된 SQL 문장\"></div>" +
                "<div class=\"sqlp-result\" data-ref=\"result\" aria-live=\"polite\">" +
                "    <p class=\"sqlp-count-row\"><span class=\"sim__chip\" data-ref=\"count\"></span></p>" +
                "    <table>" +
                "        <thead><tr><th>이름</th><th>학과</th><th>학년</th><th>학점</th></tr></thead>" +
                "        <tbody data-ref=\"out-body\"></tbody>" +
                "    </table>" +
                "</div>" +
                "<p class=\"sim__note\">WHERE는 조건에 맞는 행만 거르고, ORDER BY는 결과를 정렬합니다." +
                " 조건을 바꾸면 SQL 문장과 결과 표가 즉시 바뀝니다. 두 조건을 함께 고르면 AND로 결합됩니다.</p>";

            var selDept = root.querySelector("[data-ref=dept]");
            var selGpa = root.querySelector("[data-ref=gpa]");
            var selOrder = root.querySelector("[data-ref=order]");
            var btnReset = root.querySelector("[data-ref=reset]");
            var sqlBox = root.querySelector("[data-ref=sql]");
            var countChip = root.querySelector("[data-ref=count]");
            var srcBody = root.querySelector("[data-ref=src-body]");
            var outBody = root.querySelector("[data-ref=out-body]");

            var KEYWORDS = {
                "SELECT": 1, "FROM": 1, "WHERE": 1, "AND": 1,
                "ORDER": 1, "BY": 1, "DESC": 1, "ASC": 1
            };

            /* SQL 한 줄을 토큰 단위로 키워드 강조해 추가 */
            function appendSqlLine(line) {
                var div = document.createElement("div");
                var tokens = line.split(" ");
                for (var i = 0; i < tokens.length; i++) {
                    var tok = tokens[i];
                    var bare = tok.replace(/;$/, "");
                    var span = document.createElement("span");
                    if (KEYWORDS[bare]) {
                        span.className = "sqlp-kw";
                    }
                    span.textContent = tok;
                    div.appendChild(span);
                    if (i < tokens.length - 1) {
                        div.appendChild(document.createTextNode(" "));
                    }
                }
                sqlBox.appendChild(div);
            }

            function renderSql(parts) {
                sqlBox.textContent = "";
                var lines = [parts.select];
                if (parts.where) {
                    lines.push(parts.where);
                }
                if (parts.order) {
                    lines.push(parts.order);
                }
                lines[lines.length - 1] += ";";
                for (var i = 0; i < lines.length; i++) {
                    appendSqlLine(lines[i]);
                }
            }

            function appendRow(tbody, row) {
                var tr = document.createElement("tr");
                var cells = [row.name, row.dept, String(row.year), row.gpa.toFixed(1)];
                for (var i = 0; i < cells.length; i++) {
                    var td = document.createElement("td");
                    if (i >= 2) {
                        td.className = "sqlp-num";
                    }
                    td.textContent = cells[i];
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }

            function renderResult(rows) {
                outBody.textContent = "";
                if (rows.length === 0) {
                    var tr = document.createElement("tr");
                    var td = document.createElement("td");
                    td.colSpan = 4;
                    td.className = "sqlp-empty";
                    td.textContent = "조건에 맞는 행이 없습니다";
                    tr.appendChild(td);
                    outBody.appendChild(tr);
                } else {
                    for (var i = 0; i < rows.length; i++) {
                        appendRow(outBody, rows[i]);
                    }
                }
                countChip.textContent = rows.length + "행 반환";
            }

            function update() {
                var dept = selDept.value;
                var gpa = selGpa.value;
                var order = selOrder.value;
                renderSql(buildSqlParts(dept, gpa, order));
                renderResult(runQuery(STUDENTS, dept, gpa, order));
            }

            /* 원본 테이블은 한 번만 채운다 */
            for (var i = 0; i < STUDENTS.length; i++) {
                appendRow(srcBody, STUDENTS[i]);
            }

            selDept.addEventListener("change", update);
            selGpa.addEventListener("change", update);
            selOrder.addEventListener("change", update);
            btnReset.addEventListener("click", function () {
                selDept.value = "";
                selGpa.value = "";
                selOrder.value = "";
                update();
            });

            update();
        }
    });
})();

/* sim:crypto-lab - 암호 실험실 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- pure-logic-start ---- */
    function caesarEncrypt(text, shift) {
        var s = ((shift % 26) + 26) % 26;
        var out = "";
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (c >= 65 && c <= 90) {
                out += String.fromCharCode(65 + (c - 65 + s) % 26);
            } else if (c >= 97 && c <= 122) {
                out += String.fromCharCode(97 + (c - 97 + s) % 26);
            } else {
                out += text.charAt(i);
            }
        }
        return out;
    }

    function caesarDecrypt(text, shift) {
        return caesarEncrypt(text, 26 - (((shift % 26) + 26) % 26));
    }

    function bufferToHex(buffer) {
        var bytes = new Uint8Array(buffer);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) {
            var h = bytes[i].toString(16);
            if (h.length < 2) {
                h = "0" + h;
            }
            hex += h;
        }
        return hex;
    }

    function hexDiffCount(a, b) {
        var len = Math.max(a.length, b.length);
        var n = 0;
        for (var i = 0; i < len; i++) {
            if (a.charAt(i) !== b.charAt(i)) {
                n++;
            }
        }
        return n;
    }
    /* ---- pure-logic-end ---- */

    function displayText(t) {
        return t === "" ? "(빈 문자열)" : t;
    }

    window.SIM.register("crypto-lab", {
        title: "암호 실험실",
        build: function (root) {
            root.innerHTML =
                '<div class="sim__tabs">' +
                '<button type="button" class="sim__tab active" data-tab="caesar">시저 암호(대칭키)</button>' +
                '<button type="button" class="sim__tab" data-tab="hash">해시 함수(SHA-256)</button>' +
                '</div>' +

                '<div class="cl-panel" data-panel="caesar">' +
                '<div class="sim__row">' +
                '<span class="cl-label">평문</span>' +
                '<input type="text" class="sim__input cl-grow" value="HELLO KNOU" maxlength="60" aria-label="평문 입력" data-el="plain">' +
                '</div>' +
                '<div class="sim__row">' +
                '<span class="cl-label">이동 칸수</span>' +
                '<input type="range" class="cl-range" min="1" max="25" step="1" value="3" aria-label="이동 칸수" data-el="shift">' +
                '<span class="sim__chip" data-el="shiftView">+3</span>' +
                '</div>' +
                '<div class="cl-out-label">암호문</div>' +
                '<div class="sim__out cl-wrap" data-el="cipher" aria-live="polite"></div>' +
                '<p class="sim__note">같은 키(이동 칸수)로 잠그고(암호화) 같은 키로 푸는(복호화) 방식이 대칭키 암호입니다.</p>' +
                '<div class="sim__row">' +
                '<button type="button" class="sim__btn" data-el="bruteBtn" aria-expanded="false">전수 대입 해보기</button>' +
                '</div>' +
                '<div class="cl-brute" data-el="bruteBox" hidden>' +
                '<div class="cl-brute-list" data-el="bruteList"></div>' +
                '<p class="sim__note">키가 25가지뿐이라 모든 키를 차례로 넣어 보는 무차별 대입(브루트 포스)에 바로 뚫립니다. 키 공간이 작은 암호는 안전하지 않습니다.</p>' +
                '</div>' +
                '</div>' +

                '<div class="cl-panel" data-panel="hash" hidden>' +
                '<div class="sim__row">' +
                '<span class="cl-label">텍스트</span>' +
                '<input type="text" class="sim__input cl-grow" value="knou" maxlength="60" aria-label="해시할 텍스트 입력" data-el="hashInput">' +
                '</div>' +
                '<div class="cl-out-label">SHA-256 해시</div>' +
                '<div class="sim__out cl-wrap" data-el="hashOut" aria-live="polite">계산 중...</div>' +
                '<div class="cl-prev" data-el="prevBox" hidden>' +
                '<div class="cl-out-label">직전 입력의 해시</div>' +
                '<div class="cl-prev-text" data-el="prevText"></div>' +
                '<div class="cl-hash-prev cl-wrap" data-el="prevHash"></div>' +
                '<p class="sim__note" data-el="diffNote"></p>' +
                '</div>' +
                '<p class="sim__note">한 글자만 바꿔도 해시 전체가 완전히 달라집니다(눈사태 효과). 해시는 일방향이라 해시값에서 원문을 복원할 수 없고, 비밀번호 저장과 무결성 검증에 쓰입니다.</p>' +
                '</div>';

            function el(name) {
                return root.querySelector('[data-el="' + name + '"]');
            }

            /* ---- 탭 전환 ---- */
            var tabBtns = root.querySelectorAll(".sim__tab");
            var panels = root.querySelectorAll(".cl-panel");

            function selectTab(name) {
                var i;
                for (i = 0; i < tabBtns.length; i++) {
                    var on = tabBtns[i].getAttribute("data-tab") === name;
                    if (on) {
                        tabBtns[i].classList.add("active");
                    } else {
                        tabBtns[i].classList.remove("active");
                    }
                }
                for (i = 0; i < panels.length; i++) {
                    panels[i].hidden = panels[i].getAttribute("data-panel") !== name;
                }
            }

            Array.prototype.forEach.call(tabBtns, function (btn) {
                btn.addEventListener("click", function () {
                    selectTab(btn.getAttribute("data-tab"));
                });
            });

            /* ---- 탭1: 시저 암호 ---- */
            var plainEl = el("plain");
            var shiftEl = el("shift");
            var shiftView = el("shiftView");
            var cipherEl = el("cipher");
            var bruteBtn = el("bruteBtn");
            var bruteBox = el("bruteBox");
            var bruteList = el("bruteList");

            function renderBrute(cipher, shift) {
                bruteList.innerHTML = "";
                for (var k = 1; k <= 25; k++) {
                    var item = document.createElement("div");
                    item.className = "cl-brute-item" + (k === shift ? " hit" : "");
                    var keySpan = document.createElement("span");
                    keySpan.className = "cl-brute-key";
                    keySpan.textContent = "키 " + (k < 10 ? " " : "") + k;
                    var txtSpan = document.createElement("span");
                    txtSpan.className = "cl-brute-text";
                    txtSpan.textContent = caesarDecrypt(cipher, k);
                    item.appendChild(keySpan);
                    item.appendChild(txtSpan);
                    if (k === shift) {
                        var mark = document.createElement("span");
                        mark.className = "cl-brute-mark";
                        mark.textContent = "원문 발견";
                        item.appendChild(mark);
                    }
                    bruteList.appendChild(item);
                }
            }

            function updateCaesar() {
                var shift = parseInt(shiftEl.value, 10);
                if (isNaN(shift)) shift = 3;
                shiftView.textContent = "+" + shift;
                var cipher = caesarEncrypt(plainEl.value, shift);
                cipherEl.textContent = cipher === "" ? "(평문을 입력하세요)" : cipher;
                if (!bruteBox.hidden) {
                    renderBrute(cipher, shift);
                }
            }

            plainEl.addEventListener("input", updateCaesar);
            shiftEl.addEventListener("input", updateCaesar);

            bruteBtn.addEventListener("click", function () {
                var show = bruteBox.hidden;
                bruteBox.hidden = !show;
                bruteBtn.setAttribute("aria-expanded", show ? "true" : "false");
                bruteBtn.textContent = show ? "전수 대입 닫기" : "전수 대입 해보기";
                if (show) {
                    updateCaesar();
                }
            });

            updateCaesar();

            /* ---- 탭2: SHA-256 해시 ---- */
            var hashPanel = root.querySelector('[data-panel="hash"]');
            var subtle = null;
            try {
                if (window.crypto && window.crypto.subtle &&
                    typeof window.crypto.subtle.digest === "function" &&
                    typeof TextEncoder !== "undefined") {
                    subtle = window.crypto.subtle;
                }
            } catch (eSubtle) {
                subtle = null;
            }

            if (!subtle) {
                hashPanel.innerHTML = "";
                var na = document.createElement("p");
                na.className = "sim__note";
                na.textContent = "이 환경에서는 브라우저 내장 해시 기능(crypto.subtle)을 사용할 수 없어 " +
                    "SHA-256 계산을 보여 드릴 수 없습니다. 최신 브라우저의 https(또는 localhost) " +
                    "환경에서 다시 열어 보세요.";
                hashPanel.appendChild(na);
                return;
            }

            var hashInput = el("hashInput");
            var hashOut = el("hashOut");
            var prevBox = el("prevBox");
            var prevText = el("prevText");
            var prevHash = el("prevHash");
            var diffNote = el("diffNote");

            var hashSeq = 0;
            var hashState = { text: null, hex: null };

            function computeHash(text) {
                var my = ++hashSeq;
                var data = new TextEncoder().encode(text);
                subtle.digest("SHA-256", data).then(function (buf) {
                    if (my !== hashSeq) return;
                    var hex = bufferToHex(buf);
                    if (hashState.text !== null && hashState.text !== text) {
                        prevBox.hidden = false;
                        prevText.textContent = "입력: " + displayText(hashState.text);
                        prevHash.textContent = hashState.hex;
                        diffNote.textContent = "지금 해시와 64자리 중 " +
                            hexDiffCount(hex, hashState.hex) + "자리가 다릅니다.";
                    }
                    hashState.text = text;
                    hashState.hex = hex;
                    hashOut.textContent = hex;
                }, function () {
                    if (my !== hashSeq) return;
                    hashOut.textContent = "해시 계산에 실패했습니다. 다시 시도해 보세요.";
                });
            }

            hashInput.addEventListener("input", function () {
                computeHash(hashInput.value);
            });

            computeHash(hashInput.value);
        }
    });
})();

/* sim:knn-demo - 지도학습 분류 체험 (k-NN) */
(function () {
    "use strict";
    if (!window.SIM) return;

    var SVG_NS = "http://www.w3.org/2000/svg";
    var VIEW_W = 320;
    var VIEW_H = 220;
    var PLOT = { x0: 36, y0: 10, x1: 310, y1: 184 };
    var CLASS_NAME = { A: "고양이", B: "강아지" };

    /* 프리셋 학습 데이터 12개
       - A(고양이): 좌상단 클러스터 6개, B(강아지): 우하단 클러스터 6개, 가운데 약간 섞임 */
    var TRAIN = [
        { x: 75, y: 45, label: "A" },
        { x: 105, y: 70, label: "A" },
        { x: 62, y: 88, label: "A" },
        { x: 118, y: 38, label: "A" },
        { x: 140, y: 80, label: "A" },
        { x: 158, y: 112, label: "A" },
        { x: 238, y: 152, label: "B" },
        { x: 262, y: 122, label: "B" },
        { x: 205, y: 162, label: "B" },
        { x: 285, y: 140, label: "B" },
        { x: 215, y: 96, label: "B" },
        { x: 182, y: 142, label: "B" }
    ];

    /* ---- 순수 계산 로직 (DOM 무관, node로 검증) ---- */

    function dist2(ax, ay, bx, by) {
        var dx = ax - bx;
        var dy = ay - by;
        return dx * dx + dy * dy;
    }

    /* 가장 가까운 k개 이웃을 거리 오름차순으로 반환 (동률이면 인덱스 낮은 쪽 우선) */
    function knnNearest(points, qx, qy, k) {
        var arr = [];
        var i;
        for (i = 0; i < points.length; i++) {
            arr.push({
                index: i,
                label: points[i].label,
                d2: dist2(points[i].x, points[i].y, qx, qy)
            });
        }
        arr.sort(function (p, q) {
            if (p.d2 !== q.d2) return p.d2 - q.d2;
            return p.index - q.index;
        });
        return arr.slice(0, Math.min(k, arr.length));
    }

    /* k개 이웃의 다수결 분류. UI의 k는 홀수(1/3/5)라 동률이 없지만,
       방어적으로 동률이면 가장 가까운 이웃(첫 번째)의 클래스를 따른다 */
    function knnClassify(points, qx, qy, k) {
        var neighbors = knnNearest(points, qx, qy, k);
        var counts = { A: 0, B: 0 };
        var label;
        var i;
        for (i = 0; i < neighbors.length; i++) {
            counts[neighbors[i].label] += 1;
        }
        if (counts.A !== counts.B) {
            label = counts.A > counts.B ? "A" : "B";
        } else {
            label = neighbors.length > 0 ? neighbors[0].label : "A";
        }
        return {
            neighbors: neighbors,
            counts: counts,
            label: label
        };
    }

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    /* ---- DOM 보조 ---- */

    function svgEl(name, attrs) {
        var el = document.createElementNS(SVG_NS, name);
        var key;
        for (key in attrs) {
            if (attrs.hasOwnProperty(key)) {
                el.setAttribute(key, attrs[key]);
            }
        }
        return el;
    }

    function clearChildren(el) {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
    }

    function triPath(x, y) {
        return "M " + x + " " + (y - 7) +
            " L " + (x + 6.5) + " " + (y + 5) +
            " L " + (x - 6.5) + " " + (y + 5) + " Z";
    }

    window.SIM.register("knn-demo", {
        title: "지도학습 분류 체험 (k-NN)",
        build: function (root) {
            var marks = "";
            var midX = (PLOT.x0 + PLOT.x1) / 2;
            var midY = (PLOT.y0 + PLOT.y1) / 2;
            var i;
            var p;

            for (i = 0; i < TRAIN.length; i++) {
                p = TRAIN[i];
                if (p.label === "A") {
                    marks += '<circle class="knn-pt knn-pt--a" cx="' + p.x +
                        '" cy="' + p.y + '" r="6"></circle>';
                } else {
                    marks += '<path class="knn-pt knn-pt--b" d="' +
                        triPath(p.x, p.y) + '"></path>';
                }
            }

            root.innerHTML =
                '<div class="sim__row">' +
                '<span class="knn-legend"><span class="knn-sw knn-sw--a"></span>고양이 (학습 데이터)</span>' +
                '<span class="knn-legend"><span class="knn-sw knn-sw--b"></span>강아지 (학습 데이터)</span>' +
                '</div>' +
                '<svg class="knn-svg" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" ' +
                'xmlns="http://www.w3.org/2000/svg" role="img" ' +
                'aria-label="k-NN 분류 평면. 파란 원은 고양이, 주황 세모는 강아지 학습 데이터입니다. 평면을 탭하면 그 자리의 새 점을 분류합니다.">' +
                '<line class="knn-axis" x1="' + PLOT.x0 + '" y1="' + PLOT.y1 +
                '" x2="' + PLOT.x1 + '" y2="' + PLOT.y1 + '"></line>' +
                '<line class="knn-axis" x1="' + PLOT.x0 + '" y1="' + PLOT.y0 +
                '" x2="' + PLOT.x0 + '" y2="' + PLOT.y1 + '"></line>' +
                '<text class="knn-axis-label" x="' + midX +
                '" y="208" text-anchor="middle">특징 1 (예: 몸길이)</text>' +
                '<text class="knn-axis-label" x="14" y="' + midY +
                '" text-anchor="middle" transform="rotate(-90 14 ' + midY +
                ')">특징 2 (예: 귀 크기)</text>' +
                '<g class="knn-links"></g>' +
                '<g class="knn-train">' + marks + '</g>' +
                '<g class="knn-query"></g>' +
                '</svg>' +
                '<div class="sim__row">' +
                '<label class="knn-k-label">k (이웃 수)' +
                '<input class="knn-range" type="range" min="1" max="5" step="2" value="3" ' +
                'aria-label="k 값 (가까운 이웃 수, 1 또는 3 또는 5)">' +
                '</label>' +
                '<span class="sim__chip knn-k-value">k = 3</span>' +
                '<button type="button" class="sim__btn knn-btn-random" aria-label="무작위 위치에 새 점 찍기">무작위 점</button>' +
                '<button type="button" class="sim__btn knn-btn-clear" aria-label="새 점 지우기">지우기</button>' +
                '</div>' +
                '<div class="sim__out knn-out" aria-live="polite">평면을 탭하거나 클릭해 새 점을 놓아 보세요.</div>' +
                '<p class="sim__note">라벨(정답)이 달린 학습 데이터로 새 데이터의 정답을 맞히는 것이 ' +
                '지도학습의 분류입니다. k-NN은 가장 가까운 k개 이웃의 다수결로 답을 정합니다.</p>';

            var svg = root.querySelector(".knn-svg");
            var linksGroup = root.querySelector(".knn-links");
            var queryGroup = root.querySelector(".knn-query");
            var range = root.querySelector(".knn-range");
            var kValue = root.querySelector(".knn-k-value");
            var btnRandom = root.querySelector(".knn-btn-random");
            var btnClear = root.querySelector(".knn-btn-clear");
            var out = root.querySelector(".knn-out");

            var state = { query: null, k: 3 };

            function render() {
                clearChildren(linksGroup);
                clearChildren(queryGroup);
                if (!state.query) {
                    out.textContent = "평면을 탭하거나 클릭해 새 점을 놓아 보세요.";
                    return;
                }

                var q = state.query;
                var res = knnClassify(TRAIN, q.x, q.y, state.k);
                var i;
                var t;

                for (i = 0; i < res.neighbors.length; i++) {
                    t = TRAIN[res.neighbors[i].index];
                    linksGroup.appendChild(svgEl("line", {
                        "class": "knn-link",
                        x1: q.x, y1: q.y, x2: t.x, y2: t.y
                    }));
                }

                queryGroup.appendChild(svgEl("circle", {
                    "class": "knn-query-mark knn-query-mark--" + (res.label === "A" ? "a" : "b"),
                    cx: q.x, cy: q.y, r: 7
                }));

                var qMark = svgEl("text", {
                    "class": "knn-query-q",
                    x: q.x, y: q.y + 3.5, "text-anchor": "middle"
                });
                qMark.textContent = "?";
                queryGroup.appendChild(qMark);

                var nameY = q.y - 12;
                if (nameY < PLOT.y0 + 8) nameY = q.y + 20;
                var name = svgEl("text", {
                    "class": "knn-query-name",
                    x: clamp(q.x, PLOT.x0 + 16, PLOT.x1 - 16),
                    y: nameY,
                    "text-anchor": "middle"
                });
                name.textContent = CLASS_NAME[res.label];
                queryGroup.appendChild(name);

                out.textContent = "가까운 " + state.k + "개 중 고양이 " + res.counts.A +
                    ", 강아지 " + res.counts.B + " -> " + CLASS_NAME[res.label] + "!";
            }

            function placeQuery(x, y) {
                state.query = {
                    x: clamp(x, PLOT.x0, PLOT.x1),
                    y: clamp(y, PLOT.y0, PLOT.y1)
                };
                render();
            }

            svg.addEventListener("click", function (e) {
                /* 클릭 시점에만 픽셀 크기를 측정해 viewBox 좌표로 환산 */
                var rect = svg.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                var x = (e.clientX - rect.left) * (VIEW_W / rect.width);
                var y = (e.clientY - rect.top) * (VIEW_H / rect.height);
                placeQuery(x, y);
            });

            range.addEventListener("input", function () {
                var k = parseInt(range.value, 10);
                if (k !== 1 && k !== 3 && k !== 5) k = 3;
                state.k = k;
                kValue.textContent = "k = " + k;
                if (state.query) render();
            });

            btnRandom.addEventListener("click", function () {
                var x = PLOT.x0 + Math.random() * (PLOT.x1 - PLOT.x0);
                var y = PLOT.y0 + Math.random() * (PLOT.y1 - PLOT.y0);
                placeQuery(x, y);
            });

            btnClear.addEventListener("click", function () {
                state.query = null;
                render();
            });
        },
        /* node 테스트용으로 순수 함수 노출 (UI 동작과 무관) */
        _lib: {
            dist2: dist2,
            knnNearest: knnNearest,
            knnClassify: knnClassify,
            TRAIN: TRAIN,
            PLOT: PLOT
        }
    });
})();

/* sim:en-pattern-lab - 5형식 문장 분해기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 데이터/로직 (DOM 비의존) ---- */
    var ROLE_INFO = {
        S: { name: "주어", desc: "동작이나 상태의 주체" },
        V: { name: "동사", desc: "주어의 동작이나 상태를 나타내는 말" },
        O: { name: "목적어", desc: "동사의 동작이 미치는 대상" },
        IO: { name: "간접목적어", desc: "'~에게'에 해당하는, 받는 대상" },
        DO: { name: "직접목적어", desc: "'~을/를'에 해당하는, 건네지는 것" },
        C: { name: "주격보어", desc: "주어를 보충 설명하는 말" },
        OC: { name: "목적격보어", desc: "목적어를 보충 설명하는 말" },
        M: { name: "수식어", desc: "시간/장소 등 부가 정보. 문장 형식을 셀 때는 포함하지 않는다" }
    };

    var PATTERNS = [
        {
            label: "1형식",
            verbType: "완전자동사",
            korean: "해는 동쪽에서 뜬다.",
            parts: [
                { text: "The sun", role: "S" },
                { text: "rises", role: "V" },
                { text: "in the east", role: "M" }
            ]
        },
        {
            label: "2형식",
            verbType: "불완전자동사",
            korean: "그녀는 의사가 되었다.",
            parts: [
                { text: "She", role: "S" },
                { text: "became", role: "V" },
                { text: "a doctor", role: "C" }
            ]
        },
        {
            label: "3형식",
            verbType: "완전타동사",
            korean: "그는 새 차를 샀다.",
            parts: [
                { text: "He", role: "S" },
                { text: "bought", role: "V" },
                { text: "a new car", role: "O" }
            ]
        },
        {
            label: "4형식",
            verbType: "수여동사",
            korean: "아버지는 나에게 시계를 주셨다.",
            parts: [
                { text: "My father", role: "S" },
                { text: "gave", role: "V" },
                { text: "me", role: "IO" },
                { text: "a watch", role: "DO" }
            ]
        },
        {
            label: "5형식",
            verbType: "불완전타동사",
            korean: "우리는 그를 천재라고 부른다.",
            parts: [
                { text: "We", role: "S" },
                { text: "call", role: "V" },
                { text: "him", role: "O" },
                { text: "a genius", role: "OC" }
            ]
        }
    ];

    var logic = {
        patterns: PATTERNS,
        /* 성분 코드 -> { name, desc }. 모르는 코드는 null */
        roleInfo: function (role) {
            return ROLE_INFO.hasOwnProperty(role) ? ROLE_INFO[role] : null;
        },
        /* 수식어(M)를 뺀 구조 공식: "S + V + IO + DO" */
        formulaOf: function (parts) {
            var out = [];
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].role !== "M") out.push(parts[i].role);
            }
            return out.join(" + ");
        },
        /* 성분 텍스트를 이어 붙인 완성 문장 (마침표 포함, TTS용) */
        sentenceOf: function (parts) {
            var words = [];
            for (var i = 0; i < parts.length; i++) {
                words.push(parts[i].text);
            }
            return words.join(" ") + ".";
        },
        /* 성분 -> 색 구분 클래스 키 (IO/DO는 O 계열, OC는 C 계열) */
        roleClass: function (role) {
            if (role === "S") return "s";
            if (role === "V") return "v";
            if (role === "O" || role === "IO" || role === "DO") return "o";
            if (role === "C" || role === "OC") return "c";
            return "m";
        },
        /* 설명 한 줄: "주어(S): 동작이나 상태의 주체" */
        describe: function (role) {
            var info = ROLE_INFO.hasOwnProperty(role) ? ROLE_INFO[role] : null;
            if (!info) return "";
            return info.name + "(" + role + "): " + info.desc;
        }
    };

    window.SIM.register("en-pattern-lab", {
        title: "5형식 문장 분해기",
        _logic: logic,
        build: function (root) {
            var HINT = "성분 블록을 탭하면 설명이 여기에 표시됩니다.";

            root.innerHTML = ""
                + '<div class="sim__tabs" role="tablist" aria-label="문장 형식 선택"></div>'
                + '<div class="epl-sentence" role="group" aria-label="예문 성분 블록"></div>'
                + '<div class="sim__row epl-meta">'
                +     '<span class="epl-meta-label">구조</span>'
                +     '<span class="sim__chip epl-formula"></span>'
                +     '<span class="epl-meta-label">동사</span>'
                +     '<span class="sim__chip epl-vt"></span>'
                + '</div>'
                + '<p class="epl-korean">'
                +     '<span class="epl-meta-label">해석</span> '
                +     '<span class="epl-ko-text"></span>'
                + '</p>'
                + '<div class="epl-desc" aria-live="polite"></div>'
                + '<div class="sim__row epl-legend">'
                +     '<span class="epl-lg epl-lg--s">S 주어</span>'
                +     '<span class="epl-lg epl-lg--v">V 동사</span>'
                +     '<span class="epl-lg epl-lg--o">O/IO/DO 목적어</span>'
                +     '<span class="epl-lg epl-lg--c">C/OC 보어</span>'
                +     '<span class="epl-lg epl-lg--m">M 수식어</span>'
                + '</div>'
                + '<p class="sim__note">수식어(M)는 형식을 셀 때 포함하지 않는다.'
                + ' 4형식은 목적어가 둘(IO, DO), 5형식은 목적어 뒤에 보어(OC)가 온다.</p>';

            var tabsBox = root.querySelector(".sim__tabs");
            var sentenceBox = root.querySelector(".epl-sentence");
            var formulaEl = root.querySelector(".epl-formula");
            var vtEl = root.querySelector(".epl-vt");
            var koEl = root.querySelector(".epl-ko-text");
            var descEl = root.querySelector(".epl-desc");

            var current = -1;
            var tabButtons = [];

            function makeTab(i) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "sim__tab";
                b.setAttribute("role", "tab");
                b.setAttribute("aria-selected", "false");
                b.textContent = PATTERNS[i].label;
                b.addEventListener("click", function () {
                    if (current !== i) select(i);
                });
                tabsBox.appendChild(b);
                tabButtons.push(b);
            }

            function makeBlock(part) {
                var info = logic.roleInfo(part.role);
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "epl-block epl-block--" + logic.roleClass(part.role);
                btn.setAttribute("aria-label",
                    part.text + ", " + (info ? info.name : part.role));

                var word = document.createElement("span");
                word.className = "epl-word";
                word.textContent = part.text;

                var tag = document.createElement("span");
                tag.className = "epl-tag";
                tag.textContent = part.role;

                btn.appendChild(word);
                btn.appendChild(tag);
                btn.addEventListener("click", function () {
                    var act = sentenceBox.querySelectorAll(".epl-block.active");
                    for (var k = 0; k < act.length; k++) {
                        act[k].classList.remove("active");
                    }
                    btn.classList.add("active");
                    descEl.textContent = logic.describe(part.role);
                });
                return btn;
            }

            /* 발음 버튼: 클릭 처리는 app.js 전역 위임이 담당하므로 여기서는 마크업만 */
            function makeSpeakBtn(text) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "speak-btn";
                b.setAttribute("aria-label", "발음 듣기");
                b.setAttribute("aria-pressed", "false");
                b.setAttribute("data-speak-text", text);
                b.innerHTML = '<span aria-hidden="true">&#128266;</span>';
                return b;
            }

            function select(i) {
                current = i;
                for (var t = 0; t < tabButtons.length; t++) {
                    var on = (t === i);
                    tabButtons[t].className = on ? "sim__tab active" : "sim__tab";
                    tabButtons[t].setAttribute("aria-selected", on ? "true" : "false");
                }

                var p = PATTERNS[i];
                sentenceBox.innerHTML = "";
                for (var j = 0; j < p.parts.length; j++) {
                    sentenceBox.appendChild(makeBlock(p.parts[j]));
                }

                var period = document.createElement("span");
                period.className = "epl-period";
                period.setAttribute("aria-hidden", "true");
                period.textContent = ".";
                sentenceBox.appendChild(period);
                sentenceBox.appendChild(makeSpeakBtn(logic.sentenceOf(p.parts)));

                formulaEl.textContent = logic.formulaOf(p.parts);
                vtEl.textContent = p.verbType;
                koEl.textContent = p.korean;
                descEl.textContent = HINT;
            }

            for (var i = 0; i < PATTERNS.length; i++) {
                makeTab(i);
            }
            select(0);
        }
    });
})();

/* sim:en-tense-matrix - 12시제 탐색기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    var TIMES = ["현재", "과거", "미래"];
    var ASPECTS = ["단순", "진행", "완료", "완료진행"];

    /* 본문 2-2 표의 형태/예문/해석 (study 기준). DATA[시점][상] */
    var DATA = [
        [
            {
                form: "study",
                pattern: "동사원형(3인칭 단수 -s)",
                en: "I study English every day.",
                ko: "나는 매일 영어를 공부한다.",
                usage: "습관·반복되는 일, 일반적 사실"
            },
            {
                form: "am/is/are studying",
                pattern: "am/is/are + -ing",
                en: "I am studying English now.",
                ko: "나는 지금 영어를 공부하고 있다.",
                usage: "지금 이 순간 진행 중인 동작"
            },
            {
                form: "have/has studied",
                pattern: "have/has + p.p.",
                en: "I have studied English for five years.",
                ko: "나는 5년 동안 영어를 공부해 왔다.",
                usage: "과거에 시작된 일이 현재까지 이어지거나 영향을 줌(경험·계속·완료·결과)"
            },
            {
                form: "have/has been studying",
                pattern: "have/has been + -ing",
                en: "I have been studying English since 2020.",
                ko: "나는 2020년부터 영어를 계속 공부해 오고 있다.",
                usage: "과거에 시작해 지금까지 계속 진행 중인 일"
            }
        ],
        [
            {
                form: "studied",
                pattern: "동사 과거형",
                en: "I studied English yesterday.",
                ko: "나는 어제 영어를 공부했다.",
                usage: "과거의 한 시점에 일어나 끝난 일"
            },
            {
                form: "was/were studying",
                pattern: "was/were + -ing",
                en: "I was studying when he called.",
                ko: "그가 전화했을 때 나는 공부하고 있었다.",
                usage: "과거 한 시점에 진행 중이던 동작"
            },
            {
                form: "had studied",
                pattern: "had + p.p.",
                en: "I had studied English before I moved.",
                ko: "나는 이사하기 전에 영어를 공부했었다.",
                usage: "과거 기준 시점보다 더 앞서 일어난 일(대과거)"
            },
            {
                form: "had been studying",
                pattern: "had been + -ing",
                en: "I had been studying for two hours when she arrived.",
                ko: "그녀가 도착했을 때 나는 두 시간째 공부하고 있었다.",
                usage: "과거 기준 시점까지 계속 진행되던 일"
            }
        ],
        [
            {
                form: "will study",
                pattern: "will + 동사원형",
                en: "I will study English tomorrow.",
                ko: "나는 내일 영어를 공부할 것이다.",
                usage: "미래에 할 일이나 예측"
            },
            {
                form: "will be studying",
                pattern: "will be + -ing",
                en: "I will be studying at this time tomorrow.",
                ko: "내일 이 시간이면 나는 공부하고 있을 것이다.",
                usage: "미래 한 시점에 진행 중일 동작"
            },
            {
                form: "will have studied",
                pattern: "will have + p.p.",
                en: "I will have studied English for ten years by 2030.",
                ko: "2030년이면 나는 영어를 10년간 공부한 셈이 될 것이다.",
                usage: "미래 기준 시점까지 완료되어 있을 일"
            },
            {
                form: "will have been studying",
                pattern: "will have been + -ing",
                en: "By next month, I will have been studying for a year.",
                ko: "다음 달이면 나는 1년째 계속 공부하고 있는 것이 된다.",
                usage: "미래 기준 시점까지 계속 진행되고 있을 일"
            }
        ]
    ];

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        /* 시제 이름: 단순상은 시점 이름 그대로 (예: 현재, 과거완료진행) */
        tenseName: function (t, a) {
            return TIMES[t] + (a === 0 ? "" : ASPECTS[a]);
        },
        entry: function (t, a) {
            return DATA[t][a];
        },
        /* 타임라인 축 위 기준점 x좌표 (viewBox 0 0 700 144 기준) */
        anchorX: function (t) {
            return [350, 180, 520][t];
        },
        /* 선택 시제를 그릴 도형 명세: 점/물결/화살표/물결+화살표 */
        timelineSpec: function (t, a) {
            var anchor = this.anchorX(t);
            var kinds = ["dot", "wave", "arrow", "wavearrow"];
            var spec = { anchor: anchor, kind: kinds[a], start: null };
            if (a >= 2) {
                spec.start = anchor - 130;
            }
            return spec;
        },
        /* x0에서 시작해 step 20px 반파장으로 이어지는 물결 path */
        wavePath: function (x0, x1, y) {
            var step = 20;
            var n = Math.max(1, Math.round((x1 - x0) / step));
            var d = "M " + x0 + " " + y + " q " + (step / 2) + " -8 " + step + " 0";
            for (var i = 1; i < n; i++) {
                d += " t " + step + " 0";
            }
            return d;
        },
        /* SVG 대체 텍스트용 한국어 설명 */
        describe: function (t, a) {
            var word = TIMES[t];
            if (a === 0) return word + " 시점의 한 점";
            if (a === 1) return word + " 시점에서 진행 중인 물결 구간";
            if (a === 2) return "앞선 시점에서 기준점(" + word + ")까지 이어지는 화살표";
            return "앞선 시점에서 기준점(" + word + ")까지 계속 진행되는 물결 화살표";
        }
    };

    function svgHead(x, y) {
        return '<polygon class="tm-head" points="'
            + x + "," + y + " "
            + (x - 12) + "," + (y - 6) + " "
            + (x - 12) + "," + (y + 6) + '"/>';
    }

    function buildSvg(t, a) {
        var spec = logic.timelineSpec(t, a);
        var anchor = spec.anchor;
        var y = 68;
        var axisY = 102;
        var order = [1, 0, 2];
        var i, ti, x;
        var s = '<svg viewBox="0 0 700 144" role="img" aria-label="타임라인: '
            + logic.describe(t, a) + '">';
        s += '<line class="tm-ax" x1="28" y1="' + axisY + '" x2="664" y2="' + axisY + '"/>';
        s += '<polygon class="tm-axhead" points="678,' + axisY + " 664," + (axisY - 6)
            + " 664," + (axisY + 6) + '"/>';
        for (i = 0; i < order.length; i++) {
            ti = order[i];
            x = logic.anchorX(ti);
            s += '<line class="tm-tick" x1="' + x + '" y1="' + (axisY - 6)
                + '" x2="' + x + '" y2="' + (axisY + 6) + '"/>';
            s += '<text class="tm-axlbl' + (ti === t ? " is-on" : "") + '" x="' + x
                + '" y="' + (axisY + 28) + '" text-anchor="middle">' + TIMES[ti] + "</text>";
        }
        s += '<line class="tm-ref" x1="' + anchor + '" y1="44" x2="' + anchor
            + '" y2="' + (axisY + 6) + '"/>';
        s += '<text class="tm-reflbl" x="' + anchor + '" y="34" text-anchor="middle">기준점('
            + TIMES[t] + ")</text>";
        if (spec.kind === "dot") {
            s += '<circle class="tm-dot" cx="' + anchor + '" cy="' + y + '" r="8"/>';
        } else if (spec.kind === "wave") {
            s += '<path class="tm-wave" d="' + logic.wavePath(anchor - 50, anchor + 50, y) + '"/>';
        } else if (spec.kind === "arrow") {
            s += '<circle class="tm-startdot" cx="' + spec.start + '" cy="' + y + '" r="5"/>';
            s += '<line class="tm-arrowline" x1="' + (spec.start + 5) + '" y1="' + y
                + '" x2="' + (anchor - 12) + '" y2="' + y + '"/>';
            s += svgHead(anchor, y);
        } else {
            s += '<circle class="tm-startdot" cx="' + spec.start + '" cy="' + y + '" r="5"/>';
            s += '<path class="tm-wave" d="' + logic.wavePath(spec.start + 6, anchor - 14, y) + '"/>';
            s += svgHead(anchor, y);
        }
        s += "</svg>";
        return s;
    }

    function matrixHtml() {
        var t, a;
        var h = '<table><thead><tr><th scope="col" class="tm-corner">구분</th>';
        for (a = 0; a < 4; a++) {
            h += '<th scope="col" data-col="' + a + '">' + ASPECTS[a] + "</th>";
        }
        h += "</tr></thead><tbody>";
        for (t = 0; t < 3; t++) {
            h += '<tr><th scope="row" data-row="' + t + '">' + TIMES[t] + "</th>";
            for (a = 0; a < 4; a++) {
                h += '<td class="tm-cell" data-cell="' + t + "-" + a + '">'
                    + DATA[t][a].form + "</td>";
            }
            h += "</tr>";
        }
        h += "</tbody></table>";
        return h;
    }

    window.SIM.register("en-tense-matrix", {
        title: "12시제 탐색기",
        _logic: logic,
        build: function (root) {
            var i, t, a;
            var timeBtns = "";
            for (t = 0; t < 3; t++) {
                timeBtns += '<button type="button" class="sim__btn tm-btn" data-t="' + t
                    + '" aria-pressed="false">' + TIMES[t] + "</button>";
            }
            var aspectBtns = "";
            for (a = 0; a < 4; a++) {
                aspectBtns += '<button type="button" class="sim__btn tm-btn" data-a="' + a
                    + '" aria-pressed="false">' + ASPECTS[a] + "</button>";
            }
            root.innerHTML = ""
                + '<div class="sim__row" role="group" aria-label="시점 선택">'
                +     '<span class="tm-grouplbl">시점</span>' + timeBtns
                + "</div>"
                + '<div class="sim__row" role="group" aria-label="상 선택">'
                +     '<span class="tm-grouplbl">상</span>' + aspectBtns
                + "</div>"
                + '<div class="tm-result" aria-live="polite">'
                +     '<div class="tm-meta">'
                +         '<span class="sim__chip tm-name"></span>'
                +         '<span class="tm-pattern"></span>'
                +     "</div>"
                +     '<p class="tm-form">'
                +         '<span class="tm-formlbl">study 기준 형태</span>'
                +         '<span class="tm-formval"></span>'
                +     "</p>"
                +     '<div class="tm-sent">'
                +         '<span class="tm-en" lang="en"></span>'
                +         '<button type="button" class="speak-btn" aria-label="발음 듣기"'
                +             ' aria-pressed="false" data-speak-text="">'
                +             '<span aria-hidden="true">&#128266;</span>'
                +         "</button>"
                +     "</div>"
                +     '<p class="tm-ko"></p>'
                +     '<p class="sim__note tm-usage"></p>'
                + "</div>"
                + '<div class="tm-tablewrap">' + matrixHtml() + "</div>"
                + '<div class="tm-svgwrap"></div>'
                + '<p class="sim__note">타임라인 읽는 법: 점은 그 시점의 일, 물결은 진행 중,'
                + " 화살표는 앞선 시점에서 기준점(세로 점선)까지 이어짐을 뜻한다.</p>";

            var nameEl = root.querySelector(".tm-name");
            var patternEl = root.querySelector(".tm-pattern");
            var formEl = root.querySelector(".tm-formval");
            var enEl = root.querySelector(".tm-en");
            var speakBtn = root.querySelector(".speak-btn");
            var koEl = root.querySelector(".tm-ko");
            var usageEl = root.querySelector(".tm-usage");
            var svgWrap = root.querySelector(".tm-svgwrap");
            var btns = root.querySelectorAll(".tm-btn");
            var state = { t: 0, a: 0 };

            function update() {
                var ct = state.t;
                var ca = state.a;
                var j, b, on, key;
                for (j = 0; j < btns.length; j++) {
                    b = btns[j];
                    if (b.getAttribute("data-t") !== null) {
                        on = parseInt(b.getAttribute("data-t"), 10) === ct;
                    } else {
                        on = parseInt(b.getAttribute("data-a"), 10) === ca;
                    }
                    if (on) {
                        b.classList.add("active");
                    } else {
                        b.classList.remove("active");
                    }
                    b.setAttribute("aria-pressed", on ? "true" : "false");
                }
                var e = logic.entry(ct, ca);
                nameEl.textContent = logic.tenseName(ct, ca);
                patternEl.textContent = e.pattern;
                formEl.textContent = e.form;
                enEl.textContent = e.en;
                speakBtn.setAttribute("data-speak-text", e.en);
                koEl.textContent = e.ko;
                usageEl.textContent = "쓰임: " + e.usage;
                key = ct + "-" + ca;
                var cells = root.querySelectorAll("[data-cell]");
                for (j = 0; j < cells.length; j++) {
                    if (cells[j].getAttribute("data-cell") === key) {
                        cells[j].classList.add("is-now");
                    } else {
                        cells[j].classList.remove("is-now");
                    }
                }
                var cols = root.querySelectorAll("[data-col]");
                for (j = 0; j < cols.length; j++) {
                    if (parseInt(cols[j].getAttribute("data-col"), 10) === ca) {
                        cols[j].classList.add("is-axis");
                    } else {
                        cols[j].classList.remove("is-axis");
                    }
                }
                var rows = root.querySelectorAll("[data-row]");
                for (j = 0; j < rows.length; j++) {
                    if (parseInt(rows[j].getAttribute("data-row"), 10) === ct) {
                        rows[j].classList.add("is-axis");
                    } else {
                        rows[j].classList.remove("is-axis");
                    }
                }
                svgWrap.innerHTML = buildSvg(ct, ca);
            }

            function onClick(ev) {
                var b = ev.currentTarget;
                var dt = b.getAttribute("data-t");
                var da = b.getAttribute("data-a");
                if (dt !== null) state.t = parseInt(dt, 10);
                if (da !== null) state.a = parseInt(da, 10);
                update();
            }

            for (i = 0; i < btns.length; i++) {
                btns[i].addEventListener("click", onClick);
            }
            update();
        }
    });
})();

/* sim:en-passive-machine - 능동태 -> 수동태 변환기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ------------------------------------------------------------------
       순수 로직 (DOM 비의존, node 테스트 가능)
       - 예문 데이터: 능동태 역할별 단어 / 수동태 역할별 단어 / 단계 설명
       - 역할 색 대응: 주어=accent, 동사=warn, 목적어=info
         (수동태에서도 원래 역할의 색을 유지해 블록 이동을 보여준다)
       ------------------------------------------------------------------ */
    var SENTENCES = [
        {
            label: "Shakespeare wrote Hamlet.",
            active: {
                subject: ["Shakespeare"],
                verb: ["wrote"],
                object: ["Hamlet"]
            },
            passive: {
                subject: ["Hamlet"],
                verb: ["was", "written"],
                agent: ["by", "Shakespeare"]
            },
            hints: ["새 주어", "be + p.p.", "by + 목적격"],
            activeKo: "셰익스피어가 햄릿을 썼다.",
            passiveKo: "햄릿은 셰익스피어에 의해 쓰였다.",
            steps: [
                "능동태의 목적어 'Hamlet'(파랑)을 수동태의 주어 자리로 옮깁니다.",
                "동사 'wrote'(과거)를 'was written'으로 바꿉니다. 시제(과거)는 be동사 'was'가 이어받고, 본동사는 과거분사 'written'(write-wrote-written)이 됩니다.",
                "능동태의 주어 'Shakespeare'는 'by Shakespeare'가 되어 문장 끝으로 갑니다."
            ]
        },
        {
            label: "He bought a new car.",
            active: {
                subject: ["He"],
                verb: ["bought"],
                object: ["a", "new", "car"]
            },
            passive: {
                subject: ["A", "new", "car"],
                verb: ["was", "bought"],
                agent: ["by", "him"]
            },
            hints: ["새 주어", "be + p.p.", "by + 목적격"],
            activeKo: "그가 새 차를 샀다.",
            passiveKo: "새 차가 그에 의해 구매되었다.",
            steps: [
                "능동태의 목적어 'a new car'(파랑)를 수동태의 주어 자리로 옮깁니다. 문장 맨 앞이므로 'A new car'로 대문자가 됩니다.",
                "동사 'bought'(과거)를 'was bought'(be동사 과거 + 과거분사)로 바꿉니다. buy-bought-bought, 시제는 그대로 과거입니다.",
                "능동태의 주어 'He'(주격)는 by 뒤에서 목적격 'him'으로 바뀝니다. by 뒤에는 반드시 목적격이 옵니다."
            ]
        },
        {
            label: "They will finish the work.",
            active: {
                subject: ["They"],
                verb: ["will", "finish"],
                object: ["the", "work"]
            },
            passive: {
                subject: ["The", "work"],
                verb: ["will", "be", "finished"],
                agent: ["by", "them"]
            },
            hints: ["새 주어", "will be + p.p.", "by + 목적격"],
            activeKo: "그들은 그 일을 끝낼 것이다.",
            passiveKo: "그 일은 그들에 의해 끝내질 것이다.",
            steps: [
                "능동태의 목적어 'the work'(파랑)를 수동태의 주어 자리로 옮깁니다. 문장 맨 앞이므로 'The work'가 됩니다.",
                "조동사 will이 있으면 'will + be + 과거분사' 꼴이 됩니다. 'will finish'가 'will be finished'로 바뀌고 미래 시제는 그대로 유지됩니다.",
                "능동태의 주어 'They'(주격)는 by 뒤에서 목적격 'them'으로 바뀝니다."
            ]
        }
    ];

    /* 수동태 슬롯 순서: 원래 역할 기준 (object -> verb -> subject) */
    var SLOTS = [
        { role: "object", at: 1, key: "subject" },
        { role: "verb", at: 2, key: "verb" },
        { role: "subject", at: 3, key: "agent" }
    ];

    function joinWords(words) {
        return words.join(" ");
    }

    function activeSentenceText(s) {
        return joinWords(s.active.subject.concat(s.active.verb, s.active.object)) + ".";
    }

    function passiveSentenceText(s) {
        return joinWords(s.passive.subject.concat(s.passive.verb, s.passive.agent)) + ".";
    }

    /* 수동태 슬롯 상태: 아직 안 채워짐 / 이번 단계에 채워짐(강조) / 채워짐 */
    function slotState(at, step) {
        if (step < at) return "empty";
        if (step === at) return "hot";
        return "filled";
    }

    /* 능동태 블록 상태: 평소 / 이번 단계에 이동 중(강조) / 이미 이동함(흐리게) */
    function activeRoleState(role, step) {
        var at = role === "object" ? 1 : (role === "verb" ? 2 : 3);
        if (step === at) return "hot";
        if (step > at) return "done";
        return "normal";
    }

    function stepMessage(s, step) {
        if (step <= 0) {
            return "'다음 단계'를 누르면 목적어 이동부터 3단계로 변환이 진행됩니다.";
        }
        var msg = step + "단계: " + s.steps[step - 1];
        if (step >= 3) {
            msg += " 변환 완료!";
        }
        return msg;
    }

    var logic = {
        SENTENCES: SENTENCES,
        SLOTS: SLOTS,
        joinWords: joinWords,
        activeSentenceText: activeSentenceText,
        passiveSentenceText: passiveSentenceText,
        slotState: slotState,
        activeRoleState: activeRoleState,
        stepMessage: stepMessage
    };

    window.SIM.register("en-passive-machine", {
        title: "능동태 -> 수동태 변환기",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="pm-field">예문 '
                +         '<select class="sim__select pm-select" aria-label="변환할 능동태 예문 선택"></select>'
                +     '</label>'
                +     '<span class="sim__chip pm-stepchip">단계 0/3</span>'
                + '</div>'
                + '<div class="pm-stage">'
                +     '<div class="pm-line">'
                +         '<span class="pm-rolechip pm-rolechip--active">능동태</span>'
                +         '<div class="pm-tokens pm-active-tokens"></div>'
                +         '<span class="pm-speak pm-speak-active"></span>'
                +     '</div>'
                +     '<p class="pm-ko pm-active-ko"></p>'
                +     '<div class="pm-arrow" aria-hidden="true">&#8595; 변환 &#8595;</div>'
                +     '<div class="pm-line">'
                +         '<span class="pm-rolechip pm-rolechip--passive">수동태</span>'
                +         '<div class="pm-tokens pm-passive-tokens"></div>'
                +     '</div>'
                + '</div>'
                + '<div class="pm-live" aria-live="polite">'
                +     '<p class="pm-msg"></p>'
                +     '<div class="pm-result" hidden>'
                +         '<div class="pm-line">'
                +             '<strong class="pm-result-en"></strong>'
                +             '<span class="pm-speak pm-speak-passive"></span>'
                +         '</div>'
                +         '<p class="pm-ko pm-result-ko"></p>'
                +     '</div>'
                + '</div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary pm-next" aria-label="다음 단계 진행">다음 단계</button>'
                +     '<button type="button" class="sim__btn pm-reset" aria-label="변환 처음부터 다시 시작">처음부터</button>'
                + '</div>'
                + '<p class="sim__note pm-legend">'
                +     '<span class="pm-key"><span class="pm-swatch pm-swatch--subject" aria-hidden="true"></span>주어</span>'
                +     '<span class="pm-key"><span class="pm-swatch pm-swatch--verb" aria-hidden="true"></span>동사</span>'
                +     '<span class="pm-key"><span class="pm-swatch pm-swatch--object" aria-hidden="true"></span>목적어</span>'
                +     '<span>같은 색 블록이 수동태에서 어디로 가는지 따라가 보세요.</span>'
                + '</p>';

            var select = root.querySelector(".pm-select");
            var stepChip = root.querySelector(".pm-stepchip");
            var activeBox = root.querySelector(".pm-active-tokens");
            var passiveBox = root.querySelector(".pm-passive-tokens");
            var activeKo = root.querySelector(".pm-active-ko");
            var speakActiveBox = root.querySelector(".pm-speak-active");
            var msg = root.querySelector(".pm-msg");
            var result = root.querySelector(".pm-result");
            var resultEn = root.querySelector(".pm-result-en");
            var resultKo = root.querySelector(".pm-result-ko");
            var speakPassiveBox = root.querySelector(".pm-speak-passive");
            var nextBtn = root.querySelector(".pm-next");
            var resetBtn = root.querySelector(".pm-reset");

            var state = { idx: 0, step: 0 };

            var i;
            for (i = 0; i < SENTENCES.length; i++) {
                var opt = document.createElement("option");
                opt.value = String(i);
                opt.textContent = SENTENCES[i].label;
                select.appendChild(opt);
            }

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            /* 발음 버튼 - 클릭 처리는 app.js 전역 위임이 담당하므로 여기서는 만들기만 한다 */
            function makeSpeakBtn(text) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "speak-btn";
                b.setAttribute("aria-label", "발음 듣기");
                b.setAttribute("aria-pressed", "false");
                b.setAttribute("data-speak-text", text);
                var icon = document.createElement("span");
                icon.setAttribute("aria-hidden", "true");
                icon.textContent = "🔊";
                b.appendChild(icon);
                return b;
            }

            function makeToken(word, role, stateName) {
                var t = document.createElement("span");
                t.className = "pm-tok pm-tok--" + role;
                if (stateName === "hot") t.className += " pm-tok--hot";
                if (stateName === "done") t.className += " pm-tok--done";
                t.textContent = word;
                return t;
            }

            function makePunct() {
                var t = document.createElement("span");
                t.className = "pm-tok pm-tok--punct";
                t.textContent = ".";
                return t;
            }

            function renderActive(s, step) {
                clearNode(activeBox);
                var roles = ["subject", "verb", "object"];
                var j, k, words;
                for (j = 0; j < roles.length; j++) {
                    words = s.active[roles[j]];
                    for (k = 0; k < words.length; k++) {
                        activeBox.appendChild(
                            makeToken(words[k], roles[j], activeRoleState(roles[j], step))
                        );
                    }
                }
                activeBox.appendChild(makePunct());
            }

            function renderPassive(s, step) {
                clearNode(passiveBox);
                var j, k, slot, st, words;
                for (j = 0; j < SLOTS.length; j++) {
                    slot = SLOTS[j];
                    st = slotState(slot.at, step);
                    if (st === "empty") {
                        var ph = document.createElement("span");
                        ph.className = "pm-tok pm-slot--empty";
                        ph.textContent = s.hints[j];
                        passiveBox.appendChild(ph);
                    } else {
                        words = s.passive[slot.key];
                        for (k = 0; k < words.length; k++) {
                            passiveBox.appendChild(
                                makeToken(words[k], slot.role, st === "hot" ? "hot" : "normal")
                            );
                        }
                    }
                }
                if (step >= 3) {
                    passiveBox.appendChild(makePunct());
                }
            }

            function render() {
                var s = SENTENCES[state.idx];
                renderActive(s, state.step);
                renderPassive(s, state.step);

                activeKo.textContent = "해석: " + s.activeKo;
                clearNode(speakActiveBox);
                speakActiveBox.appendChild(makeSpeakBtn(activeSentenceText(s)));

                stepChip.textContent = "단계 " + state.step + "/3";
                msg.textContent = stepMessage(s, state.step);
                nextBtn.disabled = state.step >= 3;

                if (state.step >= 3) {
                    resultEn.textContent = passiveSentenceText(s);
                    resultKo.textContent = "해석: " + s.passiveKo;
                    clearNode(speakPassiveBox);
                    speakPassiveBox.appendChild(makeSpeakBtn(passiveSentenceText(s)));
                    result.hidden = false;
                } else {
                    result.hidden = true;
                }
            }

            select.addEventListener("change", function () {
                var v = parseInt(select.value, 10);
                state.idx = isNaN(v) ? 0 : v;
                state.step = 0;
                render();
            });

            nextBtn.addEventListener("click", function () {
                if (state.step < 3) {
                    state.step += 1;
                    render();
                }
            });

            resetBtn.addEventListener("click", function () {
                state.step = 0;
                render();
            });

            render();
        }
    });
})();

/* sim:en-verbal-quiz - 동명사 vs to부정사 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 문제 은행 (대학영어 2-5 준동사: 목적어 형태 구분) ---- */
    var BANK = [
        { verb: "enjoy", answer: "ger", example: "I enjoy swimming." },
        { verb: "finish", answer: "ger", example: "I finished doing my homework." },
        { verb: "mind", answer: "ger", example: "Do you mind opening the window?" },
        { verb: "avoid", answer: "ger", example: "She avoids eating fast food." },
        { verb: "give up", answer: "ger", example: "He gave up smoking last year." },
        { verb: "keep", answer: "ger", example: "They kept talking all night." },
        { verb: "want", answer: "inf", example: "I want to go home." },
        { verb: "hope", answer: "inf", example: "I hope to see you again." },
        { verb: "decide", answer: "inf", example: "We decided to take a break." },
        { verb: "plan", answer: "inf", example: "They plan to visit Korea." },
        { verb: "promise", answer: "inf", example: "She promised to call me tonight." },
        { verb: "expect", answer: "inf", example: "I expect to pass the exam." }
    ];

    /* ---- 순수 로직 (DOM 비의존, 테스트 대상) ---- */
    var logic = {
        /* Fisher-Yates 셔플. 원본은 그대로 두고 새 배열을 돌려준다.
           rng는 0 이상 1 미만 난수를 주는 함수(테스트용 주입 가능). */
        shuffle: function (arr, rng) {
            var a = arr.slice();
            var r = rng || Math.random;
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(r() * (i + 1));
                var tmp = a[i];
                a[i] = a[j];
                a[j] = tmp;
            }
            return a;
        },
        /* 선택(choice: "ger" | "inf")이 정답인지 판정 */
        judge: function (item, choice) {
            return item.answer === choice;
        },
        /* 정답 코드 -> 표시용 라벨 */
        formLabel: function (answer) {
            return answer === "ger" ? "동명사(-ing)" : "to부정사";
        },
        /* 점수 비율에 따른 결과 코멘트 */
        grade: function (score, total) {
            var ratio = total > 0 ? score / total : 0;
            if (ratio >= 1) return "완벽합니다! 목적어 형태를 전부 구분했어요.";
            if (ratio >= 0.75) return "좋아요! 틀린 동사만 한 번 더 확인해 보세요.";
            if (ratio >= 0.5) return "절반 이상 맞혔어요. 동명사/to부정사 동사 목록을 다시 복습해 보세요.";
            return "아직 헷갈리네요. 본문의 동사 목록을 복습한 뒤 다시 풀어 보세요.";
        }
    };

    window.SIM.register("en-verbal-quiz", {
        title: "동명사 vs to부정사 퀴즈",
        _logic: logic,
        _bank: BANK,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<span class="sim__chip evq-progress">문제 1 / ' + BANK.length + '</span>'
                +     '<span class="sim__chip evq-score">맞힘 0 / ' + BANK.length + '</span>'
                + '</div>'
                + '<div class="evq-card">'
                +     '<p class="evq-question">이 동사는 목적어로 어떤 형태를 취할까요?</p>'
                +     '<div class="evq-verb"></div>'
                +     '<div class="sim__row evq-choices">'
                +         '<button type="button" class="sim__btn evq-choice" data-choice="ger" aria-label="동명사를 정답으로 선택">동명사 (-ing)</button>'
                +         '<button type="button" class="sim__btn evq-choice" data-choice="inf" aria-label="to부정사를 정답으로 선택">to부정사</button>'
                +     '</div>'
                +     '<div class="evq-feedback" aria-live="polite">'
                +         '<p class="evq-verdict"></p>'
                +         '<div class="evq-example" hidden>'
                +             '<span class="evq-sentence"></span>'
                +             '<button type="button" class="speak-btn" aria-label="발음 듣기" aria-pressed="false" data-speak-text=""><span aria-hidden="true">&#128266;</span></button>'
                +         '</div>'
                +     '</div>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary evq-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="evq-result" aria-live="polite" hidden>'
                +     '<p class="evq-result-line"></p>'
                +     '<p class="evq-result-msg"></p>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary evq-retry">다시 풀기</button>'
                +     '</div>'
                + '</div>'
                + '<p class="sim__note">참고: remember처럼 둘 다 목적어로 취하지만 뜻이 갈리는 동사도 있습니다. '
                + 'remember to lock(앞으로 잠가야 할 일을 기억하다) vs remember locking(이미 잠갔던 일을 기억하다).</p>';

            var progressEl = root.querySelector(".evq-progress");
            var scoreEl = root.querySelector(".evq-score");
            var card = root.querySelector(".evq-card");
            var verbEl = root.querySelector(".evq-verb");
            var choiceBtns = root.querySelectorAll(".evq-choice");
            var verdictEl = root.querySelector(".evq-verdict");
            var exampleEl = root.querySelector(".evq-example");
            var sentenceEl = root.querySelector(".evq-sentence");
            var speakBtn = root.querySelector(".speak-btn");
            var nextBtn = root.querySelector(".evq-next");
            var resultBox = root.querySelector(".evq-result");
            var resultLine = root.querySelector(".evq-result-line");
            var resultMsg = root.querySelector(".evq-result-msg");
            var retryBtn = root.querySelector(".evq-retry");

            var state = { order: [], index: 0, score: 0, answered: false };

            function updateStatus() {
                var pos = state.index < state.order.length ? state.index + 1 : state.order.length;
                progressEl.textContent = "문제 " + pos + " / " + state.order.length;
                scoreEl.textContent = "맞힘 " + state.score + " / " + state.order.length;
            }

            function showQuestion() {
                var item = state.order[state.index];
                state.answered = false;
                verbEl.textContent = item.verb;
                verdictEl.textContent = "";
                verdictEl.className = "evq-verdict";
                sentenceEl.textContent = "";
                speakBtn.setAttribute("data-speak-text", "");
                exampleEl.hidden = true;
                nextBtn.hidden = true;
                for (var i = 0; i < choiceBtns.length; i++) {
                    choiceBtns[i].disabled = false;
                    choiceBtns[i].className = "sim__btn evq-choice";
                }
                updateStatus();
            }

            function onChoice(btn) {
                if (state.answered) return;
                state.answered = true;
                var item = state.order[state.index];
                var choice = btn.getAttribute("data-choice");
                var ok = logic.judge(item, choice);
                if (ok) state.score += 1;
                for (var i = 0; i < choiceBtns.length; i++) {
                    var b = choiceBtns[i];
                    b.disabled = true;
                    if (b.getAttribute("data-choice") === item.answer) {
                        b.className = "sim__btn evq-choice is-correct";
                    } else if (b === btn) {
                        b.className = "sim__btn evq-choice is-wrong";
                    }
                }
                verdictEl.className = "evq-verdict " + (ok ? "is-ok" : "is-no");
                verdictEl.textContent = (ok ? "정답입니다! " : "오답입니다. ")
                    + item.verb + " + " + logic.formLabel(item.answer);
                sentenceEl.textContent = item.example;
                speakBtn.setAttribute("data-speak-text", item.example);
                speakBtn.setAttribute("aria-pressed", "false");
                exampleEl.hidden = false;
                nextBtn.textContent = state.index + 1 >= state.order.length ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
                updateStatus();
            }

            function showResult() {
                card.hidden = true;
                resultBox.hidden = false;
                resultLine.textContent = state.order.length + "문제 중 " + state.score + "개 정답";
                resultMsg.textContent = logic.grade(state.score, state.order.length);
                progressEl.textContent = "완료";
                scoreEl.textContent = "맞힘 " + state.score + " / " + state.order.length;
            }

            function start() {
                state.order = logic.shuffle(BANK);
                state.index = 0;
                state.score = 0;
                resultBox.hidden = true;
                card.hidden = false;
                showQuestion();
            }

            function makeChoiceHandler(btn) {
                return function () {
                    onChoice(btn);
                };
            }

            for (var i = 0; i < choiceBtns.length; i++) {
                choiceBtns[i].addEventListener("click", makeChoiceHandler(choiceBtns[i]));
            }

            nextBtn.addEventListener("click", function () {
                state.index += 1;
                if (state.index >= state.order.length) {
                    showResult();
                } else {
                    showQuestion();
                }
            });

            retryBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:en-relative-picker - 관계사 고르기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 문제 은행 (DOM 비의존 데이터) ---- */
    var BANK = [
        {
            before: "I know the man ",
            after: " lives next door.",
            choices: ["who", "which", "whose", "what"],
            answer: "who",
            type: "사람 + 주격",
            explain: "선행사 the man은 사람이고, 빈칸 뒤에 동사 lives가 바로 이어지므로 주격 관계대명사 who를 쓴다.",
            ko: "옆집에 사는 그 남자를 안다."
        },
        {
            before: "This is the book ",
            after: " I bought.",
            choices: ["who", "which", "whose", "what"],
            answer: "which",
            type: "사물 + 목적격",
            explain: "선행사 the book은 사물이고, 뒤 절에서 bought의 목적어 자리가 비어 있으므로 목적격 관계대명사 which를 쓴다.",
            ko: "이것은 내가 산 책이다."
        },
        {
            before: "She has a friend ",
            after: " father is a doctor.",
            choices: ["who", "whose", "which", "that"],
            answer: "whose",
            type: "소유격",
            explain: "father가 a friend의 소유(친구의 아버지)이므로 소유격 관계대명사 whose를 쓴다. 소유격은 사람·사물 모두 whose다.",
            ko: "그녀에게는 아버지가 의사인 친구가 있다."
        },
        {
            before: "Tell me ",
            after: " you want.",
            choices: ["that", "what", "which", "who"],
            answer: "what",
            type: "선행사 포함",
            explain: "빈칸 앞에 선행사가 없다. 선행사를 스스로 포함하는 관계대명사 what(= the thing which)을 쓴다.",
            ko: "네가 원하는 것을 말해 줘."
        },
        {
            before: "the house ",
            after: " I live",
            choices: ["where", "which", "when", "why"],
            answer: "where",
            type: "관계부사 (장소)",
            explain: "선행사 the house는 장소이고, 뒤 절(I live)이 완전한 문장이므로 장소 관계부사 where(= in which)를 쓴다.",
            ko: "내가 사는 집"
        },
        {
            before: "the day ",
            after: " we met",
            choices: ["where", "when", "why", "how"],
            answer: "when",
            type: "관계부사 (시간)",
            explain: "선행사 the day는 시간이므로 시간 관계부사 when(= on which)을 쓴다.",
            ko: "우리가 만난 날"
        },
        {
            before: "the reason ",
            after: " he left",
            choices: ["where", "when", "why", "how"],
            answer: "why",
            type: "관계부사 (이유)",
            explain: "선행사 the reason은 이유이므로 이유 관계부사 why(= for which)를 쓴다.",
            ko: "그가 떠난 이유"
        },
        {
            before: "He has two sons, ",
            after: " are doctors.",
            choices: ["who", "that", "what", "whose"],
            answer: "who",
            type: "계속적 용법",
            explain: "콤마 뒤 계속적 용법에는 that을 쓸 수 없다. 선행사 two sons(사람)를 보충 설명하면서 동사 are의 주어가 되므로 주격 who를 쓴다.",
            ko: "그에게는 아들이 둘 있는데, 둘 다 의사다."
        }
    ];

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* 선택한 보기가 정답인지 판정 */
        judge: function (q, choice) {
            return choice === q.answer;
        },
        /* 빈칸에 word를 넣어 완성 문장(또는 구)을 만든다 */
        fill: function (q, word) {
            return q.before + word + q.after;
        },
        /* Fisher-Yates 셔플. rng를 주입해 테스트 가능 */
        shuffle: function (arr, rng) {
            var a = arr.slice();
            var r = rng || Math.random;
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(r() * (i + 1));
                var t = a[i];
                a[i] = a[j];
                a[j] = t;
            }
            return a;
        },
        /* 결과 배열에서 점수 집계 */
        score: function (results) {
            var c = 0;
            for (var i = 0; i < results.length; i++) {
                if (results[i].correct) c++;
            }
            return {
                correct: c,
                total: results.length,
                percent: results.length ? Math.round((c * 100) / results.length) : 0
            };
        },
        /* 점수대별 한 줄 평 */
        grade: function (correct, total) {
            if (correct === total) return "완벽합니다! 관계사 개념이 확실히 잡혔어요.";
            if (correct >= total * 0.75) return "잘했어요! 틀린 문제의 해설만 다시 확인해 보세요.";
            if (correct >= total * 0.5) return "절반 이상 맞혔어요. 선행사와 격 표를 한 번 더 복습해 보세요.";
            return "관계대명사 표(선행사 x 격)부터 차근차근 다시 복습해 보세요.";
        }
    };

    window.SIM.register("en-relative-picker", {
        title: "관계사 고르기",
        _logic: logic,
        _bank: BANK,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="erp-quiz">'
                +     '<div class="sim__row erp-status">'
                +         '<span class="sim__chip erp-progress"></span>'
                +         '<span class="sim__chip erp-score"></span>'
                +     '</div>'
                +     '<p class="sim__note erp-guide">빈칸에 들어갈 관계사를 골라 보세요. 선행사가 무엇인지, 어떤 격이 필요한지 먼저 따져 보면 좋습니다.</p>'
                +     '<p class="erp-sentence" aria-label="문제 문장"></p>'
                +     '<div class="erp-choices" role="group" aria-label="보기 선택"></div>'
                +     '<div class="erp-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row erp-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary erp-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="erp-summary" aria-live="polite" hidden></div>';

            var progressEl = root.querySelector(".erp-progress");
            var scoreEl = root.querySelector(".erp-score");
            var sentenceEl = root.querySelector(".erp-sentence");
            var choicesEl = root.querySelector(".erp-choices");
            var feedbackEl = root.querySelector(".erp-feedback");
            var nextBtn = root.querySelector(".erp-next");
            var quizEl = root.querySelector(".erp-quiz");
            var summaryEl = root.querySelector(".erp-summary");

            var state = {
                order: [],
                pos: 0,
                results: [],
                answered: false
            };

            /* 보기 버튼 4개를 한 번만 만든다 (문제마다 textContent만 교체) */
            var choiceBtns = [];
            (function () {
                for (var i = 0; i < 4; i++) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.className = "sim__btn erp-choice";
                    choicesEl.appendChild(b);
                    choiceBtns.push(b);
                    bindChoice(b, i);
                }
            })();

            function bindChoice(btn, idx) {
                btn.addEventListener("click", function () {
                    onChoice(idx);
                });
            }

            nextBtn.addEventListener("click", function () {
                if (state.pos < state.order.length - 1) {
                    state.pos++;
                    state.answered = false;
                    renderQuestion();
                } else {
                    showSummary();
                }
            });

            /* 발음 버튼: 클릭 처리는 app.js 전역 위임이 담당 (여기서 핸들러 안 닮) */
            function speakBtn(text) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "speak-btn";
                b.setAttribute("aria-label", "발음 듣기");
                b.setAttribute("aria-pressed", "false");
                b.setAttribute("data-speak-text", text);
                var s = document.createElement("span");
                s.setAttribute("aria-hidden", "true");
                s.textContent = "🔊";
                b.appendChild(s);
                return b;
            }

            /* 완성 문장 표시용 span (정답 단어 강조) */
            function fullSentenceEl(q) {
                var span = document.createElement("span");
                span.className = "erp-en";
                span.appendChild(document.createTextNode(q.before));
                var key = document.createElement("strong");
                key.className = "erp-key";
                key.textContent = q.answer;
                span.appendChild(key);
                span.appendChild(document.createTextNode(q.after));
                return span;
            }

            function updateChips() {
                progressEl.textContent = "문제 " + (state.pos + 1) + " / " + state.order.length;
                scoreEl.textContent = "맞힘 " + logic.score(state.results).correct;
            }

            function renderQuestion() {
                var q = state.order[state.pos];
                updateChips();

                sentenceEl.textContent = "";
                sentenceEl.appendChild(document.createTextNode(q.before));
                var blank = document.createElement("span");
                blank.className = "erp-blank";
                blank.textContent = "?";
                sentenceEl.appendChild(blank);
                sentenceEl.appendChild(document.createTextNode(q.after));

                for (var i = 0; i < choiceBtns.length; i++) {
                    choiceBtns[i].textContent = q.choices[i];
                    choiceBtns[i].disabled = false;
                    choiceBtns[i].className = "sim__btn erp-choice";
                }

                feedbackEl.textContent = "";
                nextBtn.hidden = true;
            }

            function onChoice(idx) {
                if (state.answered) return;
                state.answered = true;

                var q = state.order[state.pos];
                var choice = q.choices[idx];
                var correct = logic.judge(q, choice);
                state.results.push({ q: q, chosen: choice, correct: correct });

                for (var i = 0; i < choiceBtns.length; i++) {
                    choiceBtns[i].disabled = true;
                    if (q.choices[i] === q.answer) {
                        choiceBtns[i].className = "sim__btn erp-choice is-correct";
                    } else if (i === idx) {
                        choiceBtns[i].className = "sim__btn erp-choice is-wrong";
                    }
                }

                /* 문장의 빈칸을 정답으로 채워 보여 준다 */
                var blank = sentenceEl.querySelector(".erp-blank");
                if (blank) {
                    blank.textContent = q.answer;
                    blank.className = "erp-blank erp-blank--filled";
                }

                /* 판정 + 해설 + 완성 문장(발음 버튼) + 해석 */
                feedbackEl.textContent = "";

                var verdict = document.createElement("p");
                verdict.className = "erp-verdict " + (correct ? "is-ok" : "is-no");
                verdict.textContent = correct
                    ? "정답입니다!"
                    : "오답입니다. 정답은 " + q.answer + " 입니다.";
                feedbackEl.appendChild(verdict);

                var typeChip = document.createElement("span");
                typeChip.className = "sim__chip";
                typeChip.textContent = q.type;
                feedbackEl.appendChild(typeChip);

                var explain = document.createElement("p");
                explain.className = "erp-explain";
                explain.textContent = q.explain;
                feedbackEl.appendChild(explain);

                var fullRow = document.createElement("div");
                fullRow.className = "erp-full";
                fullRow.appendChild(fullSentenceEl(q));
                fullRow.appendChild(speakBtn(logic.fill(q, q.answer)));
                feedbackEl.appendChild(fullRow);

                var ko = document.createElement("p");
                ko.className = "sim__note";
                ko.textContent = "해석: " + q.ko;
                feedbackEl.appendChild(ko);

                updateChips();
                nextBtn.textContent = state.pos === state.order.length - 1
                    ? "결과 보기"
                    : "다음 문제";
                nextBtn.hidden = false;
            }

            function showSummary() {
                quizEl.hidden = true;
                summaryEl.hidden = false;
                summaryEl.textContent = "";

                var s = logic.score(state.results);

                var scoreLine = document.createElement("p");
                scoreLine.className = "erp-score-line";
                scoreLine.textContent = s.total + "문제 중 " + s.correct + "개 정답 (" + s.percent + "%)";
                summaryEl.appendChild(scoreLine);

                var msg = document.createElement("p");
                msg.className = "sim__note";
                msg.textContent = logic.grade(s.correct, s.total);
                summaryEl.appendChild(msg);

                var list = document.createElement("ul");
                list.className = "erp-result-list";
                for (var i = 0; i < state.results.length; i++) {
                    var r = state.results[i];
                    var li = document.createElement("li");
                    li.className = "erp-result-item";

                    var mark = document.createElement("span");
                    mark.className = "erp-mark " + (r.correct ? "is-ok" : "is-no");
                    mark.textContent = r.correct ? "O" : "X";
                    mark.setAttribute("aria-label", r.correct ? "정답" : "오답");
                    li.appendChild(mark);

                    li.appendChild(fullSentenceEl(r.q));
                    li.appendChild(speakBtn(logic.fill(r.q, r.q.answer)));

                    if (!r.correct) {
                        var my = document.createElement("span");
                        my.className = "erp-mywrong";
                        my.textContent = "내 답: " + r.chosen;
                        li.appendChild(my);
                    }
                    list.appendChild(li);
                }
                summaryEl.appendChild(list);

                var nav = document.createElement("div");
                nav.className = "sim__row";
                var retry = document.createElement("button");
                retry.type = "button";
                retry.className = "sim__btn sim__btn--primary";
                retry.textContent = "다시 풀기 (순서 섞기)";
                retry.setAttribute("aria-label", "문제 순서를 섞어서 다시 풀기");
                retry.addEventListener("click", function () {
                    startRound(true);
                });
                nav.appendChild(retry);
                summaryEl.appendChild(nav);
            }

            function startRound(doShuffle) {
                var qs = BANK.slice();
                if (doShuffle) {
                    qs = logic.shuffle(qs);
                    for (var i = 0; i < qs.length; i++) {
                        var q = qs[i];
                        qs[i] = {
                            before: q.before,
                            after: q.after,
                            choices: logic.shuffle(q.choices),
                            answer: q.answer,
                            type: q.type,
                            explain: q.explain,
                            ko: q.ko
                        };
                    }
                }
                state.order = qs;
                state.pos = 0;
                state.results = [];
                state.answered = false;
                summaryEl.hidden = true;
                summaryEl.textContent = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            startRound(false);
        }
    });
})();

/* sim:en-conditional-lab - 가정법 실험실 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 데이터/로직 (DOM 비의존) ---- */
    var logic = {
        /* 모드 표시 순서: 종류 탭 3개 + 보조 칩 2개 */
        modeKeys: ["past", "perfect", "mixed", "wish", "asif"],
        tabKeys: ["past", "perfect", "mixed"],
        chipKeys: ["wish", "asif"],
        modes: {
            past: {
                name: "가정법 과거",
                meaning: "현재 사실의 반대",
                formula: [
                    { role: "cond", name: "if절", form: "if + 과거동사 (were)" },
                    { role: "main", name: "주절", form: "would/could/might + 동사원형" }
                ],
                parts: [
                    { role: "cond", text: "If I were rich" },
                    { role: "plain", text: ", " },
                    { role: "main", text: "I would buy a house." }
                ],
                korean: "내가 부자라면 집을 살 텐데.",
                note: "지금 부자가 아니라는 현재 사실의 반대를 가정합니다. be동사는 인칭과 관계없이 were를 씁니다."
            },
            perfect: {
                name: "가정법 과거완료",
                meaning: "과거 사실의 반대",
                formula: [
                    { role: "cond", name: "if절", form: "if + had p.p." },
                    { role: "main", name: "주절", form: "would have p.p." }
                ],
                parts: [
                    { role: "cond", text: "If I had studied harder" },
                    { role: "plain", text: ", " },
                    { role: "main", text: "I would have passed." }
                ],
                korean: "더 열심히 공부했다면 합격했을 텐데.",
                note: "과거에 열심히 공부하지 않았다는 과거 사실의 반대를 가정합니다. 과거보다 한 단계 더 낮춘 과거완료(had p.p.)를 씁니다."
            },
            mixed: {
                name: "혼합 가정법",
                meaning: "과거 가정 -> 현재 결과",
                formula: [
                    { role: "cond", name: "if절", form: "if + had p.p." },
                    { role: "main", name: "주절", form: "would + 동사원형" }
                ],
                parts: [
                    { role: "cond", text: "If I had taken the medicine" },
                    { role: "plain", text: ", " },
                    { role: "main", text: "I would not be sick now." }
                ],
                korean: "그때 약을 먹었다면 지금 아프지 않을 텐데.",
                note: "if절은 과거(had p.p.), 주절은 현재(동사원형)로 시제가 섞입니다. now 같은 현재 시간 표현이 단서가 됩니다."
            },
            wish: {
                name: "I wish",
                meaning: "현재의 아쉬움",
                formula: [
                    { role: "cond", name: "신호", form: "I wish" },
                    { role: "main", name: "소망절", form: "주어 + 과거동사 (한 단계 낮춤)" }
                ],
                parts: [
                    { role: "cond", text: "I wish" },
                    { role: "plain", text: " " },
                    { role: "main", text: "I knew her name." }
                ],
                korean: "그녀의 이름을 안다면 좋을 텐데.",
                note: "이룰 수 없는 일에 대한 아쉬움을 나타냅니다. 지금 모른다는 사실을 시제 한 단계 낮춘 knew로 표현합니다."
            },
            asif: {
                name: "as if",
                meaning: "마치 ~인 것처럼",
                formula: [
                    { role: "main", name: "주절", form: "주어 + 동사 (현재)" },
                    { role: "cond", name: "as if절", form: "as if + 과거동사 (were)" }
                ],
                parts: [
                    { role: "main", text: "He talks" },
                    { role: "plain", text: " " },
                    { role: "cond", text: "as if he were an expert." }
                ],
                korean: "그는 마치 전문가인 것처럼 말한다.",
                note: "사실이 아닌 것을 사실처럼 말할 때 씁니다. 실제로는 전문가가 아니므로 시제를 낮춰 were를 씁니다."
            }
        },
        /* 모드 키 -> 모드 객체 (없으면 null) */
        getMode: function (key) {
            return this.modes.hasOwnProperty(key) ? this.modes[key] : null;
        },
        /* 예문 조각을 이어 발음용 전체 영어 문장을 만든다 */
        joinEnglish: function (parts) {
            var s = "";
            for (var i = 0; i < parts.length; i++) {
                s += parts[i].text;
            }
            return s;
        },
        /* data-speak-text 안전성 검사: 영어 문장 문자만 허용 */
        isEnglishOnly: function (s) {
            return /^[A-Za-z ,.!?'-]+$/.test(s);
        }
    };

    window.SIM.register("en-conditional-lab", {
        title: "가정법 실험실",
        _logic: logic,
        build: function (root) {
            var i;
            var tabsHtml = "";
            for (i = 0; i < logic.tabKeys.length; i++) {
                var tk = logic.tabKeys[i];
                tabsHtml += '<button type="button" class="sim__tab'
                    + (i === 0 ? " active" : "")
                    + '" data-mode="' + tk + '" role="tab" aria-selected="'
                    + (i === 0 ? "true" : "false") + '">'
                    + logic.modes[tk].name + '</button>';
            }
            var chipsHtml = "";
            for (i = 0; i < logic.chipKeys.length; i++) {
                var ck = logic.chipKeys[i];
                chipsHtml += '<button type="button" class="sim__btn ecl-chipbtn" data-mode="'
                    + ck + '" aria-pressed="false">' + logic.modes[ck].name + '</button>';
            }

            root.innerHTML = ""
                + '<div class="sim__tabs" role="tablist" aria-label="가정법 종류 선택">' + tabsHtml + '</div>'
                + '<div class="sim__row ecl-chips">'
                +     '<span class="ecl-chips__label">보조 표현</span>'
                +     chipsHtml
                + '</div>'
                + '<div class="ecl-card" aria-live="polite"></div>'
                + '<p class="ecl-keynote"><strong>핵심</strong>시제를 한 단계 과거로 낮추는 것이 가정법의 핵심</p>';

            var card = root.querySelector(".ecl-card");
            var buttons = root.querySelectorAll("[data-mode]");

            /* 선택한 모드의 공식 카드 + 의미 라벨 + 예문을 그린다 (모든 문자열은 위젯 내부 상수) */
            function renderCard(key) {
                var m = logic.getMode(key);
                if (!m) return;

                var blocks = [];
                for (var b = 0; b < m.formula.length; b++) {
                    var f = m.formula[b];
                    blocks.push('<div class="ecl-block ecl-block--' + f.role + '">'
                        + '<span class="ecl-block__name">' + f.name + '</span>'
                        + '<span class="ecl-block__form">' + f.form + '</span>'
                        + '</div>');
                }

                var partsHtml = "";
                for (var p = 0; p < m.parts.length; p++) {
                    var part = m.parts[p];
                    if (part.role === "plain") {
                        partsHtml += '<span>' + part.text + '</span>';
                    } else {
                        partsHtml += '<span class="ecl-part ecl-part--' + part.role + '">'
                            + part.text + '</span>';
                    }
                }
                var english = logic.joinEnglish(m.parts);

                card.innerHTML = ""
                    + '<div class="ecl-meta">'
                    +     '<span class="sim__chip">' + m.meaning + '</span>'
                    +     '<span class="ecl-modename">' + m.name + '</span>'
                    + '</div>'
                    + '<div class="ecl-formula">'
                    +     blocks.join('<span class="ecl-plus" aria-hidden="true">+</span>')
                    + '</div>'
                    + '<div class="ecl-sentence">'
                    +     '<span class="ecl-en" lang="en">' + partsHtml + '</span> '
                    +     '<button type="button" class="speak-btn" aria-label="발음 듣기" aria-pressed="false"'
                    +         ' data-speak-text="' + english + '">'
                    +         '<span aria-hidden="true">&#128266;</span>'
                    +     '</button>'
                    + '</div>'
                    + '<p class="ecl-korean">' + m.korean + '</p>'
                    + '<p class="sim__note">' + m.note + '</p>';
            }

            function setMode(key) {
                for (var j = 0; j < buttons.length; j++) {
                    var btn = buttons[j];
                    var on = btn.getAttribute("data-mode") === key;
                    btn.classList.toggle("active", on);
                    if (btn.getAttribute("role") === "tab") {
                        btn.setAttribute("aria-selected", on ? "true" : "false");
                    } else {
                        btn.setAttribute("aria-pressed", on ? "true" : "false");
                    }
                }
                renderCard(key);
            }

            function onClick(e) {
                setMode(e.currentTarget.getAttribute("data-mode"));
            }
            for (i = 0; i < buttons.length; i++) {
                buttons[i].addEventListener("click", onClick);
            }

            setMode("past");
        }
    });
})();

/* sim:en-agreement-quiz - 수일치 판정 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 문제 은행 (빈칸 문장, 동사 2개, 정답, 규칙명, 해설, 우리말 뜻) ---- */
    var QUESTIONS = [
        {
            s: "He ___ hard.",
            opts: ["works", "work"],
            answer: "works",
            rule: "단수 주어 + 단수 동사",
            tip: "3인칭 단수 주어(He) 뒤의 일반동사에는 -s를 붙입니다.",
            ko: "그는 열심히 일한다."
        },
        {
            s: "Swimming ___ fun.",
            opts: ["is", "are"],
            answer: "is",
            rule: "동명사 주어는 단수",
            tip: "동명사(-ing) 주어는 하나의 행위로 보아 단수 취급합니다.",
            ko: "수영은 재미있다."
        },
        {
            s: "Mathematics ___ difficult.",
            opts: ["is", "are"],
            answer: "is",
            rule: "학문명은 단수",
            tip: "-s로 끝나도 mathematics 같은 학문명은 단수 취급합니다.",
            ko: "수학은 어렵다."
        },
        {
            s: "Every student ___ a book.",
            opts: ["has", "have"],
            answer: "has",
            rule: "every + 명사는 단수",
            tip: "every 뒤에는 단수 명사가 오고 동사도 단수형을 씁니다.",
            ko: "모든 학생이 책을 한 권 가지고 있다."
        },
        {
            s: "Tom and Jane ___ friends.",
            opts: ["is", "are"],
            answer: "are",
            rule: "A and B는 복수",
            tip: "and로 연결된 두 주어는 복수 취급합니다.",
            ko: "Tom과 Jane은 친구다."
        },
        {
            s: "Most of the water ___ gone.",
            opts: ["is", "are"],
            answer: "is",
            rule: "부분 표현은 of 뒤 명사에 일치",
            tip: "most of 뒤의 water는 불가산 명사라 단수 동사를 씁니다.",
            ko: "물의 대부분이 사라졌다."
        },
        {
            s: "The number of cars ___ rising.",
            opts: ["is", "are"],
            answer: "is",
            rule: "The number of + 복수 명사는 단수",
            tip: "'~의 수'라는 뜻으로, 진짜 주어는 number(단수)입니다.",
            ko: "자동차의 수가 늘고 있다."
        },
        {
            s: "A number of cars ___ parked.",
            opts: ["is", "are"],
            answer: "are",
            rule: "A number of + 복수 명사는 복수",
            tip: "'많은 ~'이라는 뜻으로, 뒤의 복수 명사(cars)에 일치합니다.",
            ko: "많은 자동차가 주차되어 있다."
        },
        {
            s: "The box of apples ___ heavy.",
            opts: ["is", "are"],
            answer: "is",
            rule: "진짜 주어에 일치",
            tip: "of apples는 수식어일 뿐, 진짜 주어는 The box(단수)입니다.",
            ko: "사과가 든 상자는 무겁다."
        }
    ];

    /* 7번(The number of)과 8번(A number of)은 비교 학습 효과를 위해
       셔플할 때도 항상 이 순서로 붙여서 출제한다. (0 기준 인덱스 6, 7) */
    var PAIR_START = 6;

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        questions: QUESTIONS,
        pairStart: PAIR_START,
        /* pairStart와 pairStart+1을 한 단위로 묶어 Fisher-Yates 셔플한
           문제 인덱스 순서를 돌려준다. rnd는 [0,1) 난수 함수. */
        makeOrder: function (n, pairStart, rnd) {
            var units = [];
            var i, j, k, tmp;
            for (i = 0; i < n; i++) {
                if (i === pairStart && pairStart + 1 < n) {
                    units.push([i, i + 1]);
                    i++;
                } else {
                    units.push([i]);
                }
            }
            for (i = units.length - 1; i > 0; i--) {
                j = Math.floor(rnd() * (i + 1));
                tmp = units[i];
                units[i] = units[j];
                units[j] = tmp;
            }
            var order = [];
            for (i = 0; i < units.length; i++) {
                for (k = 0; k < units[i].length; k++) {
                    order.push(units[i][k]);
                }
            }
            return order;
        },
        /* 고른 동사가 정답인지 판정 */
        isCorrect: function (q, choice) {
            return choice === q.answer;
        },
        /* 빈칸(___)에 동사를 넣어 완성 문장을 만든다 */
        fillBlank: function (sentence, verb) {
            return sentence.replace("___", verb);
        },
        /* 점수대별 마무리 메시지 */
        summaryMsg: function (score, total) {
            if (score === total) {
                return "만점입니다! 수일치 규칙을 완벽하게 익혔어요.";
            }
            if (score >= Math.ceil(total * 0.7)) {
                return "잘했어요. 틀린 규칙만 다시 확인해 보세요.";
            }
            return "규칙 해설을 다시 읽고 한 번 더 도전해 보세요.";
        }
    };

    /* 영어 문장용 발음 버튼 (클릭 처리는 app.js 전역 위임 담당) */
    function speakBtnHtml(text) {
        return '<button type="button" class="speak-btn" aria-label="발음 듣기"'
            + ' aria-pressed="false" data-speak-text="' + text + '">'
            + '<span aria-hidden="true">&#128266;</span></button>';
    }

    window.SIM.register("en-agreement-quiz", {
        title: "수일치 판정 퀴즈",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="agq-status">'
                +     '<span class="sim__chip agq-progress">문제 1 / ' + QUESTIONS.length + '</span>'
                +     '<span class="sim__chip agq-score">점수 0</span>'
                + '</div>'
                + '<div class="agq-quiz">'
                +     '<p class="agq-sentence" lang="en"></p>'
                +     '<div class="sim__row agq-options" role="group" aria-label="빈칸에 들어갈 동사 선택"></div>'
                +     '<div class="agq-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row agq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary agq-next" hidden>다음 문제</button>'
                +         '<button type="button" class="sim__btn agq-restart" aria-label="퀴즈를 처음부터 다시 시작">처음부터</button>'
                +     '</div>'
                + '</div>'
                + '<div class="agq-summary" aria-live="polite" hidden></div>'
                + '<p class="sim__note">빈칸에 알맞은 동사를 고르면 어떤 수일치 규칙이 적용되는지 알려줍니다.</p>';

            var progressEl = root.querySelector(".agq-progress");
            var scoreEl = root.querySelector(".agq-score");
            var quizEl = root.querySelector(".agq-quiz");
            var sentenceEl = root.querySelector(".agq-sentence");
            var optionsEl = root.querySelector(".agq-options");
            var feedbackEl = root.querySelector(".agq-feedback");
            var nextBtn = root.querySelector(".agq-next");
            var restartBtn = root.querySelector(".agq-restart");
            var summaryEl = root.querySelector(".agq-summary");

            var state = {
                order: [],
                pos: 0,
                score: 0,
                answered: false,
                results: []
            };

            function currentQuestion() {
                return QUESTIONS[state.order[state.pos]];
            }

            function renderQuestion() {
                var q = currentQuestion();
                state.answered = false;
                progressEl.textContent = "문제 " + (state.pos + 1) + " / " + state.order.length;
                scoreEl.textContent = "점수 " + state.score;

                /* 빈칸을 강조 표시한 문장 */
                sentenceEl.innerHTML = "";
                var parts = q.s.split("___");
                sentenceEl.appendChild(document.createTextNode(parts[0]));
                var blank = document.createElement("span");
                blank.className = "agq-blank";
                blank.textContent = "___";
                sentenceEl.appendChild(blank);
                sentenceEl.appendChild(document.createTextNode(parts[1]));

                /* 동사 선택 버튼 2개 (자리 무작위) */
                optionsEl.innerHTML = "";
                var idx = Math.random() < 0.5 ? [0, 1] : [1, 0];
                for (var i = 0; i < idx.length; i++) {
                    var verb = q.opts[idx[i]];
                    var btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "sim__btn agq-opt";
                    btn.textContent = verb;
                    btn.setAttribute("data-verb", verb);
                    btn.setAttribute("lang", "en");
                    btn.addEventListener("click", onOptionClick);
                    optionsEl.appendChild(btn);
                }

                feedbackEl.innerHTML = "";
                nextBtn.hidden = true;
            }

            function onOptionClick(ev) {
                if (state.answered) return;
                state.answered = true;
                var choice = ev.currentTarget.getAttribute("data-verb");
                var q = currentQuestion();
                var ok = logic.isCorrect(q, choice);
                if (ok) state.score++;
                state.results.push({
                    index: state.order[state.pos],
                    chosen: choice,
                    correct: ok
                });
                scoreEl.textContent = "점수 " + state.score;

                var btns = optionsEl.querySelectorAll(".agq-opt");
                for (var i = 0; i < btns.length; i++) {
                    btns[i].disabled = true;
                    var v = btns[i].getAttribute("data-verb");
                    if (v === q.answer) {
                        btns[i].classList.add("agq-opt--right");
                    } else if (v === choice && !ok) {
                        btns[i].classList.add("agq-opt--wrong");
                    }
                }

                var blank = sentenceEl.querySelector(".agq-blank");
                if (blank) {
                    blank.textContent = q.answer;
                    blank.className = "agq-blank agq-blank--filled";
                }

                renderFeedback(q, ok);
                nextBtn.textContent = state.pos === state.order.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            function renderFeedback(q, ok) {
                var full = logic.fillBlank(q.s, q.answer);
                feedbackEl.innerHTML = ""
                    + '<p class="agq-verdict ' + (ok ? "agq-verdict--ok" : "agq-verdict--no") + '">'
                    +     (ok ? "정답입니다!" : "오답입니다. 정답은 " + q.answer + " 입니다.")
                    + '</p>'
                    + '<p class="agq-rule"><span class="sim__chip">규칙</span> ' + q.rule + '</p>'
                    + '<p class="agq-tip">' + q.tip + '</p>'
                    + '<p class="agq-full"><span lang="en">' + full + '</span> ' + speakBtnHtml(full) + '</p>'
                    + '<p class="agq-meaning">' + q.ko + '</p>';
            }

            function renderSummary() {
                quizEl.hidden = true;
                progressEl.textContent = "완료";
                var rows = "";
                for (var i = 0; i < state.results.length; i++) {
                    var r = state.results[i];
                    var q = QUESTIONS[r.index];
                    var full = logic.fillBlank(q.s, q.answer);
                    rows += '<tr>'
                        + '<td class="' + (r.correct ? "agq-cell-ok" : "agq-cell-no") + '">'
                        +     (r.correct ? "O" : "X")
                        + '</td>'
                        + '<td><span lang="en">' + full + '</span> ' + speakBtnHtml(full) + '</td>'
                        + '<td>' + q.rule + '</td>'
                        + '</tr>';
                }
                summaryEl.innerHTML = ""
                    + '<p class="agq-result">' + state.order.length + '문제 중 '
                    +     '<strong>' + state.score + '문제</strong> 정답</p>'
                    + '<p class="agq-tip">' + logic.summaryMsg(state.score, state.order.length) + '</p>'
                    + '<div class="agq-table-wrap"><table>'
                    +     '<thead><tr><th>결과</th><th>문장</th><th>규칙</th></tr></thead>'
                    +     '<tbody>' + rows + '</tbody>'
                    + '</table></div>'
                    + '<div class="sim__row">'
                    +     '<button type="button" class="sim__btn sim__btn--primary agq-retry">다시 풀기</button>'
                    + '</div>';
                summaryEl.hidden = false;
                summaryEl.querySelector(".agq-retry").addEventListener("click", start);
            }

            function start() {
                state.order = logic.makeOrder(QUESTIONS.length, PAIR_START, Math.random);
                state.pos = 0;
                state.score = 0;
                state.results = [];
                summaryEl.hidden = true;
                summaryEl.innerHTML = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            nextBtn.addEventListener("click", function () {
                state.pos++;
                if (state.pos >= state.order.length) {
                    renderSummary();
                } else {
                    renderQuestion();
                }
            });

            restartBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:en-order-builder - 어순 조립 연습 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 문장 은행 (대학영어 2-12 자가 점검, 문장의 5형식) ---- */
    var BANK = [
        { en: "The sun rises in the east.", ko: "해는 동쪽에서 뜬다." },
        { en: "She became a doctor.", ko: "그녀는 의사가 되었다." },
        { en: "He bought a new car.", ko: "그는 새 차를 샀다." },
        { en: "My father gave me a watch.", ko: "아버지는 나에게 시계를 주셨다." },
        { en: "We call him a genius.", ko: "우리는 그를 천재라고 부른다." },
        { en: "The diligent student read the book carefully.", ko: "그 부지런한 학생은 그 책을 주의 깊게 읽었다." }
    ];

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        /* 문장을 공백 단위 단어 칩으로 분할 */
        words: function (sentence) {
            var parts = sentence.split(/\s+/);
            var out = [];
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].length > 0) out.push(parts[i]);
            }
            return out;
        },
        /* 두 단어 배열이 완전히 같은 순서인지 */
        sameSeq: function (a, b) {
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        },
        /* 조립 결과가 정답 어순과 일치하는지 */
        check: function (built, answer) {
            return logic.sameSeq(built, answer);
        },
        /* 서로 다른 단어가 하나라도 있어야 다른 배열이 존재한다 */
        canDiffer: function (words) {
            for (var i = 1; i < words.length; i++) {
                if (words[i] !== words[0]) return true;
            }
            return false;
        },
        /* Fisher-Yates 셔플 (rand: 0 이상 1 미만을 주는 함수) */
        shuffle: function (words, rand) {
            var arr = words.slice();
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(rand() * (i + 1));
                var t = arr[i];
                arr[i] = arr[j];
                arr[j] = t;
            }
            return arr;
        },
        /* 정답 순서와 달라질 때까지 재셔플 (최대 50회 + 안전망 스왑) */
        shuffleDifferent: function (words, rand) {
            if (!logic.canDiffer(words)) return words.slice();
            var arr = logic.shuffle(words, rand);
            var tries = 1;
            while (logic.sameSeq(arr, words) && tries < 50) {
                arr = logic.shuffle(words, rand);
                tries++;
            }
            if (logic.sameSeq(arr, words)) {
                for (var i = 1; i < arr.length; i++) {
                    if (arr[i] !== arr[0]) {
                        var t = arr[0];
                        arr[0] = arr[i];
                        arr[i] = t;
                        break;
                    }
                }
            }
            return arr;
        },
        /* 정답 어순을 셔플된 보관함의 인덱스 열로 변환 (정답 보기용) */
        mapAnswerToOrder: function (orderWords, answerWords) {
            var used = [];
            var res = [];
            var i;
            for (i = 0; i < orderWords.length; i++) used.push(false);
            for (var a = 0; a < answerWords.length; a++) {
                for (i = 0; i < orderWords.length; i++) {
                    if (!used[i] && orderWords[i] === answerWords[a]) {
                        used[i] = true;
                        res.push(i);
                        break;
                    }
                }
            }
            return res;
        }
    };

    window.SIM.register("en-order-builder", {
        title: "어순 조립 연습",
        _logic: logic,
        _bank: BANK,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<span class="sim__chip ob-progress"></span>'
                +     '<span class="sim__note ob-guide">해석에 맞게 단어 칩을 순서대로 탭해 영어 문장을 만드세요.</span>'
                + '</div>'
                + '<div class="ob-quiz">'
                +     '<p class="ob-ko"></p>'
                +     '<div class="ob-line" role="group" aria-label="조립 줄. 칩을 탭하면 보관함으로 되돌아갑니다."></div>'
                +     '<div class="ob-bank" role="group" aria-label="단어 칩 보관함. 칩을 탭하면 조립 줄에 추가됩니다."></div>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary ob-check" aria-label="조립한 문장 확인">확인</button>'
                +         '<button type="button" class="sim__btn ob-clear" aria-label="조립 줄 비우기">비우기</button>'
                +         '<button type="button" class="sim__btn ob-reveal" aria-label="정답 보기" hidden>정답 보기</button>'
                +     '</div>'
                + '</div>'
                + '<div class="ob-feedback" aria-live="polite"></div>'
                + '<div class="ob-summary" hidden></div>';

            var progressEl = root.querySelector(".ob-progress");
            var quizEl = root.querySelector(".ob-quiz");
            var koEl = root.querySelector(".ob-ko");
            var lineEl = root.querySelector(".ob-line");
            var bankEl = root.querySelector(".ob-bank");
            var checkBtn = root.querySelector(".ob-check");
            var clearBtn = root.querySelector(".ob-clear");
            var revealBtn = root.querySelector(".ob-reveal");
            var feedbackEl = root.querySelector(".ob-feedback");
            var summaryEl = root.querySelector(".ob-summary");

            var state = {
                idx: 0,        /* 현재 문장 번호 */
                order: [],     /* 셔플된 칩 목록 [{ word, used }] */
                built: [],     /* 조립 줄 (order 인덱스 배열) */
                answer: [],    /* 정답 단어 배열 */
                wrong: 0,      /* 현재 문장 오답 횟수 */
                solved: false, /* 현재 문장 완료(정답 또는 정답 보기) */
                results: [],   /* 문장별 { revealed, wrong } */
                finished: false
            };

            function clearEl(el) {
                el.innerHTML = "";
            }

            /* TTS 발음 버튼 (클릭 처리는 app.js 전역 위임이 담당) */
            function makeSpeakBtn(text) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "speak-btn";
                b.setAttribute("aria-label", "발음 듣기");
                b.setAttribute("aria-pressed", "false");
                b.setAttribute("data-speak-text", text);
                var icon = document.createElement("span");
                icon.setAttribute("aria-hidden", "true");
                icon.textContent = "🔊";
                b.appendChild(icon);
                return b;
            }

            function builtWords() {
                var out = [];
                for (var i = 0; i < state.built.length; i++) {
                    out.push(state.order[state.built[i]].word);
                }
                return out;
            }

            function updateProgress() {
                if (state.finished) {
                    progressEl.textContent = "완료 " + BANK.length + " / " + BANK.length;
                } else {
                    progressEl.textContent = "문장 " + (state.idx + 1) + " / " + BANK.length;
                }
            }

            function updateControls() {
                checkBtn.disabled = state.solved || state.built.length !== state.answer.length;
                clearBtn.disabled = state.solved || state.built.length === 0;
                revealBtn.hidden = state.solved || state.wrong < 2;
            }

            function makeBankChip(orderIdx) {
                var item = state.order[orderIdx];
                var b = document.createElement("button");
                b.type = "button";
                b.className = "ob-chip" + (item.used ? " ob-chip--used" : "");
                b.textContent = item.word;
                b.disabled = item.used || state.solved;
                b.setAttribute("aria-label", item.word + " 칩을 조립 줄에 추가");
                b.addEventListener("click", function () {
                    if (state.solved || item.used) return;
                    item.used = true;
                    state.built.push(orderIdx);
                    clearEl(feedbackEl);
                    renderChips();
                    updateControls();
                });
                return b;
            }

            function makeLineChip(pos) {
                var orderIdx = state.built[pos];
                var b = document.createElement("button");
                b.type = "button";
                b.className = "ob-chip ob-chip--line";
                b.textContent = state.order[orderIdx].word;
                b.disabled = state.solved;
                b.setAttribute("aria-label", state.order[orderIdx].word + " 칩을 보관함으로 되돌리기");
                b.addEventListener("click", function () {
                    if (state.solved) return;
                    state.order[orderIdx].used = false;
                    state.built.splice(pos, 1);
                    clearEl(feedbackEl);
                    renderChips();
                    updateControls();
                });
                return b;
            }

            function renderChips() {
                clearEl(lineEl);
                clearEl(bankEl);
                var i;
                if (state.built.length === 0) {
                    var ph = document.createElement("span");
                    ph.className = "ob-placeholder";
                    ph.textContent = "탭한 단어가 여기에 순서대로 놓입니다.";
                    lineEl.appendChild(ph);
                }
                for (i = 0; i < state.built.length; i++) {
                    lineEl.appendChild(makeLineChip(i));
                }
                for (i = 0; i < state.order.length; i++) {
                    bankEl.appendChild(makeBankChip(i));
                }
            }

            function makeNextBtn() {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "sim__btn sim__btn--primary";
                var last = state.idx >= BANK.length - 1;
                b.textContent = last ? "결과 보기" : "다음 문장";
                b.setAttribute("aria-label", last ? "연습 결과 보기" : "다음 문장으로 이동");
                b.addEventListener("click", function () {
                    state.idx++;
                    if (state.idx >= BANK.length) {
                        finish();
                    } else {
                        loadQuestion(state.idx);
                    }
                });
                return b;
            }

            function sentenceRow(en) {
                var row = document.createElement("div");
                row.className = "ob-en-row";
                var span = document.createElement("span");
                span.className = "ob-en";
                span.textContent = en;
                row.appendChild(span);
                row.appendChild(makeSpeakBtn(en));
                return row;
            }

            function showCorrect() {
                clearEl(feedbackEl);
                var box = document.createElement("div");
                box.className = "ob-result ob-result--ok";
                var p = document.createElement("p");
                p.className = "ob-result-msg";
                p.textContent = state.wrong === 0 ? "정답입니다! 한 번에 맞혔어요." : "정답입니다!";
                box.appendChild(p);
                box.appendChild(sentenceRow(BANK[state.idx].en));
                var row = document.createElement("div");
                row.className = "sim__row";
                row.appendChild(makeNextBtn());
                box.appendChild(row);
                feedbackEl.appendChild(box);
            }

            function showWrong() {
                clearEl(feedbackEl);
                var box = document.createElement("div");
                box.className = "ob-result ob-result--no";
                var p = document.createElement("p");
                p.className = "ob-result-msg";
                p.textContent = "어순이 정답과 달라요. 칩을 다시 배치해 보세요.";
                box.appendChild(p);
                if (state.wrong >= 2) {
                    var hint = document.createElement("p");
                    hint.className = "ob-result-sub";
                    hint.textContent = "두 번 이상 틀렸어요. 아래의 정답 보기 버튼을 눌러도 됩니다.";
                    box.appendChild(hint);
                }
                var row = document.createElement("div");
                row.className = "sim__row";
                var retry = document.createElement("button");
                retry.type = "button";
                retry.className = "sim__btn";
                retry.textContent = "다시 시도";
                retry.setAttribute("aria-label", "안내를 닫고 칩을 다시 배치");
                retry.addEventListener("click", function () {
                    clearEl(feedbackEl);
                });
                row.appendChild(retry);
                box.appendChild(row);
                feedbackEl.appendChild(box);
            }

            function showRevealed() {
                clearEl(feedbackEl);
                var box = document.createElement("div");
                box.className = "ob-result ob-result--info";
                var p = document.createElement("p");
                p.className = "ob-result-msg";
                p.textContent = "정답 문장입니다. 조립 줄의 어순을 눈으로 따라가 보세요.";
                box.appendChild(p);
                box.appendChild(sentenceRow(BANK[state.idx].en));
                var row = document.createElement("div");
                row.className = "sim__row";
                row.appendChild(makeNextBtn());
                box.appendChild(row);
                feedbackEl.appendChild(box);
            }

            function finish() {
                state.finished = true;
                quizEl.hidden = true;
                clearEl(feedbackEl);
                clearEl(summaryEl);
                summaryEl.hidden = false;
                updateProgress();

                var ok = 0;
                var i;
                for (i = 0; i < state.results.length; i++) {
                    if (!state.results[i].revealed) ok++;
                }
                var head = document.createElement("p");
                head.className = "ob-sum-head";
                head.textContent = "연습 완료! " + BANK.length + "문장 중 " + ok + "문장을 스스로 맞혔습니다.";
                summaryEl.appendChild(head);

                var list = document.createElement("ul");
                list.className = "ob-sum-list";
                for (i = 0; i < BANK.length; i++) {
                    var li = document.createElement("li");
                    var r = state.results[i];
                    var solvedSelf = r && !r.revealed;
                    var tag = document.createElement("span");
                    tag.className = "ob-tag " + (solvedSelf ? "ob-tag--ok" : "ob-tag--no");
                    if (solvedSelf) {
                        tag.textContent = r.wrong === 0 ? "한 번에 맞힘" : "맞힘";
                    } else {
                        tag.textContent = "정답 봄";
                    }
                    li.appendChild(tag);
                    var span = document.createElement("span");
                    span.className = "ob-en";
                    span.textContent = BANK[i].en;
                    li.appendChild(span);
                    li.appendChild(makeSpeakBtn(BANK[i].en));
                    list.appendChild(li);
                }
                summaryEl.appendChild(list);

                var row = document.createElement("div");
                row.className = "sim__row";
                var restart = document.createElement("button");
                restart.type = "button";
                restart.className = "sim__btn sim__btn--primary";
                restart.textContent = "처음부터";
                restart.setAttribute("aria-label", "연습을 처음부터 다시 시작");
                restart.addEventListener("click", function () {
                    state.results = [];
                    state.finished = false;
                    summaryEl.hidden = true;
                    clearEl(summaryEl);
                    quizEl.hidden = false;
                    loadQuestion(0);
                });
                row.appendChild(restart);
                summaryEl.appendChild(row);
            }

            function loadQuestion(i) {
                state.idx = i;
                state.answer = logic.words(BANK[i].en);
                var shuffled = logic.shuffleDifferent(state.answer, Math.random);
                state.order = [];
                for (var k = 0; k < shuffled.length; k++) {
                    state.order.push({ word: shuffled[k], used: false });
                }
                state.built = [];
                state.wrong = 0;
                state.solved = false;
                koEl.textContent = BANK[i].ko;
                clearEl(feedbackEl);
                updateProgress();
                renderChips();
                updateControls();
            }

            checkBtn.addEventListener("click", function () {
                if (state.solved || state.built.length !== state.answer.length) return;
                if (logic.check(builtWords(), state.answer)) {
                    state.solved = true;
                    state.results.push({ revealed: false, wrong: state.wrong });
                    renderChips();
                    showCorrect();
                } else {
                    state.wrong++;
                    showWrong();
                }
                updateControls();
            });

            clearBtn.addEventListener("click", function () {
                if (state.solved) return;
                for (var i = 0; i < state.order.length; i++) {
                    state.order[i].used = false;
                }
                state.built = [];
                clearEl(feedbackEl);
                renderChips();
                updateControls();
            });

            revealBtn.addEventListener("click", function () {
                if (state.solved) return;
                var orderWords = [];
                for (var i = 0; i < state.order.length; i++) {
                    orderWords.push(state.order[i].word);
                    state.order[i].used = true;
                }
                state.built = logic.mapAnswerToOrder(orderWords, state.answer);
                state.solved = true;
                state.results.push({ revealed: true, wrong: state.wrong });
                renderChips();
                showRevealed();
                updateControls();
            });

            loadQuestion(0);
        }
    });
})();

/* sim:py-type-casting - 형변환 실험기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ----
       파이썬 3의 실제 동작(CPython으로 검증한 repr/에러 메시지)을 내장 표로 관리한다.
       동적 계산보다 정확성 우선. ok: 성공 결과 repr / err: 에러 한 줄 / type: 결과 타입 */

    var VALUES = [
        { id: "s100", label: "\"100\"", kind: "str", aria: "문자열 100" },
        { id: "s35", label: "\"3.5\"", kind: "str", aria: "문자열 3.5" },
        { id: "f39", label: "3.9", kind: "float", aria: "실수 3.9" },
        { id: "fn39", label: "-3.9", kind: "float", aria: "실수 -3.9" },
        { id: "i0", label: "0", kind: "int", aria: "정수 0" },
        { id: "sempty", label: "\"\"", kind: "str", aria: "빈 문자열" },
        { id: "sx", label: "\"x\"", kind: "str", aria: "문자열 x" },
        { id: "btrue", label: "True", kind: "bool", aria: "불리언 True" }
    ];

    var FNS = ["int", "float", "str", "bool"];

    var TABLE = {
        s100: {
            int: { ok: "100", type: "int",
                note: "숫자 모양의 문자열은 따옴표를 벗고 정수 100이 됩니다." },
            float: { ok: "100.0", type: "float",
                note: "정수 모양 문자열도 float()를 거치면 100.0이 됩니다." },
            str: { ok: "'100'", type: "str",
                note: "이미 문자열이므로 그대로입니다." },
            bool: { ok: "True", type: "bool",
                note: "비어 있지 않은 문자열은 모두 True입니다." }
        },
        s35: {
            int: { err: "ValueError: invalid literal for int() with base 10: '3.5'",
                type: "ValueError",
                note: "소수점이 든 문자열은 int()가 바로 읽지 못합니다. int(float(\"3.5\"))처럼 두 단계로 변환하세요." },
            float: { ok: "3.5", type: "float",
                note: "소수 모양 문자열은 float()로 변환됩니다." },
            str: { ok: "'3.5'", type: "str",
                note: "이미 문자열이므로 그대로입니다." },
            bool: { ok: "True", type: "bool",
                note: "비어 있지 않은 문자열은 모두 True입니다." }
        },
        f39: {
            int: { ok: "3", type: "int",
                note: "소수부를 버리는 0 방향 절단입니다. 반올림(4)이 아닙니다." },
            float: { ok: "3.9", type: "float",
                note: "이미 float이므로 그대로입니다." },
            str: { ok: "'3.9'", type: "str",
                note: "따옴표 붙은 문자열 '3.9'가 됩니다. 더 이상 숫자 연산이 안 됩니다." },
            bool: { ok: "True", type: "bool",
                note: "0이 아닌 숫자는 모두 True입니다." }
        },
        fn39: {
            int: { ok: "-3", type: "int",
                note: "내림이면 -4지만 int()는 0 방향 절단이라 -3입니다. 파트 2에서 확인해 보세요." },
            float: { ok: "-3.9", type: "float",
                note: "이미 float이므로 그대로입니다." },
            str: { ok: "'-3.9'", type: "str",
                note: "부호까지 포함한 문자열 '-3.9'가 됩니다." },
            bool: { ok: "True", type: "bool",
                note: "음수도 0이 아니므로 True입니다." }
        },
        i0: {
            int: { ok: "0", type: "int",
                note: "이미 int이므로 그대로입니다." },
            float: { ok: "0.0", type: "float",
                note: "int 0이 float 0.0이 됩니다. 값은 같지만 타입이 다릅니다." },
            str: { ok: "'0'", type: "str",
                note: "문자열 '0'이 됩니다. 참고로 bool('0')은 비어 있지 않아 True입니다." },
            bool: { ok: "False", type: "bool",
                note: "숫자 0은 False입니다. 0.0도 마찬가지입니다." }
        },
        sempty: {
            int: { err: "ValueError: invalid literal for int() with base 10: ''",
                type: "ValueError",
                note: "빈 문자열에는 읽을 숫자가 없어 ValueError가 납니다." },
            float: { err: "ValueError: could not convert string to float: ''",
                type: "ValueError",
                note: "빈 문자열은 float()도 변환하지 못합니다." },
            str: { ok: "''", type: "str",
                note: "빈 문자열 그대로입니다." },
            bool: { ok: "False", type: "bool",
                note: "빈 문자열은 False입니다. 내용이 한 글자라도 있으면 True입니다." }
        },
        sx: {
            int: { err: "ValueError: invalid literal for int() with base 10: 'x'",
                type: "ValueError",
                note: "숫자 모양이 아닌 문자열은 int()로 변환할 수 없습니다." },
            float: { err: "ValueError: could not convert string to float: 'x'",
                type: "ValueError",
                note: "숫자 모양이 아닌 문자열은 float()로도 변환할 수 없습니다." },
            str: { ok: "'x'", type: "str",
                note: "이미 문자열이므로 그대로입니다." },
            bool: { ok: "True", type: "bool",
                note: "내용이 있으면 무조건 True입니다. bool(\"False\")조차 True입니다!" }
        },
        btrue: {
            int: { ok: "1", type: "int",
                note: "bool은 int의 하위 타입이라 True는 1, False는 0입니다." },
            float: { ok: "1.0", type: "float",
                note: "True가 1로 취급되어 1.0이 됩니다." },
            str: { ok: "'True'", type: "str",
                note: "4글자짜리 문자열 'True'가 됩니다. bool 값 True와는 다른 값입니다." },
            bool: { ok: "True", type: "bool",
                note: "이미 bool이므로 그대로입니다." }
        }
    };

    var logic = {
        values: VALUES,
        fns: FNS,
        /* 값 id + 함수명 -> 결과 항목 (없으면 null) */
        cast: function (valueId, fn) {
            return (TABLE[valueId] && TABLE[valueId][fn]) || null;
        },
        /* 표시용 파이썬 식 문자열 (예: int("100")) */
        exprOf: function (valueId, fn) {
            var i;
            for (i = 0; i < VALUES.length; i++) {
                if (VALUES[i].id === valueId) {
                    return fn + "(" + VALUES[i].label + ")";
                }
            }
            return "";
        },
        /* int(): 0 방향 절단 */
        truncToZero: function (x) {
            return x < 0 ? Math.ceil(x) : Math.floor(x);
        },
        /* math.floor(): 음의 무한대 방향 내림 */
        floorDown: function (x) {
            return Math.floor(x);
        }
    };

    /* ---- SVG 수직선 (-5 ~ 5, viewBox 기반: 픽셀 측정 없음) ---- */

    function xOf(v) {
        return 30 + (v + 5) * 50;
    }

    /* 가로 화살표 + 라벨 (sx에서 dir 방향으로 len만큼) */
    function arrowH(sx, y, dir, len, key, label) {
        var ex = sx + dir * len;
        var hx = ex - dir * 10;
        return '<line x1="' + sx + '" y1="' + y + '" x2="' + (ex - dir * 8) +
            '" y2="' + y + '" class="ptc-' + key + '-line"/>' +
            '<polygon points="' + ex + ',' + y + ' ' + hx + ',' + (y - 5) +
            ' ' + hx + ',' + (y + 5) + '" class="ptc-' + key + '-head"/>' +
            '<text x="' + (sx + dir * (len / 2)) + '" y="' + (y - 9) +
            '" text-anchor="middle" class="ptc-arrowlabel ptc-' + key +
            '-label">' + label + '</text>';
    }

    function svgMarkup(val, t, f) {
        var xv = xOf(val);
        var xt = xOf(t);
        var xf = xOf(f);
        var dirInt = val < 0 ? 1 : -1; /* 0을 향하는 방향 */
        var v;
        var s = [];
        s.push('<svg viewBox="0 0 560 168" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="수직선 비교: ' +
            val + '에서 int()는 ' + t + '로 0 방향 절단, math.floor()는 ' +
            f + '로 음의 무한대 방향 내림">');
        /* 축과 양끝 화살표 */
        s.push('<line x1="16" y1="130" x2="544" y2="130" class="ptc-axis"/>');
        s.push('<polygon points="8,130 20,125 20,135" class="ptc-axis-head"/>');
        s.push('<polygon points="552,130 540,125 540,135" class="ptc-axis-head"/>');
        /* 눈금 -5 ~ 5 */
        for (v = -5; v <= 5; v++) {
            s.push('<line x1="' + xOf(v) + '" y1="123" x2="' + xOf(v) +
                '" y2="137" class="ptc-tick"/>');
            s.push('<text x="' + xOf(v) + '" y="156" text-anchor="middle" class="ptc-ticklabel' +
                (v === 0 ? ' ptc-ticklabel--zero' : '') + '">' + v + '</text>');
        }
        /* 도착 지점 (int: 안쪽 원, floor: 바깥 원 - 양수처럼 겹쳐도 둘 다 보임) */
        s.push('<circle cx="' + xt + '" cy="130" r="7" class="ptc-land ptc-land--int"/>');
        s.push('<circle cx="' + xf + '" cy="130" r="12" class="ptc-land ptc-land--floor"/>');
        /* 선택한 값 표시 */
        s.push('<line x1="' + xv + '" y1="56" x2="' + xv + '" y2="124" class="ptc-vline"/>');
        s.push('<text x="' + xv + '" y="48" text-anchor="middle" class="ptc-vlabel">' + val + '</text>');
        /* 방향 화살표: int()는 0 방향, floor()는 항상 음의 무한대(왼쪽) 방향 */
        s.push(arrowH(xv, 78, dirInt, 48, "int", "int()"));
        s.push(arrowH(xv, 106, -1, 48, "floor", "floor()"));
        s.push('<circle cx="' + xv + '" cy="130" r="5" class="ptc-dot"/>');
        s.push('</svg>');
        return s.join("");
    }

    window.SIM.register("py-type-casting", {
        title: "형변환 실험기",
        logic: logic,
        build: function (root) {
            root.innerHTML =
                '<div class="ptc-part">' +
                '<p class="ptc-part-title">파트 1 · 변환 실험</p>' +
                '<p class="sim__note">값 칩 하나와 변환 함수 하나를 골라, 파이썬이 실제로 내놓는 결과를 확인해 보세요.</p>' +
                '<div class="sim__row ptc-vals" role="group" aria-label="변환할 값 선택"></div>' +
                '<div class="sim__row ptc-fns" role="group" aria-label="변환 함수 선택"></div>' +
                '<div class="ptc-result-wrap" aria-live="polite">' +
                '<div class="sim__out ptc-out">' +
                '<div class="ptc-expr" data-ref="expr"></div>' +
                '<div class="ptc-res" data-ref="res"></div>' +
                '</div>' +
                '<div class="ptc-meta"><span class="sim__chip" data-ref="chip"></span></div>' +
                '<p class="sim__note" data-ref="note"></p>' +
                '</div>' +
                '</div>' +
                '<div class="ptc-part">' +
                '<p class="ptc-part-title">파트 2 · 절단 vs 내림</p>' +
                '<p class="sim__note">같은 값을 int()와 math.floor()가 각각 어디로 보내는지 수직선에서 비교합니다. math.floor()는 import math 후 사용합니다.</p>' +
                '<div class="sim__row" role="group" aria-label="비교할 값 선택">' +
                '<button type="button" class="sim__btn ptc-toggle" data-val="-3.9" aria-pressed="false" aria-label="-3.9로 비교">-3.9</button>' +
                '<button type="button" class="sim__btn ptc-toggle" data-val="3.9" aria-pressed="false" aria-label="3.9로 비교">3.9</button>' +
                '</div>' +
                '<div class="ptc-svgwrap" data-ref="svg"></div>' +
                '<div class="sim__out ptc-cmp" aria-live="polite">' +
                '<div class="ptc-cmpline"><span class="ptc-swatch ptc-swatch--int" aria-hidden="true"></span><span data-ref="cmp-int"></span></div>' +
                '<div class="ptc-cmpline"><span class="ptc-swatch ptc-swatch--floor" aria-hidden="true"></span><span data-ref="cmp-floor"></span></div>' +
                '<div class="ptc-cmpnote" data-ref="cmp-note"></div>' +
                '</div>' +
                '<p class="ptc-tip">핵심: int()는 내림이 아니라 0 방향 절단입니다.</p>' +
                '</div>';

            var valsRow = root.querySelector(".ptc-vals");
            var fnsRow = root.querySelector(".ptc-fns");
            var exprEl = root.querySelector('[data-ref="expr"]');
            var resEl = root.querySelector('[data-ref="res"]');
            var chipEl = root.querySelector('[data-ref="chip"]');
            var noteEl = root.querySelector('[data-ref="note"]');
            var svgWrap = root.querySelector('[data-ref="svg"]');
            var cmpIntEl = root.querySelector('[data-ref="cmp-int"]');
            var cmpFloorEl = root.querySelector('[data-ref="cmp-floor"]');
            var cmpNoteEl = root.querySelector('[data-ref="cmp-note"]');
            var togBtns = root.querySelectorAll(".ptc-toggle");

            var valBtns = [];
            var fnBtns = [];
            var curVal = VALUES[0].id;
            var curFn = "int";
            var curX = -3.9;

            /* ---- 파트 1 ---- */

            function syncPart1() {
                var entry = logic.cast(curVal, curFn);
                var j, on;
                for (j = 0; j < valBtns.length; j++) {
                    on = valBtns[j].getAttribute("data-id") === curVal;
                    valBtns[j].className = "sim__btn ptc-val" + (on ? " active" : "");
                    valBtns[j].setAttribute("aria-pressed", on ? "true" : "false");
                }
                for (j = 0; j < fnBtns.length; j++) {
                    on = fnBtns[j].getAttribute("data-fn") === curFn;
                    fnBtns[j].className = "sim__btn ptc-fn" + (on ? " active" : "");
                    fnBtns[j].setAttribute("aria-pressed", on ? "true" : "false");
                }
                exprEl.textContent = ">>> " + logic.exprOf(curVal, curFn);
                if (!entry) return;
                if (entry.err) {
                    resEl.textContent = entry.err;
                    resEl.className = "ptc-res ptc-res--err";
                    chipEl.textContent = "에러: " + entry.type;
                    chipEl.className = "sim__chip ptc-chip--err";
                } else {
                    resEl.textContent = entry.ok;
                    resEl.className = "ptc-res";
                    chipEl.textContent = "결과 타입: " + entry.type;
                    chipEl.className = "sim__chip";
                }
                noteEl.textContent = entry.note;
            }

            function makeValHandler(id) {
                return function () {
                    curVal = id;
                    syncPart1();
                };
            }

            function makeFnHandler(fn) {
                return function () {
                    curFn = fn;
                    syncPart1();
                };
            }

            var i, btn, lab, kind;
            for (i = 0; i < VALUES.length; i++) {
                btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sim__btn ptc-val";
                btn.setAttribute("data-id", VALUES[i].id);
                btn.setAttribute("aria-label", VALUES[i].aria + " 선택");
                btn.setAttribute("aria-pressed", "false");
                lab = document.createElement("span");
                lab.textContent = VALUES[i].label;
                kind = document.createElement("span");
                kind.className = "ptc-kind";
                kind.textContent = VALUES[i].kind;
                btn.appendChild(lab);
                btn.appendChild(kind);
                btn.addEventListener("click", makeValHandler(VALUES[i].id));
                valsRow.appendChild(btn);
                valBtns.push(btn);
            }
            for (i = 0; i < FNS.length; i++) {
                btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sim__btn ptc-fn";
                btn.setAttribute("data-fn", FNS[i]);
                btn.setAttribute("aria-label", FNS[i] + " 함수로 변환");
                btn.setAttribute("aria-pressed", "false");
                btn.textContent = FNS[i] + "()";
                btn.addEventListener("click", makeFnHandler(FNS[i]));
                fnsRow.appendChild(btn);
                fnBtns.push(btn);
            }

            /* ---- 파트 2 ---- */

            function syncPart2() {
                var t = logic.truncToZero(curX);
                var f = logic.floorDown(curX);
                var j, on;
                for (j = 0; j < togBtns.length; j++) {
                    on = parseFloat(togBtns[j].getAttribute("data-val")) === curX;
                    togBtns[j].className = "sim__btn ptc-toggle" + (on ? " active" : "");
                    togBtns[j].setAttribute("aria-pressed", on ? "true" : "false");
                }
                svgWrap.innerHTML = svgMarkup(curX, t, f);
                cmpIntEl.textContent = "int(" + curX + ") = " + t + "  (0 방향 절단)";
                cmpFloorEl.textContent = "math.floor(" + curX + ") = " + f + "  (음의 무한대 방향 내림)";
                cmpNoteEl.textContent = curX < 0
                    ? "음수에서는 결과가 다릅니다: 절단은 " + t + ", 내림은 " + f + "."
                    : "양수에서는 두 함수의 결과가 같습니다 (둘 다 " + t + ").";
            }

            function makeTogHandler(x) {
                return function () {
                    curX = x;
                    syncPart2();
                };
            }

            for (i = 0; i < togBtns.length; i++) {
                togBtns[i].addEventListener("click",
                    makeTogHandler(parseFloat(togBtns[i].getAttribute("data-val"))));
            }

            syncPart1();
            syncPart2();
        }
    });
})();

/* sim:py-slice-lab - 슬라이싱 실험실 */
(function () {
    "use strict";
    if (!window.SIM) return;

    var TEXT = "ABCDEFG";

    /* ------------------------------------------------------------------
       순수 슬라이스 로직 (DOM 비의존, node 테스트 대상)
       파이썬 슬라이스 의미론(CPython PySlice_AdjustIndices)을 그대로 구현:
       - 음수 인덱스는 len을 더해 정규화 후 범위로 클램프
       - stop 위치의 문자는 제외
       - step < 0 이면 역방향, 생략 기본값은 start=len-1, stop=-1(처음 앞)
       - step > 0 이면 정방향, 생략 기본값은 start=0, stop=len
       node 대조 검증 케이스(t = "ABCDEFG", 파이썬 실행 결과와 일치 확인):
       [1:4]=BCD, [:3]=ABC, [4:]=EFG, [::2]=ACEG, [::-1]=GFEDCBA,
       [5:1:-2]=FD, [-3:]=EFG, [::-2]=GECA, [2:-2]=CDE, [-1:-8:-1]=GFEDCBA,
       [6:0:-2]=GEC, [-9:2]=AB, [7:]='', [3:3]='', [4:2]='', [2:5:-1]=''
       ------------------------------------------------------------------ */
    var LOGIC = {
        /* start/stop/step: 정수 또는 null(생략). step=0이면 null 반환 */
        slice: function (s, start, stop, step) {
            var len = s.length;
            if (step === null || step === undefined) step = 1;
            if (step === 0) return null;
            var lower, upper, st, sp, i;
            if (step > 0) {
                lower = 0;
                upper = len;
            } else {
                lower = -1;
                upper = len - 1;
            }
            if (start === null || start === undefined) {
                st = step > 0 ? lower : upper;
            } else if (start < 0) {
                st = start + len;
                if (st < lower) st = lower;
            } else {
                st = start > upper ? upper : start;
            }
            if (stop === null || stop === undefined) {
                sp = step > 0 ? upper : lower;
            } else if (stop < 0) {
                sp = stop + len;
                if (sp < lower) sp = lower;
            } else {
                sp = stop > upper ? upper : stop;
            }
            var indices = [];
            if (step > 0) {
                for (i = st; i < sp; i += step) indices.push(i);
            } else {
                for (i = st; i > sp; i += step) indices.push(i);
            }
            var result = "";
            for (i = 0; i < indices.length; i++) {
                result += s.charAt(indices[i]);
            }
            return {
                indices: indices,
                result: result,
                start: st,
                stop: sp,
                step: step
            };
        },
        /* t[start:stop:step] 표기 문자열 (생략 자리는 비움) */
        repr: function (start, stop, step) {
            var txt = "t[" + (start === null || start === undefined ? "" : String(start))
                + ":" + (stop === null || stop === undefined ? "" : String(stop));
            if (step !== null && step !== undefined) {
                txt += ":" + String(step);
            }
            return txt + "]";
        },
        /* 빈 결과의 이유 한 줄 */
        emptyReason: function (res) {
            if (res.step > 0) {
                return "정방향(step > 0)에서는 start가 stop보다 앞(왼쪽)에 있어야 하는데,"
                    + " 정규화 후 start가 stop과 같거나 뒤에 있어 빈 문자열이 됩니다.";
            }
            return "역방향(step < 0)에서는 start가 stop보다 뒤(오른쪽)에 있어야 하는데,"
                + " 정규화 후 start가 stop과 같거나 앞에 있어 빈 문자열이 됩니다.";
        }
    };

    window.SIM.register("py-slice-lab", {
        title: "슬라이싱 실험실",
        _logic: LOGIC,
        build: function (root) {
            var i;
            var cells = "";
            for (i = 0; i < TEXT.length; i++) {
                cells += '<div class="psl-cell">'
                    + '<span class="psl-pos">' + i + '</span>'
                    + '<span class="psl-char" data-idx="' + i + '">' + TEXT.charAt(i)
                    + '<span class="psl-order" hidden></span></span>'
                    + '<span class="psl-neg">' + (i - TEXT.length) + '</span>'
                    + '</div>';
            }

            function options(includeZero) {
                var html = '<option value="">생략</option>';
                for (var v = -7; v <= 7; v++) {
                    if (v === 0 && !includeZero) continue;
                    html += '<option value="' + v + '">' + v + '</option>';
                }
                return html;
            }

            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<span class="sim__chip">t = "ABCDEFG"</span>'
                + '</div>'
                + '<div class="psl-strip-wrap">'
                +     '<div class="psl-strip" aria-hidden="true">' + cells + '</div>'
                + '</div>'
                + '<p class="sim__note">위 줄은 양수 인덱스(0~6), 아래 줄은 음수 인덱스(-7~-1)입니다.'
                + ' stop 위치의 문자는 결과에 포함되지 않습니다.</p>'
                + '<div class="sim__row psl-controls">'
                +     '<label class="psl-field"><span class="psl-field-name">start</span>'
                +         '<select class="sim__select psl-sel psl-start" aria-label="start 값 선택 (생략 가능)">'
                +         options(true) + '</select></label>'
                +     '<label class="psl-field"><span class="psl-field-name">stop</span>'
                +         '<select class="sim__select psl-sel psl-stop" aria-label="stop 값 선택 (생략 가능)">'
                +         options(true) + '</select></label>'
                +     '<label class="psl-field"><span class="psl-field-name">step</span>'
                +         '<select class="sim__select psl-sel psl-step" aria-label="step 값 선택 (생략 가능, 0 제외)">'
                +         options(false) + '</select></label>'
                +     '<button type="button" class="sim__btn psl-reset"'
                +         ' aria-label="start, stop, step 모두 생략으로 초기화">초기화</button>'
                + '</div>'
                + '<div class="sim__row psl-presets">'
                +     '<span class="sim__chip">프리셋</span>'
                + '</div>'
                + '<div class="psl-result" aria-live="polite">'
                +     '<div class="sim__out psl-expr">'
                +         '<span class="psl-expr-code"></span>'
                +         '<span class="psl-expr-arrow"> &#8594; </span>'
                +         '<span class="psl-expr-result"></span>'
                +     '</div>'
                +     '<p class="sim__note psl-info"></p>'
                + '</div>';

            var startSel = root.querySelector(".psl-start");
            var stopSel = root.querySelector(".psl-stop");
            var stepSel = root.querySelector(".psl-step");
            var resetBtn = root.querySelector(".psl-reset");
            var presetRow = root.querySelector(".psl-presets");
            var exprCode = root.querySelector(".psl-expr-code");
            var exprResult = root.querySelector(".psl-expr-result");
            var infoEl = root.querySelector(".psl-info");

            var charEls = [];
            var orderEls = [];
            var charNodes = root.querySelectorAll(".psl-char");
            for (i = 0; i < charNodes.length; i++) {
                charEls.push(charNodes[i]);
                orderEls.push(charNodes[i].querySelector(".psl-order"));
            }

            function val(sel) {
                return sel.value === "" ? null : parseInt(sel.value, 10);
            }

            function render() {
                var start = val(startSel);
                var stop = val(stopSel);
                var step = val(stepSel);
                var res = LOGIC.slice(TEXT, start, stop, step);
                var k;
                for (k = 0; k < charEls.length; k++) {
                    charEls[k].classList.remove("on");
                    orderEls[k].setAttribute("hidden", "");
                    orderEls[k].textContent = "";
                }
                exprCode.textContent = LOGIC.repr(start, stop, step);
                if (!res) {
                    /* step=0은 셀렉트에서 제외되지만 방어적으로 처리 */
                    exprResult.textContent = "오류 (step은 0이 될 수 없습니다)";
                    infoEl.textContent = "";
                    return;
                }
                for (k = 0; k < res.indices.length; k++) {
                    charEls[res.indices[k]].classList.add("on");
                    orderEls[res.indices[k]].textContent = String(k + 1);
                    orderEls[res.indices[k]].removeAttribute("hidden");
                }
                if (res.result === "") {
                    exprResult.textContent = "빈 문자열 ''";
                    infoEl.textContent = LOGIC.emptyReason(res);
                } else {
                    exprResult.textContent = "'" + res.result + "'";
                    infoEl.textContent = "선택 인덱스(순서대로): " + res.indices.join(" → ");
                }
            }

            var presets = [
                { label: "t[1:4]", start: "1", stop: "4", step: "" },
                { label: "t[:3]", start: "", stop: "3", step: "" },
                { label: "t[4:]", start: "4", stop: "", step: "" },
                { label: "t[::2]", start: "", stop: "", step: "2" },
                { label: "t[::-1]", start: "", stop: "", step: "-1" }
            ];

            function onPresetClick() {
                startSel.value = this.getAttribute("data-start");
                stopSel.value = this.getAttribute("data-stop");
                stepSel.value = this.getAttribute("data-step");
                render();
            }

            for (i = 0; i < presets.length; i++) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sim__btn psl-preset";
                btn.textContent = presets[i].label;
                btn.setAttribute("data-start", presets[i].start);
                btn.setAttribute("data-stop", presets[i].stop);
                btn.setAttribute("data-step", presets[i].step);
                btn.setAttribute("aria-label", "프리셋 " + presets[i].label + " 적용");
                btn.addEventListener("click", onPresetClick);
                presetRow.appendChild(btn);
            }

            startSel.addEventListener("change", render);
            stopSel.addEventListener("change", render);
            stepSel.addEventListener("change", render);
            resetBtn.addEventListener("click", function () {
                startSel.value = "";
                stopSel.value = "";
                stepSel.value = "";
                render();
            });

            /* 초기 상태: t[1:4] */
            startSel.value = "1";
            stopSel.value = "4";
            stepSel.value = "";
            render();
        }
    });
})();

/* sim:py-alias-lab - 리스트 별칭 vs 복사 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ------------------------------------------------------------------
       순수 상태 전이 로직 (DOM 비의존, node 테스트 가능)
       - 본문 5단원 예제 7줄을 한 줄씩 실행한 스냅샷 8개(시작 전 + 줄별)를
         미리 만들어 두고, 버튼은 인덱스만 이동한다.
       - 메모리 모델: 상자(boxes) id -> 배열, 이름표(vars) a/b/c -> 상자 id
       ------------------------------------------------------------------ */

    var CODE_LINES = [
        "a = [1, 2, 3]",
        "b = a",
        "b.append(4)",
        "print(a)",
        "c = a[:]",
        "c.append(5)",
        "print(a)"
    ];

    /* 줄별 실행 의미 + 설명 데이터 (print 메시지는 실행 결과로 완성) */
    var PROGRAM = [
        {
            op: "new", target: "a", box: 1, values: [1, 2, 3],
            tone: "info", emph: "", hot: ["a"], mood: null,
            msg: "a = [1, 2, 3] 실행: 새 리스트 상자(상자 1)가 만들어지고, 이름표 a가 이 상자를 가리킵니다."
        },
        {
            op: "alias", target: "b", source: "a",
            tone: "info", emph: "같은 상자!", hot: ["a", "b"],
            mood: { box: 1, kind: "hot" },
            msg: "b = a 실행: 상자를 새로 만들지 않습니다. 이름표 b가 a와 같은 상자 1을 가리키게 됩니다. 이것이 별칭(alias)입니다."
        },
        {
            op: "append", target: "b", value: 4,
            tone: "info", emph: "", hot: ["b"], mood: null,
            msg: "b.append(4) 실행: b가 가리키는 상자 1에 4가 들어갑니다. a도 같은 상자를 가리키고 있으니 다음 print(a) 결과를 예상해 보세요."
        },
        {
            op: "print", target: "a",
            tone: "warn", emph: "b만 바꿨는데 a도 변했다!", hot: ["a"],
            mood: { box: 1, kind: "warn" },
            msgBefore: "print(a) 출력: ",
            msgAfter: ". a와 b는 같은 상자를 가리키는 별칭이라서, b로 바꾼 내용이 a에도 그대로 보입니다."
        },
        {
            op: "copy", target: "c", source: "a", box: 2,
            tone: "tip", emph: "다른 상자!", hot: ["c"],
            mood: { box: 2, kind: "tip" },
            msg: "c = a[:] 실행: 슬라이스 복사가 내용이 같은 새 상자 2를 만들고, c는 이 다른 상자를 가리킵니다."
        },
        {
            op: "append", target: "c", value: 5,
            tone: "info", emph: "", hot: ["c"], mood: null,
            msg: "c.append(5) 실행: 5는 c가 가리키는 상자 2에만 들어갑니다. a와 b가 가리키는 상자 1은 그대로입니다."
        },
        {
            op: "print", target: "a",
            tone: "tip", emph: "a는 그대로!", hot: ["a"],
            mood: { box: 1, kind: "tip" },
            msgBefore: "print(a) 출력: ",
            msgAfter: ". c가 바꾼 것은 다른 상자라서 a는 영향을 받지 않습니다. 복사가 필요할 때는 a[:]나 a.copy()를 쓰세요."
        }
    ];

    function formatList(arr) {
        return "[" + arr.join(", ") + "]";
    }

    function snapBoxes(boxes) {
        var out = {};
        var id;
        for (id in boxes) {
            if (boxes.hasOwnProperty(id)) {
                out[id] = boxes[id].slice();
            }
        }
        return out;
    }

    /* 스크린리더용 메모리 요약 문장 */
    function describeMemory(vars, boxes) {
        var names = ["a", "b", "c"];
        var ids = [1, 2];
        var byBox = {};
        var parts = [];
        var i, id, holders;
        for (i = 0; i < names.length; i++) {
            id = vars[names[i]];
            if (id !== null && id !== undefined) {
                if (!byBox[id]) byBox[id] = [];
                byBox[id].push(names[i]);
            }
        }
        for (i = 0; i < ids.length; i++) {
            id = ids[i];
            if (boxes[id]) {
                holders = byBox[id] ? byBox[id].join(", ") : "이름표 없음";
                parts.push(holders + " -> 상자 " + id + " " + formatList(boxes[id]));
            }
        }
        if (parts.length === 0) return "메모리가 비어 있습니다.";
        return "메모리 그림: " + parts.join(" / ");
    }

    /* 시작 전 + 7줄 = 스냅샷 8개. 각 스냅샷은 깊은 복사라 서로 독립이다. */
    function buildSteps() {
        var steps = [];
        var boxes = {};
        var vars = { a: null, b: null, c: null };
        var output = [];
        var i, ins, arr, printed, msg, newCell;

        steps.push({
            line: 0,
            vars: { a: null, b: null, c: null },
            boxes: {},
            output: [],
            newCell: null,
            hot: [],
            mood: null,
            tone: "info",
            emph: "",
            msg: "아직 실행 전입니다. '다음 단계' 버튼을 누르면 코드를 한 줄씩 실행하면서 메모리 그림이 바뀝니다.",
            pic: "메모리가 비어 있습니다."
        });

        for (i = 0; i < PROGRAM.length; i++) {
            ins = PROGRAM[i];
            newCell = null;
            msg = ins.msg || "";

            if (ins.op === "new") {
                boxes[ins.box] = ins.values.slice();
                vars[ins.target] = ins.box;
            } else if (ins.op === "alias") {
                vars[ins.target] = vars[ins.source];
            } else if (ins.op === "append") {
                arr = boxes[vars[ins.target]];
                arr.push(ins.value);
                newCell = { box: vars[ins.target], index: arr.length - 1 };
            } else if (ins.op === "copy") {
                boxes[ins.box] = boxes[vars[ins.source]].slice();
                vars[ins.target] = ins.box;
            } else if (ins.op === "print") {
                printed = formatList(boxes[vars[ins.target]]);
                output.push(printed);
                msg = ins.msgBefore + printed + ins.msgAfter;
            }

            steps.push({
                line: i + 1,
                vars: { a: vars.a, b: vars.b, c: vars.c },
                boxes: snapBoxes(boxes),
                output: output.slice(),
                newCell: newCell,
                hot: ins.hot.slice(),
                mood: ins.mood ? { box: ins.mood.box, kind: ins.mood.kind } : null,
                tone: ins.tone,
                emph: ins.emph,
                msg: msg,
                pic: describeMemory(vars, boxes)
            });
        }
        return steps;
    }

    /* ------------------------------------------------------------------
       메모리 그림 SVG (viewBox 기반, 픽셀 측정 없음)
       - 왼쪽: 이름표 a/b/c, 오른쪽: 리스트 상자 1/2, 화살표로 연결
       - b = a 단계에서 화살표 두 개가 상자 1 하나로 모이는 것이 핵심
       ------------------------------------------------------------------ */
    var GEOM = {
        view: "0 0 350 215",
        tagX: 8,
        tagW: 52,
        tagH: 32,
        tags: { a: 30, b: 88, c: 158 },
        boxX: 140,
        boxH: 46,
        boxes: { 1: 28, 2: 152 },
        anchors: { 1: { a: 44, b: 62 }, 2: { c: 175 } },
        cellW: 28,
        cellGap: 4,
        cellPad: 6
    };

    function r1(n) {
        return Math.round(n * 10) / 10;
    }

    /* 화살표(선 + 머리). 끝점 (x2, y2)가 상자 왼쪽 변에 닿는다. */
    function arrowMarkup(x1, y1, x2, y2, hot) {
        var ang = Math.atan2(y2 - y1, x2 - x1);
        var size = 8;
        var spread = 0.42;
        var cls = hot ? " is-hot" : "";
        var lx2 = r1(x2 - (size - 2) * Math.cos(ang));
        var ly2 = r1(y2 - (size - 2) * Math.sin(ang));
        var hx1 = r1(x2 - size * Math.cos(ang - spread));
        var hy1 = r1(y2 - size * Math.sin(ang - spread));
        var hx2 = r1(x2 - size * Math.cos(ang + spread));
        var hy2 = r1(y2 - size * Math.sin(ang + spread));
        return '<line class="pal-arrow' + cls + '" x1="' + x1 + '" y1="' + y1 +
            '" x2="' + lx2 + '" y2="' + ly2 + '"></line>' +
            '<polygon class="pal-head' + cls + '" points="' + x2 + "," + y2 +
            " " + hx1 + "," + hy1 + " " + hx2 + "," + hy2 + '"></polygon>';
    }

    /* 스냅샷 1개를 SVG 마크업으로. 모든 값은 위젯 내부 상수라 innerHTML 안전. */
    function svgMarkup(s) {
        var html = '<svg viewBox="' + GEOM.view + '" role="img" aria-label="' +
            s.pic + '" focusable="false">';
        var names = ["a", "b", "c"];
        var ids = [1, 2];
        var i, j, id, arr, name, y, w, cx, ty, anchorY, hot, isNew, moodCls;

        if (s.vars.a === null) {
            html += '<text class="pal-emptytext" x="175" y="100" text-anchor="middle">아직 메모리에 아무것도 없습니다</text>';
            html += '<text class="pal-emptytext" x="175" y="120" text-anchor="middle">다음 단계를 눌러 보세요</text>';
            return html + "</svg>";
        }

        /* 상자 + 칸 */
        for (i = 0; i < ids.length; i++) {
            id = ids[i];
            arr = s.boxes[id];
            if (!arr) continue;
            y = GEOM.boxes[id];
            w = GEOM.cellPad * 2 + arr.length * GEOM.cellW +
                (arr.length - 1) * GEOM.cellGap;
            moodCls = "";
            if (s.mood && s.mood.box === id) {
                moodCls = " pal-box--" + s.mood.kind;
            }
            html += '<text class="pal-boxlabel" x="' + GEOM.boxX + '" y="' +
                (y - 6) + '">' + (id === 1 ? "상자 1" : "상자 2 (복사본)") + "</text>";
            html += '<rect class="pal-box' + moodCls + '" x="' + GEOM.boxX +
                '" y="' + y + '" width="' + w + '" height="' + GEOM.boxH +
                '" rx="8"></rect>';
            for (j = 0; j < arr.length; j++) {
                cx = GEOM.boxX + GEOM.cellPad + j * (GEOM.cellW + GEOM.cellGap);
                isNew = s.newCell && s.newCell.box === id && s.newCell.index === j;
                html += '<rect class="pal-cell' + (isNew ? " pal-cell--new" : "") +
                    '" x="' + cx + '" y="' + (y + 7) + '" width="' + GEOM.cellW +
                    '" height="32" rx="5"></rect>';
                html += '<text class="pal-cellnum' + (isNew ? " pal-cellnum--new" : "") +
                    '" x="' + (cx + GEOM.cellW / 2) + '" y="' + (y + 28) +
                    '" text-anchor="middle">' + arr[j] + "</text>";
            }
        }

        /* 화살표 + 이름표 */
        for (i = 0; i < names.length; i++) {
            name = names[i];
            id = s.vars[name];
            if (id === null) continue;
            ty = GEOM.tags[name];
            hot = s.hot.indexOf(name) !== -1;
            anchorY = GEOM.anchors[id][name];
            if (anchorY === undefined) {
                anchorY = GEOM.boxes[id] + GEOM.boxH / 2;
            }
            html += arrowMarkup(GEOM.tagX + GEOM.tagW, ty + GEOM.tagH / 2,
                GEOM.boxX - 2, anchorY, hot);
            html += '<rect class="pal-tag' + (hot ? " is-hot" : "") + '" x="' +
                GEOM.tagX + '" y="' + ty + '" width="' + GEOM.tagW +
                '" height="' + GEOM.tagH + '" rx="6"></rect>';
            html += '<text class="pal-tagname" x="' + (GEOM.tagX + GEOM.tagW / 2) +
                '" y="' + (ty + 21) + '" text-anchor="middle">' + name + "</text>";
        }

        return html + "</svg>";
    }

    /* ------------------------------------------------------------------
       위젯 등록
       ------------------------------------------------------------------ */
    window.SIM.register("py-alias-lab", {
        title: "리스트 별칭 vs 복사",
        /* node 테스트에서 순수 로직에 접근하기 위한 노출 */
        logic: {
            CODE_LINES: CODE_LINES,
            formatList: formatList,
            buildSteps: buildSteps,
            describeMemory: describeMemory,
            svgMarkup: svgMarkup
        },
        build: function (root) {
            var steps = buildSteps();
            var idx = 0;
            var html = "";
            var i;

            html += '<div class="pal-layout">';
            html += '<div class="pal-code" role="group" aria-label="파이썬 예제 코드 7줄">';
            for (i = 0; i < CODE_LINES.length; i++) {
                html += '<div class="pal-line" data-line="' + (i + 1) + '">' +
                    '<span class="pal-ln" aria-hidden="true">' + (i + 1) + "</span>" +
                    "<code></code></div>";
            }
            html += "</div>";
            html += '<div class="pal-diagram"></div>';
            html += "</div>";

            html += '<div class="sim__row">' +
                '<button type="button" class="sim__btn sim__btn--primary" data-act="next" aria-label="다음 줄 실행">다음 단계</button>' +
                '<button type="button" class="sim__btn" data-act="reset" aria-label="처음부터 다시 실행">처음부터</button>' +
                '<span class="pal-count" aria-hidden="true"></span>' +
                "</div>";

            html += '<p class="pal-outlabel">print 출력</p>';
            html += '<pre class="sim__out pal-out" aria-live="polite" aria-label="print 출력 결과"></pre>';

            html += '<p class="pal-msg" role="status" aria-live="polite">' +
                '<strong class="pal-msg-emph"></strong>' +
                '<span class="pal-msg-text"></span></p>';

            html += '<p class="sim__note">이름표(변수)는 상자(리스트)를 가리키는 화살표일 뿐입니다. ' +
                "b = a는 화살표만 하나 더 만들고, a[:]는 내용을 통째로 복사한 새 상자를 만듭니다.</p>";

            root.innerHTML = html;

            var lineEls = root.querySelectorAll(".pal-line");
            for (i = 0; i < lineEls.length; i++) {
                lineEls[i].querySelector("code").textContent = CODE_LINES[i];
            }
            var diagramEl = root.querySelector(".pal-diagram");
            var nextBtn = root.querySelector('[data-act="next"]');
            var resetBtn = root.querySelector('[data-act="reset"]');
            var countEl = root.querySelector(".pal-count");
            var outEl = root.querySelector(".pal-out");
            var msgEl = root.querySelector(".pal-msg");
            var emphEl = root.querySelector(".pal-msg-emph");
            var textEl = root.querySelector(".pal-msg-text");

            function setClass(el, cls, on) {
                if (on) {
                    el.classList.add(cls);
                } else {
                    el.classList.remove(cls);
                }
            }

            function render() {
                var s = steps[idx];
                var j;
                for (j = 0; j < lineEls.length; j++) {
                    setClass(lineEls[j], "is-cur", j + 1 === s.line);
                    setClass(lineEls[j], "is-done", j + 1 < s.line);
                }
                diagramEl.innerHTML = svgMarkup(s);
                if (s.output.length > 0) {
                    outEl.textContent = s.output.join("\n");
                } else {
                    outEl.textContent = "(아직 출력이 없습니다)";
                }
                emphEl.textContent = s.emph;
                textEl.textContent = s.msg;
                setClass(msgEl, "is-warn", s.tone === "warn");
                setClass(msgEl, "is-tip", s.tone === "tip");
                countEl.textContent = "단계 " + idx + "/" + (steps.length - 1);
                nextBtn.disabled = idx >= steps.length - 1;
            }

            nextBtn.addEventListener("click", function () {
                if (idx < steps.length - 1) idx += 1;
                render();
            });
            resetBtn.addEventListener("click", function () {
                idx = 0;
                render();
            });

            render();
        }
    });
})();

/* sim:py-collection-chooser - 어떤 자료구조를 쓸까? */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 데이터 (DOM 비의존) ---- */
    var CHOICES = [
        { key: "list", label: "리스트" },
        { key: "tuple", label: "튜플" },
        { key: "dict", label: "딕셔너리" },
        { key: "set", label: "집합" }
    ];

    var BANK = [
        {
            q: "학생 이름으로 성적을 빠르게 찾고 싶다.",
            answer: "dict",
            why: "이름(키)으로 성적(값)을 바로 꺼내는 키-값 구조가 필요합니다. 목록을 순서대로 훑지 않고 키로 즉시 접근합니다.",
            code: "scores = {\"민수\": 90}; scores[\"민수\"]  # 90"
        },
        {
            q: "변하면 안 되는 (x, y) 좌표를 저장하고 싶다.",
            answer: "tuple",
            why: "튜플은 불변(변경 불가)이라 한 번 만든 좌표가 실수로 바뀌는 일을 막아 줍니다. 순서도 유지됩니다.",
            code: "point = (3, 5)   # point[0] = 10 -> TypeError"
        },
        {
            q: "방문자 ID 목록에서 중복을 제거하고 싶다.",
            answer: "set",
            why: "집합은 중복을 허용하지 않으므로 set()에 넣는 것만으로 중복이 사라집니다. 대신 순서는 보장되지 않습니다.",
            code: "set([\"a\", \"b\", \"a\"])   # {\"a\", \"b\"}"
        },
        {
            q: "순서를 유지하면서 항목을 추가/삭제하는 할 일 목록을 만들고 싶다.",
            answer: "list",
            why: "리스트는 변경 가능(가변)하고 입력한 순서가 그대로 유지되므로 추가/삭제가 잦은 할 일 목록에 맞습니다.",
            code: "todos.append(\"과제 제출\"); todos.remove(\"청소\")"
        },
        {
            q: "긴 텍스트에서 단어별 등장 횟수(빈도)를 세고 싶다.",
            answer: "dict",
            why: "단어를 키, 횟수를 값으로 두면 단어마다 빈도를 누적하기 쉽습니다. 키는 중복되지 않아 단어당 항목이 하나입니다.",
            code: "counts[word] = counts.get(word, 0) + 1"
        },
        {
            q: "함수가 (최솟값, 최댓값)을 한 번에 반환하게 하고 싶다.",
            answer: "tuple",
            why: "파이썬 함수가 여러 값을 반환하면 내부적으로 튜플이 됩니다. 반환된 묶음이 바뀌면 안 되므로 불변인 튜플이 어울립니다.",
            code: "return min(data), max(data)   # 튜플 반환"
        },
        {
            q: "두 동아리의 공통 회원을 찾고 싶다.",
            answer: "set",
            why: "집합끼리는 & 연산자로 교집합을 한 번에 구할 수 있습니다. 회원 명단은 중복이 없는 모음이므로 집합이 자연스럽습니다.",
            code: "club_a & club_b   # 교집합"
        },
        {
            q: "성적순으로 정렬할 점수 모음이 필요하다.",
            answer: "list",
            why: "정렬은 요소의 순서를 바꾸는 일이므로 순서가 있고 변경 가능한 리스트가 필요합니다. sort()로 제자리 정렬합니다.",
            code: "scores.sort()   # 오름차순 제자리 정렬"
        }
    ];

    /* ---- 순수 로직 (node 테스트 대상) ---- */
    var logic = {
        bankSize: function () {
            return BANK.length;
        },
        labelOf: function (key) {
            for (var i = 0; i < CHOICES.length; i++) {
                if (CHOICES[i].key === key) return CHOICES[i].label;
            }
            return key;
        },
        /* qIndex 문제에 key로 답했을 때의 판정 */
        judge: function (qIndex, key) {
            var item = BANK[qIndex];
            return {
                correct: item.answer === key,
                answerKey: item.answer,
                answerLabel: logic.labelOf(item.answer)
            };
        },
        /* 0..n-1 순열 (Fisher-Yates, rand는 [0,1) 난수 함수) */
        shuffleOrder: function (n, rand) {
            var order = [];
            var i;
            for (i = 0; i < n; i++) order.push(i);
            for (i = n - 1; i > 0; i--) {
                var j = Math.floor(rand() * (i + 1));
                if (j < 0) j = 0;
                if (j > i) j = i;
                var tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
            return order;
        },
        /* 종료 요약 문구 */
        grade: function (score, total) {
            if (score >= total) {
                return "완벽합니다! 순서/변경/중복 기준을 모두 정확히 구분했어요.";
            }
            if (score / total >= 0.75) {
                return "훌륭해요. 틀린 문제의 해설만 한 번 더 확인해 보세요.";
            }
            if (score / total >= 0.5) {
                return "절반 이상 맞혔어요. 아래 비교 표로 네 자료구조의 특성을 다시 정리해 보세요.";
            }
            return "아직 헷갈리네요. 아래 비교 표를 먼저 읽고 다시 도전해 보세요.";
        }
    };

    window.SIM.register("py-collection-chooser", {
        title: "어떤 자료구조를 쓸까?",
        _logic: logic,
        build: function (root) {
            var i;
            var choiceHtml = "";
            for (i = 0; i < CHOICES.length; i++) {
                choiceHtml += '<button type="button" class="sim__btn pcc-choice" data-key="'
                    + CHOICES[i].key + '">' + CHOICES[i].label + "</button>";
            }

            root.innerHTML = ""
                + '<p class="sim__note pcc-intro">시나리오를 읽고 가장 알맞은 자료구조 버튼을 누르세요. 총 '
                +     BANK.length + "문제, 순서는 매번 섞입니다.</p>"
                + '<div class="pcc-quiz">'
                +     '<div class="sim__row pcc-status">'
                +         '<span class="sim__chip pcc-progress"></span>'
                +         '<span class="sim__chip pcc-score"></span>'
                +     "</div>"
                +     '<p class="pcc-scenario"></p>'
                +     '<div class="pcc-choices" role="group" aria-label="자료구조 선택">' + choiceHtml + "</div>"
                +     '<div class="pcc-feedback" aria-live="polite" hidden>'
                +         '<p class="pcc-verdict"></p>'
                +         '<p class="pcc-why"></p>'
                +         '<div class="sim__out pcc-code"></div>'
                +     "</div>"
                +     '<div class="sim__row pcc-controls">'
                +         '<button type="button" class="sim__btn sim__btn--primary pcc-next" disabled>다음 문제</button>'
                +         '<button type="button" class="sim__btn pcc-reset" aria-label="퀴즈를 처음부터 다시 시작">다시 풀기</button>'
                +     "</div>"
                + "</div>"
                + '<div class="pcc-summary" aria-live="polite" hidden>'
                +     '<p class="pcc-sum-title">퀴즈 종료</p>'
                +     '<p class="pcc-sum-score"></p>'
                +     '<p class="pcc-sum-msg"></p>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary pcc-retry">다시 풀기</button>'
                +     "</div>"
                + "</div>"
                + '<div class="pcc-ref">'
                +     '<p class="pcc-ref-title">네 자료구조 비교</p>'
                +     '<div class="pcc-table-wrap">'
                +         '<table aria-label="리스트, 튜플, 딕셔너리, 집합 특성 비교">'
                +             "<thead><tr><th>자료구조</th><th>표기</th><th>순서</th><th>변경</th><th>중복</th></tr></thead>"
                +             "<tbody>"
                +                 '<tr data-key="list"><td>리스트</td><td><code>[ ]</code></td><td>있음</td><td>가능</td><td>허용</td></tr>'
                +                 '<tr data-key="tuple"><td>튜플</td><td><code>( )</code></td><td>있음</td><td>불가</td><td>허용</td></tr>'
                +                 '<tr data-key="dict"><td>딕셔너리</td><td><code>{k: v}</code></td><td>있음(3.7+)</td><td>가능</td><td>키 중복 불가</td></tr>'
                +                 '<tr data-key="set"><td>집합</td><td><code>{ }</code></td><td>없음</td><td>가능</td><td>불가</td></tr>'
                +             "</tbody>"
                +         "</table>"
                +     "</div>"
                + "</div>";

            var quizEl = root.querySelector(".pcc-quiz");
            var progressEl = root.querySelector(".pcc-progress");
            var scoreEl = root.querySelector(".pcc-score");
            var scenarioEl = root.querySelector(".pcc-scenario");
            var choicesEl = root.querySelector(".pcc-choices");
            var choiceBtns = root.querySelectorAll(".pcc-choice");
            var feedbackEl = root.querySelector(".pcc-feedback");
            var verdictEl = root.querySelector(".pcc-verdict");
            var whyEl = root.querySelector(".pcc-why");
            var codeEl = root.querySelector(".pcc-code");
            var nextBtn = root.querySelector(".pcc-next");
            var resetBtn = root.querySelector(".pcc-reset");
            var summaryEl = root.querySelector(".pcc-summary");
            var sumScoreEl = root.querySelector(".pcc-sum-score");
            var sumMsgEl = root.querySelector(".pcc-sum-msg");
            var retryBtn = root.querySelector(".pcc-retry");
            var refRows = root.querySelectorAll(".pcc-ref tbody tr");

            var state = { order: [], pos: 0, score: 0, answered: false };

            function updateChips() {
                progressEl.textContent = "문제 " + (state.pos + 1) + " / " + BANK.length;
                scoreEl.textContent = "점수 " + state.score;
            }

            function highlightRef(key) {
                for (var k = 0; k < refRows.length; k++) {
                    if (key !== null && refRows[k].getAttribute("data-key") === key) {
                        refRows[k].className = "is-hit";
                    } else {
                        refRows[k].className = "";
                    }
                }
            }

            function renderQuestion() {
                var item = BANK[state.order[state.pos]];
                state.answered = false;
                updateChips();
                scenarioEl.textContent = "Q. " + item.q;
                for (var k = 0; k < choiceBtns.length; k++) {
                    choiceBtns[k].disabled = false;
                    choiceBtns[k].classList.remove("is-correct");
                    choiceBtns[k].classList.remove("is-wrong");
                }
                feedbackEl.hidden = true;
                verdictEl.textContent = "";
                whyEl.textContent = "";
                codeEl.textContent = "";
                nextBtn.disabled = true;
                nextBtn.textContent = (state.pos === BANK.length - 1) ? "결과 보기" : "다음 문제";
                highlightRef(null);
            }

            function start() {
                state.order = logic.shuffleOrder(BANK.length, Math.random);
                state.pos = 0;
                state.score = 0;
                summaryEl.hidden = true;
                quizEl.hidden = false;
                renderQuestion();
            }

            function onChoose(key) {
                if (state.answered) return;
                state.answered = true;
                var qIndex = state.order[state.pos];
                var item = BANK[qIndex];
                var res = logic.judge(qIndex, key);
                if (res.correct) state.score++;
                updateChips();
                for (var k = 0; k < choiceBtns.length; k++) {
                    var btnKey = choiceBtns[k].getAttribute("data-key");
                    choiceBtns[k].disabled = true;
                    if (btnKey === res.answerKey) {
                        choiceBtns[k].classList.add("is-correct");
                    } else if (btnKey === key) {
                        choiceBtns[k].classList.add("is-wrong");
                    }
                }
                verdictEl.className = "pcc-verdict " + (res.correct ? "ok" : "bad");
                verdictEl.textContent = res.correct
                    ? "정답! " + res.answerLabel
                    : "오답. 정답은 " + res.answerLabel + "입니다.";
                whyEl.textContent = item.why;
                codeEl.textContent = item.code;
                feedbackEl.hidden = false;
                highlightRef(res.answerKey);
                nextBtn.disabled = false;
            }

            function showSummary() {
                quizEl.hidden = true;
                summaryEl.hidden = false;
                sumScoreEl.textContent = BANK.length + "문제 중 " + state.score + "문제 정답";
                sumMsgEl.textContent = logic.grade(state.score, BANK.length);
                highlightRef(null);
            }

            choicesEl.addEventListener("click", function (e) {
                var btn = e.target;
                while (btn && btn !== choicesEl && btn.tagName !== "BUTTON") {
                    btn = btn.parentNode;
                }
                if (!btn || btn === choicesEl || btn.disabled) return;
                onChoose(btn.getAttribute("data-key"));
            });

            nextBtn.addEventListener("click", function () {
                if (!state.answered) return;
                if (state.pos === BANK.length - 1) {
                    showSummary();
                } else {
                    state.pos++;
                    renderQuestion();
                }
            });

            resetBtn.addEventListener("click", start);
            retryBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:py-grade-flow - if / elif / else 흐름 추적기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 판정 로직 (DOM 비의존) ---- */
    var logic = {
        /* 점수 분기 정의: 위에서부터 차례로 검사된다 */
        BRANCHES: [
            { limit: 90, grade: "A" },
            { limit: 80, grade: "B" },
            { limit: 70, grade: "C" }
        ],
        /* 0~100 정수로 클램프. 숫자가 아니면 null */
        clamp: function (n) {
            if (typeof n !== "number" || isNaN(n)) return null;
            n = Math.floor(n);
            if (n < 0) n = 0;
            if (n > 100) n = 100;
            return n;
        },
        /* 점수 하나를 if/elif/else에 통과시켜 경로를 계산한다.
           checks[i] = { limit, grade, evaluated, result }
           - evaluated=false: 앞에서 이미 참이 나와 검사 자체를 건너뜀
           - result: 검사했을 때의 참/거짓 (검사 안 했으면 null) */
        evaluate: function (score) {
            var checks = [];
            var hit = -1;
            var i;
            for (i = 0; i < this.BRANCHES.length; i++) {
                if (hit >= 0) {
                    checks.push({
                        limit: this.BRANCHES[i].limit,
                        grade: this.BRANCHES[i].grade,
                        evaluated: false,
                        result: null
                    });
                    continue;
                }
                var pass = score >= this.BRANCHES[i].limit;
                checks.push({
                    limit: this.BRANCHES[i].limit,
                    grade: this.BRANCHES[i].grade,
                    evaluated: true,
                    result: pass
                });
                if (pass) hit = i;
            }
            var isElse = hit < 0;
            return {
                grade: isElse ? "F" : this.BRANCHES[hit].grade,
                hit: hit,
                isElse: isElse,
                checks: checks
            };
        },
        /* 경로 설명 한 줄. 예) "85점: 90 미만 -> 다음 조건, 80 이상 -> B 확정" */
        explain: function (score) {
            var r = this.evaluate(score);
            var parts = [];
            var i;
            for (i = 0; i < r.checks.length; i++) {
                var c = r.checks[i];
                if (!c.evaluated) break;
                if (c.result) {
                    parts.push(c.limit + " 이상 -> " + c.grade + " 확정");
                } else {
                    parts.push(c.limit + " 미만 -> 다음 조건");
                }
            }
            if (r.isElse) {
                parts.push("모든 조건 거짓 -> else에서 F 확정");
            }
            return score + "점: " + parts.join(", ");
        }
    };

    window.SIM.register("py-grade-flow", {
        title: "if / elif / else 흐름 추적기",
        _logic: logic,
        build: function (root) {
            var BOUNDS = [90, 89, 80, 70, 69];
            var boundsHtml = "";
            var i;
            for (i = 0; i < BOUNDS.length; i++) {
                boundsHtml += '<button type="button" class="sim__btn gf-bound"'
                    + ' data-score="' + BOUNDS[i] + '" aria-pressed="false"'
                    + ' aria-label="점수를 ' + BOUNDS[i] + '점으로 설정">'
                    + BOUNDS[i] + "</button>";
            }

            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="gf-sliderwrap">'
                +         '<span class="gf-slidertext">score</span>'
                +         '<input type="range" class="gf-slider" min="0" max="100" step="1" value="85" aria-label="점수, 0부터 100까지">'
                +     '</label>'
                +     '<span class="sim__chip gf-scoreval">score = 85</span>'
                + '</div>'
                + '<div class="sim__row gf-bounds" role="group" aria-label="경계값 바로 가기 버튼">'
                +     '<span class="gf-bounds-label">경계값</span>'
                +     boundsHtml
                + '</div>'
                + '<div class="gf-code" aria-label="코드 실행 경로 시각화">'
                +     '<div class="gf-line" data-line="score"><code class="gf-src">score = <span class="gf-scorenum">85</span></code></div>'
                +     '<div class="gf-line" data-line="c0"><code class="gf-src">if score &gt;= 90:</code><span class="gf-badge" data-badge="c0" hidden></span></div>'
                +     '<div class="gf-line" data-line="b0"><code class="gf-src">    grade = "A"</code></div>'
                +     '<div class="gf-line" data-line="c1"><code class="gf-src">elif score &gt;= 80:</code><span class="gf-badge" data-badge="c1" hidden></span></div>'
                +     '<div class="gf-line" data-line="b1"><code class="gf-src">    grade = "B"</code></div>'
                +     '<div class="gf-line" data-line="c2"><code class="gf-src">elif score &gt;= 70:</code><span class="gf-badge" data-badge="c2" hidden></span></div>'
                +     '<div class="gf-line" data-line="b2"><code class="gf-src">    grade = "C"</code></div>'
                +     '<div class="gf-line" data-line="else"><code class="gf-src">else:</code><span class="gf-badge" data-badge="else" hidden></span></div>'
                +     '<div class="gf-line" data-line="b3"><code class="gf-src">    grade = "F"</code></div>'
                +     '<div class="gf-line" data-line="print"><code class="gf-src">print(grade)</code></div>'
                + '</div>'
                + '<div class="gf-live" aria-live="polite">'
                +     '<p class="gf-explain"></p>'
                +     '<div class="gf-outrow">'
                +         '<span class="sim__chip">출력</span>'
                +         '<div class="sim__out gf-out"></div>'
                +     '</div>'
                + '</div>'
                + '<p class="sim__note">조건은 위에서부터 차례로 검사되고, 처음 참이 되는 곳에서 멈춥니다. '
                + '검사조차 안 한 줄은 흐리게 표시됩니다. 89와 90처럼 경계 바로 앞뒤를 눌러 비교해 보세요.</p>';

            var slider = root.querySelector(".gf-slider");
            var scoreChip = root.querySelector(".gf-scoreval");
            var scoreNum = root.querySelector(".gf-scorenum");
            var explainEl = root.querySelector(".gf-explain");
            var outEl = root.querySelector(".gf-out");
            var boundBtns = root.querySelectorAll(".gf-bound");

            /* data-line 키 -> 줄 요소, data-badge 키 -> 배지 요소 */
            var lines = {};
            var badges = {};
            var lineEls = root.querySelectorAll(".gf-line");
            for (i = 0; i < lineEls.length; i++) {
                lines[lineEls[i].getAttribute("data-line")] = lineEls[i];
            }
            var badgeEls = root.querySelectorAll(".gf-badge");
            for (i = 0; i < badgeEls.length; i++) {
                badges[badgeEls[i].getAttribute("data-badge")] = badgeEls[i];
            }

            function setLine(key, state) {
                /* state: "" | "skip" | "hit" */
                var cls = "gf-line";
                if (state === "skip") cls += " gf-line--skip";
                if (state === "hit") cls += " gf-line--hit";
                lines[key].className = cls;
            }

            function setBadge(key, kind, text) {
                /* kind: null(숨김) | "true" | "false" */
                var el = badges[key];
                if (!kind) {
                    el.hidden = true;
                    el.textContent = "";
                    el.className = "gf-badge";
                    return;
                }
                el.hidden = false;
                el.textContent = text;
                el.className = "gf-badge gf-badge--" + kind;
            }

            function render(score) {
                var r = logic.evaluate(score);
                scoreChip.textContent = "score = " + score;
                scoreNum.textContent = String(score);

                for (var k = 0; k < r.checks.length; k++) {
                    var c = r.checks[k];
                    var condKey = "c" + k;
                    var bodyKey = "b" + k;
                    if (!c.evaluated) {
                        /* 앞에서 멈춰서 검사 자체를 안 한 조건 */
                        setLine(condKey, "skip");
                        setBadge(condKey, null);
                        setLine(bodyKey, "skip");
                    } else if (c.result) {
                        /* 적중: 조건 줄과 해당 grade 줄 하이라이트 */
                        setLine(condKey, "hit");
                        setBadge(condKey, "true", "참");
                        setLine(bodyKey, "hit");
                    } else {
                        /* 검사했지만 거짓이라 다음으로 */
                        setLine(condKey, "");
                        setBadge(condKey, "false", "거짓 -> 다음");
                        setLine(bodyKey, "skip");
                    }
                }
                if (r.isElse) {
                    setLine("else", "hit");
                    setBadge("else", "true", "모두 거짓 -> 실행");
                    setLine("b3", "hit");
                } else {
                    setLine("else", "skip");
                    setBadge("else", null);
                    setLine("b3", "skip");
                }

                explainEl.textContent = logic.explain(score);
                outEl.textContent = r.grade;

                for (var b = 0; b < boundBtns.length; b++) {
                    var on = parseInt(boundBtns[b].getAttribute("data-score"), 10) === score;
                    boundBtns[b].setAttribute("aria-pressed", on ? "true" : "false");
                }
            }

            slider.addEventListener("input", function () {
                var n = logic.clamp(parseInt(slider.value, 10));
                if (n === null) n = 85;
                render(n);
            });

            for (i = 0; i < boundBtns.length; i++) {
                boundBtns[i].addEventListener("click", function () {
                    var n = logic.clamp(parseInt(this.getAttribute("data-score"), 10));
                    if (n === null) return;
                    slider.value = String(n);
                    render(n);
                });
            }

            render(85);
        }
    });
})();

/* sim:py-loop-tracer - 반복문 한 단계씩 추적 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ------------------------------------------------------------------
       순수 로직 (DOM 비의존, node 테스트 대상)
       step 객체 형태:
       {
           line: 강조할 코드 줄 인덱스 (0부터),
           note: 이 단계에서 일어나는 일 설명,
           row:  추적 표에 추가할 행 { cells: [...], skip?, hit? } 또는 null,
           out:  출력 패널에 이어붙일 문자열 또는 null,
           emph: "break" | "continue" | null (특수 줄 강조),
           done: 마지막 단계 여부
       }
       ------------------------------------------------------------------ */
    var LOGIC = {
        step: function (line, note, extra) {
            var s = { line: line, note: note, row: null, out: null, emph: null, done: false };
            if (extra) {
                if (extra.row) { s.row = extra.row; }
                if (extra.out) { s.out = extra.out; }
                if (extra.emph) { s.emph = extra.emph; }
                if (extra.done) { s.done = true; }
            }
            return s;
        },

        /* 탭1: 리스트 합계 누적 - 최종 출력 60 */
        sumSteps: function () {
            var values = [10, 20, 30];
            var steps = [];
            var total = 0;
            var i;
            steps.push(LOGIC.step(0, "total을 0으로 초기화합니다."));
            for (i = 0; i < values.length; i++) {
                steps.push(LOGIC.step(1, (i + 1) + "회차: 리스트에서 n = " + values[i] + "을(를) 꺼냅니다."));
                steps.push(LOGIC.step(2, "total = " + total + " + " + values[i] + " = " + (total + values[i]), {
                    row: { cells: [String(i + 1), String(values[i]), String(total + values[i])] }
                }));
                total += values[i];
            }
            steps.push(LOGIC.step(1, "리스트에 남은 값이 없어 반복이 끝납니다."));
            steps.push(LOGIC.step(3, "print(total)이 최종 합계 " + total + "을(를) 출력합니다.", {
                out: String(total),
                done: true
            }));
            return steps;
        },

        /* 탭2: 제곱이 50을 넘는 첫 수 찾기 - n=8에서 break */
        breakSteps: function () {
            var steps = [];
            var n;
            var sq;
            var hit;
            for (n = 1; n < 100; n++) {
                steps.push(LOGIC.step(0, "n = " + n + " (range(1, 100)은 1부터 99까지 차례로 줍니다)"));
                sq = n * n;
                hit = sq > 50;
                steps.push(LOGIC.step(1, n + " * " + n + " = " + sq + " -> 50보다 " + (hit ? "크므로 참입니다." : "크지 않으므로 거짓입니다. 다음 회차로 넘어갑니다."), {
                    row: { cells: [String(n), String(sq), hit ? "참" : "거짓"], hit: hit }
                }));
                if (hit) {
                    steps.push(LOGIC.step(2, "조건이 처음으로 참이 되어 print가 실행됩니다.", {
                        out: "제곱이 50을 넘는 첫 수: " + n
                    }));
                    steps.push(LOGIC.step(3, "break: 남은 반복(n = " + (n + 1) + "부터 99까지)을 모두 버리고 즉시 빠져나갑니다.", {
                        emph: "break",
                        done: true
                    }));
                    return steps;
                }
            }
            return steps;
        },

        /* 탭3: 짝수는 continue로 건너뛰기 - 출력 "1 3 5 7 9 " */
        continueSteps: function () {
            var steps = [];
            var n;
            var even;
            for (n = 1; n <= 10; n++) {
                steps.push(LOGIC.step(0, "n = " + n));
                even = n % 2 === 0;
                steps.push(LOGIC.step(1, n + " % 2 = " + (n % 2) + " -> 조건은 " + (even ? "참 (짝수)" : "거짓 (홀수)") + "입니다."));
                if (even) {
                    steps.push(LOGIC.step(2, "continue: 아래 print를 건너뛰고 바로 다음 회차로 넘어갑니다.", {
                        row: { cells: [String(n), "짝수", "건너뜀"], skip: true },
                        emph: "continue"
                    }));
                } else {
                    steps.push(LOGIC.step(3, "print(" + n + ", end=\" \")가 " + n + "와(과) 공백 한 칸을 출력합니다 (줄바꿈 없음).", {
                        row: { cells: [String(n), "홀수", String(n)] },
                        out: n + " "
                    }));
                }
            }
            steps.push(LOGIC.step(0, "range(1, 11)이 끝나 반복을 종료합니다. 홀수만 출력되었습니다.", { done: true }));
            return steps;
        },

        /* steps 배열에서 print 출력만 모아 이어붙인다 (테스트/검증용) */
        collectOut: function (steps) {
            var buf = "";
            var i;
            for (i = 0; i < steps.length; i++) {
                if (steps[i].out !== null) { buf += steps[i].out; }
            }
            return buf;
        },

        /* 예제 3개 정의 (코드 줄, 표 컬럼, 단계 시퀀스) */
        examples: function () {
            return [
                {
                    id: "sum",
                    label: "합계 누적",
                    code: [
                        "total = 0",
                        "for n in [10, 20, 30]:",
                        "    total += n",
                        "print(total)"
                    ],
                    cols: ["회차", "n", "total"],
                    steps: LOGIC.sumSteps()
                },
                {
                    id: "break",
                    label: "break",
                    code: [
                        "for n in range(1, 100):",
                        "    if n * n > 50:",
                        "        print(\"제곱이 50을 넘는 첫 수:\", n)",
                        "        break"
                    ],
                    cols: ["n", "n * n", "조건 결과"],
                    steps: LOGIC.breakSteps()
                },
                {
                    id: "continue",
                    label: "continue",
                    code: [
                        "for n in range(1, 11):",
                        "    if n % 2 == 0:",
                        "        continue",
                        "    print(n, end=\" \")"
                    ],
                    cols: ["n", "판정", "출력"],
                    steps: LOGIC.continueSteps()
                }
            ];
        }
    };

    window.SIM.register("py-loop-tracer", {
        title: "반복문 한 단계씩 추적",
        _logic: LOGIC,
        build: function (root) {
            var examples = LOGIC.examples();

            root.innerHTML = ""
                + '<div class="sim__tabs plt-tabs" role="tablist" aria-label="반복문 예제 선택"></div>'
                + '<div class="plt-code" aria-label="예제 코드"></div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary plt-step" aria-label="한 단계 실행">한 단계</button>'
                +     '<button type="button" class="sim__btn plt-run" aria-label="끝까지 실행">끝까지</button>'
                +     '<button type="button" class="sim__btn plt-reset" aria-label="처음부터 다시 시작">처음부터</button>'
                +     '<span class="sim__chip plt-status">시작 전</span>'
                + '</div>'
                + '<p class="sim__note plt-note" aria-live="polite"></p>'
                + '<div class="plt-tablewrap">'
                +     '<table><thead></thead><tbody></tbody></table>'
                + '</div>'
                + '<div class="plt-outwrap">'
                +     '<span class="sim__chip">출력</span>'
                +     '<div class="sim__out plt-out plt-out--empty" aria-live="polite" aria-label="print 출력 결과"></div>'
                + '</div>';

            var tabsBox = root.querySelector(".plt-tabs");
            var codeBox = root.querySelector(".plt-code");
            var stepBtn = root.querySelector(".plt-step");
            var runBtn = root.querySelector(".plt-run");
            var resetBtn = root.querySelector(".plt-reset");
            var statusChip = root.querySelector(".plt-status");
            var noteEl = root.querySelector(".plt-note");
            var theadEl = root.querySelector("thead");
            var tbodyEl = root.querySelector("tbody");
            var outEl = root.querySelector(".plt-out");

            var cur = 0;        /* 현재 예제 인덱스 */
            var idx = 0;        /* 다음에 실행할 단계 인덱스 */
            var outBuf = "";    /* 누적 print 출력 */
            var lineEls = [];   /* 코드 줄 요소 목록 */
            var lastRow = null; /* 마지막으로 추가한 표 행 */
            var tabEls = [];

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            /* 탭 버튼 생성 */
            (function makeTabs() {
                var i;
                var b;
                function onTab() {
                    selectTab(parseInt(this.getAttribute("data-idx"), 10));
                }
                for (i = 0; i < examples.length; i++) {
                    b = document.createElement("button");
                    b.type = "button";
                    b.className = "sim__tab" + (i === 0 ? " active" : "");
                    b.setAttribute("role", "tab");
                    b.setAttribute("aria-selected", i === 0 ? "true" : "false");
                    b.setAttribute("data-idx", String(i));
                    b.textContent = examples[i].label;
                    b.addEventListener("click", onTab);
                    tabsBox.appendChild(b);
                    tabEls.push(b);
                }
            })();

            /* 현재 예제 코드를 줄 단위로 그린다 */
            function renderCode() {
                clearNode(codeBox);
                lineEls = [];
                var code = examples[cur].code;
                var i;
                var line;
                var no;
                var txt;
                for (i = 0; i < code.length; i++) {
                    line = document.createElement("div");
                    line.className = "plt-line";
                    no = document.createElement("span");
                    no.className = "plt-lineno";
                    no.setAttribute("aria-hidden", "true");
                    no.textContent = String(i + 1);
                    txt = document.createElement("span");
                    txt.className = "plt-text";
                    txt.textContent = code[i];
                    line.appendChild(no);
                    line.appendChild(txt);
                    codeBox.appendChild(line);
                    lineEls.push(line);
                }
            }

            /* 추적 표 머리글을 현재 예제 컬럼으로 그린다 */
            function renderHead() {
                clearNode(theadEl);
                var tr = document.createElement("tr");
                var cols = examples[cur].cols;
                var i;
                var th;
                for (i = 0; i < cols.length; i++) {
                    th = document.createElement("th");
                    th.setAttribute("scope", "col");
                    th.textContent = cols[i];
                    tr.appendChild(th);
                }
                theadEl.appendChild(tr);
            }

            /* 출력 패널 갱신 (비어 있으면 안내 문구) */
            function renderOut() {
                if (outBuf === "") {
                    outEl.classList.add("plt-out--empty");
                    outEl.textContent = "(아직 출력 없음)";
                } else {
                    outEl.classList.remove("plt-out--empty");
                    outEl.textContent = outBuf;
                }
            }

            /* 현재 단계 줄 강조 (step이 null이면 모두 해제) */
            function highlight(step) {
                var i;
                var cls;
                for (i = 0; i < lineEls.length; i++) {
                    lineEls[i].className = "plt-line";
                }
                if (step) {
                    cls = "plt-line active";
                    if (step.emph === "break") { cls += " plt-line--break"; }
                    if (step.emph === "continue") { cls += " plt-line--continue"; }
                    lineEls[step.line].className = cls;
                }
            }

            /* 추적 표에 행 추가 (마지막 행은 새 행 강조) */
            function appendRow(row) {
                var tr = document.createElement("tr");
                var i;
                var td;
                var badge;
                var last = row.cells.length - 1;
                for (i = 0; i < row.cells.length; i++) {
                    td = document.createElement("td");
                    if (i === last && row.skip) {
                        badge = document.createElement("span");
                        badge.className = "plt-skip";
                        badge.textContent = row.cells[i];
                        td.appendChild(badge);
                    } else {
                        td.textContent = row.cells[i];
                        if (i === last && typeof row.hit === "boolean") {
                            td.className = row.hit ? "plt-true" : "plt-false";
                        }
                    }
                    tr.appendChild(td);
                }
                if (lastRow) { lastRow.classList.remove("plt-row-new"); }
                tr.className = "plt-row-new";
                lastRow = tr;
                tbodyEl.appendChild(tr);
            }

            /* 진행 상태 칩과 버튼 활성화 갱신 */
            function updateStatus(doneFlag) {
                var total = examples[cur].steps.length;
                if (idx === 0) {
                    statusChip.textContent = "시작 전";
                    statusChip.classList.remove("plt-status--done");
                } else if (doneFlag) {
                    statusChip.textContent = "종료 (" + idx + "/" + total + " 단계)";
                    statusChip.classList.add("plt-status--done");
                } else {
                    statusChip.textContent = "단계 " + idx + " / " + total;
                    statusChip.classList.remove("plt-status--done");
                }
                stepBtn.disabled = doneFlag;
                runBtn.disabled = doneFlag;
            }

            /* 단계 하나 실행. 더 실행할 단계가 있으면 true */
            function applyStep() {
                var steps = examples[cur].steps;
                var step;
                if (idx >= steps.length) { return false; }
                step = steps[idx];
                idx += 1;
                highlight(step);
                noteEl.textContent = step.note;
                if (step.row) { appendRow(step.row); }
                if (step.out !== null) {
                    outBuf += step.out;
                    renderOut();
                }
                updateStatus(step.done);
                return !step.done;
            }

            /* 처음 상태로 되돌린다 */
            function reset() {
                idx = 0;
                outBuf = "";
                lastRow = null;
                clearNode(tbodyEl);
                highlight(null);
                renderOut();
                noteEl.textContent = "\"한 단계\"를 누르면 지금 실행되는 줄이 강조되고, 변수 변화가 표에 기록됩니다.";
                updateStatus(false);
            }

            function selectTab(i) {
                cur = i;
                var k;
                for (k = 0; k < tabEls.length; k++) {
                    if (k === i) {
                        tabEls[k].classList.add("active");
                        tabEls[k].setAttribute("aria-selected", "true");
                    } else {
                        tabEls[k].classList.remove("active");
                        tabEls[k].setAttribute("aria-selected", "false");
                    }
                }
                renderCode();
                renderHead();
                reset();
            }

            stepBtn.addEventListener("click", function () {
                applyStep();
            });
            runBtn.addEventListener("click", function () {
                var guard = 0;
                while (applyStep() && guard < 500) {
                    guard += 1;
                }
            });
            resetBtn.addEventListener("click", reset);

            selectTab(0);
        }
    });
})();

/* sim:py-scope-vis - 함수 호출과 스코프 시각화 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 상태 전이 로직 (DOM 비의존, node로 검증) ----
       각 단계는 화면 전체 상태의 불변 스냅샷이다.
       { lines: 강조할 코드 줄 번호 배열(0부터),
         narration: 한 줄 내레이션,
         globals: 전역 프레임 변수 목록 [{name, value}],
         local: 지역 프레임(null이면 없음) {title, vars, ret, note, dying},
         callNote: 호출 지점으로 전달된 값 설명(null이면 숨김),
         output: 지금까지의 출력 줄 목록,
         changed: 이번 단계에 값이 바뀐 전역 변수 이름 목록 } */

    function v(name, value) {
        return { name: name, value: value };
    }

    function frame(title, vars, ret, note, dying) {
        return { title: title, vars: vars, ret: ret, note: note, dying: dying };
    }

    var logic = {
        callCode: [
            "def add(a, b):",
            "    return a + b",
            "print(add(3, 4))"
        ],
        globalCode: [
            "count = 0",
            "def increase():",
            "    global count",
            "    count += 1",
            "increase()",
            "increase()",
            "print(count)"
        ],
        /* 탭1: 호출과 반환 */
        callSteps: function () {
            return [
                {
                    lines: [0],
                    narration: "def 문이 실행되어 전역 프레임에 함수 add가 등록됩니다. 함수 본문은 아직 실행되지 않습니다.",
                    globals: [v("add", "<함수>")],
                    local: null,
                    callNote: null,
                    output: [],
                    changed: ["add"]
                },
                {
                    lines: [2],
                    narration: "print 안의 add(3, 4)가 호출됩니다. 지역 프레임이 새로 만들어지고 매개변수에 a=3, b=4가 채워집니다.",
                    globals: [v("add", "<함수>")],
                    local: frame("add 지역 프레임", [v("a", "3"), v("b", "4")], null, null, false),
                    callNote: null,
                    output: [],
                    changed: []
                },
                {
                    lines: [1],
                    narration: "함수 본문이 실행됩니다. return a + b 는 3 + 4 = 7 을 계산해 반환을 준비합니다.",
                    globals: [v("add", "<함수>")],
                    local: frame("add 지역 프레임", [v("a", "3"), v("b", "4")], "7", null, false),
                    callNote: null,
                    output: [],
                    changed: []
                },
                {
                    lines: [2],
                    narration: "함수가 끝나 지역 프레임은 소멸하고, 반환값 7이 호출 지점 add(3, 4) 자리에 전달됩니다.",
                    globals: [v("add", "<함수>")],
                    local: frame("add 지역 프레임", [v("a", "3"), v("b", "4")], "7", null, true),
                    callNote: "add(3, 4) → 7",
                    output: [],
                    changed: []
                },
                {
                    lines: [2],
                    narration: "print(7)이 실행되어 7이 출력됩니다. 사라진 지역 변수 a, b에는 더 이상 접근할 수 없습니다.",
                    globals: [v("add", "<함수>")],
                    local: null,
                    callNote: "add(3, 4) → 7",
                    output: ["7"],
                    changed: []
                }
            ];
        },
        /* 탭2: global 선언 */
        globalSteps: function () {
            return [
                {
                    lines: [0, 1],
                    narration: "count = 0 이 실행되어 전역 프레임에 count가 만들어지고, def 문으로 함수 increase가 등록됩니다.",
                    globals: [v("count", "0"), v("increase", "<함수>")],
                    local: null,
                    callNote: null,
                    output: [],
                    changed: ["count", "increase"]
                },
                {
                    lines: [4, 2],
                    narration: "첫 번째 increase() 호출로 지역 프레임이 생깁니다. global count 선언 덕분에 함수 안의 count는 지역 변수가 아니라 전역 변수 count를 가리킵니다.",
                    globals: [v("count", "0"), v("increase", "<함수>")],
                    local: frame("increase 지역 프레임", [], null, "global count → 전역 count 사용", false),
                    callNote: null,
                    output: [],
                    changed: []
                },
                {
                    lines: [3],
                    narration: "count += 1 이 전역 count를 0에서 1로 바꿉니다. 함수가 끝나면서 지역 프레임은 소멸합니다.",
                    globals: [v("count", "1"), v("increase", "<함수>")],
                    local: frame("increase 지역 프레임", [], null, "global count → 전역 count 사용", true),
                    callNote: null,
                    output: [],
                    changed: ["count"]
                },
                {
                    lines: [5, 2],
                    narration: "두 번째 increase() 호출로 지역 프레임이 다시 만들어집니다. count는 여전히 전역 변수를 가리킵니다.",
                    globals: [v("count", "1"), v("increase", "<함수>")],
                    local: frame("increase 지역 프레임", [], null, "global count → 전역 count 사용", false),
                    callNote: null,
                    output: [],
                    changed: []
                },
                {
                    lines: [3],
                    narration: "count += 1 이 전역 count를 1에서 2로 바꿉니다. 지역 프레임은 다시 소멸합니다.",
                    globals: [v("count", "2"), v("increase", "<함수>")],
                    local: frame("increase 지역 프레임", [], null, "global count → 전역 count 사용", true),
                    callNote: null,
                    output: [],
                    changed: ["count"]
                },
                {
                    lines: [6],
                    narration: "print(count)가 전역 프레임의 count를 읽어 2를 출력합니다.",
                    globals: [v("count", "2"), v("increase", "<함수>")],
                    local: null,
                    callNote: null,
                    output: ["2"],
                    changed: []
                }
            ];
        },
        /* 단계 인덱스를 0 ~ (steps.length-1) 범위로 보정 */
        clampStep: function (steps, i) {
            if (typeof i !== "number" || isNaN(i)) return 0;
            i = Math.floor(i);
            if (i < 0) return 0;
            if (i > steps.length - 1) return steps.length - 1;
            return i;
        }
    };

    /* ---- DOM 도우미 ---- */

    function clearNode(el) {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
    }

    function isInList(list, item) {
        for (var k = 0; k < list.length; k++) {
            if (list[k] === item) return true;
        }
        return false;
    }

    function makeVarRow(name, value, extraClass) {
        var row = document.createElement("div");
        row.className = "psv-var" + (extraClass ? " " + extraClass : "");
        var n = document.createElement("span");
        n.className = "psv-var__name";
        n.textContent = name;
        var val = document.createElement("span");
        val.className = "psv-var__value";
        val.textContent = value;
        row.appendChild(n);
        row.appendChild(val);
        return row;
    }

    /* 시나리오 패널 하나(코드 뷰 + 프레임 + 컨트롤)를 구성 */
    function buildScenario(panel, cfg) {
        panel.innerHTML = ""
            + '<div class="psv-code"></div>'
            + '<div class="psv-frames">'
            +     '<div class="psv-frame psv-frame--global">'
            +         '<div class="psv-frame__title"><span>전역 프레임</span></div>'
            +         '<div class="psv-frame__vars psv-globals"></div>'
            +     '</div>'
            +     '<div class="psv-local-slot"></div>'
            + '</div>'
            + '<div class="psv-callnote" hidden></div>'
            + '<p class="psv-narration" aria-live="polite"></p>'
            + '<div class="sim__out psv-out" aria-live="polite"></div>'
            + '<div class="sim__row">'
            +     '<button type="button" class="sim__btn sim__btn--primary psv-next" aria-label="' + cfg.label + ' 다음 단계 실행">다음 단계</button>'
            +     '<button type="button" class="sim__btn psv-reset" aria-label="' + cfg.label + ' 처음부터 다시 보기">처음부터</button>'
            +     '<span class="sim__chip psv-stepchip" aria-hidden="true"></span>'
            + '</div>'
            + (cfg.warn ? '<p class="psv-warn"></p>' : '');

        var codeBox = panel.querySelector(".psv-code");
        var i;
        for (i = 0; i < cfg.code.length; i++) {
            var line = document.createElement("div");
            line.className = "psv-line";
            var no = document.createElement("span");
            no.className = "psv-lineno";
            no.setAttribute("aria-hidden", "true");
            no.textContent = String(i + 1);
            var txt = document.createElement("span");
            txt.className = "psv-linetext";
            txt.textContent = cfg.code[i];
            line.appendChild(no);
            line.appendChild(txt);
            codeBox.appendChild(line);
        }
        if (cfg.warn) {
            panel.querySelector(".psv-warn").textContent = cfg.warn;
        }

        var lineEls = panel.querySelectorAll(".psv-line");
        var globalsBox = panel.querySelector(".psv-globals");
        var localSlot = panel.querySelector(".psv-local-slot");
        var callNoteEl = panel.querySelector(".psv-callnote");
        var narrationEl = panel.querySelector(".psv-narration");
        var outEl = panel.querySelector(".psv-out");
        var nextBtn = panel.querySelector(".psv-next");
        var resetBtn = panel.querySelector(".psv-reset");
        var chipEl = panel.querySelector(".psv-stepchip");

        var steps = cfg.steps;
        var idx = 0;

        function renderLocal(step, prev) {
            clearNode(localSlot);
            if (!step.local) {
                var empty = document.createElement("div");
                empty.className = "psv-empty";
                empty.textContent = "지역 프레임 없음";
                localSlot.appendChild(empty);
                return;
            }
            var born = !prev || !prev.local || prev.local.dying;
            var box = document.createElement("div");
            box.className = "psv-frame psv-frame--local"
                + (step.local.dying ? " psv-frame--dying" : "")
                + (born && !step.local.dying ? " psv-frame--born" : "");
            var title = document.createElement("div");
            title.className = "psv-frame__title";
            var titleText = document.createElement("span");
            titleText.textContent = step.local.title;
            title.appendChild(titleText);
            if (step.local.dying) {
                var badge = document.createElement("span");
                badge.className = "psv-frame__badge";
                badge.textContent = "소멸";
                title.appendChild(badge);
            }
            box.appendChild(title);
            var varsBox = document.createElement("div");
            varsBox.className = "psv-frame__vars";
            var lv = step.local.vars;
            if (lv.length === 0 && step.local.ret === null) {
                var none = document.createElement("div");
                none.className = "psv-var psv-var--none";
                none.textContent = "(지역 변수 없음)";
                varsBox.appendChild(none);
            }
            for (var k = 0; k < lv.length; k++) {
                varsBox.appendChild(makeVarRow(lv[k].name, lv[k].value, null));
            }
            if (step.local.ret !== null) {
                varsBox.appendChild(makeVarRow("return", step.local.ret, "psv-var--ret"));
            }
            box.appendChild(varsBox);
            if (step.local.note) {
                var note = document.createElement("div");
                note.className = "psv-frame__note";
                note.textContent = step.local.note;
                box.appendChild(note);
            }
            localSlot.appendChild(box);
        }

        function render() {
            var step = steps[idx];
            var prev = idx > 0 ? steps[idx - 1] : null;
            var k;
            for (k = 0; k < lineEls.length; k++) {
                lineEls[k].className = isInList(step.lines, k)
                    ? "psv-line psv-line--active"
                    : "psv-line";
            }
            clearNode(globalsBox);
            for (k = 0; k < step.globals.length; k++) {
                var g = step.globals[k];
                globalsBox.appendChild(makeVarRow(
                    g.name,
                    g.value,
                    isInList(step.changed, g.name) ? "psv-var--changed" : null
                ));
            }
            renderLocal(step, prev);
            if (step.callNote) {
                callNoteEl.removeAttribute("hidden");
                callNoteEl.textContent = "호출 지점: " + step.callNote;
            } else {
                callNoteEl.setAttribute("hidden", "");
                callNoteEl.textContent = "";
            }
            narrationEl.textContent = "단계 " + (idx + 1) + "/" + steps.length + " · " + step.narration;
            outEl.textContent = step.output.length === 0
                ? "출력: (아직 없음)"
                : "출력: " + step.output.join("\n");
            chipEl.textContent = (idx + 1) + " / " + steps.length;
            nextBtn.disabled = idx >= steps.length - 1;
        }

        nextBtn.addEventListener("click", function () {
            idx = logic.clampStep(steps, idx + 1);
            render();
        });
        resetBtn.addEventListener("click", function () {
            idx = 0;
            render();
        });

        render();
    }

    window.SIM.register("py-scope-vis", {
        title: "함수 호출과 스코프 시각화",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__tabs" role="tablist">'
                +     '<button type="button" class="sim__tab active" data-tab="call" role="tab" aria-selected="true">호출과 반환</button>'
                +     '<button type="button" class="sim__tab" data-tab="global" role="tab" aria-selected="false">global 선언</button>'
                + '</div>'
                + '<div class="psv-panel" data-panel="call" role="tabpanel" aria-label="함수 호출과 반환 단계 시각화"></div>'
                + '<div class="psv-panel" data-panel="global" role="tabpanel" aria-label="global 선언으로 전역 변수 바꾸기 단계 시각화" hidden></div>';

            buildScenario(root.querySelector('[data-panel="call"]'), {
                label: "호출과 반환 예제",
                code: logic.callCode,
                steps: logic.callSteps(),
                warn: null
            });
            buildScenario(root.querySelector('[data-panel="global"]'), {
                label: "global 선언 예제",
                code: logic.globalCode,
                steps: logic.globalSteps(),
                warn: "주의: global 선언이 없으면 count += 1 은 함수 안에서 새 지역 변수 count를 만들면서 동시에 그 값을 읽으려는 셈이 되어 UnboundLocalError가 발생합니다. 함수 안에서 전역 변수의 값을 바꾸려면 반드시 global 선언이 필요합니다."
            });

            var tabs = root.querySelectorAll(".sim__tab");
            var panels = root.querySelectorAll(".psv-panel");

            function bindTab(btn) {
                btn.addEventListener("click", function () {
                    var name = btn.getAttribute("data-tab");
                    var i;
                    for (i = 0; i < tabs.length; i++) {
                        var on = tabs[i] === btn;
                        if (on) {
                            tabs[i].classList.add("active");
                        } else {
                            tabs[i].classList.remove("active");
                        }
                        tabs[i].setAttribute("aria-selected", on ? "true" : "false");
                    }
                    for (i = 0; i < panels.length; i++) {
                        if (panels[i].getAttribute("data-panel") === name) {
                            panels[i].removeAttribute("hidden");
                        } else {
                            panels[i].setAttribute("hidden", "");
                        }
                    }
                });
            }
            for (var t = 0; t < tabs.length; t++) {
                bindTab(tabs[t]);
            }
        }
    });
})();

/* sim:da-boxplot-iqr - IQR 이상치 판별기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* 고정 표본 11개 (시험 점수 느낌의 자료) */
    var BASE_DATA = [52, 55, 58, 60, 61, 63, 64, 66, 68, 70, 72];

    /* 의심 값 슬라이더 범위 */
    var VMIN = 0;
    var VMAX = 200;
    var VDEFAULT = 75;

    /* SVG 좌표 (viewBox 기준, 픽셀 측정 없음) */
    var VIEW_W = 700;
    var VIEW_H = 180;
    var PLOT_X0 = 36;
    var PLOT_X1 = 664;

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */

    /* 소수 둘째 자리까지 반올림한 문자열 (뒤 0 제거) */
    function fmt(n) {
        var r = Math.round(n * 100) / 100;
        return String(r);
    }

    /* 0~200 정수로 클램프. 숫자가 아니면 기본값 */
    function clampVal(n) {
        if (typeof n !== "number" || isNaN(n)) return VDEFAULT;
        n = Math.round(n);
        if (n < VMIN) n = VMIN;
        if (n > VMAX) n = VMAX;
        return n;
    }

    /* 정렬된 배열의 p분위수.
       엑셀 QUARTILE.INC / PERCENTILE.INC와 같은 선형 보간(R type 7) 방식:
       h = (n-1)*p 위치를 잡고, 아래 칸 값과 위 칸 값을 소수부로 보간한다. */
    function quantileInc(sorted, p) {
        var n = sorted.length;
        if (n === 0) return NaN;
        if (n === 1) return sorted[0];
        var h = (n - 1) * p;
        var lo = Math.floor(h);
        var frac = h - lo;
        if (lo >= n - 1) return sorted[n - 1];
        return sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
    }

    /* 전체 자료로 Q1/Q3/IQR/경계/수염 끝/이상치 목록 계산 */
    function computeStats(values) {
        var sorted = values.slice().sort(function (a, b) { return a - b; });
        var q1 = quantileInc(sorted, 0.25);
        var median = quantileInc(sorted, 0.5);
        var q3 = quantileInc(sorted, 0.75);
        var iqr = q3 - q1;
        var lower = q1 - 1.5 * iqr;
        var upper = q3 + 1.5 * iqr;
        var inliers = [];
        var outliers = [];
        var i;
        for (i = 0; i < sorted.length; i++) {
            if (sorted[i] < lower || sorted[i] > upper) {
                outliers.push(sorted[i]);
            } else {
                inliers.push(sorted[i]);
            }
        }
        return {
            sorted: sorted,
            q1: q1,
            median: median,
            q3: q3,
            iqr: iqr,
            lower: lower,
            upper: upper,
            /* 수염은 경계(1.5 x IQR) 안에 있는 최솟값/최댓값까지만 */
            whiskerLo: inliers.length ? inliers[0] : q1,
            whiskerHi: inliers.length ? inliers[inliers.length - 1] : q3,
            outliers: outliers
        };
    }

    /* 숫자 뒤에 붙는 은/는 조사 선택.
       끝자리가 0이면 십/백/영으로 읽혀 받침이 있으므로 "은",
       끝자리 읽기에 받침이 없는 2(이)/4(사)/5(오)/9(구)만 "는". */
    function josaEunNeun(n) {
        var s = String(Math.abs(Math.round(n)));
        var last = s.charCodeAt(s.length - 1) - 48;
        if (last === 2 || last === 4 || last === 5 || last === 9) return "는";
        return "은";
    }

    /* 의심 값 판정 (경계와 같으면 정상으로 본다) */
    function judge(value, stats) {
        var j = josaEunNeun(value);
        if (value > stats.upper) {
            return {
                outlier: true,
                side: "high",
                text: fmt(value) + j + " 상한 " + fmt(stats.upper) + " 초과 - 이상치 후보!"
            };
        }
        if (value < stats.lower) {
            return {
                outlier: true,
                side: "low",
                text: fmt(value) + j + " 하한 " + fmt(stats.lower) + " 미만 - 이상치 후보!"
            };
        }
        return {
            outlier: false,
            side: "in",
            text: fmt(value) + j + " 경계 안 (" + fmt(stats.lower) + " ~ " + fmt(stats.upper) + ") - 정상"
        };
    }

    var logic = {
        baseData: BASE_DATA,
        fmt: fmt,
        clampVal: clampVal,
        quantileInc: quantileInc,
        computeStats: computeStats,
        josaEunNeun: josaEunNeun,
        judge: judge
    };

    /* ---- 그리기 도우미 (viewBox 좌표 변환) ---- */

    /* 값 -> viewBox x좌표 (소수 1자리로 정리) */
    function xOf(v) {
        var x = PLOT_X0 + (v - VMIN) / (VMAX - VMIN) * (PLOT_X1 - PLOT_X0);
        return Math.round(x * 10) / 10;
    }

    /* 동적으로 다시 그리는 상자그림 본체 마크업 (모두 계산된 숫자만 삽입) */
    function plotMarkup(st, suspect) {
        var xq1 = xOf(st.q1);
        var xq3 = xOf(st.q3);
        var xmed = xOf(st.median);
        var xlo = xOf(st.whiskerLo);
        var xhi = xOf(st.whiskerHi);
        var xlow = xOf(st.lower);
        var xup = xOf(st.upper);
        var xs = xOf(suspect);
        var boxW = Math.max(1, Math.round((xq3 - xq1) * 10) / 10);
        var s = "";
        var i;

        /* 이상치 경계 점선 + 라벨 */
        s += '<line class="bi-fence" x1="' + xlow + '" y1="42" x2="' + xlow + '" y2="150"></line>';
        s += '<text class="bi-fence-label" x="' + xlow + '" y="34" text-anchor="middle">하한 ' + fmt(st.lower) + '</text>';
        s += '<line class="bi-fence" x1="' + xup + '" y1="42" x2="' + xup + '" y2="150"></line>';
        s += '<text class="bi-fence-label" x="' + xup + '" y="34" text-anchor="middle">상한 ' + fmt(st.upper) + '</text>';

        /* 수염: 경계 안 최솟값/최댓값까지 + 끝 캡 */
        s += '<line class="bi-whisker" x1="' + xlo + '" y1="88" x2="' + xq1 + '" y2="88"></line>';
        s += '<line class="bi-whisker" x1="' + xq3 + '" y1="88" x2="' + xhi + '" y2="88"></line>';
        s += '<line class="bi-whisker" x1="' + xlo + '" y1="76" x2="' + xlo + '" y2="100"></line>';
        s += '<line class="bi-whisker" x1="' + xhi + '" y1="76" x2="' + xhi + '" y2="100"></line>';

        /* 상자(Q1~Q3)와 중앙값 선 */
        s += '<rect class="bi-box" x="' + xq1 + '" y="64" width="' + boxW + '" height="48" rx="3"></rect>';
        s += '<line class="bi-median" x1="' + xmed + '" y1="64" x2="' + xmed + '" y2="112"></line>';

        /* 이상치는 점으로 분리 표시 */
        for (i = 0; i < st.outliers.length; i++) {
            s += '<circle class="bi-outlier" cx="' + xOf(st.outliers[i]) + '" cy="88" r="6"></circle>';
        }

        /* 의심 값 점 (색 구분, 맨 위에) + 값 라벨 */
        s += '<circle class="bi-suspect" cx="' + xs + '" cy="88" r="7"></circle>';
        s += '<text class="bi-suspect-label" x="' + xs + '" y="56" text-anchor="middle">의심 ' + fmt(suspect) + '</text>';
        return s;
    }

    /* 계산 패널 마크업 (모두 계산된 숫자만 삽입) */
    function statsMarkup(st, suspect) {
        var items = [];
        var marked = false;
        var i;
        for (i = 0; i < st.sorted.length; i++) {
            if (!marked && st.sorted[i] === suspect) {
                items.push('<strong class="bi-mark">' + fmt(suspect) + '</strong>');
                marked = true;
            } else {
                items.push(fmt(st.sorted[i]));
            }
        }
        var step = fmt(1.5 * st.iqr);
        return '<div>자료 12개 (정렬): ' + items.join(", ") + '</div>'
            + '<div>Q1 = ' + fmt(st.q1) + ' / 중앙값 = ' + fmt(st.median) + ' / Q3 = ' + fmt(st.q3) + '</div>'
            + '<div>IQR = Q3 - Q1 = ' + fmt(st.iqr) + '</div>'
            + '<div>하한 = Q1 - 1.5 × IQR = ' + fmt(st.q1) + ' - ' + step + ' = ' + fmt(st.lower) + '</div>'
            + '<div>상한 = Q3 + 1.5 × IQR = ' + fmt(st.q3) + ' + ' + step + ' = ' + fmt(st.upper) + '</div>';
    }

    window.SIM.register("da-boxplot-iqr", {
        title: "IQR 이상치 판별기",
        _logic: logic,
        build: function (root) {
            /* 고정 눈금 축 (0~200, 50 간격) */
            var axis = '<line class="bi-axis" x1="' + PLOT_X0 + '" y1="150" x2="' + PLOT_X1 + '" y2="150"></line>';
            var tv;
            for (tv = VMIN; tv <= VMAX; tv += 50) {
                var tx = xOf(tv);
                axis += '<line class="bi-axis" x1="' + tx + '" y1="150" x2="' + tx + '" y2="156"></line>'
                    + '<text class="bi-tick-label" x="' + tx + '" y="172" text-anchor="middle">' + tv + '</text>';
            }

            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="bi-field">의심 값'
                +         '<input type="range" class="bi-slider" min="' + VMIN + '" max="' + VMAX + '" step="1" value="' + VDEFAULT + '" aria-label="의심 값 슬라이더, 0부터 200까지">'
                +     '</label>'
                +     '<span class="sim__chip bi-val" aria-hidden="true">' + VDEFAULT + '</span>'
                +     '<button type="button" class="sim__btn bi-preset" data-val="75" aria-label="의심 값을 75로 설정">예시 75</button>'
                +     '<button type="button" class="sim__btn bi-preset" data-val="150" aria-label="의심 값을 150으로 설정">예시 150</button>'
                + '</div>'
                + '<svg class="bi-svg" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" xmlns="http://www.w3.org/2000/svg" role="img" '
                +     'aria-label="가로 상자그림. 상자는 Q1부터 Q3, 가운데 굵은 선은 중앙값, 점선은 1.5 곱하기 IQR 이상치 경계, 강조된 점은 의심 값입니다.">'
                +     '<g>' + axis + '</g>'
                +     '<g class="bi-plot"></g>'
                + '</svg>'
                + '<div class="bi-legend">'
                +     '<span><span class="bi-sw bi-sw--box"></span>상자 (Q1~Q3)</span>'
                +     '<span><span class="bi-sw bi-sw--median"></span>중앙값</span>'
                +     '<span><span class="bi-sw bi-sw--fence"></span>이상치 경계</span>'
                +     '<span><span class="bi-sw bi-sw--suspect"></span>의심 값</span>'
                +     '<span><span class="bi-sw bi-sw--outlier"></span>이상치</span>'
                + '</div>'
                + '<div class="bi-verdict" role="status" aria-live="polite"></div>'
                + '<div class="sim__out bi-stats"></div>'
                + '<p class="sim__note">고정 표본 11개(52~72)에 의심 값 1개를 더한 12개로 계산합니다. '
                +     '사분위수는 엑셀 QUARTILE.INC와 같은 선형 보간(R type 7) 방식입니다.</p>'
                + '<div class="bi-tip">이상치 후보는 기계적으로 지우지 말고 입력 오류인지 진짜 특이값인지 먼저 본다.</div>';

            var slider = root.querySelector(".bi-slider");
            var valChip = root.querySelector(".bi-val");
            var plot = root.querySelector(".bi-plot");
            var statsBox = root.querySelector(".bi-stats");
            var verdict = root.querySelector(".bi-verdict");
            var presets = root.querySelectorAll(".bi-preset");

            function update() {
                var v = clampVal(parseFloat(slider.value));
                valChip.textContent = String(v);
                var st = computeStats(BASE_DATA.concat([v]));
                plot.innerHTML = plotMarkup(st, v);
                statsBox.innerHTML = statsMarkup(st, v);
                var j = judge(v, st);
                verdict.textContent = j.text;
                verdict.className = "bi-verdict " + (j.outlier ? "bi-verdict--out" : "bi-verdict--ok");
            }

            slider.addEventListener("input", update);

            var i;
            for (i = 0; i < presets.length; i++) {
                presets[i].addEventListener("click", function () {
                    slider.value = this.getAttribute("data-val");
                    update();
                });
            }

            update();
        }
    });
})();

/* sim:da-stats-lab - 기술통계 실험실 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 고정 데이터 (노트 점수 풍 9개) + 10번째 값 기본값 ---- */
    var BASE = [62, 65, 68, 70, 71, 73, 75, 78, 80];
    var DEFAULT_X = 72;
    var X_MIN = 0;
    var X_MAX = 500;

    /* ---- 순수 통계 로직 (DOM 비의존, node 테스트 대상) ---- */
    var stats = {
        /* 오름차순 정렬 복사본 */
        sorted: function (arr) {
            return arr.slice().sort(function (a, b) { return a - b; });
        },
        /* 산술평균 (AVERAGE) */
        mean: function (arr) {
            var sum = 0;
            for (var i = 0; i < arr.length; i++) {
                sum += arr[i];
            }
            return sum / arr.length;
        },
        /* 중앙값 (MEDIAN) */
        median: function (arr) {
            var s = this.sorted(arr);
            var n = s.length;
            var mid = Math.floor(n / 2);
            return n % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        },
        /* 최빈값 목록 (모든 값의 빈도가 1이면 빈 배열) */
        modes: function (arr) {
            var freq = {};
            var i;
            var key;
            for (i = 0; i < arr.length; i++) {
                key = String(arr[i]);
                freq[key] = (freq[key] || 0) + 1;
            }
            var max = 0;
            for (key in freq) {
                if (freq[key] > max) max = freq[key];
            }
            if (max < 2) return [];
            var out = [];
            for (key in freq) {
                if (freq[key] === max) out.push(Number(key));
            }
            out.sort(function (a, b) { return a - b; });
            return out;
        },
        /* 범위 = 최댓값 - 최솟값 */
        range: function (arr) {
            var s = this.sorted(arr);
            return s[s.length - 1] - s[0];
        },
        /* 편차 제곱합 */
        ss: function (arr) {
            var m = this.mean(arr);
            var sum = 0;
            for (var i = 0; i < arr.length; i++) {
                var d = arr[i] - m;
                sum += d * d;
            }
            return sum;
        },
        /* 표본 분산: n-1로 나눔 (VAR.S) */
        varS: function (arr) {
            return this.ss(arr) / (arr.length - 1);
        },
        /* 모집단 분산: n으로 나눔 (VAR.P) */
        varP: function (arr) {
            return this.ss(arr) / arr.length;
        },
        /* 표본 표준편차 (STDEV.S) */
        stdevS: function (arr) {
            return Math.sqrt(this.varS(arr));
        },
        /* 엑셀 QUARTILE.INC 방식: (n-1)*q/4 위치를 선형 보간 (q: 0~4) */
        quartileInc: function (arr, q) {
            var s = this.sorted(arr);
            var h = (s.length - 1) * q / 4;
            var lo = Math.floor(h);
            var frac = h - lo;
            if (lo + 1 >= s.length) return s[s.length - 1];
            return s[lo] + frac * (s[lo + 1] - s[lo]);
        },
        /* 전체 요약 + 1.5 x IQR 이상치 울타리 */
        summary: function (arr) {
            var q1 = this.quartileInc(arr, 1);
            var q3 = this.quartileInc(arr, 3);
            var iqr = q3 - q1;
            return {
                n: arr.length,
                mean: this.mean(arr),
                median: this.median(arr),
                modes: this.modes(arr),
                range: this.range(arr),
                varS: this.varS(arr),
                varP: this.varP(arr),
                stdevS: this.stdevS(arr),
                q1: q1,
                q3: q3,
                iqr: iqr,
                fenceLo: q1 - 1.5 * iqr,
                fenceHi: q3 + 1.5 * iqr
            };
        }
    };

    /* 소수 둘째 자리까지 반올림한 문자열 */
    function fmt(n) {
        return String(Math.round(n * 100) / 100);
    }

    window.SIM.register("da-stats-lab", {
        title: "기술통계 실험실",
        _stats: stats,
        _base: BASE,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="dsl-sliderwrap">'
                +         '<span class="dsl-slidertext">10번째 값</span>'
                +         '<input type="range" class="dsl-slider" min="' + X_MIN + '" max="' + X_MAX + '" step="1" value="' + DEFAULT_X + '" aria-label="10번째 값, 0부터 500까지">'
                +     '</label>'
                +     '<span class="sim__chip dsl-xval" data-el="xval">x = ' + DEFAULT_X + '</span>'
                +     '<button type="button" class="sim__btn dsl-reset" data-el="reset" aria-label="10번째 값을 기본값 72로 되돌리기">초기화</button>'
                + '</div>'
                + '<p class="sim__note">고정 데이터 9개(노트 점수 예시): 62, 65, 68, 70, 71, 73, 75, 78, 80. 여기에 10번째 값 하나를 슬라이더로 움직여 보세요.</p>'
                + '<div class="dsl-plot" data-el="plot"></div>'
                + '<div class="dsl-legend">'
                +     '<span class="dsl-legend-item"><span class="dsl-sw dsl-sw-dot"></span>고정 데이터 9개</span>'
                +     '<span class="dsl-legend-item"><span class="dsl-sw dsl-sw-dot dsl-sw-dot--x"></span>10번째 값</span>'
                +     '<span class="dsl-legend-item"><span class="dsl-sw dsl-sw-line"></span>평균 <span class="dsl-legend-val" data-el="legendMean"></span></span>'
                +     '<span class="dsl-legend-item"><span class="dsl-sw dsl-sw-line dsl-sw-line--median"></span>중앙값 <span class="dsl-legend-val" data-el="legendMedian"></span></span>'
                + '</div>'
                + '<div class="dsl-msg" data-el="msg" aria-live="polite"></div>'
                + '<div class="dsl-tablewrap">'
                +     '<table aria-label="기술통계량 표">'
                +         '<thead>'
                +             '<tr><th>통계량</th><th class="dsl-val-head">값</th><th>엑셀 함수</th></tr>'
                +         '</thead>'
                +         '<tbody>'
                +             '<tr><td>평균</td><td class="dsl-val" data-stat="mean"></td><td class="dsl-fn">AVERAGE</td></tr>'
                +             '<tr><td>중앙값</td><td class="dsl-val" data-stat="median"></td><td class="dsl-fn">MEDIAN</td></tr>'
                +             '<tr><td>최빈값</td><td class="dsl-val" data-stat="modes"></td><td class="dsl-fn">MODE.SNGL</td></tr>'
                +             '<tr><td>범위</td><td class="dsl-val" data-stat="range"></td><td class="dsl-fn">MAX - MIN</td></tr>'
                +             '<tr class="dsl-row-pair"><td>표본 분산 (n-1로 나눔)</td><td class="dsl-val" data-stat="varS"></td><td class="dsl-fn">VAR.S</td></tr>'
                +             '<tr class="dsl-row-pair"><td>모집단 분산 (n으로 나눔)</td><td class="dsl-val" data-stat="varP"></td><td class="dsl-fn">VAR.P</td></tr>'
                +             '<tr><td>표본 표준편차</td><td class="dsl-val" data-stat="stdevS"></td><td class="dsl-fn">STDEV.S</td></tr>'
                +             '<tr><td>1사분위수 Q1</td><td class="dsl-val" data-stat="q1"></td><td class="dsl-fn">QUARTILE.INC(범위,1)</td></tr>'
                +             '<tr><td>3사분위수 Q3</td><td class="dsl-val" data-stat="q3"></td><td class="dsl-fn">QUARTILE.INC(범위,3)</td></tr>'
                +             '<tr><td>사분위범위 IQR</td><td class="dsl-val" data-stat="iqr"></td><td class="dsl-fn">Q3 - Q1</td></tr>'
                +         '</tbody>'
                +     '</table>'
                + '</div>'
                + '<p class="sim__note">표본 분산은 편차 제곱합을 n-1로, 모집단 분산은 n으로 나눕니다. 수집한 자료가 전체의 일부(표본)라면 엑셀에서 VAR.S와 STDEV.S를 사용합니다.</p>';

            var slider = root.querySelector(".dsl-slider");
            var xval = root.querySelector('[data-el="xval"]');
            var resetBtn = root.querySelector('[data-el="reset"]');
            var plot = root.querySelector('[data-el="plot"]');
            var msg = root.querySelector('[data-el="msg"]');
            var legendMean = root.querySelector('[data-el="legendMean"]');
            var legendMedian = root.querySelector('[data-el="legendMedian"]');
            var cells = {};
            var cellNodes = root.querySelectorAll("[data-stat]");
            for (var c = 0; c < cellNodes.length; c++) {
                cells[cellNodes[c].getAttribute("data-stat")] = cellNodes[c];
            }

            /* 도트 플롯 SVG를 통째로 다시 그린다 (모든 삽입값은 숫자) */
            function renderPlot(x, s) {
                var padL = 34;
                var padR = 666;
                var axisY = 150;
                var data = BASE.concat([x]);
                var dMin = data[0];
                var dMax = data[0];
                var i;
                for (i = 1; i < data.length; i++) {
                    if (data[i] < dMin) dMin = data[i];
                    if (data[i] > dMax) dMax = data[i];
                }
                var pad = (dMax - dMin) * 0.08 + 2;
                var lo = dMin - pad;
                var hi = dMax + pad;

                function sx(v) {
                    return padL + (v - lo) / (hi - lo) * (padR - padL);
                }

                var parts = [];
                /* 수평축 + 눈금 5개 */
                parts.push('<line class="dsl-axis" x1="' + padL + '" y1="' + axisY + '" x2="' + padR + '" y2="' + axisY + '"/>');
                for (i = 0; i <= 4; i++) {
                    var tv = lo + (hi - lo) * i / 4;
                    var tx = sx(tv).toFixed(1);
                    parts.push('<line class="dsl-tick" x1="' + tx + '" y1="' + axisY + '" x2="' + tx + '" y2="' + (axisY + 6) + '"/>');
                    parts.push('<text class="dsl-tick-label" x="' + tx + '" y="' + (axisY + 21) + '" text-anchor="middle">' + Math.round(tv) + '</text>');
                }
                /* 점 10개 (같은 값은 위로 쌓기). 10번째 점은 색 구분 */
                var counts = {};
                function dot(v, extra) {
                    var key = String(v);
                    var idx = counts[key] || 0;
                    counts[key] = idx + 1;
                    var cy = axisY - 12 - idx * 15;
                    return '<circle class="dsl-dot' + (extra ? " " + extra : "") + '" cx="' + sx(v).toFixed(1) + '" cy="' + cy + '" r="6.5"/>';
                }
                for (i = 0; i < BASE.length; i++) {
                    parts.push(dot(BASE[i], ""));
                }
                parts.push(dot(x, "dsl-dot--x"));
                /* 평균 세로선(실선)과 중앙값 세로선(점선) + 라벨 */
                function vline(v, y1, cls) {
                    var px = sx(v).toFixed(1);
                    return '<line class="' + cls + '" x1="' + px + '" y1="' + y1 + '" x2="' + px + '" y2="' + axisY + '"/>';
                }
                function vlabel(v, y, cls, text) {
                    var px = sx(v);
                    var anchor = px > 600 ? "end" : "start";
                    var tx = (px > 600 ? px - 5 : px + 5).toFixed(1);
                    return '<text class="dsl-line-label ' + cls + '" x="' + tx + '" y="' + y + '" text-anchor="' + anchor + '">' + text + '</text>';
                }
                parts.push(vline(s.mean, 16, "dsl-line-mean"));
                parts.push(vline(s.median, 36, "dsl-line-median"));
                parts.push(vlabel(s.mean, 12, "dsl-line-label--mean", "평균 " + fmt(s.mean)));
                parts.push(vlabel(s.median, 32, "dsl-line-label--median", "중앙값 " + fmt(s.median)));

                plot.innerHTML = '<svg class="dsl-svg" viewBox="0 0 700 184" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="10개 값의 도트 플롯. 평균 위치는 실선, 중앙값 위치는 점선 세로선으로 표시">'
                    + parts.join("")
                    + '</svg>';
            }

            function renderTable(s) {
                cells.mean.textContent = fmt(s.mean);
                cells.median.textContent = fmt(s.median);
                cells.modes.textContent = s.modes.length > 0 ? s.modes.join(", ") : "없음";
                cells.range.textContent = fmt(s.range);
                cells.varS.textContent = fmt(s.varS);
                cells.varP.textContent = fmt(s.varP);
                cells.stdevS.textContent = fmt(s.stdevS);
                cells.q1.textContent = fmt(s.q1);
                cells.q3.textContent = fmt(s.q3);
                cells.iqr.textContent = fmt(s.iqr);
            }

            function renderMsg(x, s) {
                if (x < s.fenceLo || x > s.fenceHi) {
                    msg.className = "dsl-msg is-warn";
                    msg.textContent = "10번째 값(" + x + ")은 1.5 x IQR 울타리("
                        + fmt(s.fenceLo) + " ~ " + fmt(s.fenceHi) + ") 밖의 이상치입니다. 평균은 "
                        + fmt(s.mean) + "까지 끌려갔지만 중앙값은 " + fmt(s.median)
                        + "에 머뭅니다. 이상치에 평균은 민감, 중앙값은 강건합니다.";
                } else {
                    msg.className = "dsl-msg";
                    msg.textContent = "현재 평균 " + fmt(s.mean) + ", 중앙값 " + fmt(s.median)
                        + ". 슬라이더를 0이나 500 쪽으로 끌어 이상치를 만들어 보세요.";
                }
            }

            function renderAll() {
                var x = parseInt(slider.value, 10);
                if (isNaN(x)) x = DEFAULT_X;
                if (x < X_MIN) x = X_MIN;
                if (x > X_MAX) x = X_MAX;
                var s = stats.summary(BASE.concat([x]));
                xval.textContent = "x = " + x;
                legendMean.textContent = "= " + fmt(s.mean);
                legendMedian.textContent = "= " + fmt(s.median);
                renderPlot(x, s);
                renderTable(s);
                renderMsg(x, s);
            }

            slider.addEventListener("input", renderAll);
            resetBtn.addEventListener("click", function () {
                slider.value = String(DEFAULT_X);
                renderAll();
            });

            renderAll();
        }
    });
})();

/* sim:da-cell-ref - 셀 참조 시뮬레이터 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        /* 열 문자 -> 번호 ("A"=1, "E"=5, "AA"=27) */
        colToNum: function (col) {
            var n = 0;
            for (var i = 0; i < col.length; i++) {
                n = n * 26 + (col.charCodeAt(i) - 64);
            }
            return n;
        },
        /* 번호 -> 열 문자 */
        numToCol: function (num) {
            var s = "";
            while (num > 0) {
                var r = (num - 1) % 26;
                s = String.fromCharCode(65 + r) + s;
                num = Math.floor((num - 1) / 26);
            }
            return s;
        },
        /* "$E$1" 같은 참조 문자열 파싱. 형식이 아니면 null */
        parseRef: function (str) {
            var m = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(str);
            if (!m) return null;
            return {
                absCol: m[1] === "$",
                col: m[2],
                absRow: m[3] === "$",
                row: parseInt(m[4], 10)
            };
        },
        /* 참조 객체 -> "$E$1" 문자열 */
        formatRef: function (ref) {
            return (ref.absCol ? "$" : "") + ref.col
                + (ref.absRow ? "$" : "") + ref.row;
        },
        /* 복사 이동: $로 고정되지 않은 축만 dRow/dCol 만큼 밀린다 */
        shiftRef: function (ref, dRow, dCol) {
            return {
                absCol: ref.absCol,
                col: ref.absCol ? ref.col
                    : logic.numToCol(logic.colToNum(ref.col) + dCol),
                absRow: ref.absRow,
                row: ref.absRow ? ref.row : ref.row + dRow
            };
        },
        /* $를 뗀 실제 셀 주소 ("$E$1" -> "E1") */
        plainAddr: function (ref) {
            return ref.col + ref.row;
        },
        /* F4 순환 순서: E1 -> $E$1 -> E$1 -> $E1 -> E1 */
        F4_MODES: [
            { absCol: false, absRow: false },
            { absCol: true, absRow: true },
            { absCol: false, absRow: true },
            { absCol: true, absRow: false }
        ],
        /* mode(0~3)에 해당하는 환율 셀 참조 객체 */
        modeRef: function (mode) {
            var f = logic.F4_MODES[mode];
            return { absCol: f.absCol, col: "E", absRow: f.absRow, row: 1 };
        },
        /* 시나리오 고정 값: 단가 B2~B4, 환율 E1. 나머지는 빈 셀 */
        VALUES: { B2: 1000, B3: 2000, B4: 3000, E1: 1350 },
        /* 빈 셀은 엑셀 산술 연산처럼 0으로 취급 */
        cellValue: function (addr) {
            return logic.VALUES.hasOwnProperty(addr) ? logic.VALUES[addr] : 0;
        },
        /* C2 수식(=B2*환율참조)을 dRow칸 아래로 복사했을 때의 수식과 결과 */
        copyRow: function (mode, dRow) {
            var bRef = logic.shiftRef(
                { absCol: false, col: "B", absRow: false, row: 2 }, dRow, 0);
            var eRef = logic.shiftRef(logic.modeRef(mode), dRow, 0);
            var bAddr = logic.plainAddr(bRef);
            var eAddr = logic.plainAddr(eRef);
            var bVal = logic.cellValue(bAddr);
            var eVal = logic.cellValue(eAddr);
            return {
                cell: "C" + (2 + dRow),
                formula: "=" + logic.formatRef(bRef) + "*"
                    + logic.formatRef(eRef),
                bAddr: bAddr,
                eAddr: eAddr,
                bVal: bVal,
                eVal: eVal,
                result: bVal * eVal,
                ok: eAddr === "E1"
            };
        },
        /* C2 -> C2, C3, C4 세 줄 전체 */
        copyDown: function (mode) {
            var rows = [];
            for (var d = 0; d <= 2; d++) {
                rows.push(logic.copyRow(mode, d));
            }
            return rows;
        },
        /* 1234567 -> "1,234,567" */
        fmt: function (n) {
            return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    };

    /* mode별 UI 문구 (kind: 복사 결과 판정 박스 색) */
    var MODE_INFO = [
        {
            name: "상대 참조",
            kind: "warn",
            msg: "E1이 상대 참조라서 아래로 복사하면 참조가 E2, E3으로 같이 "
                + "밀려난다. E2, E3은 빈 셀(0)이라 금액이 전부 0으로 깨진다. "
                + "F4를 눌러 $E$1로 고정해 보자."
        },
        {
            name: "절대 참조",
            kind: "tip",
            msg: "$E$1은 행과 열을 모두 고정한 절대 참조다. 어디로 복사해도 "
                + "항상 E1(1,350)을 가리켜서 모든 행이 정상 계산된다."
        },
        {
            name: "행 고정 혼합",
            kind: "tip",
            msg: "E$1은 행(1)만 고정한 혼합 참조다. 아래(세로) 복사에서는 행 "
                + "번호만 움직이는데 그 행이 고정돼 있어 절대 참조와 똑같이 "
                + "정상이다. 단, 오른쪽(가로)으로 복사하면 열이 F$1로 밀려나니 "
                + "주의한다."
        },
        {
            name: "열 고정 혼합",
            kind: "warn",
            msg: "$E1은 열(E)만 고정한 혼합 참조다. 아래로 복사하면 고정되지 "
                + "않은 행이 $E2, $E3으로 밀려나 빈 셀이 곱해져 0이 된다. "
                + "세로 복사에서 꼭 필요한 고정은 행 고정(E$1 또는 $E$1)이다."
        }
    ];

    window.SIM.register("da-cell-ref", {
        title: "셀 참조 시뮬레이터",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row dcr-top">'
                +     '<span class="sim__chip dcr-mode"></span>'
                +     '<button type="button" class="sim__btn dcr-f4" aria-label="F4 키 시뮬레이션, 환율 참조 모드 전환">F4 · 참조 전환</button>'
                + '</div>'
                + '<div class="dcr-fx" aria-live="polite">'
                +     '<span class="dcr-fx-cell"></span>'
                +     '<span class="dcr-fx-formula"></span>'
                + '</div>'
                + '<div class="dcr-gridwrap">'
                +     '<table class="dcr-grid">'
                +         '<thead><tr>'
                +             '<th scope="col" class="dcr-rowno"></th>'
                +             '<th scope="col">A</th>'
                +             '<th scope="col">B</th>'
                +             '<th scope="col">C</th>'
                +             '<th class="dcr-gap" aria-hidden="true"></th>'
                +             '<th scope="col">E</th>'
                +         '</tr></thead>'
                +         '<tbody>'
                +             '<tr>'
                +                 '<th scope="row" class="dcr-rowno">1</th>'
                +                 '<td data-cell="A1">품목</td>'
                +                 '<td data-cell="B1">단가</td>'
                +                 '<td data-cell="C1">금액(원)</td>'
                +                 '<td class="dcr-gap" aria-hidden="true"></td>'
                +                 '<td data-cell="E1" class="dcr-ecell"><span class="dcr-elabel">환율</span><span class="dcr-eval">1,350</span></td>'
                +             '</tr>'
                +             '<tr>'
                +                 '<th scope="row" class="dcr-rowno">2</th>'
                +                 '<td data-cell="A2">키보드</td>'
                +                 '<td data-cell="B2">1,000</td>'
                +                 '<td data-cell="C2" class="dcr-ccell"><button type="button" class="dcr-cbtn" data-d="0"></button></td>'
                +                 '<td class="dcr-gap" aria-hidden="true"></td>'
                +                 '<td data-cell="E2" class="dcr-ecell dcr-eempty"></td>'
                +             '</tr>'
                +             '<tr>'
                +                 '<th scope="row" class="dcr-rowno">3</th>'
                +                 '<td data-cell="A3">마우스</td>'
                +                 '<td data-cell="B3">2,000</td>'
                +                 '<td data-cell="C3" class="dcr-ccell"><button type="button" class="dcr-cbtn" data-d="1"></button></td>'
                +                 '<td class="dcr-gap" aria-hidden="true"></td>'
                +                 '<td data-cell="E3" class="dcr-ecell dcr-eempty"></td>'
                +             '</tr>'
                +             '<tr>'
                +                 '<th scope="row" class="dcr-rowno">4</th>'
                +                 '<td data-cell="A4">모니터</td>'
                +                 '<td data-cell="B4">3,000</td>'
                +                 '<td data-cell="C4" class="dcr-ccell"><button type="button" class="dcr-cbtn" data-d="2"></button></td>'
                +                 '<td class="dcr-gap" aria-hidden="true"></td>'
                +                 '<td data-cell="E4" class="dcr-ecell dcr-eempty"></td>'
                +             '</tr>'
                +         '</tbody>'
                +     '</table>'
                + '</div>'
                + '<div class="dcr-legend" aria-hidden="true">'
                +     '<span class="dcr-key"><span class="dcr-swatch dcr-swatch--b"></span>단가 참조</span>'
                +     '<span class="dcr-key"><span class="dcr-swatch dcr-swatch--e"></span>환율 참조(정상)</span>'
                +     '<span class="dcr-key"><span class="dcr-swatch dcr-swatch--bad"></span>환율 참조(깨짐)</span>'
                + '</div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary dcr-copy" aria-label="C2 수식을 C3과 C4로 아래로 복사">아래로 복사 (C2 → C3:C4)</button>'
                +     '<button type="button" class="sim__btn dcr-reset" aria-label="시뮬레이터 초기화">초기화</button>'
                + '</div>'
                + '<div class="dcr-result" aria-live="polite"></div>'
                + '<p class="sim__note">F4로 $를 토글한다. VLOOKUP 범위는 절대 참조로 고정하지 않으면 #N/A.</p>';

            var modeChip = root.querySelector(".dcr-mode");
            var f4Btn = root.querySelector(".dcr-f4");
            var fxCell = root.querySelector(".dcr-fx-cell");
            var fxFormula = root.querySelector(".dcr-fx-formula");
            var copyBtn = root.querySelector(".dcr-copy");
            var resetBtn = root.querySelector(".dcr-reset");
            var resultBox = root.querySelector(".dcr-result");
            var cellTds = root.querySelectorAll(".dcr-grid td[data-cell]");
            var cBtns = root.querySelectorAll(".dcr-cbtn");

            var state = { mode: 0, copied: false, sel: 0 };

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            function findTd(addr) {
                for (var i = 0; i < cellTds.length; i++) {
                    if (cellTds[i].getAttribute("data-cell") === addr) {
                        return cellTds[i];
                    }
                }
                return null;
            }

            /* 그리드 강조: 선택된 C 셀 + 그 셀이 참조하는 B/E 셀 */
            function renderHighlights(rows) {
                var i;
                for (i = 0; i < cellTds.length; i++) {
                    cellTds[i].classList.remove("sel", "hl-b", "hl-e", "hl-bad");
                }
                var r = rows[state.sel];
                var cTd = findTd(r.cell);
                var bTd = findTd(r.bAddr);
                var eTd = findTd(r.eAddr);
                if (cTd) cTd.classList.add("sel");
                if (bTd) bTd.classList.add("hl-b");
                if (eTd) {
                    eTd.classList.add("hl-e");
                    if (!r.ok) eTd.classList.add("hl-bad");
                }
            }

            /* C 셀 버튼: 수식이 있는 셀만 값 표시 + 선택 가능 */
            function renderCells(rows) {
                for (var d = 0; d < cBtns.length; d++) {
                    var btn = cBtns[d];
                    var r = rows[d];
                    var has = d === 0 || state.copied;
                    btn.disabled = !has;
                    btn.classList.remove("bad");
                    if (has) {
                        btn.textContent = logic.fmt(r.result);
                        if (!r.ok) btn.classList.add("bad");
                        btn.setAttribute("aria-label", r.cell + " 셀 선택, 수식 "
                            + r.formula + ", 결과 " + logic.fmt(r.result));
                    } else {
                        btn.textContent = "";
                        btn.setAttribute("aria-label", r.cell + " 셀, 비어 있음");
                    }
                }
            }

            /* 결과 패널: 셀별 수식/계산 표 + 판정 박스 */
            function renderResult(rows, info) {
                clearNode(resultBox);
                var visible = state.copied ? rows : [rows[0]];
                var tableWrap = document.createElement("div");
                tableWrap.className = "dcr-tablewrap";
                var table = document.createElement("table");
                var thead = document.createElement("thead");
                var headRow = document.createElement("tr");
                var headers = ["셀", "수식", "계산", "판정"];
                for (var h = 0; h < headers.length; h++) {
                    var th = document.createElement("th");
                    th.textContent = headers[h];
                    headRow.appendChild(th);
                }
                thead.appendChild(headRow);
                table.appendChild(thead);
                var tbody = document.createElement("tbody");
                for (var i = 0; i < visible.length; i++) {
                    var r = visible[i];
                    var tr = document.createElement("tr");
                    if (i === state.sel) tr.className = "sel";

                    var tdCell = document.createElement("td");
                    tdCell.className = "dcr-mono";
                    tdCell.textContent = r.cell;
                    tr.appendChild(tdCell);

                    var tdF = document.createElement("td");
                    tdF.className = "dcr-mono";
                    tdF.textContent = r.formula;
                    tr.appendChild(tdF);

                    var tdCalc = document.createElement("td");
                    tdCalc.className = "dcr-mono";
                    tdCalc.textContent = logic.fmt(r.bVal) + " × "
                        + (r.ok ? logic.fmt(r.eVal) : "빈 셀(0)")
                        + " = " + logic.fmt(r.result);
                    tr.appendChild(tdCalc);

                    var tdV = document.createElement("td");
                    var verdict = document.createElement("span");
                    verdict.className = r.ok
                        ? "dcr-verdict dcr-verdict--ok"
                        : "dcr-verdict dcr-verdict--bad";
                    verdict.textContent = r.ok ? "정상" : "깨짐";
                    tdV.appendChild(verdict);
                    tr.appendChild(tdV);

                    tbody.appendChild(tr);
                }
                table.appendChild(tbody);
                tableWrap.appendChild(table);
                resultBox.appendChild(tableWrap);

                if (state.copied) {
                    var box = document.createElement("div");
                    box.className = "dcr-status dcr-status--" + info.kind;
                    box.textContent = info.msg;
                    resultBox.appendChild(box);
                } else {
                    var note = document.createElement("p");
                    note.className = "sim__note";
                    note.textContent = "아래로 복사를 누르면 C2의 수식이 C3, "
                        + "C4로 복사된다. 셀을 누르면 어떤 셀을 참조하는지 "
                        + "그리드에 표시된다.";
                    resultBox.appendChild(note);
                }
            }

            function render() {
                if (!state.copied && state.sel > 0) state.sel = 0;
                var info = MODE_INFO[state.mode];
                var rows = logic.copyDown(state.mode);

                modeChip.textContent = info.name + " · "
                    + logic.formatRef(logic.modeRef(state.mode));
                fxCell.textContent = rows[state.sel].cell;
                fxFormula.textContent = rows[state.sel].formula;

                renderCells(rows);
                renderHighlights(rows);
                renderResult(rows, info);
            }

            f4Btn.addEventListener("click", function () {
                state.mode = (state.mode + 1) % 4;
                render();
            });

            copyBtn.addEventListener("click", function () {
                state.copied = true;
                state.sel = 1;
                render();
            });

            resetBtn.addEventListener("click", function () {
                state.mode = 0;
                state.copied = false;
                state.sel = 0;
                render();
            });

            function onCellClick(d) {
                return function () {
                    state.sel = d;
                    render();
                };
            }
            for (var d = 0; d < cBtns.length; d++) {
                cBtns[d].addEventListener("click", onCellClick(d));
            }

            render();
        }
    });
})();

/* sim:da-excel-fn - 조건 집계 함수 체험 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 집계 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        /* 0~100 정수로 클램프. 숫자가 아니면 null */
        clamp: function (n) {
            if (typeof n !== "number" || isNaN(n)) return null;
            n = Math.floor(n);
            if (n < 0) n = 0;
            if (n > 100) n = 100;
            return n;
        },
        /* scores에서 threshold 이상인 값의 개수/합/평균/인덱스 목록 */
        aggregate: function (scores, threshold) {
            var count = 0;
            var sum = 0;
            var matches = [];
            for (var i = 0; i < scores.length; i++) {
                if (scores[i] >= threshold) {
                    count += 1;
                    sum += scores[i];
                    matches.push(i);
                }
            }
            return {
                count: count,
                sum: sum,
                avg: count > 0 ? sum / count : null,
                matches: matches
            };
        },
        /* AVERAGEIF 표시값: 소수 1자리. 대상이 없으면 #DIV/0! */
        fmtAvg: function (avg) {
            if (avg === null) return "#DIV/0!";
            return (Math.round(avg * 10) / 10).toFixed(1);
        },
        /* ">=60" 형태의 조건 인수 문자열 */
        criteria: function (threshold) {
            return '">=' + threshold + '"';
        },
        /* C열 IF 수식 문자열 */
        ifFormula: function (threshold) {
            return '=IF(B2>=' + threshold + ',"합격","불합격")';
        },
        /* COUNTIF/SUMIF/AVERAGEIF 수식 문자열 */
        fnFormula: function (name, threshold) {
            return "=" + name + "(B2:B9," + logic.criteria(threshold) + ")";
        }
    };

    /* 고정 데이터: 학생 8명 (B2:B9) */
    var STUDENTS = [
        { name: "김민준", score: 92 },
        { name: "이서연", score: 88 },
        { name: "박지호", score: 57 },
        { name: "최수아", score: 73 },
        { name: "정다은", score: 45 },
        { name: "강하은", score: 81 },
        { name: "윤시우", score: 66 },
        { name: "한유진", score: 95 }
    ];
    var SCORES = [];
    for (var si = 0; si < STUDENTS.length; si++) {
        SCORES.push(STUDENTS[si].score);
    }

    window.SIM.register("da-excel-fn", {
        title: "조건 집계 함수 체험",
        _logic: logic,
        _data: STUDENTS,
        build: function (root) {
            var i;
            var rowsHtml = "";
            for (i = 0; i < STUDENTS.length; i++) {
                rowsHtml += ""
                    + '<tr class="ef-datarow">'
                    +     '<th class="ef-rowno">' + (i + 2) + "</th>"
                    +     "<td>" + STUDENTS[i].name + "</td>"
                    +     '<td class="ef-bcell">' + STUDENTS[i].score + "</td>"
                    +     '<td class="ef-ccell"></td>'
                    + "</tr>";
            }

            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="ef-sliderwrap">'
                +         '<span class="ef-slidertext">기준 점수</span>'
                +         '<input type="range" class="ef-slider" min="0" max="100" step="1" value="60" aria-label="기준 점수, 0부터 100까지">'
                +     "</label>"
                +     '<span class="ef-thval" aria-hidden="true">60</span>'
                + "</div>"
                + '<div class="ef-fbar">'
                +     '<span class="sim__chip">C열 수식</span>'
                +     '<code class="ef-iffx"></code>'
                + "</div>"
                + '<div class="ef-tablewrap">'
                +     '<table aria-label="학생 8명 점수 표, 엑셀 셀 주소 형식">'
                +         "<thead>"
                +             '<tr><th class="ef-rowno"></th><th class="ef-colhead">A</th><th class="ef-colhead">B</th><th class="ef-colhead">C</th></tr>'
                +         "</thead>"
                +         "<tbody>"
                +             '<tr class="ef-labelrow"><th class="ef-rowno">1</th><td>이름</td><td>점수</td><td>IF 결과</td></tr>'
                +             rowsHtml
                +         "</tbody>"
                +     "</table>"
                + "</div>"
                + '<div class="ef-fns" aria-live="polite">'
                +     '<button type="button" class="ef-fn" data-fn="COUNTIF" aria-label="COUNTIF가 세는 셀을 표에서 깜빡 강조">'
                +         '<span class="sim__chip">개수</span>'
                +         '<code class="ef-fn-fx"></code>'
                +         '<span class="ef-fn-res"></span>'
                +     "</button>"
                +     '<button type="button" class="ef-fn" data-fn="SUMIF" aria-label="SUMIF가 더하는 셀을 표에서 깜빡 강조">'
                +         '<span class="sim__chip">합계</span>'
                +         '<code class="ef-fn-fx"></code>'
                +         '<span class="ef-fn-res"></span>'
                +     "</button>"
                +     '<button type="button" class="ef-fn" data-fn="AVERAGEIF" aria-label="AVERAGEIF가 평균 내는 셀을 표에서 깜빡 강조">'
                +         '<span class="sim__chip">평균</span>'
                +         '<code class="ef-fn-fx"></code>'
                +         '<span class="ef-fn-res"></span>'
                +     "</button>"
                +     '<div class="ef-empty">기준 점수 이상인 학생이 없어 COUNTIF는 0, SUMIF는 0, AVERAGEIF는 #DIV/0! 오류가 됩니다.</div>'
                + "</div>"
                + '<p class="sim__note">슬라이더로 기준 점수를 바꾸면 IF, COUNTIF, SUMIF, AVERAGEIF 결과가 바로 갱신됩니다. 함수 줄을 누르면 그 함수가 집계하는 B열 셀이 깜빡입니다.</p>'
                + '<p class="sim__note">SUMIF, AVERAGEIF는 조건 범위와 계산 범위가 같으면 세 번째 인수(계산 범위)를 생략할 수 있습니다.</p>';

            var slider = root.querySelector(".ef-slider");
            var thval = root.querySelector(".ef-thval");
            var iffx = root.querySelector(".ef-iffx");
            var dataRows = root.querySelectorAll(".ef-datarow");
            var bcells = root.querySelectorAll(".ef-bcell");
            var ccells = root.querySelectorAll(".ef-ccell");
            var fnBtns = root.querySelectorAll(".ef-fn");
            var emptyNote = root.querySelector(".ef-empty");

            var flashTimer = null;
            var currentMatches = [];

            /* B열 깜빡 강조 해제 (대기 중 타이머도 정리) */
            function clearFlash() {
                if (flashTimer !== null) {
                    clearTimeout(flashTimer);
                    flashTimer = null;
                }
                for (var k = 0; k < bcells.length; k++) {
                    bcells[k].classList.remove("ef-flash");
                }
            }

            /* 현재 조건을 만족하는 B열 셀을 잠깐 깜빡 강조 */
            function flashMatches() {
                clearFlash();
                if (currentMatches.length === 0) return;
                /* 같은 태스크에서 클래스를 떼고 바로 다시 붙이면 애니메이션이
                   재시작되지 않으므로 리플로로 제거를 먼저 반영한다.
                   (클릭 핸들러 안이라 픽셀 측정 허용) */
                void root.offsetWidth;
                for (var k = 0; k < currentMatches.length; k++) {
                    bcells[currentMatches[k]].classList.add("ef-flash");
                }
                flashTimer = setTimeout(clearFlash, 1500);
            }

            function render(threshold) {
                clearFlash();
                var agg = logic.aggregate(SCORES, threshold);
                currentMatches = agg.matches;

                thval.textContent = String(threshold);
                iffx.textContent = logic.ifFormula(threshold);

                for (var k = 0; k < dataRows.length; k++) {
                    var pass = SCORES[k] >= threshold;
                    ccells[k].textContent = pass ? "합격" : "불합격";
                    if (pass) {
                        dataRows[k].classList.add("ef-pass");
                        ccells[k].classList.add("ef-ok");
                        ccells[k].classList.remove("ef-no");
                    } else {
                        dataRows[k].classList.remove("ef-pass");
                        ccells[k].classList.remove("ef-ok");
                        ccells[k].classList.add("ef-no");
                    }
                }

                var results = {
                    COUNTIF: String(agg.count),
                    SUMIF: String(agg.sum),
                    AVERAGEIF: logic.fmtAvg(agg.avg)
                };
                for (k = 0; k < fnBtns.length; k++) {
                    var fn = fnBtns[k].getAttribute("data-fn");
                    fnBtns[k].querySelector(".ef-fn-fx").textContent =
                        logic.fnFormula(fn, threshold);
                    var resEl = fnBtns[k].querySelector(".ef-fn-res");
                    resEl.textContent = "→ " + results[fn];
                    if (fn === "AVERAGEIF" && agg.avg === null) {
                        resEl.classList.add("ef-err");
                    } else {
                        resEl.classList.remove("ef-err");
                    }
                }

                if (agg.count === 0) {
                    emptyNote.classList.add("show");
                } else {
                    emptyNote.classList.remove("show");
                }
            }

            slider.addEventListener("input", function () {
                var n = logic.clamp(parseInt(slider.value, 10));
                if (n === null) n = 60;
                render(n);
            });

            for (i = 0; i < fnBtns.length; i++) {
                fnBtns[i].addEventListener("click", flashMatches);
            }

            render(60);
        }
    });
})();

/* sim:da-chart-picker - 차트 고르기 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 차트 5종 정의 (아이콘은 정적 SVG 문자열, 사용자 입력 아님) ---- */
    var CHARTS = [
        {
            key: "pie",
            label: "원형",
            full: "원그래프",
            use: "전체 합이 100%일 때 각 부분의 구성비를 보여 줄 때",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                + '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>'
                + '<path d="M12 12 L12 3.5 A8.5 8.5 0 0 1 20.5 12 Z" fill="currentColor"/>'
                + "</svg>"
        },
        {
            key: "bar",
            label: "막대",
            full: "막대그래프",
            use: "여러 항목(범주)의 크기를 나란히 비교할 때",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                + '<rect x="3" y="11" width="4" height="9" fill="currentColor"/>'
                + '<rect x="10" y="5" width="4" height="15" fill="currentColor"/>'
                + '<rect x="17" y="8" width="4" height="12" fill="currentColor"/>'
                + "</svg>"
        },
        {
            key: "line",
            label: "꺾은선",
            full: "꺾은선그래프",
            use: "시간 흐름에 따른 추세와 변화를 볼 때",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                + '<polyline points="3,17 9,9 14,13 21,4" fill="none" stroke="currentColor"'
                + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
                + "</svg>"
        },
        {
            key: "hist",
            label: "히스토그램",
            full: "히스토그램",
            use: "한 수치형 변수의 구간별 분포(도수)를 볼 때",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                + '<rect x="3" y="13" width="4.5" height="8" fill="currentColor"/>'
                + '<rect x="7.5" y="7" width="4.5" height="14" fill="currentColor"/>'
                + '<rect x="12" y="4" width="4.5" height="17" fill="currentColor"/>'
                + '<rect x="16.5" y="10" width="4.5" height="11" fill="currentColor"/>'
                + "</svg>"
        },
        {
            key: "scatter",
            label: "산점도",
            full: "산점도",
            use: "두 수치형 변수 사이의 관계(상관)를 볼 때",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                + '<circle cx="5" cy="17" r="2" fill="currentColor"/>'
                + '<circle cx="10" cy="13" r="2" fill="currentColor"/>'
                + '<circle cx="13" cy="15" r="2" fill="currentColor"/>'
                + '<circle cx="17" cy="8" r="2" fill="currentColor"/>'
                + '<circle cx="20" cy="5" r="2" fill="currentColor"/>'
                + "</svg>"
        }
    ];

    /* ---- 문제 은행 8개 ---- */
    var BANK = [
        {
            q: "최근 30년간 연도별 출생아 수가 어떻게 변해 왔는지 보여 주고 싶다.",
            answer: "line",
            kind: "시간(연도)에 따른 수치의 변화",
            why: "가로축에 시간을 두고 점을 선으로 이으면 증가/감소 추세가 한눈에 드러납니다. 시간 추세를 보여 주는 일은 꺾은선그래프의 몫입니다."
        },
        {
            q: "17개 시도의 인구 수를 서로 비교하고 싶다.",
            answer: "bar",
            kind: "범주(시도)별 수치의 크기 비교",
            why: "항목이 여러 개일 때는 막대 길이로 크기를 직관적으로 비교할 수 있습니다. 범주 간 크기 비교는 막대그래프가 기본입니다."
        },
        {
            q: "한 반 학생 30명의 키가 어떤 구간에 몰려 있는지 분포를 보고 싶다.",
            answer: "hist",
            kind: "한 수치형 변수의 구간별 분포",
            why: "키를 구간(계급)으로 나눠 각 구간의 도수를 세면 분포 모양이 보입니다. 가로축이 연속된 구간이라 막대를 붙여 그리는 히스토그램이 알맞습니다."
        },
        {
            q: "한 가구의 소비지출에서 식비, 주거비 등 항목별 구성비를 보여 주고 싶다.",
            answer: "pie",
            kind: "전체(100%) 속 부분의 구성비",
            why: "모든 항목을 더하면 전체(100%)가 되는 구성비 데이터는 부채꼴 넓이로 비율을 보여 주는 원그래프가 알맞습니다."
        },
        {
            q: "학생들의 공부 시간과 성적 사이에 관계가 있는지 확인하고 싶다.",
            answer: "scatter",
            kind: "두 수치형 변수 사이의 관계",
            why: "두 수치형 변수를 가로/세로축에 하나씩 놓고 점을 찍으면 함께 변하는 경향(상관)이 보입니다. 관계 탐색은 산점도가 알맞습니다."
        },
        {
            q: "우리 지역의 월별 평균 기온이 1년 동안 어떻게 오르내리는지 보여 주고 싶다.",
            answer: "line",
            kind: "시간(월)에 따른 수치의 변화",
            why: "1월부터 12월까지 시간 순서가 있는 데이터이므로 점을 선으로 이어 추이를 보여 주는 꺾은선그래프가 알맞습니다."
        },
        {
            q: "제품 5종의 이번 분기 판매량을 한 화면에서 비교하고 싶다.",
            answer: "bar",
            kind: "범주(제품)별 수치의 크기 비교",
            why: "제품이라는 범주별로 판매량의 크기를 견주는 상황이므로 막대그래프가 알맞습니다. 막대 길이 차이가 곧 판매량 차이입니다."
        },
        {
            q: "월별 광고비와 매출액 자료로 광고비가 클수록 매출도 큰지 확인하고 싶다.",
            answer: "scatter",
            kind: "두 수치형 변수 사이의 관계",
            why: "광고비와 매출액이라는 두 수치형 변수의 상관을 보는 일이므로 산점도가 알맞습니다. 점들이 오른쪽 위로 모이면 양의 상관입니다."
        }
    ];

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        bankSize: function () {
            return BANK.length;
        },
        /* key에 해당하는 차트 정의. 없으면 null */
        chartOf: function (key) {
            for (var i = 0; i < CHARTS.length; i++) {
                if (CHARTS[i].key === key) return CHARTS[i];
            }
            return null;
        },
        /* qIndex 문제에 key로 답했을 때의 판정 */
        judge: function (qIndex, key) {
            var item = BANK[qIndex];
            var answer = logic.chartOf(item.answer);
            return {
                correct: item.answer === key,
                answerKey: item.answer,
                answerLabel: answer ? answer.full : item.answer
            };
        },
        /* "차트 = 데이터 성격" 근거 해설. 오답이면 고른 차트의 용도까지 덧붙인다 */
        explain: function (qIndex, key) {
            var item = BANK[qIndex];
            var answer = logic.chartOf(item.answer);
            var text = "[데이터 성격] " + item.kind + " -> " + answer.full + ". " + item.why;
            if (item.answer !== key) {
                var picked = logic.chartOf(key);
                if (picked) {
                    text += " 선택한 차트(" + picked.full + ")는 " + picked.use + " 씁니다.";
                }
            }
            return text;
        },
        /* 0..n-1 순열 (Fisher-Yates, rand는 [0,1) 난수 함수) */
        shuffleOrder: function (n, rand) {
            var order = [];
            var i;
            for (i = 0; i < n; i++) order.push(i);
            for (i = n - 1; i > 0; i--) {
                var j = Math.floor(rand() * (i + 1));
                if (j < 0) j = 0;
                if (j > i) j = i;
                var tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
            return order;
        },
        /* 종료 요약 문구 */
        grade: function (score, total) {
            if (score >= total) {
                return "완벽합니다! 데이터 성격과 차트의 짝을 모두 정확히 찾았어요.";
            }
            if (score / total >= 0.75) {
                return "훌륭해요. 틀린 문제의 데이터 성격(비교/추세/분포/구성비/관계)만 한 번 더 확인해 보세요.";
            }
            if (score / total >= 0.5) {
                return "절반 이상 맞혔어요. 비교는 막대, 추세는 꺾은선, 분포는 히스토그램, 구성비는 원형, 관계는 산점도라고 정리해 보세요.";
            }
            return "아직 헷갈리네요. 차트는 모양이 아니라 데이터의 성격으로 고른다는 점을 기억하고 다시 도전해 보세요.";
        }
    };

    window.SIM.register("da-chart-picker", {
        title: "차트 고르기 퀴즈",
        _logic: logic,
        build: function (root) {
            var i;
            var choiceHtml = "";
            for (i = 0; i < CHARTS.length; i++) {
                choiceHtml += '<button type="button" class="sim__btn dcp-choice" data-key="'
                    + CHARTS[i].key + '" aria-label="' + CHARTS[i].full + ' 선택">'
                    + '<span class="dcp-icon">' + CHARTS[i].icon + "</span>"
                    + '<span class="dcp-label">' + CHARTS[i].label + "</span>"
                    + "</button>";
            }

            root.innerHTML = ""
                + '<p class="sim__note dcp-intro">시나리오를 읽고 가장 알맞은 차트 버튼을 누르세요. 총 '
                +     BANK.length + "문제, 순서는 매번 섞입니다.</p>"
                + '<div class="dcp-quiz">'
                +     '<div class="sim__row dcp-status">'
                +         '<span class="sim__chip dcp-progress"></span>'
                +         '<span class="sim__chip dcp-score"></span>'
                +     "</div>"
                +     '<p class="dcp-scenario"></p>'
                +     '<div class="dcp-choices" role="group" aria-label="차트 종류 선택">' + choiceHtml + "</div>"
                +     '<div class="dcp-feedback" aria-live="polite" hidden>'
                +         '<p class="dcp-verdict"></p>'
                +         '<p class="dcp-why"></p>'
                +     "</div>"
                +     '<div class="sim__row dcp-controls">'
                +         '<button type="button" class="sim__btn sim__btn--primary dcp-next" disabled>다음 문제</button>'
                +         '<button type="button" class="sim__btn dcp-reset" aria-label="퀴즈를 처음부터 다시 시작">다시 풀기</button>'
                +     "</div>"
                + "</div>"
                + '<div class="dcp-summary" aria-live="polite" hidden>'
                +     '<p class="dcp-sum-title">퀴즈 종료</p>'
                +     '<p class="dcp-sum-score"></p>'
                +     '<p class="dcp-sum-msg"></p>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary dcp-retry">다시 풀기</button>'
                +     "</div>"
                + "</div>"
                + '<div class="dcp-caution">'
                +     '<p class="dcp-caution-title">차트 함정 주의</p>'
                +     "<ul>"
                +         "<li>세로축을 0이 아닌 값에서 끊으면(축 절단) 막대나 선의 차이가 실제보다 과장되어 보입니다.</li>"
                +         "<li>산점도에서 상관이 보여도 상관은 인과가 아닙니다. 제3의 변수가 숨어 있을 수 있습니다.</li>"
                +     "</ul>"
                + "</div>";

            var quizEl = root.querySelector(".dcp-quiz");
            var progressEl = root.querySelector(".dcp-progress");
            var scoreEl = root.querySelector(".dcp-score");
            var scenarioEl = root.querySelector(".dcp-scenario");
            var choicesEl = root.querySelector(".dcp-choices");
            var choiceBtns = root.querySelectorAll(".dcp-choice");
            var feedbackEl = root.querySelector(".dcp-feedback");
            var verdictEl = root.querySelector(".dcp-verdict");
            var whyEl = root.querySelector(".dcp-why");
            var nextBtn = root.querySelector(".dcp-next");
            var resetBtn = root.querySelector(".dcp-reset");
            var summaryEl = root.querySelector(".dcp-summary");
            var sumScoreEl = root.querySelector(".dcp-sum-score");
            var sumMsgEl = root.querySelector(".dcp-sum-msg");
            var retryBtn = root.querySelector(".dcp-retry");

            var state = { order: [], pos: 0, score: 0, answered: false };

            function updateChips() {
                progressEl.textContent = "문제 " + (state.pos + 1) + " / " + BANK.length;
                scoreEl.textContent = "점수 " + state.score;
            }

            function renderQuestion() {
                var item = BANK[state.order[state.pos]];
                state.answered = false;
                updateChips();
                scenarioEl.textContent = "Q. " + item.q;
                for (var k = 0; k < choiceBtns.length; k++) {
                    choiceBtns[k].disabled = false;
                    choiceBtns[k].classList.remove("is-correct");
                    choiceBtns[k].classList.remove("is-wrong");
                }
                feedbackEl.hidden = true;
                verdictEl.textContent = "";
                whyEl.textContent = "";
                nextBtn.disabled = true;
                nextBtn.textContent = (state.pos === BANK.length - 1) ? "결과 보기" : "다음 문제";
            }

            function start() {
                state.order = logic.shuffleOrder(BANK.length, Math.random);
                state.pos = 0;
                state.score = 0;
                summaryEl.hidden = true;
                quizEl.hidden = false;
                renderQuestion();
            }

            function onChoose(key) {
                if (state.answered) return;
                state.answered = true;
                var qIndex = state.order[state.pos];
                var res = logic.judge(qIndex, key);
                if (res.correct) state.score++;
                updateChips();
                for (var k = 0; k < choiceBtns.length; k++) {
                    var btnKey = choiceBtns[k].getAttribute("data-key");
                    choiceBtns[k].disabled = true;
                    if (btnKey === res.answerKey) {
                        choiceBtns[k].classList.add("is-correct");
                    } else if (btnKey === key) {
                        choiceBtns[k].classList.add("is-wrong");
                    }
                }
                verdictEl.className = "dcp-verdict " + (res.correct ? "ok" : "bad");
                verdictEl.textContent = res.correct
                    ? "정답! " + res.answerLabel
                    : "오답. 정답은 " + res.answerLabel + "입니다.";
                whyEl.textContent = logic.explain(qIndex, key);
                feedbackEl.hidden = false;
                nextBtn.disabled = false;
            }

            function showSummary() {
                quizEl.hidden = true;
                summaryEl.hidden = false;
                sumScoreEl.textContent = BANK.length + "문제 중 " + state.score + "문제 정답";
                sumMsgEl.textContent = logic.grade(state.score, BANK.length);
            }

            choicesEl.addEventListener("click", function (e) {
                var btn = e.target;
                while (btn && btn !== choicesEl && btn.tagName !== "BUTTON") {
                    btn = btn.parentNode;
                }
                if (!btn || btn === choicesEl || btn.disabled) return;
                onChoose(btn.getAttribute("data-key"));
            });

            nextBtn.addEventListener("click", function () {
                if (!state.answered) return;
                if (state.pos === BANK.length - 1) {
                    showSummary();
                } else {
                    state.pos++;
                    renderQuestion();
                }
            });

            resetBtn.addEventListener("click", start);
            retryBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:da-regression-lab - 단순선형회귀 실험 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 플롯 좌표계 (viewBox 기반, 픽셀 측정 없음) ---- */
    var VIEW_W = 400;
    var VIEW_H = 288;
    var PLOT = { x0: 52, y0: 14, x1: 388, y1: 240 };

    /* ---- 고정 데이터셋 3개 (각 10점, 좌표는 직접 설계) ---- */
    var DATASETS = [
        {
            id: "pos",
            label: "강한 양의 관계",
            desc: "주당 공부시간이 늘수록 성적도 높아지는 데이터입니다 (r 약 +0.9).",
            xVar: "공부시간", yVar: "성적",
            xUnitWord: "1시간", yUnit: "점",
            slopeHead: "공부시간이 1시간 늘 때 성적은 평균",
            xLabel: "공부시간 (시간/주)", yLabel: "성적 (점)",
            xMin: 0, xMax: 11, xTicks: [0, 2, 4, 6, 8, 10],
            yMin: 40, yMax: 100, yTicks: [40, 50, 60, 70, 80, 90, 100],
            points: [
                [1, 54], [2, 62], [3, 56], [4, 70], [5, 63],
                [6, 77], [7, 69], [8, 84], [9, 77], [10, 90]
            ]
        },
        {
            id: "neg",
            label: "음의 관계",
            desc: "결석이 늘수록 성적이 낮아지는 데이터입니다 (r 약 -0.8).",
            xVar: "결석", yVar: "성적",
            xUnitWord: "1회", yUnit: "점",
            slopeHead: "결석이 1회 늘 때 성적은 평균",
            xLabel: "결석 횟수 (회/학기)", yLabel: "성적 (점)",
            xMin: -0.5, xMax: 10, xTicks: [0, 2, 4, 6, 8, 10],
            yMin: 40, yMax: 100, yTicks: [40, 50, 60, 70, 80, 90, 100],
            points: [
                [0, 92], [1, 78], [2, 88], [3, 70], [4, 82],
                [5, 60], [6, 76], [7, 55], [8, 68], [9, 52]
            ]
        },
        {
            id: "none",
            label: "관계 없음",
            desc: "신발 크기와 성적처럼 서로 무관한 데이터입니다 (r 약 0).",
            xVar: "신발 크기", yVar: "성적",
            xUnitWord: "1mm", yUnit: "점",
            slopeHead: "신발 크기가 1mm 늘 때 성적은 평균",
            xLabel: "신발 크기 (mm)", yLabel: "성적 (점)",
            xMin: 225, xMax: 285, xTicks: [230, 240, 250, 260, 270, 280],
            yMin: 50, yMax: 100, yTicks: [50, 60, 70, 80, 90, 100],
            points: [
                [230, 75], [235, 58], [240, 85], [245, 65], [250, 90],
                [255, 55], [260, 78], [265, 62], [270, 88], [275, 66]
            ]
        }
    ];

    /* ---- 순수 계산 로직 (DOM 비의존, node로 검증) ---- */

    /* 최소제곱 회귀: b = Sxy/Sxx, a = y평균 - b*x평균, r = Sxy/sqrt(Sxx*Syy) */
    function regress(points) {
        var n = points.length;
        if (n < 2) return null;
        var sx = 0;
        var sy = 0;
        var i;
        for (i = 0; i < n; i++) {
            sx += points[i][0];
            sy += points[i][1];
        }
        var mx = sx / n;
        var my = sy / n;
        var sxx = 0;
        var syy = 0;
        var sxy = 0;
        var dx;
        var dy;
        for (i = 0; i < n; i++) {
            dx = points[i][0] - mx;
            dy = points[i][1] - my;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        }
        if (sxx === 0) return null;
        var b = sxy / sxx;
        var a = my - b * mx;
        var r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
        return {
            n: n,
            meanX: mx,
            meanY: my,
            sxx: sxx,
            syy: syy,
            sxy: sxy,
            slope: b,
            intercept: a,
            r: r,
            r2: r * r
        };
    }

    /* 데이터의 x 최소/최대 (회귀선을 이 구간으로만 그린다) */
    function xRange(points) {
        var lo = points[0][0];
        var hi = points[0][0];
        var i;
        for (i = 1; i < points.length; i++) {
            if (points[i][0] < lo) lo = points[i][0];
            if (points[i][0] > hi) hi = points[i][0];
        }
        return { lo: lo, hi: hi };
    }

    /* 회귀선분을 x [xLo,xHi] 구간으로 만들고 y [yLo,yHi] 범위로 클리핑.
       완전히 벗어나면 null */
    function clipLine(slope, intercept, xLo, xHi, yLo, yHi) {
        var x1 = xLo;
        var x2 = xHi;
        var y1 = intercept + slope * x1;
        var y2 = intercept + slope * x2;
        var dy = y2 - y1;
        if (dy === 0) {
            if (y1 < yLo || y1 > yHi) return null;
            return { x1: x1, y1: y1, x2: x2, y2: y2 };
        }
        var ta = (yLo - y1) / dy;
        var tb = (yHi - y1) / dy;
        var tEnter = Math.min(ta, tb);
        var tExit = Math.max(ta, tb);
        var t0 = Math.max(0, tEnter);
        var t1 = Math.min(1, tExit);
        if (t0 > t1) return null;
        return {
            x1: x1 + t0 * (x2 - x1),
            y1: y1 + t0 * dy,
            x2: x1 + t1 * (x2 - x1),
            y2: y1 + t1 * dy
        };
    }

    /* 상관계수 r의 말 풀이 */
    function describeR(r) {
        var abs = Math.abs(r);
        var dir = r >= 0 ? "양(+)의" : "음(-)의";
        if (abs >= 0.7) return "강한 " + dir + " 직선 관계";
        if (abs >= 0.4) return "뚜렷한 " + dir + " 직선 관계";
        if (abs >= 0.2) return "약한 " + dir + " 직선 관계";
        return "직선 관계 거의 없음";
    }

    /* 소수 d자리 문자열 (-0.00 방지) */
    function fmt(v, d) {
        if (typeof v !== "number" || !isFinite(v)) return "-";
        var s = v.toFixed(d);
        if (parseFloat(s) === 0) s = (0).toFixed(d);
        return s;
    }

    /* 회귀식 문자열: y = a + b x (b 부호 처리) */
    function eqText(reg) {
        return "y = " + fmt(reg.intercept, 2) +
            (reg.slope >= 0 ? " + " : " - ") +
            fmt(Math.abs(reg.slope), 2) + " x";
    }

    var logic = {
        regress: regress,
        xRange: xRange,
        clipLine: clipLine,
        describeR: describeR,
        fmt: fmt,
        eqText: eqText,
        DATASETS: DATASETS
    };

    /* ---- SVG 보조 (모두 내부 상수/숫자만 끼워 넣는다) ---- */

    function sx(ds, x) {
        var t = (x - ds.xMin) / (ds.xMax - ds.xMin);
        return Math.round((PLOT.x0 + t * (PLOT.x1 - PLOT.x0)) * 10) / 10;
    }

    function sy(ds, y) {
        var t = (y - ds.yMin) / (ds.yMax - ds.yMin);
        return Math.round((PLOT.y1 - t * (PLOT.y1 - PLOT.y0)) * 10) / 10;
    }

    function svgMarkup(ds, reg, opts) {
        var midX = (PLOT.x0 + PLOT.x1) / 2;
        var midY = (PLOT.y0 + PLOT.y1) / 2;
        var s = '<svg class="drl-svg" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H +
            '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' +
            ds.label + ' 산점도. 가로축 ' + ds.xLabel + ', 세로축 ' + ds.yLabel +
            '. 상관계수 r은 ' + fmt(reg.r, 2) + '입니다.">';
        var i;
        var px;
        var py;

        /* 눈금선 + 눈금 라벨 */
        for (i = 0; i < ds.xTicks.length; i++) {
            px = sx(ds, ds.xTicks[i]);
            s += '<line class="drl-grid" x1="' + px + '" y1="' + PLOT.y0 +
                '" x2="' + px + '" y2="' + PLOT.y1 + '"></line>';
            s += '<text class="drl-tick" x="' + px + '" y="' + (PLOT.y1 + 16) +
                '" text-anchor="middle">' + ds.xTicks[i] + '</text>';
        }
        for (i = 0; i < ds.yTicks.length; i++) {
            py = sy(ds, ds.yTicks[i]);
            s += '<line class="drl-grid" x1="' + PLOT.x0 + '" y1="' + py +
                '" x2="' + PLOT.x1 + '" y2="' + py + '"></line>';
            s += '<text class="drl-tick" x="' + (PLOT.x0 - 7) + '" y="' + (py + 3.5) +
                '" text-anchor="end">' + ds.yTicks[i] + '</text>';
        }

        /* 축 */
        s += '<line class="drl-axis" x1="' + PLOT.x0 + '" y1="' + PLOT.y1 +
            '" x2="' + PLOT.x1 + '" y2="' + PLOT.y1 + '"></line>';
        s += '<line class="drl-axis" x1="' + PLOT.x0 + '" y1="' + PLOT.y0 +
            '" x2="' + PLOT.x0 + '" y2="' + PLOT.y1 + '"></line>';
        s += '<text class="drl-axis-name" x="' + midX + '" y="' + (VIEW_H - 8) +
            '" text-anchor="middle">' + ds.xLabel + '</text>';
        s += '<text class="drl-axis-name" x="14" y="' + midY +
            '" text-anchor="middle" transform="rotate(-90 14 ' + midY + ')">' +
            ds.yLabel + '</text>';

        /* 평균점 (x평균, y평균) + 안내선 */
        if (opts.showMean) {
            var mxp = sx(ds, reg.meanX);
            var myp = sy(ds, reg.meanY);
            s += '<line class="drl-mean-guide" x1="' + PLOT.x0 + '" y1="' + myp +
                '" x2="' + mxp + '" y2="' + myp + '"></line>';
            s += '<line class="drl-mean-guide" x1="' + mxp + '" y1="' + PLOT.y1 +
                '" x2="' + mxp + '" y2="' + myp + '"></line>';
            s += '<circle class="drl-mean-dot" cx="' + mxp + '" cy="' + myp +
                '" r="5"></circle>';
            s += '<line class="drl-mean-cross" x1="' + (mxp - 9) + '" y1="' + myp +
                '" x2="' + (mxp + 9) + '" y2="' + myp + '"></line>';
            s += '<line class="drl-mean-cross" x1="' + mxp + '" y1="' + (myp - 9) +
                '" x2="' + mxp + '" y2="' + (myp + 9) + '"></line>';
            s += '<text class="drl-mean-label" x="' + (mxp + 12) + '" y="' +
                (myp - 8) + '">평균점</text>';
        }

        /* 회귀직선: 데이터 x 최소~최대 구간만, 플롯 y 범위로 클리핑 */
        if (opts.showLine) {
            var xr = xRange(ds.points);
            var seg = clipLine(reg.slope, reg.intercept, xr.lo, xr.hi, ds.yMin, ds.yMax);
            if (seg) {
                s += '<line class="drl-line" x1="' + sx(ds, seg.x1) + '" y1="' +
                    sy(ds, seg.y1) + '" x2="' + sx(ds, seg.x2) + '" y2="' +
                    sy(ds, seg.y2) + '"></line>';
            }
        }

        /* 산점도 점 */
        for (i = 0; i < ds.points.length; i++) {
            s += '<circle class="drl-pt" cx="' + sx(ds, ds.points[i][0]) +
                '" cy="' + sy(ds, ds.points[i][1]) + '" r="5"></circle>';
        }

        s += '</svg>';
        return s;
    }

    /* 원자료 미니 표 (가로형: 1행 x, 1행 y) */
    function dataTableMarkup(ds) {
        var s = '<table><tbody>';
        var i;
        s += '<tr><th scope="row">' + ds.xVar + '</th>';
        for (i = 0; i < ds.points.length; i++) {
            s += '<td>' + ds.points[i][0] + '</td>';
        }
        s += '</tr><tr><th scope="row">' + ds.yVar + '</th>';
        for (i = 0; i < ds.points.length; i++) {
            s += '<td>' + ds.points[i][1] + '</td>';
        }
        s += '</tr></tbody></table>';
        return s;
    }

    window.SIM.register("da-regression-lab", {
        title: "단순선형회귀 실험",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ''
                + '<div class="sim__tabs" role="tablist" aria-label="데이터셋 선택">'
                +     '<button type="button" class="sim__tab active" data-ds="0" role="tab" aria-selected="true">강한 양의 관계</button>'
                +     '<button type="button" class="sim__tab" data-ds="1" role="tab" aria-selected="false">음의 관계</button>'
                +     '<button type="button" class="sim__tab" data-ds="2" role="tab" aria-selected="false">관계 없음</button>'
                + '</div>'
                + '<p class="sim__note drl-desc"></p>'
                + '<div class="drl-svgwrap"></div>'
                + '<div class="sim__row drl-controls">'
                +     '<label class="drl-toggle"><input type="checkbox" class="drl-chk-line" checked aria-label="회귀직선 표시 켜기 끄기">회귀직선</label>'
                +     '<label class="drl-toggle"><input type="checkbox" class="drl-chk-mean" checked aria-label="평균점 표시 켜기 끄기">평균점 (x평균, y평균)</label>'
                +     '<button type="button" class="sim__btn drl-data-btn" aria-expanded="false">데이터 보기</button>'
                + '</div>'
                + '<div class="drl-tablewrap drl-datawrap" hidden></div>'
                + '<div class="drl-tablewrap">'
                +     '<table class="drl-stats">'
                +         '<thead><tr><th>통계량</th><th>값</th><th>엑셀 함수</th></tr></thead>'
                +         '<tbody>'
                +             '<tr><td>기울기 b</td><td class="drl-val drl-val-b"></td><td class="drl-fn">=SLOPE(y범위, x범위)</td></tr>'
                +             '<tr><td>절편 a</td><td class="drl-val drl-val-a"></td><td class="drl-fn">=INTERCEPT(y범위, x범위)</td></tr>'
                +             '<tr><td>상관계수 r</td><td class="drl-val drl-val-r"></td><td class="drl-fn">=CORREL(x범위, y범위)</td></tr>'
                +             '<tr><td>결정계수 R²</td><td class="drl-val drl-val-r2"></td><td class="drl-fn">=RSQ(y범위, x범위)</td></tr>'
                +         '</tbody>'
                +     '</table>'
                + '</div>'
                + '<div class="sim__out drl-interp" aria-live="polite"></div>'
                + '<div class="sim__out drl-code"></div>'
                + '<p class="sim__note">최소제곱법은 잔차(점과 직선의 세로 거리) 제곱합이 최소가 되는 직선을 찾습니다. '
                + 'b = Sxy / Sxx, a = y평균 - b·x평균이고, 회귀직선은 항상 평균점을 지납니다. R² = r² 입니다.</p>';

            var tabs = root.querySelectorAll(".sim__tab");
            var descEl = root.querySelector(".drl-desc");
            var svgWrap = root.querySelector(".drl-svgwrap");
            var chkLine = root.querySelector(".drl-chk-line");
            var chkMean = root.querySelector(".drl-chk-mean");
            var dataBtn = root.querySelector(".drl-data-btn");
            var dataWrap = root.querySelector(".drl-datawrap");
            var valB = root.querySelector(".drl-val-b");
            var valA = root.querySelector(".drl-val-a");
            var valR = root.querySelector(".drl-val-r");
            var valR2 = root.querySelector(".drl-val-r2");
            var interpEl = root.querySelector(".drl-interp");
            var codeEl = root.querySelector(".drl-code");

            var state = { ds: 0, showLine: true, showMean: true, showData: false };

            function renderPlot() {
                var ds = DATASETS[state.ds];
                var reg = regress(ds.points);
                svgWrap.innerHTML = svgMarkup(ds, reg, {
                    showLine: state.showLine,
                    showMean: state.showMean
                });
            }

            function renderAll() {
                var ds = DATASETS[state.ds];
                var reg = regress(ds.points);
                var i;
                var t;

                for (i = 0; i < tabs.length; i++) {
                    t = tabs[i];
                    if (parseInt(t.getAttribute("data-ds"), 10) === state.ds) {
                        t.classList.add("active");
                        t.setAttribute("aria-selected", "true");
                    } else {
                        t.classList.remove("active");
                        t.setAttribute("aria-selected", "false");
                    }
                }

                descEl.textContent = ds.desc;
                renderPlot();

                dataWrap.innerHTML = dataTableMarkup(ds);
                dataWrap.hidden = !state.showData;
                dataBtn.textContent = state.showData ? "데이터 닫기" : "데이터 보기";
                dataBtn.setAttribute("aria-expanded", state.showData ? "true" : "false");

                valB.textContent = fmt(reg.slope, 3);
                valA.textContent = fmt(reg.intercept, 2);
                valR.textContent = fmt(reg.r, 3);
                valR2.textContent = fmt(reg.r2, 3) + " (= r²)";

                var lines = [];
                lines.push("회귀식: " + eqText(reg) +
                    "  (x: " + ds.xVar + ", y: " + ds.yVar + ")");
                lines.push("판정: r = " + fmt(reg.r, 3) + " → " + describeR(reg.r));
                lines.push(ds.slopeHead + " " + fmt(Math.abs(reg.slope), 2) + ds.yUnit +
                    (reg.slope >= 0 ? " 오릅니다" : " 내려갑니다") + " (기울기 b).");
                lines.push("R² = " + fmt(reg.r2, 3) + ": " + ds.yVar + " 분산의 " +
                    fmt(reg.r2 * 100, 1) + "%를 회귀직선이 설명합니다 (RSQ = r²).");
                lines.push("회귀직선은 평균점 (x평균 " + fmt(reg.meanX, 2) +
                    ", y평균 " + fmt(reg.meanY, 2) + ")을 지납니다.");
                if (Math.abs(reg.r) < 0.2) {
                    lines.push("주의: r이 0에 가까우면 직선을 그어도 예측력이 거의 없습니다.");
                }
                interpEl.textContent = lines.join("\n");

                codeEl.textContent = "R> lm(y ~ x)   # x: " + ds.xVar +
                    ", y: " + ds.yVar + "\n   결과: 절편(Intercept) " +
                    fmt(reg.intercept, 2) + ", 기울기 " + fmt(reg.slope, 3);
            }

            for (var ti = 0; ti < tabs.length; ti++) {
                tabs[ti].addEventListener("click", function () {
                    var idx = parseInt(this.getAttribute("data-ds"), 10);
                    if (idx === state.ds) return;
                    state.ds = idx;
                    renderAll();
                });
            }

            chkLine.addEventListener("change", function () {
                state.showLine = chkLine.checked;
                renderPlot();
            });

            chkMean.addEventListener("change", function () {
                state.showMean = chkMean.checked;
                renderPlot();
            });

            dataBtn.addEventListener("click", function () {
                state.showData = !state.showData;
                dataWrap.hidden = !state.showData;
                dataBtn.textContent = state.showData ? "데이터 닫기" : "데이터 보기";
                dataBtn.setAttribute("aria-expanded", state.showData ? "true" : "false");
            });

            renderAll();
        }
    });
})();

/* sim:da-fv-calc - 적금 미래가치(FV) 계산기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 비의존, node 테스트는 calc로 접근) ---- */
    var calc = {
        /* 기말 납입(ordinary annuity) 적금 미래가치.
           payment: 월 납입액(원), annualPct: 연이율(%), months: 납입 개월 수.
           r=0이면 FV = P x n (0으로 나누기 방지) */
        fv: function (payment, annualPct, months) {
            var r = annualPct / 100 / 12;
            if (r === 0) return payment * months;
            return payment * (Math.pow(1 + r, months) - 1) / r;
        },
        /* 원금 합계 */
        principal: function (payment, months) {
            return payment * months;
        },
        /* 연이율 표시: 0.5 단위라 소수 최대 한 자리 (3 -> "3", 3.5 -> "3.5") */
        formatRate: function (annualPct) {
            return String(Math.round(annualPct * 10) / 10);
        },
        /* 엑셀 수식 문자열: =FV(3%/12, 36, -300000) */
        formula: function (annualPct, months, payment) {
            return "=FV(" + calc.formatRate(annualPct) + "%/12, "
                + months + ", -" + payment + ")";
        },
        /* 원 단위 반올림 + 천 단위 콤마 */
        formatWon: function (v) {
            return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        },
        /* 스택 막대 분할(%): 원금 비중과 이자 비중 (합 100) */
        split: function (principal, fvTotal) {
            if (fvTotal <= 0) return { principal: 0, interest: 0 };
            var p = (principal / fvTotal) * 100;
            return { principal: p, interest: 100 - p };
        }
    };

    window.SIM.register("da-fv-calc", {
        title: "적금 미래가치(FV) 계산기",
        calc: calc,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="fv-sliderwrap">'
                +         '<span class="fv-slidertext">월 납입액</span>'
                +         '<input class="fv-slider" data-role="pay" type="range"'
                +             ' min="5" max="100" step="5" value="30"'
                +             ' aria-label="월 납입액, 5만원에서 100만원까지 5만원 단위">'
                +     '</label>'
                +     '<span class="sim__chip fv-chipval" data-role="pay-val">30만원</span>'
                + '</div>'
                + '<div class="sim__row">'
                +     '<label class="fv-sliderwrap">'
                +         '<span class="fv-slidertext">연이율</span>'
                +         '<input class="fv-slider" data-role="rate" type="range"'
                +             ' min="0.5" max="10" step="0.5" value="3"'
                +             ' aria-label="연이율, 0.5퍼센트에서 10퍼센트까지 0.5퍼센트 단위">'
                +     '</label>'
                +     '<span class="sim__chip fv-chipval" data-role="rate-val">3%</span>'
                + '</div>'
                + '<div class="sim__row">'
                +     '<label class="fv-sliderwrap">'
                +         '<span class="fv-slidertext">기간</span>'
                +         '<input class="fv-slider" data-role="years" type="range"'
                +             ' min="1" max="10" step="1" value="3"'
                +             ' aria-label="납입 기간, 1년에서 10년까지 1년 단위">'
                +     '</label>'
                +     '<span class="sim__chip fv-chipval" data-role="years-val">3년</span>'
                + '</div>'
                + '<div data-role="live" aria-live="polite">'
                +     '<p class="fv-subhead">엑셀 수식</p>'
                +     '<div class="sim__out fv-formula" data-role="formula"></div>'
                +     '<p class="fv-subhead">만기 금액 (기말 납입 기준)</p>'
                +     '<p class="fv-total"><span data-role="total"></span>원</p>'
                +     '<div class="fv-bar" role="img" data-role="bar">'
                +         '<div class="fv-bar__seg fv-bar__seg--principal" data-role="seg-p"></div>'
                +         '<div class="fv-bar__seg fv-bar__seg--interest" data-role="seg-i"></div>'
                +     '</div>'
                +     '<div class="fv-legend">'
                +         '<span><span class="fv-dot fv-dot--principal"></span>원금 <b data-role="principal"></b>원</span>'
                +         '<span><span class="fv-dot fv-dot--interest"></span>이자 <b data-role="interest"></b>원</span>'
                +     '</div>'
                + '</div>'
                + '<p class="sim__note">내는 돈은 음수(-), 받는 돈은 양수 / '
                + '월 단위면 이율은 연이율/12, 기간은 년x12</p>';

            var paySlider = root.querySelector('[data-role="pay"]');
            var rateSlider = root.querySelector('[data-role="rate"]');
            var yearsSlider = root.querySelector('[data-role="years"]');
            var payVal = root.querySelector('[data-role="pay-val"]');
            var rateVal = root.querySelector('[data-role="rate-val"]');
            var yearsVal = root.querySelector('[data-role="years-val"]');
            var formulaOut = root.querySelector('[data-role="formula"]');
            var totalOut = root.querySelector('[data-role="total"]');
            var bar = root.querySelector('[data-role="bar"]');
            var segP = root.querySelector('[data-role="seg-p"]');
            var segI = root.querySelector('[data-role="seg-i"]');
            var principalOut = root.querySelector('[data-role="principal"]');
            var interestOut = root.querySelector('[data-role="interest"]');

            function render() {
                var payment = (parseInt(paySlider.value, 10) || 30) * 10000;
                var annualPct = parseFloat(rateSlider.value) || 0;
                var years = parseInt(yearsSlider.value, 10) || 1;
                var months = years * 12;

                var fvRaw = calc.fv(payment, annualPct, months);
                var fvRounded = Math.round(fvRaw);
                var principal = calc.principal(payment, months);
                var interest = fvRounded - principal;
                var pct = calc.split(principal, fvRaw);
                var iPct = pct.interest;
                var pPct = pct.principal;

                /* 이자가 있으면 최소 1% 폭으로 보이게 한다 (시각 보정) */
                if (interest > 0 && iPct < 1) {
                    iPct = 1;
                    pPct = 99;
                }

                payVal.textContent = (payment / 10000) + "만원";
                rateVal.textContent = calc.formatRate(annualPct) + "%";
                yearsVal.textContent = years + "년";

                formulaOut.textContent = calc.formula(annualPct, months, payment);
                totalOut.textContent = calc.formatWon(fvRounded);
                principalOut.textContent = calc.formatWon(principal);
                interestOut.textContent = calc.formatWon(interest);

                segP.style.width = pPct + "%";
                segI.style.width = iPct + "%";
                bar.setAttribute("aria-label",
                    "원금 " + calc.formatWon(principal) + "원, 이자 "
                    + calc.formatWon(interest) + "원 비교 막대");
            }

            paySlider.addEventListener("input", render);
            rateSlider.addEventListener("input", render);
            yearsSlider.addEventListener("input", render);

            render();
        }
    });
})();

/* sim:ub-5c5any-quiz - 5C · 5Any 분류 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var GROUPS = {
        "5C": [
            { term: "Computing", ko: "컴퓨팅", desc: "정보를 처리하는 능력" },
            { term: "Communication", ko: "통신", desc: "기기끼리 데이터를 주고받는 능력" },
            { term: "Connectivity", ko: "접속성", desc: "언제든 네트워크에 연결되는 능력" },
            { term: "Contents", ko: "콘텐츠", desc: "사용자에게 제공되는 정보·서비스" },
            { term: "Calm", ko: "고요함", desc: "사용자를 방해하지 않는 차분한 동작" }
        ],
        "5Any": [
            { term: "Anytime", ko: "언제나", desc: "언제나" },
            { term: "Anywhere", ko: "어디서나", desc: "어디서나" },
            { term: "Anynetwork", ko: "어떤 망으로든", desc: "어떤 망으로든" },
            { term: "Anydevice", ko: "어떤 기기로든", desc: "어떤 기기로든" },
            { term: "Anyservice", ko: "어떤 서비스든", desc: "어떤 서비스든" }
        ]
    };

    var logic = {
        groups: GROUPS,

        /* Fisher-Yates 셔플 (원본 보존, rng는 [0,1) 함수) */
        shuffle: function (arr, rng) {
            var a = arr.slice();
            var i, j, tmp;
            for (i = a.length - 1; i > 0; i--) {
                j = Math.floor(rng() * (i + 1));
                tmp = a[i];
                a[i] = a[j];
                a[j] = tmp;
            }
            return a;
        },

        /* 10문제 덱 생성: 5C 5개 + 5Any 5개를 섞는다 */
        makeDeck: function (rng) {
            var deck = [];
            var names = ["5C", "5Any"];
            var g, i, items;
            for (g = 0; g < names.length; g++) {
                items = GROUPS[names[g]];
                for (i = 0; i < items.length; i++) {
                    deck.push({
                        group: names[g],
                        term: items[i].term,
                        ko: items[i].ko,
                        desc: items[i].desc
                    });
                }
            }
            return this.shuffle(deck, rng);
        },

        /* 문제별 한 줄 해설 */
        explainFor: function (q) {
            var s;
            if (q.group === "5C") {
                s = q.term + "(" + q.ko + "): " + q.desc + ".";
                if (q.term === "Calm") {
                    s += " 와이저의 캄 테크놀로지가 5C 안에 들어 있다.";
                }
            } else {
                s = q.term + " = " + q.desc + ".";
            }
            return s;
        },

        /* 선택한 용어 판정 */
        judge: function (q, term) {
            return {
                correct: q.term === term,
                explain: this.explainFor(q)
            };
        },

        /* 점수대별 마무리 멘트 */
        grade: function (score, total) {
            var r = total > 0 ? score / total : 0;
            if (r === 1) return "만점! 5C와 5Any를 완벽하게 구분했다.";
            if (r >= 0.7) return "좋은 점수. 틀린 용어만 플래시카드로 한 번 더 복습하자.";
            if (r >= 0.4) return "절반쯤 왔다. 5C(기능)와 5Any(제약 없음)의 차이부터 다시 정리하자.";
            return "아직 낯설다. 본문 플래시카드를 먼저 훑고 다시 도전하자.";
        }
    };

    window.SIM.register("ub-5c5any-quiz", {
        title: "5C · 5Any 분류 퀴즈",
        _logic: logic,
        build: function (root) {
            var state = { deck: [], index: 0, score: 0, answered: false };

            root.innerHTML = ""
                + '<div class="sim__row uq-bar">'
                +     '<span class="sim__chip uq-progress">문제 1 / 10</span>'
                +     '<span class="sim__chip uq-score">점수 0</span>'
                +     '<button type="button" class="sim__btn uq-restart" aria-label="퀴즈 처음부터 다시 시작">다시 시작</button>'
                + '</div>'
                + '<div class="uq-quiz">'
                +     '<p class="uq-ask">이 설명에 맞는 <span class="uq-group">5C</span><span class="uq-ask-tail">는?</span></p>'
                +     '<div class="uq-desc"></div>'
                +     '<div class="uq-choices" role="group" aria-label="정답 보기 선택"></div>'
                +     '<div class="uq-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row uq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary uq-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="uq-result" aria-live="polite" hidden></div>'
                + '<p class="sim__note">5C는 유비쿼터스 컴퓨팅이 갖춰야 할 5가지 기능, 5Any는 그 기능을 누리는 데 없어야 할 5가지 제약이다.</p>';

            var progressEl = root.querySelector(".uq-progress");
            var scoreEl = root.querySelector(".uq-score");
            var restartBtn = root.querySelector(".uq-restart");
            var quizEl = root.querySelector(".uq-quiz");
            var groupEl = root.querySelector(".uq-group");
            var descEl = root.querySelector(".uq-desc");
            var choicesEl = root.querySelector(".uq-choices");
            var feedbackEl = root.querySelector(".uq-feedback");
            var nextBtn = root.querySelector(".uq-next");
            var resultEl = root.querySelector(".uq-result");

            function updateBar() {
                progressEl.textContent = "문제 " + (state.index + 1) + " / " + state.deck.length;
                scoreEl.textContent = "점수 " + state.score;
            }

            function onChoice(ev) {
                if (state.answered) return;
                state.answered = true;

                var picked = ev.currentTarget;
                var term = picked.getAttribute("data-term");
                var q = state.deck[state.index];
                var result = logic.judge(q, term);
                var btns = choicesEl.querySelectorAll(".uq-choice");
                var i, b;

                for (i = 0; i < btns.length; i++) {
                    b = btns[i];
                    b.disabled = true;
                    if (b.getAttribute("data-term") === q.term) {
                        b.className = "uq-choice is-correct";
                    } else if (b === picked) {
                        b.className = "uq-choice is-wrong";
                    }
                }

                if (result.correct) {
                    state.score++;
                    feedbackEl.className = "uq-feedback is-ok";
                    feedbackEl.textContent = "정답! " + result.explain;
                } else {
                    feedbackEl.className = "uq-feedback is-bad";
                    feedbackEl.textContent = "오답. 정답은 " + q.term + ". " + result.explain;
                }

                updateBar();
                nextBtn.textContent = state.index === state.deck.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            function renderQuestion() {
                var q = state.deck[state.index];
                var items = logic.groups[q.group];
                var i, btn;

                state.answered = false;
                updateBar();
                groupEl.textContent = q.group;
                descEl.textContent = q.desc;
                feedbackEl.className = "uq-feedback";
                feedbackEl.textContent = "";
                nextBtn.hidden = true;

                choicesEl.innerHTML = "";
                for (i = 0; i < items.length; i++) {
                    btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "uq-choice";
                    btn.textContent = items[i].term;
                    btn.setAttribute("data-term", items[i].term);
                    btn.setAttribute("aria-label", "보기 " + items[i].term + " 선택");
                    btn.addEventListener("click", onChoice);
                    choicesEl.appendChild(btn);
                }
            }

            function showResult() {
                var scoreLine = document.createElement("p");
                var gradeLine = document.createElement("p");
                var coreBox = document.createElement("div");
                var coreTitle = document.createElement("p");
                var coreBody = document.createElement("p");
                var row = document.createElement("div");
                var againBtn = document.createElement("button");

                scoreLine.className = "uq-result-score";
                scoreLine.textContent = "퀴즈 완료: " + state.deck.length + "문제 중 " + state.score + "문제 정답";

                gradeLine.className = "uq-result-grade";
                gradeLine.textContent = logic.grade(state.score, state.deck.length);

                coreBox.className = "uq-result-core";
                coreTitle.className = "uq-result-core-title";
                coreTitle.textContent = '핵심 요약: 유비쿼터스 컴퓨팅 = "5C를 5Any화"';
                coreBody.className = "uq-result-core-body";
                coreBody.textContent = "5가지 기능(5C)을 시간·장소·망·기기·서비스의 제약 없이(5Any) 누리게 하는 것이다.";
                coreBox.appendChild(coreTitle);
                coreBox.appendChild(coreBody);

                row.className = "sim__row";
                againBtn.type = "button";
                againBtn.className = "sim__btn sim__btn--primary";
                againBtn.textContent = "다시 풀기";
                againBtn.setAttribute("aria-label", "퀴즈 다시 풀기");
                againBtn.addEventListener("click", restart);
                row.appendChild(againBtn);

                resultEl.innerHTML = "";
                resultEl.appendChild(scoreLine);
                resultEl.appendChild(gradeLine);
                resultEl.appendChild(coreBox);
                resultEl.appendChild(row);

                quizEl.hidden = true;
                resultEl.hidden = false;
                updateBar();
            }

            function restart() {
                state.deck = logic.makeDeck(Math.random);
                state.index = 0;
                state.score = 0;
                state.answered = false;
                resultEl.hidden = true;
                resultEl.innerHTML = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            nextBtn.addEventListener("click", function () {
                if (!state.answered) return;
                if (state.index === state.deck.length - 1) {
                    showResult();
                } else {
                    state.index++;
                    renderQuestion();
                }
            });

            restartBtn.addEventListener("click", restart);

            restart();
        }
    });
})();

/* sim:ub-wireless-match - 어떤 무선 기술을 쓸까? */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 거리 막대 단계 (로그 느낌: cm -> 10m -> 100m -> km -> 광역) ---- */
    var STAGES = ["cm", "10m", "100m", "km", "광역"];

    /* ---- 본문 표 기반 기술 정보 (DOM 비의존 데이터) ---- */
    var TECH = {
        "NFC": {
            dist: "약 10cm",
            level: 1,
            feat: "가까이 대면 통신. 모바일 결제·교통카드·기기 페어링에 쓴다."
        },
        "RFID": {
            dist: "수 cm ~ 수 m",
            level: 2,
            feat: "태그 + 리더 구성. 배터리 없는 수동형 태그로 물류 추적·하이패스에 쓴다."
        },
        "블루투스(BLE)": {
            dist: "~10m",
            level: 2,
            feat: "저전력 근거리 연결. 이어폰·웨어러블 기기에 쓴다."
        },
        "Zigbee": {
            dist: "실내 약 10~20m (메시로 확장)",
            level: 2,
            feat: "저전력 메시 네트워크. 스마트홈 센서를 촘촘히 연결한다."
        },
        "Wi-Fi": {
            dist: "~100m",
            level: 3,
            feat: "빠른 무선 인터넷 접속. 집·사무실 무선랜(IEEE 802.11)."
        },
        "UWB": {
            dist: "수 m ~ 수십 m",
            level: 2,
            feat: "넓은 대역으로 고속 전송과 cm급 정밀 측위. 스마트키·실내 위치 추적."
        },
        "LoRa/NB-IoT": {
            dist: "수 km",
            level: 4,
            feat: "저전력 광역(LPWA). 도시 단위 IoT 센서망에 쓴다."
        },
        "5G": {
            dist: "광역",
            level: 5,
            feat: "초고속·초저지연·초연결. 자율주행·실시간 IoT에 쓴다."
        }
    };

    /* ---- 문제 은행 (정답 1 + 오답 3, 표시 전에 셔플) ---- */
    var BANK = [
        {
            q: "버스 단말기에 약 10cm 가까이 대서 결제하는 교통카드를 만들고 싶다.",
            answer: "NFC",
            choices: ["NFC", "블루투스(BLE)", "Wi-Fi", "RFID"]
        },
        {
            q: "배터리 없는 태그를 붙여 창고의 물류 상자를 무선으로 식별하고 싶다.",
            answer: "RFID",
            choices: ["RFID", "NFC", "Zigbee", "5G"]
        },
        {
            q: "무선 이어폰과 스마트워치를 약 10m 안에서 저전력으로 연결하고 싶다.",
            answer: "블루투스(BLE)",
            choices: ["블루투스(BLE)", "Wi-Fi", "LoRa/NB-IoT", "UWB"]
        },
        {
            q: "집 안 곳곳의 여러 센서를 저전력 메시 네트워크로 연결하고 싶다.",
            answer: "Zigbee",
            choices: ["Zigbee", "NFC", "5G", "Wi-Fi"]
        },
        {
            q: "도시 곳곳에 흩어진 수 km 거리의 센서 데이터를 저전력 광역망으로 모으고 싶다.",
            answer: "LoRa/NB-IoT",
            choices: ["LoRa/NB-IoT", "블루투스(BLE)", "NFC", "UWB"]
        },
        {
            q: "cm급 정밀 실내 측위로 다가가면 문이 열리는 스마트키를 구현하고 싶다.",
            answer: "UWB",
            choices: ["UWB", "Zigbee", "RFID", "Wi-Fi"]
        },
        {
            q: "자율주행처럼 초고속·초저지연이 필요한 실시간 통신을 쓰고 싶다.",
            answer: "5G",
            choices: ["5G", "Wi-Fi", "블루투스(BLE)", "LoRa/NB-IoT"]
        },
        {
            q: "집과 사무실에서 약 100m 범위의 기기를 빠른 무선 인터넷에 연결하고 싶다.",
            answer: "Wi-Fi",
            choices: ["Wi-Fi", "NFC", "Zigbee", "5G"]
        }
    ];

    /* ---- 순수 로직 (DOM 비의존, 테스트 대상) ---- */
    var logic = {
        /* Fisher-Yates 셔플. 원본은 그대로 두고 새 배열을 돌려준다.
           rng는 0 이상 1 미만 난수를 주는 함수(테스트용 주입 가능). */
        shuffle: function (arr, rng) {
            var a = arr.slice();
            var r = rng || Math.random;
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(r() * (i + 1));
                var tmp = a[i];
                a[i] = a[j];
                a[j] = tmp;
            }
            return a;
        },
        /* 선택한 기술이 정답인지 판정 */
        judge: function (item, choice) {
            return choice === item.answer;
        },
        /* 거리 막대 채움 플래그. level 단계(1~5)까지 true, 범위 밖은 클램프 */
        stageFlags: function (level) {
            var lv = typeof level === "number" && !isNaN(level) ? Math.floor(level) : 0;
            if (lv < 0) lv = 0;
            if (lv > STAGES.length) lv = STAGES.length;
            var flags = [];
            for (var i = 0; i < STAGES.length; i++) {
                flags.push(i < lv);
            }
            return flags;
        },
        /* 판정 한 줄 문구 */
        verdictText: function (ok, answer) {
            return ok ? "정답입니다!" : "오답입니다. 정답: " + answer;
        },
        /* 해설 문구 (기술명 + 거리 + 특징, 본문 표 근거) */
        explainText: function (name, tech) {
            return name + " · 통신 거리 " + tech.dist + " · " + tech.feat;
        },
        /* 거리 막대의 보조 설명 텍스트 */
        barAria: function (name, tech) {
            return name + " 통신 거리: " + tech.dist
                + " (" + STAGES.length + "단계 중 " + tech.level + "단계)";
        },
        /* 점수 비율에 따른 종료 코멘트 */
        grade: function (score, total) {
            var ratio = total > 0 ? score / total : 0;
            if (ratio >= 1) return "완벽합니다! 거리/속도/전력 기준이 확실히 잡혔어요.";
            if (ratio >= 0.75) return "좋아요! 틀린 시나리오의 해설만 다시 확인해 보세요.";
            if (ratio >= 0.5) return "절반 이상 맞혔어요. 본문의 무선 통신 비교 표를 한 번 더 복습해 보세요.";
            return "아직 헷갈리네요. 거리 막대를 떠올리며 표를 복습한 뒤 다시 풀어 보세요.";
        },
        /* 문제 은행 무결성 검사: 오류 메시지 배열(정상이면 빈 배열) */
        checkBank: function (bank, tech) {
            var errs = [];
            for (var i = 0; i < bank.length; i++) {
                var item = bank[i];
                if (!tech[item.answer]) {
                    errs.push(i + ": 정답 기술 정보 없음 (" + item.answer + ")");
                }
                if (!item.choices || item.choices.length !== 4) {
                    errs.push(i + ": 보기가 4개가 아님");
                    continue;
                }
                var hasAnswer = false;
                for (var j = 0; j < item.choices.length; j++) {
                    var c = item.choices[j];
                    if (!tech[c]) {
                        errs.push(i + ": 보기 기술 정보 없음 (" + c + ")");
                    }
                    if (c === item.answer) hasAnswer = true;
                    for (var k = j + 1; k < item.choices.length; k++) {
                        if (item.choices[k] === c) {
                            errs.push(i + ": 보기 중복 (" + c + ")");
                        }
                    }
                }
                if (!hasAnswer) {
                    errs.push(i + ": 정답이 보기에 없음");
                }
            }
            return errs;
        }
    };

    window.SIM.register("ub-wireless-match", {
        title: "어떤 무선 기술을 쓸까?",
        _logic: logic,
        _bank: BANK,
        _tech: TECH,
        _stages: STAGES,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<span class="sim__chip uwm-progress">문제 1 / ' + BANK.length + '</span>'
                +     '<span class="sim__chip uwm-score">맞힘 0 / ' + BANK.length + '</span>'
                +     '<button type="button" class="sim__btn uwm-restart" aria-label="퀴즈를 처음부터 다시 시작">처음부터</button>'
                + '</div>'
                + '<div class="uwm-card">'
                +     '<p class="uwm-lead">이 시나리오에 가장 알맞은 무선 기술은?</p>'
                +     '<p class="uwm-scenario"></p>'
                +     '<div class="uwm-choices" role="group" aria-label="무선 기술 보기 4개"></div>'
                +     '<div class="uwm-feedback" aria-live="polite">'
                +         '<p class="uwm-verdict"></p>'
                +         '<div class="uwm-explain" hidden>'
                +             '<p class="uwm-explain-text"></p>'
                +             '<div class="uwm-bar" role="img" aria-label=""></div>'
                +         '</div>'
                +     '</div>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary uwm-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="uwm-result" aria-live="polite" hidden>'
                +     '<p class="uwm-result-line"></p>'
                +     '<p class="uwm-result-msg"></p>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary uwm-retry">다시 풀기</button>'
                +     '</div>'
                + '</div>'
                + '<p class="sim__note">핵심: 무선 기술은 거리/속도/전력에 따라 골라 쓴다.</p>';

            var progressEl = root.querySelector(".uwm-progress");
            var scoreEl = root.querySelector(".uwm-score");
            var restartBtn = root.querySelector(".uwm-restart");
            var card = root.querySelector(".uwm-card");
            var scenarioEl = root.querySelector(".uwm-scenario");
            var choicesEl = root.querySelector(".uwm-choices");
            var verdictEl = root.querySelector(".uwm-verdict");
            var explainBox = root.querySelector(".uwm-explain");
            var explainTextEl = root.querySelector(".uwm-explain-text");
            var barEl = root.querySelector(".uwm-bar");
            var nextBtn = root.querySelector(".uwm-next");
            var resultBox = root.querySelector(".uwm-result");
            var resultLine = root.querySelector(".uwm-result-line");
            var resultMsg = root.querySelector(".uwm-result-msg");
            var retryBtn = root.querySelector(".uwm-retry");

            /* 거리 막대 골격 (단계 5칸 + 라벨)은 한 번만 만든다 */
            for (var s = 0; s < STAGES.length; s++) {
                var stage = document.createElement("div");
                stage.className = "uwm-stage";
                var seg = document.createElement("div");
                seg.className = "uwm-seg";
                var lab = document.createElement("span");
                lab.className = "uwm-stage-label";
                lab.textContent = STAGES[s];
                stage.appendChild(seg);
                stage.appendChild(lab);
                barEl.appendChild(stage);
            }
            var stageEls = root.querySelectorAll(".uwm-stage");

            var state = { order: [], index: 0, score: 0, answered: false };

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            function updateStatus() {
                var pos = state.index < state.order.length ? state.index + 1 : state.order.length;
                progressEl.textContent = "문제 " + pos + " / " + state.order.length;
                scoreEl.textContent = "맞힘 " + state.score + " / " + state.order.length;
            }

            /* 정답 기술의 통신 거리를 단계 막대로 표시 */
            function renderBar(answerKey) {
                var tech = TECH[answerKey];
                var flags = logic.stageFlags(tech.level);
                for (var i = 0; i < stageEls.length; i++) {
                    stageEls[i].className = flags[i] ? "uwm-stage is-on" : "uwm-stage";
                }
                barEl.setAttribute("aria-label", logic.barAria(answerKey, tech));
            }

            function onChoice(btn) {
                if (state.answered) return;
                state.answered = true;
                var item = state.order[state.index];
                var choice = btn.getAttribute("data-tech");
                var ok = logic.judge(item, choice);
                if (ok) state.score += 1;
                var btns = choicesEl.querySelectorAll(".uwm-choice");
                for (var i = 0; i < btns.length; i++) {
                    var b = btns[i];
                    b.disabled = true;
                    if (b.getAttribute("data-tech") === item.answer) {
                        b.className = "sim__btn uwm-choice is-correct";
                    } else if (b === btn) {
                        b.className = "sim__btn uwm-choice is-wrong";
                    }
                }
                verdictEl.className = "uwm-verdict " + (ok ? "is-ok" : "is-no");
                verdictEl.textContent = logic.verdictText(ok, item.answer);
                explainTextEl.textContent = logic.explainText(item.answer, TECH[item.answer]);
                renderBar(item.answer);
                explainBox.hidden = false;
                nextBtn.textContent = state.index + 1 >= state.order.length ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
                updateStatus();
            }

            function makeChoiceHandler(btn) {
                return function () {
                    onChoice(btn);
                };
            }

            function showQuestion() {
                var item = state.order[state.index];
                state.answered = false;
                scenarioEl.textContent = item.q;
                verdictEl.textContent = "";
                verdictEl.className = "uwm-verdict";
                explainBox.hidden = true;
                nextBtn.hidden = true;
                clearNode(choicesEl);
                var shuffled = logic.shuffle(item.choices);
                for (var i = 0; i < shuffled.length; i++) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.className = "sim__btn uwm-choice";
                    b.setAttribute("data-tech", shuffled[i]);
                    b.setAttribute("aria-label", shuffled[i] + " 선택");
                    b.textContent = shuffled[i];
                    b.addEventListener("click", makeChoiceHandler(b));
                    choicesEl.appendChild(b);
                }
                updateStatus();
            }

            function showResult() {
                card.hidden = true;
                resultBox.hidden = false;
                resultLine.textContent = state.order.length + "문제 중 " + state.score + "개 정답";
                resultMsg.textContent = logic.grade(state.score, state.order.length);
                progressEl.textContent = "완료";
                scoreEl.textContent = "맞힘 " + state.score + " / " + state.order.length;
            }

            function start() {
                state.order = logic.shuffle(BANK);
                state.index = 0;
                state.score = 0;
                resultBox.hidden = true;
                card.hidden = false;
                showQuestion();
            }

            nextBtn.addEventListener("click", function () {
                state.index += 1;
                if (state.index >= state.order.length) {
                    showResult();
                } else {
                    showQuestion();
                }
            });

            restartBtn.addEventListener("click", start);
            retryBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:ub-blockchain-demo - 블록체인 위변조 체험 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var GENESIS = "00000000";

    var logic = {
        GENESIS: GENESIS,

        /* FNV-1a 32비트 해시. 곱셈은 시프트 합으로 32비트 정밀도 유지 */
        fnv1a: function (str) {
            var h = 0x811c9dc5;
            for (var i = 0; i < str.length; i++) {
                h = (h ^ str.charCodeAt(i)) >>> 0;
                h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
            }
            return h;
        },

        /* 32비트 정수를 8자리 대문자 16진 문자열로 */
        toHex8: function (n) {
            var s = (n >>> 0).toString(16).toUpperCase();
            while (s.length < 8) {
                s = "0" + s;
            }
            return s;
        },

        /* 블록 해시 = H(번호 | 데이터 | 이전해시) */
        blockHash: function (no, data, prevHash) {
            return logic.toHex8(logic.fnv1a(no + "|" + data + "|" + prevHash));
        },

        /* 데이터 목록으로 정상 체인을 봉인. [{prev, hash}] 반환 */
        buildChain: function (dataList) {
            var prev = GENESIS;
            var out = [];
            for (var i = 0; i < dataList.length; i++) {
                var h = logic.blockHash(i + 1, dataList[i], prev);
                out.push({ prev: prev, hash: h });
                prev = h;
            }
            return out;
        },

        /* 체인 상태 평가.
           state = { data:[], prevs:[], sealed:[] }
           - tampered: 현재 해시가 봉인 당시 해시와 다름 (그 블록 데이터가 바뀜)
           - broken: 이전 해시 연결이 끊겼거나, 앞 블록부터 깨져 신뢰 불가 */
        evaluate: function (state) {
            var blocks = [];
            var firstBad = -1;
            for (var i = 0; i < state.data.length; i++) {
                var hash = logic.blockHash(i + 1, state.data[i], state.prevs[i]);
                var tampered = hash !== state.sealed[i];
                var expectPrev = i === 0 ? GENESIS : blocks[i - 1].hash;
                var mismatch = state.prevs[i] !== expectPrev;
                var broken = mismatch || (i > 0 && blocks[i - 1].broken);
                blocks.push({
                    hash: hash,
                    tampered: tampered,
                    mismatch: mismatch,
                    broken: broken
                });
                if (firstBad === -1 && (tampered || broken)) {
                    firstBad = i;
                }
            }
            return {
                blocks: blocks,
                firstBad: firstBad,
                intact: firstBad === -1
            };
        },

        /* 두 문자열 배열이 같은가 */
        sameData: function (a, b) {
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        }
    };

    var DEFAULTS = ["A가 B에게 1만원", "B가 C에게 5천원", "C가 A에게 2천원"];

    window.SIM.register("ub-blockchain-demo", {
        title: "블록체인 위변조 체험",
        _logic: logic,
        build: function (root) {
            var i;
            var html = '<div class="bcd-chain">';
            for (i = 0; i < 3; i++) {
                if (i > 0) {
                    html += '<div class="bcd-link" data-link="' + i + '" aria-hidden="true"></div>';
                }
                html += ''
                    + '<div class="bcd-block" data-block="' + i + '">'
                    +     '<div class="bcd-block__head">'
                    +         '<span class="bcd-block__no">블록 ' + (i + 1) + '</span>'
                    +         '<span class="bcd-badge" data-badge="' + i + '">정상</span>'
                    +     '</div>'
                    +     '<label class="bcd-field">거래 데이터'
                    +         '<input type="text" class="sim__input bcd-data" data-data="' + i + '"'
                    +             ' maxlength="40" autocomplete="off" spellcheck="false"'
                    +             ' aria-label="블록 ' + (i + 1) + ' 거래 데이터">'
                    +     '</label>'
                    +     '<div class="bcd-hash-row">'
                    +         '<span class="bcd-hash-label">이전 해시</span>'
                    +         '<code class="bcd-hash-val" data-prev="' + i + '"></code>'
                    +     '</div>'
                    +     '<div class="bcd-hash-row">'
                    +         '<span class="bcd-hash-label">현재 해시</span>'
                    +         '<code class="bcd-hash-val" data-hash="' + i + '"></code>'
                    +     '</div>'
                    + '</div>';
            }
            html += '</div>'
                + '<div class="bcd-status" role="status" aria-live="polite"></div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary bcd-relink"'
                +         ' aria-label="모든 블록 해시를 다시 계산해 체인 재연결">다시 연결(재계산)</button>'
                +     '<button type="button" class="sim__btn bcd-reset"'
                +         ' aria-label="거래 데이터를 처음 값으로 되돌리기">처음 데이터로</button>'
                + '</div>'
                + '<p class="sim__note">위 해시는 교육용 시뮬 해시(FNV-1a 32비트)입니다. '
                + '실제 블록체인은 SHA-256 같은 암호학적 해시를 사용해 같은 원리로 블록을 연결합니다.</p>';
            root.innerHTML = html;

            var blockEls = [];
            var badgeEls = [];
            var inputEls = [];
            var prevEls = [];
            var hashEls = [];
            var linkEls = [];
            for (i = 0; i < 3; i++) {
                blockEls.push(root.querySelector('[data-block="' + i + '"]'));
                badgeEls.push(root.querySelector('[data-badge="' + i + '"]'));
                inputEls.push(root.querySelector('[data-data="' + i + '"]'));
                prevEls.push(root.querySelector('[data-prev="' + i + '"]'));
                hashEls.push(root.querySelector('[data-hash="' + i + '"]'));
                if (i > 0) {
                    linkEls.push(root.querySelector('[data-link="' + i + '"]'));
                }
            }
            var statusEl = root.querySelector(".bcd-status");
            var relinkBtn = root.querySelector(".bcd-relink");
            var resetBtn = root.querySelector(".bcd-reset");

            var state = { data: DEFAULTS.slice(), prevs: [], sealed: [] };

            /* 현재 데이터 기준으로 체인을 봉인(이전 해시 연결 + 해시 기록) */
            function seal() {
                var chain = logic.buildChain(state.data);
                for (var k = 0; k < chain.length; k++) {
                    state.prevs[k] = chain[k].prev;
                    state.sealed[k] = chain[k].hash;
                }
            }

            function setStatus(text, tone) {
                statusEl.textContent = text;
                statusEl.className = "bcd-status bcd-status--" + tone;
            }

            /* override = {text, tone} 이면 기본 상태 문구 대신 사용 */
            function render(override) {
                var ev = logic.evaluate(state);
                for (var k = 0; k < 3; k++) {
                    var b = ev.blocks[k];
                    var bad = b.tampered || b.broken;
                    prevEls[k].textContent = state.prevs[k];
                    hashEls[k].textContent = b.hash;
                    blockEls[k].className = "bcd-block "
                        + (bad ? "bcd-block--bad" : "bcd-block--ok");
                    prevEls[k].className = "bcd-hash-val"
                        + (b.mismatch ? " bcd-hash-val--bad" : "");
                    if (b.broken) {
                        badgeEls[k].textContent = "연결 끊김";
                    } else if (b.tampered) {
                        badgeEls[k].textContent = "변조됨";
                    } else {
                        badgeEls[k].textContent = "정상";
                    }
                    badgeEls[k].className = "bcd-badge "
                        + (bad ? "bcd-badge--bad" : "bcd-badge--ok");
                    if (k > 0) {
                        linkEls[k - 1].className = "bcd-link"
                            + (ev.blocks[k].broken ? " bcd-link--bad" : "");
                    }
                }
                if (override) {
                    setStatus(override.text, override.tone);
                } else if (ev.intact) {
                    setStatus("체인 정상: 세 블록이 모두 연결되어 있습니다.", "ok");
                } else if (ev.firstBad < 2) {
                    setStatus("블록 " + (ev.firstBad + 1)
                        + (ev.firstBad === 1 ? "를" : "을")
                        + " 고치면 뒤 블록이 전부 깨진다 - 이것이 위변조가 어려운 이유", "warn");
                } else {
                    setStatus("블록 3의 해시가 봉인 당시와 달라졌습니다 - 마지막 블록이라도 변조는 바로 드러납니다.", "warn");
                }
            }

            function bindInput(idx) {
                inputEls[idx].addEventListener("input", function () {
                    state.data[idx] = inputEls[idx].value;
                    render();
                });
            }
            for (i = 0; i < 3; i++) {
                inputEls[i].value = DEFAULTS[i];
                bindInput(i);
            }

            relinkBtn.addEventListener("click", function () {
                seal();
                if (logic.sameData(state.data, DEFAULTS)) {
                    render({
                        text: "해시를 다시 계산했습니다. 데이터가 처음과 같아 원래 체인과 동일합니다.",
                        tone: "ok"
                    });
                } else {
                    render({
                        text: "해시를 다시 계산해 체인을 복구했습니다. 하지만 실제 네트워크에선 "
                            + "다른 참여자들의 장부와 달라 거부됩니다.",
                        tone: "info"
                    });
                }
            });

            resetBtn.addEventListener("click", function () {
                state.data = DEFAULTS.slice();
                for (var k = 0; k < 3; k++) {
                    inputEls[k].value = DEFAULTS[k];
                }
                seal();
                render({
                    text: "처음 데이터로 되돌렸습니다. 체인 정상.",
                    tone: "ok"
                });
            });

            seal();
            render();
        }
    });
})();

/* sim:ub-cloud-quiz - 클라우드 모델 고르기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 모델 정보 (비유, 설명, 제공자 관리 범위) ----
       managed: 스택 아래(인프라)부터 제공자가 관리하는 계층 수.
       엣지는 서비스 모델이 아니라 처리 위치 개념이므로 null. */
    var MODELS = {
        iaas: {
            label: "IaaS",
            full: "Infrastructure as a Service",
            analogy: "빈 땅을 빌림 - 그 위에 집(OS, 소프트웨어)은 내가 짓는다",
            desc: "서버, 저장장치 같은 인프라만 제공자가 관리하고, OS부터 애플리케이션까지는 사용자가 직접 구성합니다.",
            managed: 1
        },
        paas: {
            label: "PaaS",
            full: "Platform as a Service",
            analogy: "집의 골조까지 빌림 - 내부 인테리어(코드)만 내가 한다",
            desc: "인프라에 더해 개발/실행 플랫폼까지 제공자가 관리하고, 사용자는 코드만 올립니다.",
            managed: 2
        },
        saas: {
            label: "SaaS",
            full: "Software as a Service",
            analogy: "다 지어진 집에 입주 - 가구까지 갖춰져 있어 바로 산다",
            desc: "인프라부터 완성된 소프트웨어까지 전부 제공자가 관리하고, 사용자는 그냥 사용합니다.",
            managed: 3
        },
        edge: {
            label: "엣지 컴퓨팅",
            full: "Edge Computing",
            analogy: "멀리 본사(데이터센터)까지 가지 않고 현장 사무소에서 바로 처리한다",
            desc: "무엇을 빌리느냐가 아니라 어디서 처리하느냐의 개념입니다. 데이터가 생기는 현장 가까이에서 먼저 처리해 지연(latency)을 줄입니다.",
            managed: null
        }
    };

    /* 선택 버튼 표시 순서 */
    var MODEL_KEYS = ["iaas", "paas", "saas", "edge"];

    /* 스택 계층 (아래에서 위 순서) */
    var LAYERS = ["인프라", "플랫폼", "소프트웨어"];

    /* ---- 문제 은행 (시나리오, 정답 모델, 판단 근거) ---- */
    var QUESTIONS = [
        {
            s: "웹 브라우저로 Gmail에 접속해 메일을 바로 쓴다.",
            answer: "saas",
            why: "완성된 소프트웨어(메일 서비스)를 설치 없이 브라우저로 바로 쓰므로 SaaS입니다."
        },
        {
            s: "AWS EC2 가상 서버를 빌려 OS부터 직접 설치해 구성한다.",
            answer: "iaas",
            why: "가상 서버라는 인프라만 빌리고 OS 설치부터는 직접 하므로 IaaS입니다."
        },
        {
            s: "Google App Engine에 코드만 올리면 알아서 실행된다.",
            answer: "paas",
            why: "실행 플랫폼까지 제공받고 사용자는 코드만 올리므로 PaaS입니다."
        },
        {
            s: "자율주행차가 장애물을 현장에서 즉시 판단해야 한다.",
            answer: "edge",
            why: "데이터센터까지 왕복할 시간이 없어 현장(차량)에서 즉시 처리해야 하므로 엣지 컴퓨팅입니다."
        },
        {
            s: "구글 문서로 팀원들과 보고서를 공동 편집한다.",
            answer: "saas",
            why: "완성된 문서 편집 소프트웨어를 빌려 그대로 쓰므로 SaaS입니다."
        },
        {
            s: "개발팀이 실행 환경 관리 없이 애플리케이션 배포만 한다.",
            answer: "paas",
            why: "실행 환경(플랫폼) 관리를 제공자에게 맡기고 배포만 하므로 PaaS입니다."
        },
        {
            s: "스마트팩토리 설비가 ms 단위로 반응해야 한다.",
            answer: "edge",
            why: "ms 단위 반응은 클라우드 왕복 지연을 견딜 수 없어 현장에서 처리하는 엣지 컴퓨팅이 필요합니다."
        },
        {
            s: "저장장치와 서버 인프라만 빌리고 그 위는 우리가 직접 구성한다.",
            answer: "iaas",
            why: "서버, 저장장치 같은 인프라만 빌리고 그 위 구성은 직접 하므로 IaaS입니다."
        }
    ];

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        models: MODELS,
        modelKeys: MODEL_KEYS,
        questions: QUESTIONS,
        layers: LAYERS,
        /* 0..n-1 인덱스를 Fisher-Yates로 섞은 출제 순서. rnd는 [0,1) 난수 함수 */
        makeOrder: function (n, rnd) {
            var order = [];
            var i, j, tmp;
            for (i = 0; i < n; i++) order.push(i);
            for (i = n - 1; i > 0; i--) {
                j = Math.floor(rnd() * (i + 1));
                tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
            return order;
        },
        /* 고른 모델이 정답인지 판정 */
        isCorrect: function (q, choice) {
            return choice === q.answer;
        },
        /* 스택 행 목록 (렌더링용, 위에서 아래 = 소프트웨어 -> 인프라).
           각 행: { name, byProvider }. 엣지는 스택이 없으므로 null */
        stackRows: function (modelKey) {
            var m = MODELS[modelKey];
            if (!m || m.managed === null) return null;
            var rows = [];
            for (var i = LAYERS.length - 1; i >= 0; i--) {
                rows.push({ name: LAYERS[i], byProvider: i < m.managed });
            }
            return rows;
        },
        /* 제공자가 관리하는 계층 이름 목록 (아래에서 위 순서). 엣지는 null */
        managedNames: function (modelKey) {
            var m = MODELS[modelKey];
            if (!m || m.managed === null) return null;
            var names = [];
            for (var i = 0; i < m.managed; i++) names.push(LAYERS[i]);
            return names;
        },
        /* 점수대별 마무리 메시지 */
        summaryMsg: function (score, total) {
            if (score === total) {
                return "만점입니다! 서비스 모델과 엣지 컴퓨팅을 완벽하게 구분했어요.";
            }
            if (score >= Math.ceil(total * 0.7)) {
                return "잘했어요. 틀린 시나리오의 판단 근거만 다시 확인해 보세요.";
            }
            return "빈 땅(IaaS), 골조까지(PaaS), 다 지어진 집(SaaS) 비유를 떠올리며 다시 도전해 보세요.";
        }
    };

    window.SIM.register("ub-cloud-quiz", {
        title: "클라우드 모델 고르기",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="ucq-status">'
                +     '<span class="sim__chip ucq-progress">문제 1 / ' + QUESTIONS.length + '</span>'
                +     '<span class="sim__chip ucq-score">점수 0</span>'
                + '</div>'
                + '<div class="ucq-quiz">'
                +     '<p class="ucq-scenario"></p>'
                +     '<div class="ucq-options" role="group" aria-label="클라우드 모델 선택"></div>'
                +     '<div class="ucq-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row ucq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary ucq-next" hidden>다음 문제</button>'
                +         '<button type="button" class="sim__btn ucq-restart" aria-label="퀴즈를 처음부터 다시 시작">처음부터</button>'
                +     '</div>'
                + '</div>'
                + '<div class="ucq-summary" aria-live="polite" hidden></div>'
                + '<p class="sim__note">시나리오를 읽고 알맞은 클라우드 모델을 고르면 비유 해설과 함께 제공자가 어디까지 관리하는지 보여줍니다.</p>';

            var progressEl = root.querySelector(".ucq-progress");
            var scoreEl = root.querySelector(".ucq-score");
            var quizEl = root.querySelector(".ucq-quiz");
            var scenarioEl = root.querySelector(".ucq-scenario");
            var optionsEl = root.querySelector(".ucq-options");
            var feedbackEl = root.querySelector(".ucq-feedback");
            var nextBtn = root.querySelector(".ucq-next");
            var restartBtn = root.querySelector(".ucq-restart");
            var summaryEl = root.querySelector(".ucq-summary");

            /* 선택 버튼 4개는 한 번만 만들고 문제마다 상태만 초기화 */
            var i;
            for (i = 0; i < MODEL_KEYS.length; i++) {
                var key = MODEL_KEYS[i];
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sim__btn ucq-opt";
                btn.textContent = MODELS[key].label;
                btn.setAttribute("data-model", key);
                btn.setAttribute("aria-label", MODELS[key].label + ", " + MODELS[key].full);
                btn.addEventListener("click", onOptionClick);
                optionsEl.appendChild(btn);
            }
            var optBtns = optionsEl.querySelectorAll(".ucq-opt");

            var state = {
                order: [],
                pos: 0,
                score: 0,
                answered: false,
                results: []
            };

            function currentQuestion() {
                return QUESTIONS[state.order[state.pos]];
            }

            function renderQuestion() {
                var q = currentQuestion();
                state.answered = false;
                progressEl.textContent = "문제 " + (state.pos + 1) + " / " + state.order.length;
                scoreEl.textContent = "점수 " + state.score;
                scenarioEl.textContent = q.s;
                for (var k = 0; k < optBtns.length; k++) {
                    optBtns[k].disabled = false;
                    optBtns[k].classList.remove("ucq-opt--right");
                    optBtns[k].classList.remove("ucq-opt--wrong");
                }
                feedbackEl.innerHTML = "";
                nextBtn.hidden = true;
            }

            function onOptionClick(ev) {
                if (state.answered) return;
                state.answered = true;
                var choice = ev.currentTarget.getAttribute("data-model");
                var q = currentQuestion();
                var ok = logic.isCorrect(q, choice);
                if (ok) state.score++;
                state.results.push({
                    index: state.order[state.pos],
                    chosen: choice,
                    correct: ok
                });
                scoreEl.textContent = "점수 " + state.score;

                for (var k = 0; k < optBtns.length; k++) {
                    optBtns[k].disabled = true;
                    var m = optBtns[k].getAttribute("data-model");
                    if (m === q.answer) {
                        optBtns[k].classList.add("ucq-opt--right");
                    } else if (m === choice && !ok) {
                        optBtns[k].classList.add("ucq-opt--wrong");
                    }
                }

                renderFeedback(q, ok);
                nextBtn.textContent = state.pos === state.order.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            /* "무엇을 빌리나" 스택 다이어그램 (엣지는 위치 배지로 대체) */
            function stackHtml(modelKey) {
                var rows = logic.stackRows(modelKey);
                if (rows === null) {
                    return ''
                        + '<div class="ucq-stack-box">'
                        +     '<p class="ucq-stack-title">처리 위치</p>'
                        +     '<span class="ucq-edge-badge">위치: 현장 가까이</span>'
                        +     '<p class="sim__note">클라우드(데이터센터)까지 왕복하지 않고 단말 옆에서 먼저 처리해 지연을 줄입니다.</p>'
                        + '</div>';
                }
                var managed = logic.managedNames(modelKey);
                var label = "무엇을 빌리나 스택 다이어그램. 제공자 관리: "
                    + managed.join(", ")
                    + (managed.length === LAYERS.length ? "" : ". 나머지는 사용자 관리");
                var html = ''
                    + '<div class="ucq-stack-box">'
                    +     '<p class="ucq-stack-title">무엇을 빌리나 (색칠 = 제공자 관리)</p>'
                    +     '<div class="ucq-stack" role="img" aria-label="' + label + '">';
                for (var r = 0; r < rows.length; r++) {
                    html += ''
                        + '<div class="ucq-stack-row' + (rows[r].byProvider ? " ucq-stack-row--provider" : "") + '">'
                        +     '<span class="ucq-stack-name">' + rows[r].name + '</span>'
                        +     '<span class="ucq-stack-who">' + (rows[r].byProvider ? "제공자 관리" : "내가 관리") + '</span>'
                        + '</div>';
                }
                html += '</div></div>';
                return html;
            }

            function renderFeedback(q, ok) {
                var m = MODELS[q.answer];
                feedbackEl.innerHTML = ""
                    + '<p class="ucq-verdict ' + (ok ? "ucq-verdict--ok" : "ucq-verdict--no") + '">'
                    +     (ok ? "정답입니다!" : "오답입니다. 정답은 " + m.label + " 입니다.")
                    + '</p>'
                    + '<p class="ucq-model"><span class="sim__chip">' + m.label + '</span> <span class="ucq-model-full">' + m.full + '</span></p>'
                    + '<p class="ucq-analogy">비유: ' + m.analogy + '</p>'
                    + '<p class="ucq-why">' + q.why + '</p>'
                    + stackHtml(q.answer);
            }

            function renderSummary() {
                quizEl.hidden = true;
                progressEl.textContent = "완료";
                var rows = "";
                for (var r = 0; r < state.results.length; r++) {
                    var res = state.results[r];
                    var q = QUESTIONS[res.index];
                    rows += '<tr>'
                        + '<td class="' + (res.correct ? "ucq-cell-ok" : "ucq-cell-no") + '">'
                        +     (res.correct ? "O" : "X")
                        + '</td>'
                        + '<td>' + q.s + '</td>'
                        + '<td>' + MODELS[res.chosen].label + '</td>'
                        + '<td>' + MODELS[q.answer].label + '</td>'
                        + '</tr>';
                }
                summaryEl.innerHTML = ""
                    + '<p class="ucq-result">' + state.order.length + '문제 중 '
                    +     '<strong>' + state.score + '문제</strong> 정답</p>'
                    + '<p class="ucq-summary-msg">' + logic.summaryMsg(state.score, state.order.length) + '</p>'
                    + '<div class="ucq-table-wrap"><table>'
                    +     '<thead><tr><th>결과</th><th>시나리오</th><th>내 답</th><th>정답</th></tr></thead>'
                    +     '<tbody>' + rows + '</tbody>'
                    + '</table></div>'
                    + '<div class="sim__row">'
                    +     '<button type="button" class="sim__btn sim__btn--primary ucq-retry">다시 풀기</button>'
                    + '</div>';
                summaryEl.hidden = false;
                summaryEl.querySelector(".ucq-retry").addEventListener("click", start);
            }

            function start() {
                state.order = logic.makeOrder(QUESTIONS.length, Math.random);
                state.pos = 0;
                state.score = 0;
                state.results = [];
                summaryEl.hidden = true;
                summaryEl.innerHTML = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            nextBtn.addEventListener("click", function () {
                state.pos++;
                if (state.pos >= state.order.length) {
                    renderSummary();
                } else {
                    renderQuestion();
                }
            });

            restartBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:ub-context-flow - 상황인식 3단계 체험 */
(function () {
    "use strict";

    /* ---- 순수 로직 (DOM 비의존, node로 단독 테스트 가능) ---- */

    var STEPS_TOTAL = 3;

    var INTRO_NARR = "시나리오를 고른 뒤 다음 단계 버튼을 누르세요. " +
        "수집 -> 추론 -> 적응 순서로 상황인식이 진행됩니다.";

    /* 본문 표(Who 김철수 / What 회의 중 / Where 회의실 / When 오후 2시 /
       Why 발표 준비 / How 조용히)를 기준으로 시나리오별 5W1H를 구성 */
    var SCENARIOS = [
        {
            id: "meeting",
            label: "회의 중 자동 무음",
            chips: [
                { w: "Who", value: "김철수", source: "기기 계정" },
                { w: "What", value: "회의 중", source: "일정 앱" },
                { w: "Where", value: "회의실", source: "GPS" },
                { w: "When", value: "오후 2시", source: "시계" },
                { w: "Why", value: "발표 준비", source: "일정 앱" },
                { w: "How", value: "조용히", source: "소음 센서" }
            ],
            inferText: "지금 김철수는 회의실에서 회의 중이라고 판단",
            inferBasis: "일정 앱 + GPS + 시계 + 소음 센서 정보를 종합",
            actionIcon: "🔕",
            actionText: "휴대폰을 자동으로 무음 모드로 전환",
            narrations: [
                "1단계 수집: 일정 앱, GPS, 시계, 소음 센서에서 5W1H 컨텍스트를 모았습니다. 칩의 작은 글씨가 출처입니다.",
                "2단계 해석·추론: 흩어진 칩들을 종합해 \"지금 회의 중\"이라는 결론 하나로 합쳤습니다.",
                "3단계 적응 행동: 사용자가 시키지 않아도 휴대폰이 스스로 무음으로 바뀝니다. 체험 완료!"
            ]
        },
        {
            id: "home",
            label: "집 도착, 조명 켜기",
            chips: [
                { w: "Who", value: "김철수", source: "기기 계정" },
                { w: "What", value: "귀가", source: "이동 감지" },
                { w: "Where", value: "집 현관", source: "GPS" },
                { w: "When", value: "저녁 7시", source: "시계" },
                { w: "Why", value: "휴식", source: "생활 패턴" },
                { w: "How", value: "실내 깜깜함", source: "조도 센서" }
            ],
            inferText: "김철수가 어두운 집에 막 도착했다고 판단",
            inferBasis: "GPS + 시계 + 조도 센서 정보를 종합",
            actionIcon: "💡",
            actionText: "거실 조명을 자동으로 켭니다",
            narrations: [
                "1단계 수집: GPS, 시계, 조도 센서, 생활 패턴에서 5W1H 컨텍스트를 모았습니다. 칩의 작은 글씨가 출처입니다.",
                "2단계 해석·추론: 위치, 시간, 어두움을 종합해 \"어두운 집에 막 도착했다\"는 결론을 내렸습니다.",
                "3단계 적응 행동: 스위치를 누르지 않아도 거실 조명이 저절로 켜집니다. 체험 완료!"
            ]
        },
        {
            id: "drive",
            label: "운전 중 메시지 음성 안내",
            chips: [
                { w: "Who", value: "김철수", source: "기기 계정" },
                { w: "What", value: "운전 중", source: "차량 블루투스" },
                { w: "Where", value: "고속도로", source: "GPS" },
                { w: "When", value: "오전 9시", source: "시계" },
                { w: "Why", value: "출근", source: "일정 앱" },
                { w: "How", value: "두 손 사용 불가", source: "차량 연결 상태" }
            ],
            inferText: "지금 운전 중이라 화면을 볼 수 없다고 판단",
            inferBasis: "차량 블루투스 + GPS + 일정 앱 정보를 종합",
            actionIcon: "🔊",
            actionText: "새 메시지를 음성으로 읽어 줍니다",
            narrations: [
                "1단계 수집: 차량 블루투스, GPS, 시계, 일정 앱에서 5W1H 컨텍스트를 모았습니다. 칩의 작은 글씨가 출처입니다.",
                "2단계 해석·추론: 차량 연결과 이동 정보를 종합해 \"운전 중이라 화면을 볼 수 없다\"고 판단했습니다.",
                "3단계 적응 행동: 화면을 보여 주는 대신 메시지를 음성으로 읽어 줍니다. 체험 완료!"
            ]
        }
    ];

    /* 시나리오 인덱스를 받아 초기 상태를 만든다 (잘못된 값은 0으로) */
    function createState(scenarioIndex) {
        var idx = 0;
        if (typeof scenarioIndex === "number" && !isNaN(scenarioIndex)) {
            idx = Math.floor(scenarioIndex);
            if (idx < 0 || idx >= SCENARIOS.length) {
                idx = 0;
            }
        }
        return { scenario: idx, step: 0 };
    }

    /* 다음 단계로 진행. 이미 마지막(3단계)이면 false */
    function nextStep(state) {
        if (state.step >= STEPS_TOTAL) {
            return false;
        }
        state.step += 1;
        return true;
    }

    function resetState(state) {
        state.step = 0;
    }

    function getScenario(state) {
        return SCENARIOS[state.scenario];
    }

    /* 현재 단계의 내레이션 문구 */
    function getNarration(state) {
        if (state.step === 0) {
            return INTRO_NARR;
        }
        return SCENARIOS[state.scenario].narrations[state.step - 1];
    }

    /* ---- node 테스트용 내보내기 (브라우저에서는 건너뜀) ---- */
    if (typeof module === "object" && module !== null && module.exports) {
        module.exports = {
            STEPS_TOTAL: STEPS_TOTAL,
            SCENARIOS: SCENARIOS,
            INTRO_NARR: INTRO_NARR,
            createState: createState,
            nextStep: nextStep,
            resetState: resetState,
            getScenario: getScenario,
            getNarration: getNarration
        };
        return;
    }

    if (!window.SIM) return;
    window.SIM.register("ub-context-flow", {
        title: "상황인식 3단계 체험",
        build: function (root) {
            var state = createState(0);
            var html = "";
            var i;

            /* 시나리오 탭 */
            html += '<div class="sim__tabs" role="tablist" aria-label="시나리오 선택">';
            for (i = 0; i < SCENARIOS.length; i++) {
                html += '<button type="button" class="sim__tab' +
                    (i === 0 ? " active" : "") +
                    '" role="tab" data-tab="' + i +
                    '" aria-selected="' + (i === 0 ? "true" : "false") + '">' +
                    SCENARIOS[i].label + "</button>";
            }
            html += "</div>";

            /* 단계 흐름 칩 */
            html += '<div class="ucf-steps" role="list" aria-label="상황인식 3단계 흐름">' +
                '<span class="ucf-step" role="listitem" data-step="1">1 컨텍스트 수집</span>' +
                '<span class="ucf-step-arrow" aria-hidden="true">&#8594;</span>' +
                '<span class="ucf-step" role="listitem" data-step="2">2 해석·추론</span>' +
                '<span class="ucf-step-arrow" aria-hidden="true">&#8594;</span>' +
                '<span class="ucf-step" role="listitem" data-step="3">3 적응 행동</span>' +
                "</div>";

            /* 무대: 3단계 패널 */
            html += '<div class="ucf-stage">';
            html += '<section class="ucf-panel" data-panel="1" aria-label="1단계 컨텍스트 수집">' +
                '<p class="ucf-panel-title">1단계 · 컨텍스트 수집</p>' +
                '<div class="ucf-chips" data-zone="collect"></div>' +
                "</section>";
            html += '<div class="ucf-down" aria-hidden="true">&#8595;</div>';
            html += '<section class="ucf-panel" data-panel="2" aria-label="2단계 해석과 추론">' +
                '<p class="ucf-panel-title">2단계 · 해석·추론</p>' +
                '<div class="ucf-zone" data-zone="infer"></div>' +
                "</section>";
            html += '<div class="ucf-down" aria-hidden="true">&#8595;</div>';
            html += '<section class="ucf-panel" data-panel="3" aria-label="3단계 적응 행동">' +
                '<p class="ucf-panel-title">3단계 · 적응 행동</p>' +
                '<div class="ucf-zone" data-zone="act"></div>' +
                "</section>";
            html += "</div>";

            /* 내레이션 + 컨트롤 */
            html += '<p class="ucf-narr" role="status" aria-live="polite"></p>';
            html += '<div class="sim__row">' +
                '<button type="button" class="sim__btn sim__btn--primary" data-act="next" aria-label="다음 단계 진행">다음 단계</button>' +
                '<button type="button" class="sim__btn" data-act="reset" aria-label="처음부터 다시 시작">처음부터</button>' +
                '<span class="ucf-count" aria-hidden="true"></span>' +
                "</div>";
            html += '<p class="sim__note">수집 -> 추론 -> 적응이 상황인식의 기본 흐름. 정확성과 프라이버시가 숙제.</p>';

            root.innerHTML = html;

            var tabEls = root.querySelectorAll(".sim__tab");
            var stepEls = root.querySelectorAll(".ucf-step");
            var panelEls = root.querySelectorAll(".ucf-panel");
            var collectZone = root.querySelector('[data-zone="collect"]');
            var inferZone = root.querySelector('[data-zone="infer"]');
            var actZone = root.querySelector('[data-zone="act"]');
            var narrEl = root.querySelector(".ucf-narr");
            var countEl = root.querySelector(".ucf-count");
            var nextBtn = root.querySelector('[data-act="next"]');
            var resetBtn = root.querySelector('[data-act="reset"]');

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            function setClass(el, cls, on) {
                if (on) {
                    el.classList.add(cls);
                } else {
                    el.classList.remove(cls);
                }
            }

            function setPlaceholder(zone, text) {
                clearNode(zone);
                var p = document.createElement("p");
                p.className = "ucf-placeholder";
                p.textContent = text;
                zone.appendChild(p);
            }

            function fillPlaceholders() {
                setPlaceholder(collectZone, "아직 수집 전입니다.");
                setPlaceholder(inferZone, "수집이 끝나면 추론 결과가 표시됩니다.");
                setPlaceholder(actZone, "추론이 끝나면 자동 행동이 실행됩니다.");
            }

            /* 1단계: 5W1H 칩 생성 (등장 애니메이션은 CSS, 지연만 인라인) */
            function showCollect() {
                var sc = getScenario(state);
                var j, chip, wEl, valEl, srcEl;
                clearNode(collectZone);
                for (j = 0; j < sc.chips.length; j++) {
                    chip = document.createElement("span");
                    chip.className = "ucf-chip";
                    chip.style.animationDelay = (j * 70) + "ms";
                    wEl = document.createElement("span");
                    wEl.className = "ucf-chip-w";
                    wEl.textContent = sc.chips[j].w;
                    valEl = document.createElement("span");
                    valEl.className = "ucf-chip-val";
                    valEl.textContent = sc.chips[j].value;
                    srcEl = document.createElement("span");
                    srcEl.className = "ucf-chip-src";
                    srcEl.textContent = "출처: " + sc.chips[j].source;
                    chip.appendChild(wEl);
                    chip.appendChild(valEl);
                    chip.appendChild(srcEl);
                    collectZone.appendChild(chip);
                }
            }

            /* 2단계: 수집 칩을 흐리게 하고 결론 카드를 보여준다 */
            function showInfer() {
                var sc = getScenario(state);
                var chips = collectZone.querySelectorAll(".ucf-chip");
                var j, card, textEl, subEl;
                for (j = 0; j < chips.length; j++) {
                    chips[j].classList.add("is-merged");
                }
                clearNode(inferZone);
                card = document.createElement("div");
                card.className = "ucf-card ucf-card--infer";
                textEl = document.createElement("p");
                textEl.className = "ucf-card-text";
                textEl.textContent = "\"" + sc.inferText + "\"";
                subEl = document.createElement("p");
                subEl.className = "ucf-card-sub";
                subEl.textContent = "근거: " + sc.inferBasis;
                card.appendChild(textEl);
                card.appendChild(subEl);
                inferZone.appendChild(card);
            }

            /* 3단계: 적응 행동 카드 (tip 톤) */
            function showAct() {
                var sc = getScenario(state);
                var card, iconEl, textEl;
                clearNode(actZone);
                card = document.createElement("div");
                card.className = "ucf-card ucf-card--act";
                iconEl = document.createElement("span");
                iconEl.className = "ucf-act-icon";
                iconEl.setAttribute("aria-hidden", "true");
                iconEl.textContent = sc.actionIcon;
                textEl = document.createElement("p");
                textEl.className = "ucf-card-text";
                textEl.textContent = sc.actionText;
                card.appendChild(iconEl);
                card.appendChild(textEl);
                actZone.appendChild(card);
            }

            function render() {
                var j, stepNo;
                for (j = 0; j < tabEls.length; j++) {
                    var selected = parseInt(tabEls[j].getAttribute("data-tab"), 10) === state.scenario;
                    setClass(tabEls[j], "active", selected);
                    tabEls[j].setAttribute("aria-selected", selected ? "true" : "false");
                }
                for (j = 0; j < stepEls.length; j++) {
                    stepNo = parseInt(stepEls[j].getAttribute("data-step"), 10);
                    setClass(stepEls[j], "active", stepNo === state.step);
                    setClass(stepEls[j], "done", stepNo < state.step);
                }
                for (j = 0; j < panelEls.length; j++) {
                    stepNo = parseInt(panelEls[j].getAttribute("data-panel"), 10);
                    setClass(panelEls[j], "is-on", stepNo === state.step);
                    setClass(panelEls[j], "is-wait", stepNo > state.step);
                }
                narrEl.textContent = getNarration(state);
                setClass(narrEl, "is-done", state.step === STEPS_TOTAL);
                countEl.textContent = "단계 " + state.step + "/" + STEPS_TOTAL;
                nextBtn.disabled = state.step >= STEPS_TOTAL;
            }

            nextBtn.addEventListener("click", function () {
                if (!nextStep(state)) {
                    return;
                }
                if (state.step === 1) {
                    showCollect();
                } else if (state.step === 2) {
                    showInfer();
                } else if (state.step === 3) {
                    showAct();
                }
                render();
            });

            resetBtn.addEventListener("click", function () {
                resetState(state);
                fillPlaceholders();
                render();
            });

            for (i = 0; i < tabEls.length; i++) {
                (function (idx) {
                    tabEls[idx].addEventListener("click", function () {
                        state = createState(idx);
                        fillPlaceholders();
                        render();
                    });
                })(i);
            }

            fillPlaceholders();
            render();
        }
    });
})();

/* sim:ub-car-level - 자율주행 레벨 탐색기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 레벨 데이터 (본문 14장 SAE 표 그대로) ---- */
    var LEVELS = [
        {
            name: "비자동화",
            desc: "사람이 모두 운전",
            example: "ADAS 예시: 차선 이탈 경고처럼 '경고만' 해 주는 장치. 조작은 전부 사람 몫입니다."
        },
        {
            name: "운전자 보조",
            desc: "차선 유지 또는 속도 중 하나 보조",
            example: "ADAS 예시: 스마트 크루즈(속도) 또는 차선 유지 보조, 둘 중 하나만 작동합니다."
        },
        {
            name: "부분 자동화",
            desc: "조향+속도 동시 보조(운전자 감시 필수)",
            example: "ADAS 예시: 스마트 크루즈 + 차선 유지가 동시에 작동하는 고속도로 주행 보조. 손과 눈은 여전히 운전에."
        },
        {
            name: "조건부 자동화",
            desc: "특정 조건에서 차가 운전, 요청 시 사람 개입",
            example: "예시: 고속도로 정체 구간 같은 정해진 조건에서 차가 운전하고, 개입 요청이 오면 사람이 받아야 합니다."
        },
        {
            name: "고도 자동화",
            desc: "특정 구역에선 사람 없이 운전",
            example: "예시: 정해진 구역만 도는 로보택시. 그 구역 안에서는 운전석이 비어 있어도 됩니다."
        },
        {
            name: "완전 자동화",
            desc: "모든 상황을 차가 운전",
            example: "예시: 운전대와 페달이 없어도 되는 차. 어떤 도로, 어떤 날씨에서도 차가 운전합니다."
        }
    ];

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */
    var logic = {
        /* 입력을 0~5 정수 레벨로. 숫자로 못 읽으면 null */
        clampLevel: function (n) {
            if (typeof n === "string") n = parseInt(n, 10);
            if (typeof n !== "number" || isNaN(n)) return null;
            n = Math.floor(n);
            if (n < 0) n = 0;
            if (n > 5) n = 5;
            return n;
        },
        /* 차의 책임 비율(%): 레벨 0=0 ... 5=100, 단계적 20%씩 */
        carShare: function (level) {
            return level * 20;
        },
        /* 감시/주행 책임 주체: 레벨 2까지 사람, 3부터 차(조건부) */
        dutySide: function (level) {
            return level <= 2 ? "human" : "car";
        },
        dutyInfo: function (level) {
            if (logic.dutySide(level) === "human") {
                return {
                    side: "human",
                    badge: "감시 책임: 사람",
                    text: "레벨 2까지는 기능이 도와줘도 사람이 항상 주행 상황을 감시해야 합니다."
                };
            }
            return {
                side: "car",
                badge: "주행 책임: 차(조건부)",
                text: "레벨 3부터는 조건이 맞는 동안 차가 주행을 책임집니다. 레벨 3은 요청 시 사람 개입, 4-5는 점점 사람 없이."
            };
        },
        /* 레벨 종합 정보 */
        getLevel: function (n) {
            var lv = logic.clampLevel(n);
            if (lv === null) return null;
            var d = LEVELS[lv];
            var car = logic.carShare(lv);
            return {
                level: lv,
                name: d.name,
                desc: d.desc,
                example: d.example,
                carShare: car,
                humanShare: 100 - car,
                duty: logic.dutySide(lv)
            };
        }
    };

    var ICON_HUMAN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">'
        + '<circle cx="12" cy="7" r="3.5"></circle>'
        + '<path d="M12 12.5c-4 0-7 2.2-7 5V20h14v-2.5c0-2.8-3-5-7-5z"></path>'
        + '</svg>';
    var ICON_CAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">'
        + '<path d="M20.4 10.3l-1.3-3.9A2 2 0 0 0 17.2 5H6.8a2 2 0 0 0-1.9 1.4l-1.3 3.9A3 3 0 0 0 2 13v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h14v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-4a3 3 0 0 0-1.6-2.7zM6.3 7h11.4l1 3H5.3l1-3zM6.5 14.5A1.5 1.5 0 1 1 8 13a1.5 1.5 0 0 1-1.5 1.5zm11 0A1.5 1.5 0 1 1 19 13a1.5 1.5 0 0 1-1.5 1.5z"></path>'
        + '</svg>';

    window.SIM.register("ub-car-level", {
        title: "자율주행 레벨 탐색기",
        _logic: logic,
        build: function (root) {
            var btnsHtml = "";
            var i;
            for (i = 0; i < LEVELS.length; i++) {
                btnsHtml += '<button type="button" class="sim__btn ucl-levelbtn" data-level="' + i
                    + '" aria-pressed="false" aria-label="레벨 ' + i + " " + LEVELS[i].name + ' 선택">'
                    + i + "</button>";
            }

            root.innerHTML = ""
                + '<div class="sim__row ucl-levels" role="group" aria-label="자율주행 레벨 선택 버튼">'
                +     btnsHtml
                + '</div>'
                + '<div class="sim__row">'
                +     '<label class="ucl-sliderwrap">'
                +         '<span class="ucl-slidertext">레벨</span>'
                +         '<input type="range" class="ucl-slider" min="0" max="5" step="1" value="2" aria-label="자율주행 레벨, 0부터 5까지">'
                +     '</label>'
                +     '<span class="sim__chip ucl-levelchip">레벨 2</span>'
                + '</div>'
                + '<div class="ucl-zones">'
                +     '<div class="ucl-zone" data-zone="human">레벨 0-2 · 사람이 항상 감시</div>'
                +     '<div class="ucl-zone" data-zone="car">레벨 3-5 · 조건부로 차가 주행 책임</div>'
                + '</div>'
                + '<div class="ucl-card" aria-live="polite">'
                +     '<div class="ucl-card-head">'
                +         '<span class="sim__chip ucl-card-chip"></span>'
                +         '<strong class="ucl-card-name"></strong>'
                +     '</div>'
                +     '<p class="ucl-card-desc"></p>'
                +     '<div class="ucl-duty">'
                +         '<span class="ucl-duty-badge"></span>'
                +         '<span class="ucl-duty-text"></span>'
                +     '</div>'
                +     '<div class="ucl-who">'
                +         '<div class="ucl-who-row" aria-hidden="true">'
                +             '<span class="ucl-actor ucl-actor--human">' + ICON_HUMAN + '사람</span>'
                +             '<div class="ucl-bar">'
                +                 '<div class="ucl-bar-human"></div>'
                +                 '<div class="ucl-bar-car"></div>'
                +             '</div>'
                +             '<span class="ucl-actor ucl-actor--car">차' + ICON_CAR + '</span>'
                +         '</div>'
                +         '<div class="ucl-who-pcts">'
                +             '<span class="ucl-pct-human"></span>'
                +             '<span class="ucl-pct-car"></span>'
                +         '</div>'
                +     '</div>'
                +     '<p class="ucl-example"></p>'
                + '</div>'
                + '<p class="sim__note">스마트 자동차 = 센서(카메라/레이더/라이다) + V2X + 엣지 + AI의 결합. '
                + '레벨이 올라갈수록 이 기술들의 결합이 더 촘촘해집니다.</p>';

            var levelBtns = root.querySelectorAll(".ucl-levelbtn");
            var slider = root.querySelector(".ucl-slider");
            var levelChip = root.querySelector(".ucl-levelchip");
            var zones = root.querySelectorAll(".ucl-zone");
            var cardChip = root.querySelector(".ucl-card-chip");
            var cardName = root.querySelector(".ucl-card-name");
            var cardDesc = root.querySelector(".ucl-card-desc");
            var dutyBadge = root.querySelector(".ucl-duty-badge");
            var dutyText = root.querySelector(".ucl-duty-text");
            var barHuman = root.querySelector(".ucl-bar-human");
            var pctHuman = root.querySelector(".ucl-pct-human");
            var pctCar = root.querySelector(".ucl-pct-car");
            var exampleEl = root.querySelector(".ucl-example");

            function render(n) {
                var info = logic.getLevel(n);
                if (!info) return;
                var k;

                for (k = 0; k < levelBtns.length; k++) {
                    var on = k === info.level;
                    levelBtns[k].setAttribute("aria-pressed", on ? "true" : "false");
                    levelBtns[k].className = "sim__btn ucl-levelbtn" + (on ? " ucl-levelbtn--active" : "");
                }
                slider.value = String(info.level);
                levelChip.textContent = "레벨 " + info.level;

                for (k = 0; k < zones.length; k++) {
                    var zoneOn = zones[k].getAttribute("data-zone") === info.duty;
                    zones[k].className = "ucl-zone" + (zoneOn ? " ucl-zone--active" : "");
                }

                cardChip.textContent = "레벨 " + info.level;
                cardName.textContent = info.name;
                cardDesc.textContent = info.desc;

                var duty = logic.dutyInfo(info.level);
                dutyBadge.textContent = duty.badge;
                dutyBadge.className = "ucl-duty-badge ucl-duty-badge--" + duty.side;
                dutyText.textContent = duty.text;

                barHuman.style.width = info.humanShare + "%";
                pctHuman.textContent = "사람 " + info.humanShare + "%";
                pctCar.textContent = "차 " + info.carShare + "%";

                exampleEl.textContent = info.example;
            }

            function onBtnClick(e) {
                render(e.currentTarget.getAttribute("data-level"));
            }
            for (i = 0; i < levelBtns.length; i++) {
                levelBtns[i].addEventListener("click", onBtnClick);
            }
            slider.addEventListener("input", function () {
                render(slider.value);
            });

            render(2);
        }
    });
})();

/* sim:co-io-quiz - 입출력장치 분류 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 문제 은행 (computers.html 4장 입출력장치 표 기준) ---- */
    var BANK = [
        { name: "키보드", type: "in", reason: "사람이 문자, 숫자, 명령을 직접 눌러 컴퓨터로 보낸다." },
        { name: "마우스", type: "in", reason: "포인터 이동과 클릭 같은 사람의 조작을 컴퓨터에 전달한다." },
        { name: "터치스크린", type: "in", reason: "화면을 손으로 눌러 위치와 명령을 컴퓨터에 전달한다." },
        { name: "스캐너", type: "in", reason: "종이 문서나 그림을 읽어 디지털 데이터로 컴퓨터에 넣는다." },
        { name: "마이크", type: "in", reason: "음성과 소리를 전기 신호로 바꿔 컴퓨터에 넣는다." },
        { name: "바코드/QR 리더", type: "in", reason: "코드에 담긴 정보를 읽어 컴퓨터로 보낸다." },
        { name: "모니터", type: "out", reason: "처리 결과를 화면으로 보여 준다. 화면 출력이므로 soft copy다." },
        { name: "프린터", type: "out", reason: "처리 결과를 종이에 인쇄한다. 인쇄 출력이므로 hard copy다." },
        { name: "스피커", type: "out", reason: "처리 결과를 소리로 바꿔 사람에게 들려준다." },
        { name: "프로젝터", type: "out", reason: "처리 결과 화면을 스크린에 크게 비춰 보여 준다." }
    ];

    var TYPE_LABEL = { "in": "입력장치", "out": "출력장치" };
    var DIR_TEXT = { "in": "사람 → 컴퓨터", "out": "컴퓨터 → 사람" };

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        /* 0..n-1 인덱스를 Fisher-Yates로 섞는다. rand는 [0,1) 난수 함수 */
        shuffledOrder: function (n, rand) {
            var order = [];
            var i;
            for (i = 0; i < n; i++) {
                order.push(i);
            }
            for (i = n - 1; i > 0; i--) {
                var j = Math.floor(rand() * (i + 1));
                var tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
            return order;
        },
        createState: function (n, rand) {
            return {
                order: this.shuffledOrder(n, rand),
                pos: 0,
                score: 0,
                answered: false,
                results: []
            };
        },
        currentIndex: function (state) {
            return state.pos < state.order.length ? state.order[state.pos] : -1;
        },
        isFinished: function (state) {
            return state.pos >= state.order.length;
        },
        /* 현재 문제에 답한다. 이미 답했거나 끝났으면 null */
        answer: function (state, bank, choice) {
            if (state.answered || this.isFinished(state)) return null;
            if (choice !== "in" && choice !== "out") return null;
            var idx = state.order[state.pos];
            var device = bank[idx];
            var correct = device.type === choice;
            state.answered = true;
            if (correct) state.score += 1;
            state.results.push({ index: idx, choice: choice, correct: correct });
            return { correct: correct, device: device };
        },
        /* 다음 문제로 이동. 남은 문제가 있으면 true */
        next: function (state) {
            if (!state.answered) return false;
            state.pos += 1;
            state.answered = false;
            return !this.isFinished(state);
        },
        wrongList: function (state, bank) {
            var out = [];
            for (var i = 0; i < state.results.length; i++) {
                if (!state.results[i].correct) {
                    out.push(bank[state.results[i].index]);
                }
            }
            return out;
        },
        grade: function (score, total) {
            if (score >= total) return "perfect";
            if (score >= Math.ceil(total * 0.7)) return "good";
            return "retry";
        },
        /* 마지막 글자 받침 유무로 주격 보조사(은/는) 선택 */
        topicJosa: function (word) {
            var code = word.charCodeAt(word.length - 1);
            if (code >= 0xAC00 && code <= 0xD7A3) {
                return (code - 0xAC00) % 28 === 0 ? "는" : "은";
            }
            return "는";
        }
    };

    window.SIM.register("co-io-quiz", {
        title: "입출력장치 분류 퀴즈",
        _logic: logic,
        _bank: BANK,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row ioq-status">'
                +     '<span class="sim__chip ioq-progress">문제 1 / ' + BANK.length + '</span>'
                +     '<span class="sim__chip ioq-score">점수 0</span>'
                +     '<button type="button" class="sim__btn ioq-reset" aria-label="문제를 새로 섞어 처음부터 다시 시작">처음부터</button>'
                + '</div>'
                + '<div class="ioq-quiz">'
                +     '<div class="ioq-card">'
                +         '<p class="ioq-ask">이 장치는 어느 쪽일까요?</p>'
                +         '<p class="ioq-device"></p>'
                +         '<div class="ioq-choices">'
                +             '<button type="button" class="sim__btn ioq-choice" data-choice="in" aria-label="입력장치로 답하기">입력장치</button>'
                +             '<button type="button" class="sim__btn ioq-choice" data-choice="out" aria-label="출력장치로 답하기">출력장치</button>'
                +         '</div>'
                +     '</div>'
                +     '<div class="ioq-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row ioq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary ioq-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="ioq-summary" aria-live="polite" hidden></div>'
                + '<p class="sim__note">화면 출력 = soft copy, 인쇄 출력 = hard copy. 입력 → 편집 → 처리 → 출력 단계.</p>';

            var progressChip = root.querySelector(".ioq-progress");
            var scoreChip = root.querySelector(".ioq-score");
            var resetBtn = root.querySelector(".ioq-reset");
            var quizBox = root.querySelector(".ioq-quiz");
            var deviceEl = root.querySelector(".ioq-device");
            var choiceBtns = root.querySelectorAll(".ioq-choice");
            var feedback = root.querySelector(".ioq-feedback");
            var nextBtn = root.querySelector(".ioq-next");
            var summaryBox = root.querySelector(".ioq-summary");

            var state = logic.createState(BANK.length, Math.random);

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            function renderIdleFeedback() {
                feedback.className = "ioq-feedback";
                clearNode(feedback);
                var p = document.createElement("p");
                p.className = "ioq-feedback__reason";
                p.textContent = "버튼을 누르면 정답과 방향 해설이 표시됩니다.";
                feedback.appendChild(p);
            }

            function renderQuestion() {
                var device = BANK[logic.currentIndex(state)];
                progressChip.textContent = "문제 " + (state.pos + 1) + " / " + BANK.length;
                scoreChip.textContent = "점수 " + state.score;
                deviceEl.textContent = device.name;
                for (var i = 0; i < choiceBtns.length; i++) {
                    choiceBtns[i].disabled = false;
                    choiceBtns[i].classList.remove("is-correct", "is-wrong");
                }
                renderIdleFeedback();
                nextBtn.hidden = true;
            }

            function renderFeedback(res) {
                feedback.className = "ioq-feedback " + (res.correct ? "is-correct" : "is-wrong");
                clearNode(feedback);
                var head = document.createElement("p");
                head.className = "ioq-feedback__head";
                head.textContent = res.correct ? "정답!" : "오답!";
                feedback.appendChild(head);
                var body = document.createElement("p");
                body.className = "ioq-feedback__body";
                body.textContent = res.device.name + logic.topicJosa(res.device.name) + " "
                    + TYPE_LABEL[res.device.type] + "입니다 ("
                    + DIR_TEXT[res.device.type] + ").";
                feedback.appendChild(body);
                var reason = document.createElement("p");
                reason.className = "ioq-feedback__reason";
                reason.textContent = res.device.reason;
                feedback.appendChild(reason);
            }

            function renderSummary() {
                quizBox.hidden = true;
                progressChip.textContent = "완료 " + BANK.length + " / " + BANK.length;
                scoreChip.textContent = "점수 " + state.score;
                clearNode(summaryBox);
                summaryBox.hidden = false;

                var title = document.createElement("p");
                title.className = "ioq-summary__title";
                title.textContent = "퀴즈 완료!";
                summaryBox.appendChild(title);

                var scoreLine = document.createElement("p");
                scoreLine.className = "ioq-summary__score";
                scoreLine.textContent = BANK.length + "문제 중 " + state.score + "문제 정답";
                summaryBox.appendChild(scoreLine);

                var grade = logic.grade(state.score, BANK.length);
                var msg = document.createElement("p");
                msg.className = "ioq-summary__msg";
                if (grade === "perfect") {
                    msg.textContent = "완벽합니다! 입출력장치 분류를 모두 맞혔어요.";
                } else if (grade === "good") {
                    msg.textContent = "잘했어요. 아래 틀린 장치만 다시 확인해 보세요.";
                } else {
                    msg.textContent = "입력 = 사람 → 컴퓨터, 출력 = 컴퓨터 → 사람. 방향을 떠올리며 다시 도전해 보세요.";
                }
                summaryBox.appendChild(msg);

                var wrong = logic.wrongList(state, BANK);
                if (wrong.length > 0) {
                    var sub = document.createElement("p");
                    sub.className = "ioq-summary__sub";
                    sub.textContent = "다시 볼 장치";
                    summaryBox.appendChild(sub);
                    var ul = document.createElement("ul");
                    ul.className = "ioq-wrong-list";
                    for (var i = 0; i < wrong.length; i++) {
                        var li = document.createElement("li");
                        var strong = document.createElement("strong");
                        strong.textContent = wrong[i].name;
                        li.appendChild(strong);
                        li.appendChild(document.createTextNode(
                            " · " + TYPE_LABEL[wrong[i].type]
                            + " (" + DIR_TEXT[wrong[i].type] + ") - " + wrong[i].reason));
                        ul.appendChild(li);
                    }
                    summaryBox.appendChild(ul);
                }

                var row = document.createElement("div");
                row.className = "sim__row";
                var retry = document.createElement("button");
                retry.type = "button";
                retry.className = "sim__btn sim__btn--primary";
                retry.textContent = "다시 풀기";
                retry.setAttribute("aria-label", "문제를 새로 섞어 다시 풀기");
                retry.addEventListener("click", restart);
                row.appendChild(retry);
                summaryBox.appendChild(row);
            }

            function restart() {
                state = logic.createState(BANK.length, Math.random);
                summaryBox.hidden = true;
                clearNode(summaryBox);
                quizBox.hidden = false;
                renderQuestion();
            }

            function onChoice(ev) {
                var choice = ev.currentTarget.getAttribute("data-choice");
                var res = logic.answer(state, BANK, choice);
                if (!res) return;
                scoreChip.textContent = "점수 " + state.score;
                for (var i = 0; i < choiceBtns.length; i++) {
                    var c = choiceBtns[i].getAttribute("data-choice");
                    choiceBtns[i].disabled = true;
                    if (c === res.device.type) {
                        choiceBtns[i].classList.add("is-correct");
                    } else if (c === choice) {
                        choiceBtns[i].classList.add("is-wrong");
                    }
                }
                renderFeedback(res);
                nextBtn.textContent = state.pos === BANK.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            function onNext() {
                if (logic.next(state)) {
                    renderQuestion();
                } else if (logic.isFinished(state)) {
                    renderSummary();
                }
            }

            for (var i = 0; i < choiceBtns.length; i++) {
                choiceBtns[i].addEventListener("click", onChoice);
            }
            nextBtn.addEventListener("click", onNext);
            resetBtn.addEventListener("click", restart);

            renderQuestion();
        }
    });
})();

/* sim:co-comm-quiz - 통신 방식 분류 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */

    /* 그룹별 보기 버튼 정의 */
    var CHOICES = {
        dir: [
            { key: "simplex", label: "단방향(simplex)" },
            { key: "half", label: "반이중(half-duplex)" },
            { key: "full", label: "전이중(full-duplex)" }
        ],
        net: [
            { key: "LAN", label: "LAN" },
            { key: "MAN", label: "MAN" },
            { key: "WAN", label: "WAN" }
        ]
    };

    /* 8문제: 전송 방향 4 + 망 유형 4 */
    var QUESTIONS = [
        {
            group: "dir",
            scenario: "라디오/TV 방송: 방송국이 보내는 신호를 시청자는 받기만 한다.",
            answer: "simplex",
            explain: "신호가 한 방향으로만 흐르므로 단방향(simplex)이다."
        },
        {
            group: "dir",
            scenario: "무전기: 양쪽 다 말할 수 있지만, 한 사람이 말하는 동안 상대는 듣기만 해야 한다.",
            answer: "half",
            explain: "양방향이지만 동시에는 불가능하므로 반이중(half-duplex)이다."
        },
        {
            group: "dir",
            scenario: "전화 통화: 두 사람이 동시에 말하고 들을 수 있다.",
            answer: "full",
            explain: "양쪽이 동시에 송수신하므로 전이중(full-duplex)이다."
        },
        {
            group: "dir",
            scenario: "키보드 -> 컴퓨터: 누른 키의 입력 신호가 컴퓨터 쪽으로만 전달된다.",
            answer: "simplex",
            explain: "입력 신호가 한쪽으로만 가므로 단방향(simplex)이다."
        },
        {
            group: "net",
            scenario: "회사 사무실 내부의 컴퓨터들을 연결한 통신망",
            answer: "LAN",
            explain: "건물/사무실 규모의 근거리 통신망은 LAN이다."
        },
        {
            group: "net",
            scenario: "한 도시 전체를 묶는 규모의 통신망",
            answer: "MAN",
            explain: "도시 규모의 통신망은 MAN이다."
        },
        {
            group: "net",
            scenario: "국가와 대륙을 잇는 인터넷 백본망",
            answer: "WAN",
            explain: "국가/대륙 규모의 광역 통신망은 WAN이다. 인터넷 백본이 대표 예다."
        },
        {
            group: "net",
            scenario: "집 안 공유기(Wi-Fi)로 묶인 노트북, 스마트폰, TV",
            answer: "LAN",
            explain: "집 안처럼 좁은 범위를 묶는 망도 LAN이다."
        }
    ];

    /* 수평 화살표 SVG 조각 (x1 -> x2, 머리 포함) */
    function arrowSvg(x1, x2, y, cls) {
        var head = 12;
        var lineEnd;
        var points;
        if (x2 > x1) {
            lineEnd = x2 - head;
        } else {
            lineEnd = x2 + head;
        }
        points = lineEnd + "," + (y - 6) + " " + x2 + "," + y + " " + lineEnd + "," + (y + 6);
        return '<g class="' + cls + '">'
            + '<line x1="' + x1 + '" y1="' + y + '" x2="' + lineEnd + '" y2="' + y + '"></line>'
            + '<polygon points="' + points + '"></polygon>'
            + '</g>';
    }

    /* 노드(원 + 라벨) SVG 조각 */
    function nodeSvg(cx, label) {
        return '<circle class="ccq-node" cx="' + cx + '" cy="85" r="24"></circle>'
            + '<text class="ccq-node-label" x="' + cx + '" y="90" text-anchor="middle">' + label + '</text>';
    }

    var logic = {
        choices: CHOICES,
        questions: QUESTIONS,

        /* Fisher-Yates 셔플 (원본 보존, rng는 [0,1) 함수) */
        shuffle: function (arr, rng) {
            var a = arr.slice();
            var i, j, tmp;
            for (i = a.length - 1; i > 0; i--) {
                j = Math.floor(rng() * (i + 1));
                tmp = a[i];
                a[i] = a[j];
                a[j] = tmp;
            }
            return a;
        },

        /* 8문제를 섞어 덱 생성 */
        makeDeck: function (rng) {
            return this.shuffle(QUESTIONS, rng);
        },

        /* 그룹 이름표 ("전송 방향" / "망 유형") */
        kindFor: function (group) {
            return group === "dir" ? "전송 방향" : "망 유형";
        },

        /* 보기 key -> 한글 라벨 */
        labelFor: function (group, key) {
            var list = CHOICES[group] || [];
            var i;
            for (i = 0; i < list.length; i++) {
                if (list[i].key === key) return list[i].label;
            }
            return key;
        },

        /* 선택 판정 */
        judge: function (q, key) {
            return {
                correct: q.answer === key,
                explain: q.explain
            };
        },

        /* 점수대별 마무리 멘트 */
        grade: function (score, total) {
            var r = total > 0 ? score / total : 0;
            if (r === 1) return "만점! 전송 방향과 망 유형을 완벽하게 구분했다.";
            if (r >= 0.75) return "좋은 점수. 틀린 문제의 해설만 한 번 더 확인하자.";
            if (r >= 0.5) return "절반 이상. 방향(누가 보내나)과 범위(얼마나 넓나) 기준을 다시 정리하자.";
            return "본문 10장의 표(전송 방향, LAN/MAN/WAN)를 먼저 복습하고 다시 도전하자.";
        },

        /* 전송 방향 미니 시각화 (정답 key 기준) */
        dirSvg: function (key) {
            var labels = key === "simplex" ? ["송신", "수신"] : ["A", "B"];
            var caption, aria, arrows;
            if (key === "simplex") {
                caption = "한 방향으로만 전송";
                aria = "단방향 전송: 송신 쪽에서 수신 쪽으로만 화살표가 간다";
                arrows = arrowSvg(84, 236, 85, "ccq-arrow");
            } else if (key === "half") {
                caption = "번갈아 한 방향씩 (동시는 불가)";
                aria = "반이중 전송: 두 방향 화살표가 있지만 한 번에 한 방향만 쓴다";
                arrows = arrowSvg(84, 236, 70, "ccq-arrow")
                    + arrowSvg(236, 84, 100, "ccq-arrow ccq-arrow--alt");
            } else {
                caption = "양쪽이 동시에 송수신";
                aria = "전이중 전송: 두 방향 화살표가 동시에 활성화된다";
                arrows = arrowSvg(84, 236, 70, "ccq-arrow")
                    + arrowSvg(236, 84, 100, "ccq-arrow");
            }
            return '<svg viewBox="0 0 320 150" role="img" aria-label="' + aria + '">'
                + '<text class="ccq-caption" x="160" y="30" text-anchor="middle">' + caption + '</text>'
                + nodeSvg(52, labels[0])
                + nodeSvg(268, labels[1])
                + arrows
                + '</svg>';
        },

        /* 망 유형 미니 시각화: 동심원(건물 < 도시 < 대륙)에서 정답 강조 */
        netSvg: function (key) {
            var cx = 160;
            var cy = 124;
            var rings = [
                { key: "WAN", r: 112, label: "WAN · 국가/대륙", ly: 32 },
                { key: "MAN", r: 76, label: "MAN · 도시", ly: 70 },
                { key: "LAN", r: 38, label: "", ly: 0 }
            ];
            var aria = "통신망 범위 동심원: 안쪽부터 LAN 건물, MAN 도시, WAN 대륙. 정답 "
                + key + " 범위가 강조된다";
            var s = '<svg viewBox="0 0 320 240" role="img" aria-label="' + aria + '">';
            var i, ring, hit;
            for (i = 0; i < rings.length; i++) {
                ring = rings[i];
                hit = ring.key === key ? " is-hit" : "";
                s += '<circle class="ccq-ring' + hit + '" data-ring="' + ring.key + '"'
                    + ' cx="' + cx + '" cy="' + cy + '" r="' + ring.r + '"></circle>';
            }
            for (i = 0; i < rings.length; i++) {
                ring = rings[i];
                hit = ring.key === key ? " is-hit" : "";
                if (ring.key === "LAN") {
                    s += '<text class="ccq-ring-label' + hit + '" data-ring="LAN"'
                        + ' x="' + cx + '" y="118" text-anchor="middle">LAN</text>'
                        + '<text class="ccq-ring-sub' + hit + '"'
                        + ' x="' + cx + '" y="137" text-anchor="middle">건물/사무실</text>';
                } else {
                    s += '<text class="ccq-ring-label' + hit + '" data-ring="' + ring.key + '"'
                        + ' x="' + cx + '" y="' + ring.ly + '" text-anchor="middle">'
                        + ring.label + '</text>';
                }
            }
            return s + "</svg>";
        },

        /* 문제 -> 정답 시각화 SVG 문자열 */
        vizSvg: function (q) {
            return q.group === "dir" ? this.dirSvg(q.answer) : this.netSvg(q.answer);
        }
    };

    window.SIM.register("co-comm-quiz", {
        title: "통신 방식 분류 퀴즈",
        _logic: logic,
        build: function (root) {
            var state = { deck: [], index: 0, score: 0, answered: false };

            root.innerHTML = ""
                + '<div class="sim__row ccq-bar">'
                +     '<span class="sim__chip ccq-progress">문제 1 / 8</span>'
                +     '<span class="sim__chip ccq-score">점수 0</span>'
                +     '<button type="button" class="sim__btn ccq-restart" aria-label="퀴즈 처음부터 다시 시작">다시 시작</button>'
                + '</div>'
                + '<div class="ccq-quiz">'
                +     '<p class="ccq-ask">이 상황은 어떤 <span class="ccq-kind">전송 방향</span>일까?</p>'
                +     '<div class="ccq-scenario"></div>'
                +     '<div class="ccq-choices" role="group" aria-label="정답 보기 선택"></div>'
                +     '<div class="ccq-feedback" aria-live="polite"></div>'
                +     '<div class="ccq-viz" hidden></div>'
                +     '<div class="sim__row ccq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary ccq-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="ccq-result" aria-live="polite" hidden></div>'
                + '<p class="sim__note">프로토콜 = 통신을 위한 약속(예: TCP/IP)</p>';

            var progressEl = root.querySelector(".ccq-progress");
            var scoreEl = root.querySelector(".ccq-score");
            var restartBtn = root.querySelector(".ccq-restart");
            var quizEl = root.querySelector(".ccq-quiz");
            var kindEl = root.querySelector(".ccq-kind");
            var scenarioEl = root.querySelector(".ccq-scenario");
            var choicesEl = root.querySelector(".ccq-choices");
            var feedbackEl = root.querySelector(".ccq-feedback");
            var vizEl = root.querySelector(".ccq-viz");
            var nextBtn = root.querySelector(".ccq-next");
            var resultEl = root.querySelector(".ccq-result");

            function updateBar() {
                progressEl.textContent = "문제 " + (state.index + 1) + " / " + state.deck.length;
                scoreEl.textContent = "점수 " + state.score;
            }

            function onChoice(ev) {
                if (state.answered) return;
                state.answered = true;

                var picked = ev.currentTarget;
                var key = picked.getAttribute("data-key");
                var q = state.deck[state.index];
                var result = logic.judge(q, key);
                var btns = choicesEl.querySelectorAll(".ccq-choice");
                var i, b;

                for (i = 0; i < btns.length; i++) {
                    b = btns[i];
                    b.disabled = true;
                    if (b.getAttribute("data-key") === q.answer) {
                        b.className = "ccq-choice is-correct";
                    } else if (b === picked) {
                        b.className = "ccq-choice is-wrong";
                    }
                }

                if (result.correct) {
                    state.score++;
                    feedbackEl.className = "ccq-feedback is-ok";
                    feedbackEl.textContent = "정답! " + result.explain;
                } else {
                    feedbackEl.className = "ccq-feedback is-bad";
                    feedbackEl.textContent = "오답. 정답은 "
                        + logic.labelFor(q.group, q.answer) + ". " + result.explain;
                }

                /* 정답 시각화: SVG 문자열은 내부 고정 데이터로만 만든다 */
                vizEl.innerHTML = logic.vizSvg(q);
                vizEl.hidden = false;

                updateBar();
                nextBtn.textContent = state.index === state.deck.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            function renderQuestion() {
                var q = state.deck[state.index];
                var list = logic.choices[q.group];
                var i, btn;

                state.answered = false;
                updateBar();
                kindEl.textContent = logic.kindFor(q.group);
                scenarioEl.textContent = q.scenario;
                feedbackEl.className = "ccq-feedback";
                feedbackEl.textContent = "";
                vizEl.hidden = true;
                vizEl.innerHTML = "";
                nextBtn.hidden = true;

                choicesEl.innerHTML = "";
                for (i = 0; i < list.length; i++) {
                    btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "ccq-choice";
                    btn.textContent = list[i].label;
                    btn.setAttribute("data-key", list[i].key);
                    btn.setAttribute("aria-label", "보기 " + list[i].label + " 선택");
                    btn.addEventListener("click", onChoice);
                    choicesEl.appendChild(btn);
                }
            }

            function showResult() {
                var scoreLine = document.createElement("p");
                var gradeLine = document.createElement("p");
                var coreBox = document.createElement("div");
                var coreTitle = document.createElement("p");
                var coreBody = document.createElement("p");
                var row = document.createElement("div");
                var againBtn = document.createElement("button");

                scoreLine.className = "ccq-result-score";
                scoreLine.textContent = "퀴즈 완료: " + state.deck.length + "문제 중 "
                    + state.score + "문제 정답";

                gradeLine.className = "ccq-result-grade";
                gradeLine.textContent = logic.grade(state.score, state.deck.length);

                coreBox.className = "ccq-result-core";
                coreTitle.className = "ccq-result-core-title";
                coreTitle.textContent = "한 줄 정리";
                coreBody.className = "ccq-result-core-body";
                coreBody.textContent = "방향: 단방향(한쪽만) / 반이중(번갈아) / 전이중(동시). "
                    + "범위: LAN(건물) < MAN(도시) < WAN(대륙).";
                coreBox.appendChild(coreTitle);
                coreBox.appendChild(coreBody);

                row.className = "sim__row";
                againBtn.type = "button";
                againBtn.className = "sim__btn sim__btn--primary";
                againBtn.textContent = "다시 풀기";
                againBtn.setAttribute("aria-label", "퀴즈 다시 풀기");
                againBtn.addEventListener("click", restart);
                row.appendChild(againBtn);

                resultEl.innerHTML = "";
                resultEl.appendChild(scoreLine);
                resultEl.appendChild(gradeLine);
                resultEl.appendChild(coreBox);
                resultEl.appendChild(row);

                quizEl.hidden = true;
                resultEl.hidden = false;
                updateBar();
            }

            function restart() {
                state.deck = logic.makeDeck(Math.random);
                state.index = 0;
                state.score = 0;
                state.answered = false;
                resultEl.hidden = true;
                resultEl.innerHTML = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            nextBtn.addEventListener("click", function () {
                if (!state.answered) return;
                if (state.index === state.deck.length - 1) {
                    showResult();
                } else {
                    state.index++;
                    renderQuestion();
                }
            });

            restartBtn.addEventListener("click", restart);

            restart();
        }
    });
})();

/* sim:co-malware-quiz - 악성코드 · 공격 분류 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 용어 사전 (정답 라벨 + 한 줄 대응책) ---- */
    var TERMS = {
        virus: {
            label: "바이러스",
            tip: "백신으로 정기 검사하고 출처 불명 파일은 실행하지 않는다."
        },
        worm: {
            label: "웜",
            tip: "OS와 소프트웨어의 보안 패치를 최신으로 유지해 전파 경로를 막는다."
        },
        trojan: {
            label: "트로이목마",
            tip: "공식 출처가 아닌 프로그램은 설치하지 말고 백신으로 검사한다."
        },
        ransom: {
            label: "랜섬웨어",
            tip: "중요 파일은 정기적으로 백업해 두면 암호화 피해를 복구할 수 있다."
        },
        phishing: {
            label: "피싱",
            tip: "메일 속 링크로 로그인하지 말고 계정에 2단계 인증을 켜 둔다."
        },
        pharming: {
            label: "파밍",
            tip: "보안 패치와 백신 점검으로 호스트 파일/DNS 변조를 막는다."
        },
        smishing: {
            label: "스미싱",
            tip: "문자 속 링크는 누르지 말고 모바일 백신으로 검사한다."
        },
        hacking: {
            label: "해킹",
            tip: "보안 패치 최신화와 2단계 인증으로 침입 경로를 줄인다."
        }
    };

    /* ---- 보기 묶음: 악성코드 4종 / 사회공학·침입 4종 ---- */
    var GROUPS = {
        malware: ["virus", "worm", "trojan", "ransom"],
        social: ["phishing", "pharming", "smishing", "hacking"]
    };

    /* ---- 문제 은행 (컴퓨터의이해 12장 본문 기준) ---- */
    var QUESTIONS = [
        {
            desc: "다른 파일에 기생해 감염을 퍼뜨린다.",
            group: "malware",
            answer: "virus",
            why: "바이러스는 스스로 퍼지지 못하고 다른 파일(숙주)에 기생해 감염을 퍼뜨립니다. 숙주 없이 스스로 복제하는 웜과 구분하세요."
        },
        {
            desc: "스스로 복제해 네트워크로 퍼진다.",
            group: "malware",
            answer: "worm",
            why: "웜(worm)은 숙주 파일 없이 스스로 복제해 네트워크를 타고 퍼집니다. 다른 파일에 기생하는 바이러스와 구분하세요."
        },
        {
            desc: "정상 프로그램으로 위장해 침투한다.",
            group: "malware",
            answer: "trojan",
            why: "트로이목마는 유용한 정상 프로그램처럼 위장해 사용자가 스스로 설치하게 만듭니다. 스스로 복제하지는 않습니다."
        },
        {
            desc: "파일을 암호화하고 금전을 요구한다.",
            group: "malware",
            answer: "ransom",
            why: "랜섬웨어(ransomware)는 파일을 암호화한 뒤 복구를 대가로 금전(ransom)을 요구합니다."
        },
        {
            desc: "가짜 사이트나 가짜 메일로 정보를 낚는다.",
            group: "social",
            answer: "phishing",
            why: "피싱(phishing)은 가짜 사이트/메일로 사용자를 속여 개인정보를 직접 입력하게 만드는 사회공학적 공격입니다."
        },
        {
            desc: "문자메시지를 미끼로 쓰는 사기다.",
            group: "social",
            answer: "smishing",
            why: "스미싱(smishing)은 SMS(문자)와 피싱의 합성어로, 문자 속 링크로 악성 앱 설치나 정보 입력을 유도합니다."
        },
        {
            desc: "정상 주소로 접속해도 가짜 사이트로 끌고 간다.",
            group: "social",
            answer: "pharming",
            why: "파밍(pharming)은 DNS나 호스트 파일을 변조해 올바른 주소를 입력해도 가짜 사이트로 연결시킵니다."
        },
        {
            desc: "시스템에 무단 침입해 정보를 빼내거나 파괴한다.",
            group: "social",
            answer: "hacking",
            why: "해킹은 시스템에 무단으로 침입해 정보를 빼내거나 파괴하는 행위를 말합니다."
        }
    ];

    /* 종료 요약에 보여줄 정보보안 3대 목표 */
    var CIA_TEXT = "CIA: 기밀성-무결성-가용성";

    /* ---- 순수 로직 (DOM 비의존, node 테스트 대상) ---- */
    var logic = {
        terms: TERMS,
        groups: GROUPS,
        questions: QUESTIONS,
        ciaText: CIA_TEXT,
        /* 0..n-1 인덱스를 Fisher-Yates로 섞은 출제 순서. rnd는 [0,1) 난수 함수 */
        makeOrder: function (n, rnd) {
            var order = [];
            var i, j, tmp;
            for (i = 0; i < n; i++) order.push(i);
            for (i = n - 1; i > 0; i--) {
                j = Math.floor(rnd() * (i + 1));
                tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
            return order;
        },
        /* 문제가 속한 묶음의 보기 키 4개 (표시 순서 고정) */
        optionKeys: function (q) {
            return GROUPS[q.group];
        },
        /* 고른 보기가 정답인지 판정 */
        isCorrect: function (q, choice) {
            return choice === q.answer;
        },
        /* 점수대별 마무리 메시지 */
        summaryMsg: function (score, total) {
            if (score === total) {
                return "만점입니다! 악성코드와 사회공학 공격을 완벽하게 구분했어요.";
            }
            if (score >= Math.ceil(total * 0.7)) {
                return "잘했어요. 틀린 문제의 해설과 대응책만 다시 확인해 보세요.";
            }
            return "바이러스(기생), 웜(자기 복제), 트로이목마(위장), 랜섬웨어(암호화+금전)부터 다시 정리해 보세요.";
        }
    };

    window.SIM.register("co-malware-quiz", {
        title: "악성코드 · 공격 분류 퀴즈",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="cmq-status">'
                +     '<span class="sim__chip cmq-progress">문제 1 / ' + QUESTIONS.length + '</span>'
                +     '<span class="sim__chip cmq-score">점수 0</span>'
                + '</div>'
                + '<div class="cmq-quiz">'
                +     '<p class="cmq-desc"></p>'
                +     '<div class="cmq-options" role="group" aria-label="보기 선택"></div>'
                +     '<div class="cmq-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row cmq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary cmq-next" hidden>다음 문제</button>'
                +         '<button type="button" class="sim__btn cmq-restart" aria-label="퀴즈를 처음부터 다시 시작">처음부터</button>'
                +     '</div>'
                + '</div>'
                + '<div class="cmq-summary" aria-live="polite" hidden></div>'
                + '<p class="sim__note">설명을 읽고 알맞은 용어를 고르면 판정과 해설, 한 줄 대응책을 보여줍니다. 문제 순서는 풀 때마다 섞입니다.</p>';

            var progressEl = root.querySelector(".cmq-progress");
            var scoreEl = root.querySelector(".cmq-score");
            var quizEl = root.querySelector(".cmq-quiz");
            var descEl = root.querySelector(".cmq-desc");
            var optionsEl = root.querySelector(".cmq-options");
            var feedbackEl = root.querySelector(".cmq-feedback");
            var nextBtn = root.querySelector(".cmq-next");
            var restartBtn = root.querySelector(".cmq-restart");
            var summaryEl = root.querySelector(".cmq-summary");

            /* 선택 버튼 4개는 한 번만 만들고 문제마다 라벨/상태만 갱신 */
            var i;
            for (i = 0; i < 4; i++) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sim__btn cmq-opt";
                btn.addEventListener("click", onOptionClick);
                optionsEl.appendChild(btn);
            }
            var optBtns = optionsEl.querySelectorAll(".cmq-opt");

            var state = {
                order: [],
                pos: 0,
                score: 0,
                answered: false,
                results: []
            };

            function currentQuestion() {
                return QUESTIONS[state.order[state.pos]];
            }

            function renderQuestion() {
                var q = currentQuestion();
                var keys = logic.optionKeys(q);
                state.answered = false;
                progressEl.textContent = "문제 " + (state.pos + 1) + " / " + state.order.length;
                scoreEl.textContent = "점수 " + state.score;
                descEl.textContent = q.desc;
                for (var k = 0; k < optBtns.length; k++) {
                    optBtns[k].disabled = false;
                    optBtns[k].classList.remove("cmq-opt--right");
                    optBtns[k].classList.remove("cmq-opt--wrong");
                    optBtns[k].setAttribute("data-key", keys[k]);
                    optBtns[k].textContent = TERMS[keys[k]].label;
                }
                feedbackEl.innerHTML = "";
                nextBtn.hidden = true;
            }

            function onOptionClick(ev) {
                if (state.answered) return;
                state.answered = true;
                var choice = ev.currentTarget.getAttribute("data-key");
                var q = currentQuestion();
                var ok = logic.isCorrect(q, choice);
                if (ok) state.score++;
                state.results.push({
                    index: state.order[state.pos],
                    chosen: choice,
                    correct: ok
                });
                scoreEl.textContent = "점수 " + state.score;

                for (var k = 0; k < optBtns.length; k++) {
                    optBtns[k].disabled = true;
                    var key = optBtns[k].getAttribute("data-key");
                    if (key === q.answer) {
                        optBtns[k].classList.add("cmq-opt--right");
                    } else if (key === choice && !ok) {
                        optBtns[k].classList.add("cmq-opt--wrong");
                    }
                }

                renderFeedback(q, ok);
                nextBtn.textContent = state.pos === state.order.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            function renderFeedback(q, ok) {
                var term = TERMS[q.answer];
                feedbackEl.innerHTML = ""
                    + '<p class="cmq-verdict ' + (ok ? "cmq-verdict--ok" : "cmq-verdict--no") + '">'
                    +     (ok ? "정답입니다!" : "오답입니다. 정답은 " + term.label + " 입니다.")
                    + '</p>'
                    + '<p class="cmq-why">' + q.why + '</p>'
                    + '<p class="cmq-tip">'
                    +     '<span class="sim__chip">' + term.label + '</span>'
                    +     '<span class="cmq-tip-text">대응책: ' + term.tip + '</span>'
                    + '</p>';
            }

            function renderSummary() {
                quizEl.hidden = true;
                progressEl.textContent = "완료";
                var rows = "";
                for (var r = 0; r < state.results.length; r++) {
                    var res = state.results[r];
                    var q = QUESTIONS[res.index];
                    rows += '<tr>'
                        + '<td class="' + (res.correct ? "cmq-cell-ok" : "cmq-cell-no") + '">'
                        +     (res.correct ? "O" : "X")
                        + '</td>'
                        + '<td>' + q.desc + '</td>'
                        + '<td>' + TERMS[res.chosen].label + '</td>'
                        + '<td>' + TERMS[q.answer].label + '</td>'
                        + '</tr>';
                }
                summaryEl.innerHTML = ""
                    + '<p class="cmq-result">' + state.order.length + '문제 중 '
                    +     '<strong>' + state.score + '문제</strong> 정답</p>'
                    + '<p class="cmq-summary-msg">' + logic.summaryMsg(state.score, state.order.length) + '</p>'
                    + '<p class="cmq-cia">' + CIA_TEXT
                    +     ' <span class="cmq-cia-en">(Confidentiality · Integrity · Availability)</span></p>'
                    + '<div class="cmq-table-wrap"><table>'
                    +     '<thead><tr><th>결과</th><th>설명</th><th>내 답</th><th>정답</th></tr></thead>'
                    +     '<tbody>' + rows + '</tbody>'
                    + '</table></div>'
                    + '<div class="sim__row">'
                    +     '<button type="button" class="sim__btn sim__btn--primary cmq-retry">다시 풀기</button>'
                    + '</div>';
                summaryEl.hidden = false;
                summaryEl.querySelector(".cmq-retry").addEventListener("click", start);
            }

            function start() {
                state.order = logic.makeOrder(QUESTIONS.length, Math.random);
                state.pos = 0;
                state.score = 0;
                state.results = [];
                summaryEl.hidden = true;
                summaryEl.innerHTML = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            nextBtn.addEventListener("click", function () {
                state.pos++;
                if (state.pos >= state.order.length) {
                    renderSummary();
                } else {
                    renderQuestion();
                }
            });

            restartBtn.addEventListener("click", start);

            start();
        }
    });
})();

/* sim:co-media-calc - 이미지 용량 계산기 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */
    var logic = {
        /* 정수에 3자리 콤마 (예: 6220800 -> "6,220,800") */
        formatInt: function (n) {
            var s = String(Math.floor(n));
            return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        },
        /* 픽셀 수 = 가로 x 세로 */
        pixelCount: function (w, h) {
            return w * h;
        },
        /* 픽셀 수를 "약 N만 화소"의 N으로 (반올림) */
        approxMan: function (pixels) {
            return Math.round(pixels / 10000);
        },
        /* 비압축 크기(바이트) = 픽셀수 x 비트 / 8 */
        bytesFor: function (w, h, bits) {
            return w * h * bits / 8;
        },
        /* 바이트를 KB/MB로 환산 (1024 기준, 소수 1자리) */
        humanSize: function (bytes) {
            if (bytes >= 1048576) {
                return (Math.round(bytes / 1048576 * 10) / 10).toFixed(1) + "MB";
            }
            return (Math.round(bytes / 1024 * 10) / 10).toFixed(1) + "KB";
        },
        /* 색 깊이별 표현 색 수 = 2^비트 */
        colorCount: function (bits) {
            return Math.pow(2, bits);
        },
        /* "2^24 = 16,777,216색 (약 1677만)" 형태의 문자열 */
        colorLabel: function (bits) {
            var s = "2^" + bits + " = " + this.formatInt(this.colorCount(bits)) + "색";
            if (bits === 1) s += " (흑/백)";
            if (bits === 24) s += " (약 1677만)";
            return s;
        },
        /* "1920 x 1080 = 2,073,600픽셀 (약 207만 화소)" */
        pixelLine: function (w, h) {
            var px = this.pixelCount(w, h);
            return w + " x " + h + " = " + this.formatInt(px) + "픽셀"
                + " (약 " + this.formatInt(this.approxMan(px)) + "만 화소)";
        },
        /* "1920 x 1080 x 24bit / 8 = 6,220,800바이트 = 5.9MB" */
        sizeLine: function (w, h, bits) {
            var bytes = this.bytesFor(w, h, bits);
            return w + " x " + h + " x " + bits + "bit / 8 = "
                + this.formatInt(bytes) + "바이트 = " + this.humanSize(bytes);
        }
    };

    window.SIM.register("co-media-calc", {
        title: "이미지 용량 계산기",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="mc-field">해상도 '
                +         '<select class="sim__select mc-res" aria-label="해상도 선택">'
                +             '<option value="640x480">640 x 480</option>'
                +             '<option value="1280x720">1280 x 720 (HD)</option>'
                +             '<option value="1920x1080" selected>1920 x 1080 (FHD)</option>'
                +             '<option value="4000x3000">4000 x 3000 (1200만 화소)</option>'
                +         '</select>'
                +     '</label>'
                +     '<label class="mc-field">색 깊이 '
                +         '<select class="sim__select mc-depth" aria-label="색 깊이 선택">'
                +             '<option value="1">1비트 (흑백 2색)</option>'
                +             '<option value="8">8비트 (256색)</option>'
                +             '<option value="24" selected>24비트 (트루컬러 약 1677만 색)</option>'
                +         '</select>'
                +     '</label>'
                + '</div>'
                + '<div class="mc-results" aria-live="polite">'
                +     '<div class="mc-result-row"><span class="sim__chip">픽셀 수</span><div class="sim__out mc-out-pixels"></div></div>'
                +     '<div class="mc-result-row"><span class="sim__chip">표현 색 수</span><div class="sim__out mc-out-colors"></div></div>'
                +     '<div class="mc-result-row"><span class="sim__chip">비압축 크기</span><div class="sim__out mc-out-size"></div></div>'
                + '</div>'
                + '<div class="mc-viz" aria-hidden="true">'
                +     '<div class="mc-viz-row" data-bits="1">'
                +         '<span class="mc-viz-label">1비트</span>'
                +         '<div class="mc-bar" data-bar="1"></div>'
                +         '<span class="mc-viz-cap">2단계</span>'
                +     '</div>'
                +     '<div class="mc-viz-row" data-bits="8">'
                +         '<span class="mc-viz-label">8비트</span>'
                +         '<div class="mc-bar" data-bar="8"></div>'
                +         '<span class="mc-viz-cap">여러 단계</span>'
                +     '</div>'
                +     '<div class="mc-viz-row" data-bits="24">'
                +         '<span class="mc-viz-label">24비트</span>'
                +         '<div class="mc-bar mc-bar--smooth" data-bar="24"></div>'
                +         '<span class="mc-viz-cap">연속</span>'
                +     '</div>'
                + '</div>'
                + '<p class="sim__note">같은 그라데이션을 색 깊이별로 표현한 느낌입니다. 비트가 클수록 단계가 촘촘해져 연속에 가까워집니다.</p>'
                + '<div class="mc-tip">그래서 압축이 필요하다 - 무손실(PNG, 원본 복원)과 손실(JPEG, 더 작게). 비트맵은 픽셀 기반(확대 시 계단), 벡터는 수식 기반(확대해도 선명)</div>';

            var resSel = root.querySelector(".mc-res");
            var depthSel = root.querySelector(".mc-depth");
            var outPixels = root.querySelector(".mc-out-pixels");
            var outColors = root.querySelector(".mc-out-colors");
            var outSize = root.querySelector(".mc-out-size");
            var vizRows = root.querySelectorAll(".mc-viz-row");

            /* 계단식 막대: count개 구간을 투명 -> 강조색으로 단계 채움 */
            function fillBar(bar, count) {
                var i, seg, pct;
                for (i = 0; i < count; i++) {
                    seg = document.createElement("span");
                    seg.className = "mc-seg";
                    pct = count === 1 ? 100 : Math.round(i / (count - 1) * 100);
                    seg.style.background =
                        "color-mix(in srgb, var(--accent) " + pct + "%, transparent)";
                    bar.appendChild(seg);
                }
            }
            fillBar(root.querySelector('[data-bar="1"]'), 2);
            fillBar(root.querySelector('[data-bar="8"]'), 12);
            /* 24비트 막대는 CSS의 연속 그라데이션(mc-bar--smooth)으로 표현 */

            function update() {
                var parts = resSel.value.split("x");
                var w = parseInt(parts[0], 10);
                var h = parseInt(parts[1], 10);
                var bits = parseInt(depthSel.value, 10);
                var i;

                outPixels.textContent = logic.pixelLine(w, h);
                outColors.textContent = logic.colorLabel(bits);
                outSize.textContent = logic.sizeLine(w, h, bits);

                for (i = 0; i < vizRows.length; i++) {
                    if (vizRows[i].getAttribute("data-bits") === String(bits)) {
                        vizRows[i].className = "mc-viz-row active";
                    } else {
                        vizRows[i].className = "mc-viz-row";
                    }
                }
            }

            resSel.addEventListener("change", update);
            depthSel.addEventListener("change", update);
            update();
        }
    });
})();

/* sim:c-printf-lab - printf 서식 지정자 체험 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 내장 데이터 (값 카드 4개 고정) ---- */
    var CARDS = [
        { id: "int", type: "int", varName: "n", decl: "int n = 42;", value: 42 },
        { id: "double", type: "double", varName: "pi", decl: "double pi = 3.14159;", value: 3.14159 },
        { id: "char", type: "char", varName: "c", decl: "char c = 'A';", value: "A" },
        { id: "string", type: "string", varName: "s", decl: "char s[] = \"KNOU\";", value: "KNOU" }
    ];

    var SPECS = [
        {
            spec: "%d", types: ["int"], desc: "10진 정수",
            explain: "정수를 10진수 그대로 출력합니다."
        },
        {
            spec: "%5d", types: ["int"], desc: "너비 5칸, 오른쪽 정렬",
            explain: "최소 5칸을 확보하고 오른쪽 정렬합니다. 연한 점(·)은 공백입니다."
        },
        {
            spec: "%f", types: ["double"], desc: "실수(소수점 아래 기본 6자리)",
            explain: "자릿수를 지정하지 않으면 소수점 아래 6자리가 기본입니다."
        },
        {
            spec: "%.2f", types: ["double"], desc: "소수점 아래 2자리",
            explain: "소수점 아래 2자리까지만 출력합니다(그 아래는 반올림)."
        },
        {
            spec: "%c", types: ["char"], desc: "문자 1개",
            explain: "문자 1개를 출력합니다."
        },
        {
            spec: "%s", types: ["string"], desc: "문자열",
            explain: "문자열을 출력합니다."
        },
        {
            spec: "%x", types: ["int"], desc: "16진수(소문자)",
            explain: "정수를 16진수 소문자로 출력합니다. 10진수 42는 16진수로 2a입니다."
        }
    ];

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* 서식 정의가 해당 타입에 쓸 수 있는지 */
        isCompatible: function (specDef, type) {
            for (var i = 0; i < specDef.types.length; i++) {
                if (specDef.types[i] === type) return true;
            }
            return false;
        },
        /* spec 문자열로 정의 찾기 (없으면 null) */
        findSpec: function (specs, spec) {
            for (var i = 0; i < specs.length; i++) {
                if (specs[i].spec === spec) return specs[i];
            }
            return null;
        },
        /* 타입에 맞는 첫 서식 문자열 (없으면 null) */
        firstCompatibleSpec: function (specs, type) {
            for (var i = 0; i < specs.length; i++) {
                if (logic.isCompatible(specs[i], type)) return specs[i].spec;
            }
            return null;
        },
        /* C printf 동작 기준의 출력 문자열 (공백은 실제 공백 문자로 반환) */
        format: function (spec, value) {
            var s;
            if (spec === "%d") return String(value);
            if (spec === "%5d") {
                s = String(value);
                while (s.length < 5) s = " " + s;
                return s;
            }
            if (spec === "%x") return value.toString(16);
            if (spec === "%f") return value.toFixed(6);
            if (spec === "%.2f") return value.toFixed(2);
            if (spec === "%c") return String(value);
            if (spec === "%s") return String(value);
            return "";
        },
        /* printf 코드 한 줄 */
        codeLine: function (spec, varName) {
            return "printf(\"" + spec + "\", " + varName + ");";
        }
    };

    window.SIM.register("c-printf-lab", {
        title: "printf 서식 지정자 체험",
        _logic: logic,
        _cards: CARDS,
        _specs: SPECS,
        build: function (root) {
            var state = { cardId: "int", spec: "%d" };
            var i;

            root.innerHTML = ""
                + '<p class="sim__note">값 카드를 고른 뒤 서식 버튼을 누르면 printf 코드와 실제 출력 결과가 나타납니다.</p>'
                + '<div class="cpl-cards" role="group" aria-label="출력할 값 선택"></div>'
                + '<div class="sim__row cpl-specs" role="group" aria-label="서식 지정자 선택"></div>'
                + '<div class="cpl-result" aria-live="polite">'
                +     '<div class="cpl-block"><span class="sim__chip">코드</span><div class="sim__out cpl-code"></div></div>'
                +     '<div class="cpl-block"><span class="sim__chip">출력</span><div class="sim__out cpl-out"></div></div>'
                +     '<p class="sim__note cpl-explain"></p>'
                + '</div>'
                + '<div class="cpl-tablewrap">'
                +     '<table class="cpl-table">'
                +         '<thead><tr><th>서식</th><th>의미</th><th>예시 출력</th></tr></thead>'
                +         '<tbody></tbody>'
                +     '</table>'
                + '</div>'
                + '<p class="cpl-scanf">scanf에는 변수 앞에 &amp;(주소)를 붙인다 - 포인터 단원에서 이유를 배운다. 예: <code>scanf("%d", &amp;n);</code></p>';

            var cardsBox = root.querySelector(".cpl-cards");
            var specsBox = root.querySelector(".cpl-specs");
            var codeEl = root.querySelector(".cpl-code");
            var outEl = root.querySelector(".cpl-out");
            var explainEl = root.querySelector(".cpl-explain");
            var tbody = root.querySelector(".cpl-table tbody");

            function findCard(id) {
                for (var k = 0; k < CARDS.length; k++) {
                    if (CARDS[k].id === id) return CARDS[k];
                }
                return CARDS[0];
            }

            /* 출력 문자열을 그리되 공백은 연한 점(·)으로 시각화 */
            function renderOut(el, text) {
                el.innerHTML = "";
                for (var k = 0; k < text.length; k++) {
                    var ch = text.charAt(k);
                    if (ch === " ") {
                        var sp = document.createElement("span");
                        sp.className = "cpl-sp";
                        sp.setAttribute("aria-hidden", "true");
                        sp.textContent = "·";
                        el.appendChild(sp);
                    } else {
                        el.appendChild(document.createTextNode(ch));
                    }
                }
            }

            /* ---- 값 카드 버튼 생성 ---- */
            var cardBtns = [];
            for (i = 0; i < CARDS.length; i++) {
                (function (card) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.className = "sim__btn cpl-card";
                    b.textContent = card.decl;
                    b.setAttribute("aria-label", "값 선택: " + card.decl);
                    b.addEventListener("click", function () {
                        state.cardId = card.id;
                        var specDef = logic.findSpec(SPECS, state.spec);
                        if (!specDef || !logic.isCompatible(specDef, card.type)) {
                            state.spec = logic.firstCompatibleSpec(SPECS, card.type);
                        }
                        renderAll();
                    });
                    cardsBox.appendChild(b);
                    cardBtns.push(b);
                })(CARDS[i]);
            }

            /* ---- 서식 버튼 생성 ---- */
            var specBtns = [];
            for (i = 0; i < SPECS.length; i++) {
                (function (specDef) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.className = "sim__btn cpl-spec";
                    b.textContent = specDef.spec;
                    b.setAttribute("aria-label", "서식 지정자 " + specDef.spec);
                    b.addEventListener("click", function () {
                        state.spec = specDef.spec;
                        renderAll();
                    });
                    specsBox.appendChild(b);
                    specBtns.push(b);
                })(SPECS[i]);
            }

            /* ---- 조합 표 (서식 -> 의미 -> 예시 출력) ---- */
            var tableRows = [];
            for (i = 0; i < SPECS.length; i++) {
                (function (specDef) {
                    var exCard = null;
                    for (var k = 0; k < CARDS.length; k++) {
                        if (logic.isCompatible(specDef, CARDS[k].type)) {
                            exCard = CARDS[k];
                            break;
                        }
                    }
                    var tr = document.createElement("tr");
                    var tdSpec = document.createElement("td");
                    tdSpec.className = "cpl-td-spec";
                    tdSpec.textContent = specDef.spec;
                    var tdDesc = document.createElement("td");
                    tdDesc.textContent = specDef.desc;
                    var tdOut = document.createElement("td");
                    tdOut.className = "cpl-td-out";
                    if (exCard) renderOut(tdOut, logic.format(specDef.spec, exCard.value));
                    tr.appendChild(tdSpec);
                    tr.appendChild(tdDesc);
                    tr.appendChild(tdOut);
                    tbody.appendChild(tr);
                    tableRows.push(tr);
                })(SPECS[i]);
            }

            /* ---- 화면 갱신 ---- */
            function renderAll() {
                var card = findCard(state.cardId);
                var specDef = logic.findSpec(SPECS, state.spec);
                var k, on;

                for (k = 0; k < CARDS.length; k++) {
                    on = CARDS[k].id === state.cardId;
                    cardBtns[k].className = "sim__btn cpl-card" + (on ? " active" : "");
                    cardBtns[k].setAttribute("aria-pressed", on ? "true" : "false");
                }
                for (k = 0; k < SPECS.length; k++) {
                    on = SPECS[k].spec === state.spec;
                    specBtns[k].className = "sim__btn cpl-spec" + (on ? " active" : "");
                    specBtns[k].setAttribute("aria-pressed", on ? "true" : "false");
                    specBtns[k].disabled = !logic.isCompatible(SPECS[k], card.type);
                }
                for (k = 0; k < SPECS.length; k++) {
                    tableRows[k].className =
                        SPECS[k].spec === state.spec ? "is-current" : "";
                }

                if (specDef) {
                    codeEl.textContent = logic.codeLine(specDef.spec, card.varName);
                    renderOut(outEl, logic.format(specDef.spec, card.value));
                    explainEl.textContent = specDef.explain;
                }
            }

            renderAll();
        }
    });
})();

/* sim:c-intdiv-lab - 정수 나눗셈과 형변환 함정 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* C의 정수 나눗셈: 0 방향으로 소수점 버림 */
        intDiv: function (a, b) {
            var q = a / b;
            return q >= 0 ? Math.floor(q) : Math.ceil(q);
        },
        /* C의 % 연산: a - (a/b)*b */
        intMod: function (a, b) {
            return a - this.intDiv(a, b) * b;
        },
        /* double 값 표기: 정수면 .0을 붙인다 (3 -> "3.0") */
        fmtDouble: function (n) {
            return n === Math.floor(n) ? n.toFixed(1) : String(n);
        },
        /* 탭1: 식 5개의 평가 단계/결과 데이터 */
        buildCases: function () {
            var iq = this.intDiv(7, 2);
            var fq = this.fmtDouble(7.0 / 2);
            var md = this.intMod(7, 2);
            var trapVal = this.fmtDouble(this.intDiv(7, 2));
            return [
                {
                    key: "intdiv",
                    btn: "7 / 2",
                    code: "int r = 7 / 2;",
                    steps: [
                        "7과 2는 둘 다 int",
                        "정수 나눗셈: 몫만 남기고 소수점 버림",
                        "7 / 2 → " + iq
                    ],
                    result: "r = " + iq + " (int)",
                    trap: false,
                    note: "정수끼리 나누면 3.5가 아니라 " + iq + "이 된다. 소수점 이하는 그냥 버려진다."
                },
                {
                    key: "floatdiv",
                    btn: "7.0 / 2",
                    code: "double r = 7.0 / 2;",
                    steps: [
                        "7.0은 double, 2는 int",
                        "int 2가 double 2.0으로 자동 형변환",
                        "실수 나눗셈 7.0 / 2.0 → " + fq
                    ],
                    result: "r = " + fq + " (double)",
                    trap: false,
                    note: "피연산자 중 한쪽이라도 실수면 다른 쪽도 실수로 바뀌어 실수 연산이 된다."
                },
                {
                    key: "castdiv",
                    btn: "(double)7 / 2",
                    code: "double r = (double)7 / 2;",
                    steps: [
                        "(double)7 명시적 형변환이 먼저 → 7.0",
                        "int 2가 double 2.0으로 자동 형변환",
                        "실수 나눗셈 7.0 / 2.0 → " + fq
                    ],
                    result: "r = " + fq + " (double)",
                    trap: false,
                    note: "(자료형) 형변환은 나눗셈보다 먼저 적용된다. 그래서 처음부터 실수 연산이 된다."
                },
                {
                    key: "mod",
                    btn: "7 % 2",
                    code: "int r = 7 % 2;",
                    steps: [
                        "7 ÷ 2 → 몫 " + iq + ", 나머지 " + md,
                        "%는 나머지만 남긴다 → " + md
                    ],
                    result: "r = " + md + " (int)",
                    trap: false,
                    note: "%(나머지)는 정수끼리만 쓸 수 있다. 짝홀 판별(n % 2)에 자주 쓰인다."
                },
                {
                    key: "trap",
                    btn: "total / count 함정",
                    code: "int total = 7, count = 2;\ndouble avg = total / count;",
                    steps: [
                        "total / count = 7 / 2 → 둘 다 int",
                        "정수 나눗셈이 먼저 끝남 → " + iq,
                        iq + "이 double avg에 담김 → " + trapVal
                    ],
                    result: "avg = " + trapVal + " (3.5가 아니다!)",
                    trap: true,
                    note: "왼쪽이 double이어도 오른쪽의 정수 연산이 먼저 끝난다. 3.5를 원하면 (double)total / count 로 형변환을 먼저 해야 한다."
                }
            ];
        },
        /* 탭2: 증감 연산자. kind는 "post"(a++) 또는 "pre"(++a) */
        incdec: function (a, kind) {
            if (kind === "post") {
                return {
                    printed: a,
                    after: a + 1,
                    printIdx: 1,
                    steps: [
                        "a는 지금 " + a,
                        "먼저 사용: " + a + " 출력",
                        "그 다음 증가: a = " + (a + 1)
                    ]
                };
            }
            return {
                printed: a + 1,
                after: a + 1,
                printIdx: 2,
                steps: [
                    "a는 지금 " + a,
                    "먼저 증가: a = " + (a + 1),
                    "그 다음 사용: " + (a + 1) + " 출력"
                ]
            };
        }
    };

    window.SIM.register("c-intdiv-lab", {
        title: "정수 나눗셈과 형변환 함정",
        _logic: logic,
        build: function (root) {
            var cases = logic.buildCases();

            root.innerHTML = ""
                + '<div class="sim__tabs" role="tablist">'
                +     '<button type="button" class="sim__tab active" data-tab="div" role="tab" aria-selected="true">나눗셈 / 형변환</button>'
                +     '<button type="button" class="sim__tab" data-tab="inc" role="tab" aria-selected="false">증감 연산자</button>'
                + '</div>'
                + '<div class="idl-panel" data-panel="div" role="tabpanel" aria-label="나눗셈과 형변환 평가 단계 체험">'
                +     '<p class="sim__note">식을 고르고 "다음 단계"를 눌러 평가가 어떤 순서로 진행되는지 확인해 보세요.</p>'
                +     '<div class="sim__row idl-exprs"></div>'
                +     '<div class="sim__out idl-code"></div>'
                +     '<div class="idl-steps" aria-live="polite"></div>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary idl-next" aria-label="다음 평가 단계 보기">다음 단계</button>'
                +         '<button type="button" class="sim__btn idl-replay" aria-label="평가 단계 처음부터 다시 보기">처음부터</button>'
                +         '<span class="idl-progress" aria-hidden="true"></span>'
                +     '</div>'
                +     '<div class="idl-resultwrap" aria-live="polite"></div>'
                + '</div>'
                + '<div class="idl-panel" data-panel="inc" role="tabpanel" aria-label="증감 연산자 전위 후위 체험" hidden>'
                +     '<div class="sim__row">'
                +         '<span class="sim__chip">int a = 5; 로 시작</span>'
                +         '<span class="idl-aval" aria-label="현재 a 값"></span>'
                +     '</div>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn idl-incbtn idl-post" aria-label="후위 증가 a++ 를 printf로 실행">printf("%d", a++);</button>'
                +         '<button type="button" class="sim__btn idl-incbtn idl-pre" aria-label="전위 증가 ++a 를 printf로 실행">printf("%d", ++a);</button>'
                +         '<button type="button" class="sim__btn idl-areset" aria-label="a 값을 5로 초기화">a 초기화</button>'
                +     '</div>'
                +     '<div class="idl-steps idl-steps--inc" aria-live="polite"></div>'
                +     '<div class="sim__out idl-log"></div>'
                +     '<p class="sim__note">후위 a++는 "먼저 쓰고 증가", 전위 ++a는 "먼저 증가하고 쓴다". 연속으로 누르면 a가 계속 변한다.</p>'
                + '</div>'
                + '<p class="idl-warnbox"><strong>=(대입)과 ==(비교)는 다르다.</strong> if (x == 1)을 if (x = 1)로 잘못 쓰면 비교가 아니라 대입이 되어 조건이 항상 참이 된다. 조건문에서 = 오타는 치명적 버그!</p>';

            var tabs = root.querySelectorAll(".sim__tab");
            var panels = root.querySelectorAll(".idl-panel");
            var exprRow = root.querySelector(".idl-exprs");
            var codeBox = root.querySelector(".idl-code");
            var stepsBox = root.querySelector(".idl-panel[data-panel=div] .idl-steps");
            var nextBtn = root.querySelector(".idl-next");
            var replayBtn = root.querySelector(".idl-replay");
            var progress = root.querySelector(".idl-progress");
            var resultWrap = root.querySelector(".idl-resultwrap");
            var aOut = root.querySelector(".idl-aval");
            var postBtn = root.querySelector(".idl-post");
            var preBtn = root.querySelector(".idl-pre");
            var aResetBtn = root.querySelector(".idl-areset");
            var incSteps = root.querySelector(".idl-steps--inc");
            var logBox = root.querySelector(".idl-log");

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            /* 단계 칩 + 화살표 렌더 (nowIdx 칩 강조) */
            function renderChips(box, texts, nowIdx) {
                clearNode(box);
                for (var i = 0; i < texts.length; i++) {
                    if (i > 0) {
                        var ar = document.createElement("span");
                        ar.className = "idl-arrow";
                        ar.setAttribute("aria-hidden", "true");
                        ar.textContent = "→";
                        box.appendChild(ar);
                    }
                    var chip = document.createElement("span");
                    chip.className = "idl-step" + (i === nowIdx ? " is-now" : "");
                    chip.textContent = texts[i];
                    box.appendChild(chip);
                }
            }

            /* ---- 탭1: 나눗셈/형변환 ---- */
            var cur = null;
            var stepIdx = 0;

            function renderDiv() {
                codeBox.textContent = cur.code;
                renderChips(stepsBox, cur.steps.slice(0, stepIdx + 1), stepIdx);
                progress.textContent = "단계 " + (stepIdx + 1) + " / " + cur.steps.length;
                var done = stepIdx >= cur.steps.length - 1;
                nextBtn.disabled = done;
                clearNode(resultWrap);
                if (done) {
                    var rbox = document.createElement("div");
                    rbox.className = "idl-result" + (cur.trap ? " idl-result--trap" : "");
                    rbox.textContent = "결과: " + cur.result;
                    resultWrap.appendChild(rbox);
                    var note = document.createElement("p");
                    note.className = "sim__note";
                    note.textContent = cur.note;
                    resultWrap.appendChild(note);
                }
            }

            function selectCase(key) {
                var btns = exprRow.querySelectorAll(".idl-expr-btn");
                for (var i = 0; i < btns.length; i++) {
                    var on = btns[i].getAttribute("data-key") === key;
                    btns[i].className = "sim__btn idl-expr-btn" + (on ? " active" : "");
                    btns[i].setAttribute("aria-pressed", on ? "true" : "false");
                }
                cur = null;
                for (var j = 0; j < cases.length; j++) {
                    if (cases[j].key === key) cur = cases[j];
                }
                stepIdx = 0;
                renderDiv();
            }

            function onExprClick(ev) {
                selectCase(ev.currentTarget.getAttribute("data-key"));
            }

            for (var b = 0; b < cases.length; b++) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sim__btn idl-expr-btn";
                btn.setAttribute("data-key", cases[b].key);
                btn.setAttribute("aria-pressed", "false");
                btn.textContent = cases[b].btn;
                btn.addEventListener("click", onExprClick);
                exprRow.appendChild(btn);
            }

            nextBtn.addEventListener("click", function () {
                if (!cur || stepIdx >= cur.steps.length - 1) return;
                stepIdx += 1;
                renderDiv();
            });

            replayBtn.addEventListener("click", function () {
                if (!cur) return;
                stepIdx = 0;
                renderDiv();
            });

            /* ---- 탭2: 증감 연산자 ---- */
            var aVal = 5;
            var logLines = [];

            function renderInc() {
                aOut.textContent = "현재 a = " + aVal;
                logBox.textContent = logLines.length
                    ? logLines.join("\n")
                    : "아직 실행한 printf가 없습니다.";
            }

            function runInc(kind) {
                var res = logic.incdec(aVal, kind);
                aVal = res.after;
                var src = kind === "post" ? 'printf("%d", a++);' : 'printf("%d", ++a);';
                logLines.push(src + "  // " + res.printed + " 출력, 직후 a = " + res.after);
                if (logLines.length > 8) logLines.shift();
                renderChips(incSteps, res.steps, res.printIdx);
                renderInc();
            }

            postBtn.addEventListener("click", function () { runInc("post"); });
            preBtn.addEventListener("click", function () { runInc("pre"); });

            aResetBtn.addEventListener("click", function () {
                aVal = 5;
                logLines = [];
                renderChips(incSteps, ["a를 5로 초기화"], 0);
                renderInc();
            });

            /* ---- 탭 전환 ---- */
            function activateTab(name) {
                for (var i = 0; i < tabs.length; i++) {
                    var on = tabs[i].getAttribute("data-tab") === name;
                    tabs[i].className = "sim__tab" + (on ? " active" : "");
                    tabs[i].setAttribute("aria-selected", on ? "true" : "false");
                }
                for (var j = 0; j < panels.length; j++) {
                    panels[j].hidden = panels[j].getAttribute("data-panel") !== name;
                }
            }

            function onTabClick(ev) {
                activateTab(ev.currentTarget.getAttribute("data-tab"));
            }

            for (var t = 0; t < tabs.length; t++) {
                tabs[t].addEventListener("click", onTabClick);
            }

            /* ---- 초기 상태 ---- */
            selectCase(cases[0].key);
            renderInc();
        }
    });
})();

/* sim:c-array-index - 배열 인덱스와 범위 밖 접근 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var SCORES = [90, 85, 70, 95, 60];
    var CELL_COUNT = 7;          /* 정상 5 + 범위 밖 2 */
    var BASE_ADDR = 4096;        /* 0x1000, int는 4바이트 가정 */

    var logic = {
        scores: SCORES,
        cellCount: CELL_COUNT,
        /* i번째 원소의 메모리 주소 (0x1000 + i*4, 16진 대문자) */
        addrHex: function (i) {
            return "0x" + (BASE_ADDR + i * 4).toString(16).toUpperCase();
        },
        /* 유효 인덱스인지 (0 <= i < 5) */
        inRange: function (i) {
            return i >= 0 && i < SCORES.length;
        },
        /* 의사난수 쓰레기 값 생성기 (LCG). 호출할 때마다 다른 값 */
        makeGarbage: function (seed) {
            var s = (typeof seed === "number" ? seed : 305419896) >>> 0;
            return function () {
                s = (s * 1664525 + 1013904223) >>> 0;
                var mode = s % 3;
                if (mode === 0) {
                    return ((s >>> 8) % 32767) + 1;          /* 작은 양수 */
                }
                if (mode === 1) {
                    return -(((s >>> 8) % 32768) + 1);       /* 작은 음수 */
                }
                var big = ((s >>> 4) % 9000000) + 1000000;   /* 7자리 */
                return (s % 2 === 0) ? big : -big;
            };
        },
        /* score[i] 접근 판정. 범위 밖이면 garbage()로 쓰레기 값 */
        access: function (i, garbage) {
            if (logic.inRange(i)) {
                return { ok: true, index: i, value: SCORES[i], addr: logic.addrHex(i) };
            }
            return { ok: false, index: i, value: garbage(), addr: logic.addrHex(i) };
        },
        /* 합계 루프 상태 초기화. inclusive=true면 조건이 i <= 5 (off-by-one) */
        sumInit: function (inclusive) {
            return { i: 0, sum: 0, done: false, inclusive: !!inclusive };
        },
        /* 합계 루프 한 단계: 조건 검사 -> 읽기/종료. 상태를 직접 갱신 */
        sumStep: function (state, garbage) {
            if (state.done) {
                return { type: "noop" };
            }
            var cond = state.inclusive ? state.i <= 5 : state.i < 5;
            if (!cond) {
                state.done = true;
                return { type: "end", i: state.i, sum: state.sum, inclusive: state.inclusive };
            }
            var idx = state.i;
            var oob = !logic.inRange(idx);
            var val = oob ? garbage() : SCORES[idx];
            state.sum += val;
            state.i += 1;
            return { type: "read", index: idx, value: val, sum: state.sum, oob: oob };
        }
    };

    /* 셀 1칸 마크업 (정적 상수만 사용) */
    function cellHTML(i) {
        var oob = i >= SCORES.length;
        return '<div class="cai-cell' + (oob ? " cai-cell--oob" : "") + '" data-idx="' + i + '">'
            + '<span class="cai-idx">[' + i + "]</span>"
            + '<span class="cai-val">' + (oob ? "?" : SCORES[i]) + "</span>"
            + '<span class="cai-addr">' + logic.addrHex(i) + "</span>"
            + "</div>";
    }

    window.SIM.register("c-array-index", {
        title: "배열 인덱스와 범위 밖 접근",
        _logic: logic,
        build: function (root) {
            var i;
            var html = '<div class="cai-decl">int score[5] = {90, 85, 70, 95, 60};</div>';
            html += '<div class="cai-memwrap"><div class="cai-mem">';
            for (i = 0; i < CELL_COUNT; i++) {
                html += cellHTML(i);
            }
            html += "</div></div>";
            html += '<p class="sim__note">int는 4바이트이므로 주소가 4씩 커진다 (시작 주소 0x1000 가정). 회색 점선 칸은 배열 범위 밖 메모리.</p>';

            html += '<p class="cai-subhead">1) 인덱스 접근 실험</p>';
            html += '<div class="sim__row cai-btns">';
            for (i = 0; i < CELL_COUNT; i++) {
                html += '<button type="button" class="sim__btn cai-ibtn' + (i >= SCORES.length ? " cai-ibtn--oob" : "")
                    + '" data-idx="' + i + '" aria-label="score ' + i + '번 인덱스 접근">[' + i + "]</button>";
            }
            html += "</div>";
            html += '<div class="sim__out cai-out cai-access-out" aria-live="polite">인덱스 버튼을 누르면 score[i] 접근 결과가 표시됩니다.</div>';

            html += '<p class="cai-subhead">2) 합계 for 루프 단계 실행</p>';
            html += '<div class="sim__row">'
                + '<label class="cai-cond-label">반복 조건 '
                + '<select class="sim__select cai-cond" aria-label="반복 조건 선택">'
                + '<option value="lt">i &lt; 5 (정확)</option>'
                + '<option value="le">i &lt;= 5 (off-by-one)</option>'
                + "</select></label>"
                + '<button type="button" class="sim__btn sim__btn--primary cai-step" aria-label="합계 반복 한 단계 실행">다음 단계</button>'
                + '<button type="button" class="sim__btn cai-reset" aria-label="합계 데모 초기화">초기화</button>'
                + "</div>";
            html += '<div class="cai-decl cai-sum-code"></div>';
            html += '<div class="sim__out cai-out cai-sum-log" aria-live="polite"></div>';
            html += '<p class="sim__note">조건을 i &lt;= 5로 바꾸면 마지막 반복이 범위 밖 score[5]를 읽어 합계가 오염된다.</p>';
            html += '<p class="cai-rule">C는 배열 범위를 검사하지 않는다. 반복 조건은 i &lt; 5처럼 정확히 맞춘다.</p>';
            root.innerHTML = html;

            var cells = root.querySelectorAll(".cai-cell");
            var btnWrap = root.querySelector(".cai-btns");
            var accessOut = root.querySelector(".cai-access-out");
            var condSel = root.querySelector(".cai-cond");
            var stepBtn = root.querySelector(".cai-step");
            var resetBtn = root.querySelector(".cai-reset");
            var sumCode = root.querySelector(".cai-sum-code");
            var sumLog = root.querySelector(".cai-sum-log");

            var garbage = logic.makeGarbage((new Date()).getTime() % 2147483647);
            var sumState = logic.sumInit(false);

            /* 하이라이트 제거 + 범위 밖 칸 값 "?" 복원 */
            function resetCells() {
                for (var k = 0; k < cells.length; k++) {
                    cells[k].classList.remove("cai-cell--hit");
                    cells[k].classList.remove("cai-cell--bad");
                    if (k >= SCORES.length) {
                        cells[k].querySelector(".cai-val").textContent = "?";
                    }
                }
            }

            function condInclusive() {
                return condSel.value === "le";
            }

            function condText() {
                return condInclusive() ? "i <= 5" : "i < 5";
            }

            function renderSumCode() {
                sumCode.textContent = "int sum = 0;\nfor (i = 0; " + condText() + "; i++)\n    sum += score[i];";
            }

            function appendLine(text, warn) {
                var div = document.createElement("div");
                div.className = "cai-line" + (warn ? " cai-line--warn" : "");
                div.textContent = text;
                sumLog.appendChild(div);
            }

            function clearLog() {
                while (sumLog.firstChild) {
                    sumLog.removeChild(sumLog.firstChild);
                }
            }

            /* score[i] 접근 결과 표시 */
            function showAccess(idx) {
                resetCells();
                var res = logic.access(idx, garbage);
                var cell = cells[idx];
                if (res.ok) {
                    cell.classList.add("cai-cell--hit");
                    accessOut.classList.remove("cai-out--warn");
                    accessOut.textContent = "score[" + idx + "] = " + res.value
                        + "   (주소 " + res.addr + ", 정상 접근)";
                } else {
                    cell.classList.add("cai-cell--bad");
                    cell.querySelector(".cai-val").textContent = String(res.value);
                    accessOut.classList.add("cai-out--warn");
                    accessOut.textContent = "score[" + idx + "] -> 범위 밖! 컴파일은 되지만 엉뚱한 메모리("
                        + res.addr + ")를 읽는다.\n지금 읽힌 쓰레기 값: " + res.value
                        + " (접근할 때마다 바뀐다) - off-by-one 오류";
                }
            }

            function resetSum() {
                sumState = logic.sumInit(condInclusive());
                stepBtn.disabled = false;
                resetCells();
                renderSumCode();
                clearLog();
                appendLine('sum = 0 에서 시작. "다음 단계"를 누르면 한 번에 한 반복씩 실행합니다.', false);
            }

            btnWrap.addEventListener("click", function (e) {
                var t = e.target;
                while (t && t !== btnWrap) {
                    if (t.nodeType === 1 && t.getAttribute("data-idx") !== null) {
                        showAccess(parseInt(t.getAttribute("data-idx"), 10));
                        return;
                    }
                    t = t.parentNode;
                }
            });

            stepBtn.addEventListener("click", function () {
                var ev = logic.sumStep(sumState, garbage);
                if (ev.type === "noop") {
                    return;
                }
                resetCells();
                if (ev.type === "read") {
                    var cell = cells[ev.index];
                    if (ev.oob) {
                        cell.classList.add("cai-cell--bad");
                        cell.querySelector(".cai-val").textContent = String(ev.value);
                        appendLine("i=" + ev.index + ": 조건 " + condText() + " 참 -> score[" + ev.index
                            + "] 읽기 = " + ev.value + " (범위 밖, 쓰레기 값!) -> sum = " + ev.sum, true);
                    } else {
                        cell.classList.add("cai-cell--hit");
                        appendLine("i=" + ev.index + ": 조건 " + condText() + " 참 -> sum += score[" + ev.index
                            + "](" + ev.value + ") -> sum = " + ev.sum, false);
                    }
                } else {
                    var ok = !ev.inclusive;
                    appendLine("i=" + ev.i + ": 조건 " + condText() + " 거짓 -> 반복 종료. 최종 sum = " + ev.sum
                        + (ok ? " (정상 총점 400)" : " (쓰레기 값이 섞여 오염!)"), !ok);
                    stepBtn.disabled = true;
                }
            });

            resetBtn.addEventListener("click", resetSum);
            condSel.addEventListener("change", resetSum);
            resetSum();
        }
    });
})();

/* sim:c-string-null - 문자열과 널 문자 '\0' */
(function () {
    "use strict";
    if (!window.SIM) return;

    var SIZE = 10;      /* char name[10] */
    var MAXLEN = 8;     /* 입력 허용 길이 (문자 8 + '\0' = 9바이트 < 10칸) */

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* 영문/숫자만 남기고 maxLen 자로 자른다 */
        validate: function (raw, maxLen) {
            if (typeof raw !== "string") raw = "";
            var hadBad = /[^A-Za-z0-9]/.test(raw);
            var clean = raw.replace(/[^A-Za-z0-9]/g, "");
            var trimmed = clean.length > maxLen;
            if (trimmed) clean = clean.slice(0, maxLen);
            return { value: clean, hadBad: hadBad, trimmed: trimmed };
        },
        /* size칸 배열의 셀 목록: 문자 / 널 / 빈칸 */
        cells: function (str, size) {
            var out = [];
            for (var i = 0; i < size; i++) {
                if (i < str.length) {
                    out.push({ ch: str.charAt(i), type: "char" });
                } else if (i === str.length) {
                    out.push({ ch: "\\0", type: "nul" });
                } else {
                    out.push({ ch: "", type: "free" });
                }
            }
            return out;
        },
        /* C strcmp 흉내: 같으면 0, 다르면 첫 불일치의 부호(-1/+1) */
        strcmp: function (a, b) {
            var n = a.length < b.length ? a.length : b.length;
            for (var i = 0; i < n; i++) {
                var d = a.charCodeAt(i) - b.charCodeAt(i);
                if (d !== 0) return d < 0 ? -1 : 1;
            }
            if (a.length === b.length) return 0;
            return a.length < b.length ? -1 : 1;
        },
        /* strcat 단계 계획: dst의 '\0' 위치부터 src 문자들 + 새 '\0' 기록.
           index >= size 인 기록은 배열 범위 밖(버퍼 오버플로) */
        strcatSteps: function (dst, src, size) {
            var steps = [];
            var pos = dst.length;
            for (var i = 0; i < src.length; i++) {
                steps.push({
                    index: pos + i,
                    ch: src.charAt(i),
                    isNul: false,
                    overflow: pos + i >= size
                });
            }
            steps.push({
                index: pos + src.length,
                ch: "\\0",
                isNul: true,
                overflow: pos + src.length >= size
            });
            return {
                dstLen: dst.length,
                srcLen: src.length,
                needed: dst.length + src.length + 1,
                size: size,
                overflow: dst.length + src.length + 1 > size,
                steps: steps
            };
        }
    };

    window.SIM.register("c-string-null", {
        title: "문자열과 널 문자 '\\0'",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                /* ---- 1. 배열 시각화 + strlen ---- */
                + '<div class="csn-sec">'
                +     '<p class="csn-subhead">1. 문자열은 \'\\0\'으로 끝나는 char 배열</p>'
                +     '<div class="sim__row">'
                +         '<label class="csn-field">name 값 '
                +             '<input type="text" class="sim__input csn-input" data-ref="nameInput" maxlength="8" value="KNOU" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="name에 저장할 문자열, 영문과 숫자 최대 8자">'
                +         '</label>'
                +         '<span class="sim__chip">영문/숫자 최대 8자</span>'
                +     '</div>'
                +     '<p class="sim__note csn-msg" data-ref="inMsg" aria-live="polite"></p>'
                +     '<p class="csn-arrlabel">char name[10]</p>'
                +     '<div class="csn-arr" data-ref="arrMain"></div>'
                +     '<p class="sim__note csn-legend">'
                +         '<span class="csn-key csn-key--nul">\\0</span> 널 문자(문자열의 끝 표시)'
                +         '<span class="csn-key csn-key--free"></span> 아직 쓰지 않는 칸'
                +     '</p>'
                +     '<div class="sim__out" data-ref="lenOut" aria-live="polite"></div>'
                +     '<p class="sim__note">strlen은 \'\\0\' 앞까지만 센다. 그래서 실제로 차지하는 공간은 항상 "길이 + 1"바이트다.</p>'
                + '</div>'
                /* ---- 2. strcmp ---- */
                + '<div class="csn-sec">'
                +     '<p class="csn-subhead">2. 문자열 비교는 strcmp</p>'
                +     '<div class="sim__row">'
                +         '<label class="csn-field">비교 상대 '
                +             '<input type="text" class="sim__input csn-input" data-ref="cmpInput" maxlength="8" value="KNOU" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="name과 비교할 문자열, 영문과 숫자 최대 8자">'
                +         '</label>'
                +     '</div>'
                +     '<p class="sim__note csn-msg" data-ref="cmpMsg" aria-live="polite"></p>'
                +     '<div class="sim__out" data-ref="cmpOut" aria-live="polite"></div>'
                +     '<div class="csn-warnbox">name == "KNOU" 는 문자열 내용이 아니라 주소를 비교하므로 항상 틀린다 - 비교는 반드시 strcmp로 한다.</div>'
                + '</div>'
                /* ---- 3. strcat + 버퍼 오버플로 ---- */
                + '<div class="csn-sec">'
                +     '<p class="csn-subhead">3. strcat과 버퍼 오버플로</p>'
                +     '<div class="sim__out csn-code">char s[10] = "Hello";\nstrcat(s, "World");   /* 다 들어갈까? */</div>'
                +     '<p class="csn-arrlabel">char s[10] - 쓸 수 있는 칸은 s[0]~s[9]</p>'
                +     '<div class="csn-arr csn-arr--cat" data-ref="arrCat"></div>'
                +     '<div class="sim__row">'
                +         '<button type="button" class="sim__btn sim__btn--primary" data-ref="stepBtn" aria-label="strcat 한 단계 실행">다음 단계</button>'
                +         '<button type="button" class="sim__btn" data-ref="resetBtn" aria-label="strcat 데모 초기화">초기화</button>'
                +         '<span class="sim__chip" data-ref="stepChip"></span>'
                +     '</div>'
                +     '<p class="csn-status" data-ref="catStatus" role="status" aria-live="polite"></p>'
                +     '<p class="sim__note">길이 검사: 필요한 공간 = strlen("Hello") + strlen("World") + 1(\'\\0\') = 5 + 5 + 1 = 11바이트. 10칸 배열에 11바이트는 넘친다(버퍼 오버플로). 실제 코드라면 strcat 전에 이 검사를 해서 더 큰 배열을 쓰거나 길이를 제한해야 한다.</p>'
                + '</div>';

            function ref(name) {
                return root.querySelector('[data-ref="' + name + '"]');
            }

            var nameInput = ref("nameInput");
            var inMsg = ref("inMsg");
            var arrMain = ref("arrMain");
            var lenOut = ref("lenOut");
            var cmpInput = ref("cmpInput");
            var cmpMsg = ref("cmpMsg");
            var cmpOut = ref("cmpOut");
            var arrCat = ref("arrCat");
            var stepBtn = ref("stepBtn");
            var resetBtn = ref("resetBtn");
            var stepChip = ref("stepChip");
            var catStatus = ref("catStatus");

            /* 셀 목록을 컨테이너에 그린다 (문자는 전부 textContent로) */
            function renderArray(container, cells) {
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
                for (var i = 0; i < cells.length; i++) {
                    var c = cells[i];
                    var cls = "csn-cell";
                    if (c.type === "nul") cls += " csn-cell--nul";
                    else if (c.type === "free") cls += " csn-cell--free";
                    else if (c.type === "ghost") cls += " csn-cell--ghost";
                    else if (c.type === "over") cls += " csn-cell--ghost csn-cell--over";
                    if (c.isNew) cls += " csn-cell--new";
                    var cell = document.createElement("div");
                    cell.className = cls;
                    var chEl = document.createElement("span");
                    chEl.className = "csn-ch";
                    chEl.textContent = c.ch || "";
                    var idxEl = document.createElement("span");
                    idxEl.className = "csn-idx";
                    idxEl.textContent = String(i);
                    cell.appendChild(chEl);
                    cell.appendChild(idxEl);
                    container.appendChild(cell);
                }
            }

            /* ---- 1. 배열 + strlen ---- */
            function renderMain() {
                var s = nameInput.value;
                renderArray(arrMain, logic.cells(s, SIZE));
                lenOut.textContent = 'strlen("' + s + '") = ' + s.length
                    + ", 저장은 " + (s.length + 1) + "바이트"
                    + " (문자 " + s.length + "개 + '\\0' 1개)";
            }

            /* ---- 2. strcmp ---- */
            function renderCmp() {
                var a = nameInput.value;
                var b = cmpInput.value;
                var r = logic.strcmp(a, b);
                var head = 'strcmp("' + a + '", "' + b + '") ';
                var txt;
                if (r === 0) {
                    txt = head + "= 0 -> 두 문자열의 내용이 같다";
                } else if (r < 0) {
                    txt = head + '< 0 (음수) -> 내용이 다르다. "' + a + '"가 사전순으로 앞';
                } else {
                    txt = head + '> 0 (양수) -> 내용이 다르다. "' + a + '"가 사전순으로 뒤';
                }
                cmpOut.textContent = txt;
            }

            /* ---- 입력 검증 공통 ---- */
            function hookInput(inputEl, msgEl, after) {
                inputEl.addEventListener("input", function () {
                    var v = logic.validate(inputEl.value, MAXLEN);
                    if (inputEl.value !== v.value) {
                        inputEl.value = v.value;
                    }
                    if (v.hadBad) {
                        msgEl.textContent = "영문/숫자만 넣을 수 있습니다. 그 외 문자는 제거했습니다.";
                        msgEl.classList.add("is-warn");
                    } else if (v.trimmed) {
                        msgEl.textContent = "최대 8자까지만 저장됩니다.";
                        msgEl.classList.add("is-warn");
                    } else {
                        msgEl.textContent = "";
                        msgEl.classList.remove("is-warn");
                    }
                    after();
                });
            }

            hookInput(nameInput, inMsg, function () {
                renderMain();
                renderCmp();
            });
            hookInput(cmpInput, cmpMsg, renderCmp);

            /* ---- 3. strcat 단계 데모 ---- */
            var catPlan = logic.strcatSteps("Hello", "World", SIZE);
            var catCells = [];
            var catIdx = 0;

            function catReset() {
                catCells = logic.cells("Hello", SIZE);
                catCells.push({ ch: "", type: "ghost" });
                catIdx = 0;
                stepBtn.disabled = false;
                stepChip.textContent = "단계 0/" + catPlan.steps.length;
                catStatus.textContent = 's에는 "Hello"와 끝 표시 \'\\0\'까지 6바이트가 들어 있습니다.'
                    + ' [다음 단계]를 눌러 strcat(s, "World")를 한 글자씩 실행해 보세요.';
                catStatus.classList.remove("is-warn");
                renderArray(arrCat, catCells);
            }

            function catStep() {
                if (catIdx >= catPlan.steps.length) return;
                var st = catPlan.steps[catIdx];
                for (var i = 0; i < catCells.length; i++) {
                    catCells[i].isNew = false;
                }
                var target = st.index < SIZE ? st.index : SIZE;
                catCells[target] = {
                    ch: st.ch,
                    type: st.overflow ? "over" : (st.isNul ? "nul" : "char"),
                    isNew: true
                };
                catIdx++;
                stepChip.textContent = "단계 " + catIdx + "/" + catPlan.steps.length;
                var msg;
                if (st.overflow) {
                    msg = "끝 표시 '\\0'은 s[" + st.index + "]에 가야 하는데 배열은 s["
                        + (SIZE - 1) + "]까지입니다. 배열 밖 메모리를 덮어쓰는 버퍼 오버플로가 일어났습니다!"
                        + " (10칸 배열에 " + catPlan.needed + "바이트는 넘침)";
                    catStatus.classList.add("is-warn");
                } else if (st.isNul) {
                    msg = "s[" + st.index + "]에 새 끝 표시 '\\0'을 써서 연결을 마칩니다.";
                } else if (st.index === catPlan.dstLen) {
                    msg = "s[" + st.index + "]: 끝 표시였던 '\\0' 자리에 '" + st.ch
                        + "'를 덮어씁니다. 여기서부터 \"World\"가 이어집니다.";
                } else {
                    msg = "s[" + st.index + "]에 '" + st.ch + "'를 씁니다.";
                    if (st.index === SIZE - 1) {
                        msg += " 마지막 칸까지 다 찼습니다. 그런데 끝 표시 '\\0'은 어디에 쓰죠?";
                    }
                }
                catStatus.textContent = msg;
                if (catIdx >= catPlan.steps.length) {
                    stepBtn.disabled = true;
                }
                renderArray(arrCat, catCells);
            }

            stepBtn.addEventListener("click", catStep);
            resetBtn.addEventListener("click", catReset);

            /* ---- 초기 표시 ---- */
            renderMain();
            renderCmp();
            catReset();
        }
    });
})();

/* sim:c-pointer-vis - 포인터 시각화 (& 와 *) */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ------------------------------------------------------------------
       고정 가짜 주소 (본문 11장 예상 출력과 같은 형식)
       ------------------------------------------------------------------ */
    var ADDR_A = "0x7ffeefbff5ac";
    var ADDR_P = "0x7ffeefbff5a0";
    var ADDR_B = "0x7ffeefbff5a8";
    var SHORT_A = "0x..5ac";
    var SHORT_B = "0x..5a8";

    /* 코드 패널에 표시할 줄 (textContent로 넣으므로 &, * 그대로) */
    var BASIC_CODE = [
        "int a = 10;",
        "int *p = &a;      // p에 a의 주소 저장",
        "printf(\"*p = %d\\n\", *p);",
        "*p = 20;          // a가 20으로!"
    ];

    var SWAP_CODE = [
        "void swap(int *x, int *y) {",
        "    int temp = *x;",
        "    *x = *y;",
        "    *y = temp;",
        "}",
        "int a = 1, b = 2;",
        "swap(&a, &b);     // 주소를 넘김",
        "printf(\"a=%d, b=%d\\n\", a, b);"
    ];

    /* ------------------------------------------------------------------
       순수 상태 전이 로직 (DOM 비의존)
       - 각 시나리오는 "단계 스냅샷 배열"로 표현한다. idx가 곧 현재 단계.
       ------------------------------------------------------------------ */

    /* 탭1: int a = 10; int *p = &a; *p 읽기; *p = 20; */
    function makeBasicSteps() {
        return [
            {
                lines: [], a: null, p: null,
                arrow: false, arrowHot: false, op: null, opKind: "",
                out: [], tone: "",
                msg: "다음 단계를 누르면 코드가 한 줄씩 실행됩니다.",
                pic: "메모리가 비어 있습니다"
            },
            {
                lines: [1], a: { val: 10, mood: "hot" }, p: null,
                arrow: false, arrowHot: false, op: null, opKind: "",
                out: [], tone: "info",
                msg: "int a = 10; - 변수 a가 주소 " + ADDR_A +
                    " 자리에 만들어지고 값 10이 저장됩니다.",
                pic: "a 상자가 생기고 값 10이 들어 있음"
            },
            {
                lines: [2], a: { val: 10, mood: "" },
                p: { val: ADDR_A, mood: "hot" },
                arrow: true, arrowHot: true, op: null, opKind: "",
                out: [], tone: "info",
                msg: "int *p = &a; - &a는 a의 주소입니다. 포인터 p가 그 주소를 " +
                    "담는 순간, p는 a를 가리킵니다(화살표가 생겼습니다).",
                pic: "p 상자가 a의 주소를 담고 화살표로 a를 가리킴"
            },
            {
                lines: [3], a: { val: 10, mood: "hot" },
                p: { val: ADDR_A, mood: "" },
                arrow: true, arrowHot: true, op: "값 읽기", opKind: "read",
                out: ["*p = 10"], tone: "info",
                msg: "*p - 화살표를 따라가 그 곳(a)의 값을 읽습니다. 결과는 10.",
                pic: "화살표를 따라가 a의 값 10을 읽음"
            },
            {
                lines: [4], a: { val: 20, mood: "warn" },
                p: { val: ADDR_A, mood: "" },
                arrow: true, arrowHot: true, op: "20 쓰기", opKind: "write",
                out: ["*p = 10"], tone: "warn",
                msg: "*p = 20; - 화살표를 따라가 a 자리에 20을 씁니다. " +
                    "p를 통해 a를 간접적으로 바꿨습니다!",
                pic: "a의 값이 20으로 바뀜"
            }
        ];
    }

    /* 탭2: int a=1, b=2; swap(&a, &b); */
    function makeSwapSteps() {
        return [
            {
                lines: [], a: null, b: null, frame: false, done: false,
                xMood: "", yMood: "", temp: null, tempMood: "",
                hotArrows: [], out: [], tone: "",
                msg: "다음 단계를 누르면 swap 예제가 한 줄씩 실행됩니다.",
                pic: "메모리가 비어 있습니다"
            },
            {
                lines: [6],
                a: { val: 1, mood: "hot" }, b: { val: 2, mood: "hot" },
                frame: false, done: false,
                xMood: "", yMood: "", temp: null, tempMood: "",
                hotArrows: [], out: [], tone: "info",
                msg: "int a = 1, b = 2; - main의 변수 a, b가 만들어집니다.",
                pic: "a 상자에 1, b 상자에 2"
            },
            {
                lines: [7, 1],
                a: { val: 1, mood: "" }, b: { val: 2, mood: "" },
                frame: true, done: false,
                xMood: "hot", yMood: "hot", temp: null, tempMood: "",
                hotArrows: ["x", "y"], out: [], tone: "info",
                msg: "swap(&a, &b) 호출 - 값이 아니라 주소가 전달됩니다. " +
                    "포인터 x는 a를, y는 b를 가리킵니다.",
                pic: "swap 프레임이 생기고 x는 a를, y는 b를 가리킴"
            },
            {
                lines: [2],
                a: { val: 1, mood: "" }, b: { val: 2, mood: "" },
                frame: true, done: false,
                xMood: "", yMood: "", temp: 1, tempMood: "hot",
                hotArrows: ["x"], out: [], tone: "info",
                msg: "int temp = *x; - x의 화살표를 따라가 a의 값 1을 " +
                    "temp에 복사해 둡니다.",
                pic: "temp 상자에 1이 저장됨"
            },
            {
                lines: [3],
                a: { val: 2, mood: "warn" }, b: { val: 2, mood: "" },
                frame: true, done: false,
                xMood: "", yMood: "", temp: 1, tempMood: "",
                hotArrows: ["x", "y"], out: [], tone: "warn",
                msg: "*x = *y; - y가 가리키는 b의 값 2를 읽어, x가 가리키는 " +
                    "a에 씁니다. a가 2가 됐습니다!",
                pic: "a의 값이 2로 바뀜"
            },
            {
                lines: [4],
                a: { val: 2, mood: "" }, b: { val: 1, mood: "warn" },
                frame: true, done: false,
                xMood: "", yMood: "", temp: 1, tempMood: "",
                hotArrows: ["y"], out: [], tone: "warn",
                msg: "*y = temp; - 복사해 둔 1을 y가 가리키는 b에 씁니다. " +
                    "b가 1이 됐습니다!",
                pic: "b의 값이 1로 바뀜"
            },
            {
                lines: [8],
                a: { val: 2, mood: "tip" }, b: { val: 1, mood: "tip" },
                frame: false, done: true,
                xMood: "", yMood: "", temp: null, tempMood: "",
                hotArrows: [], out: ["a=2, b=1"], tone: "tip",
                msg: "반환 후 a=2, b=1. 값 복사가 아니라 주소를 넘겼기 때문에 " +
                    "swap이 원본 a, b를 직접 바꿀 수 있었습니다. " +
                    "scanf에 &를 붙이는 이유도 같습니다.",
                pic: "a는 2, b는 1로 맞바뀜"
            }
        ];
    }

    /* 다음 단계 인덱스 (마지막이면 그대로) */
    function nextIndex(idx, len) {
        return idx < len - 1 ? idx + 1 : idx;
    }

    /* 마지막 단계인지 (다음 버튼 비활성 판정) */
    function isLast(idx, len) {
        return idx >= len - 1;
    }

    /* ------------------------------------------------------------------
       SVG 그리기 (viewBox 기반, 픽셀 측정 없음)
       - 모든 텍스트는 위젯 내부 상수라 innerHTML에 넣어도 안전하다.
       ------------------------------------------------------------------ */
    function r1(n) {
        return Math.round(n * 10) / 10;
    }

    function moodCls(mood) {
        return mood ? " cpv-svg-box--" + mood : "";
    }

    function valCls(mood) {
        return mood ? " cpv-svg-val--" + mood : "";
    }

    /* 화살표(선 + 머리). 끝점 (x2, y2)가 대상 상자 가장자리에 닿는다. */
    function arrowMarkup(x1, y1, x2, y2, hot) {
        var ang = Math.atan2(y2 - y1, x2 - x1);
        var size = 9;
        var spread = 0.42;
        var cls = hot ? " is-hot" : "";
        var lx2 = r1(x2 - (size - 2) * Math.cos(ang));
        var ly2 = r1(y2 - (size - 2) * Math.sin(ang));
        var hx1 = r1(x2 - size * Math.cos(ang - spread));
        var hy1 = r1(y2 - size * Math.sin(ang - spread));
        var hx2 = r1(x2 - size * Math.cos(ang + spread));
        var hy2 = r1(y2 - size * Math.sin(ang + spread));
        return '<line class="cpv-svg-arrow' + cls + '" x1="' + x1 + '" y1="' +
            y1 + '" x2="' + lx2 + '" y2="' + ly2 + '"></line>' +
            '<polygon class="cpv-svg-head' + cls + '" points="' + x2 + "," +
            y2 + " " + hx1 + "," + hy1 + " " + hx2 + "," + hy2 + '"></polygon>';
    }

    /* 탭1 메모리 그림: a 상자(오른쪽 위), p 상자(왼쪽 아래), p -> a 화살표 */
    function basicSvg(st) {
        var s = '<svg viewBox="0 0 360 200" role="img" aria-label="' +
            st.pic + '" focusable="false">';
        if (!st.a && !st.p) {
            s += '<text class="cpv-svg-empty" x="180" y="92" text-anchor="middle">아직 메모리에 아무것도 없습니다</text>';
            s += '<text class="cpv-svg-empty" x="180" y="112" text-anchor="middle">다음 단계를 눌러 보세요</text>';
            return s + "</svg>";
        }
        if (st.a) {
            s += '<text class="cpv-svg-name" x="182" y="17">a (int)</text>';
            s += '<rect class="cpv-svg-box' + moodCls(st.a.mood) +
                '" x="180" y="24" width="160" height="58" rx="8"></rect>';
            s += '<text class="cpv-svg-val' + valCls(st.a.mood) +
                '" x="260" y="53" text-anchor="middle">' + st.a.val + "</text>";
            s += '<text class="cpv-svg-addr" x="260" y="73" text-anchor="middle">주소 ' +
                ADDR_A + "</text>";
        }
        if (st.p) {
            s += '<text class="cpv-svg-name" x="22" y="119">p (int *)</text>';
            s += '<rect class="cpv-svg-box' + moodCls(st.p.mood) +
                '" x="20" y="126" width="160" height="58" rx="8"></rect>';
            s += '<text class="cpv-svg-val cpv-svg-val--addr' + valCls(st.p.mood) +
                '" x="100" y="155" text-anchor="middle">' + st.p.val + "</text>";
            s += '<text class="cpv-svg-addr" x="100" y="175" text-anchor="middle">주소 ' +
                ADDR_P + "</text>";
        }
        if (st.arrow) {
            s += arrowMarkup(150, 126, 215, 84, st.arrowHot);
        }
        if (st.op) {
            s += '<text class="cpv-svg-op cpv-svg-op--' + st.opKind +
                '" x="228" y="110">' + st.op + "</text>";
        }
        return s + "</svg>";
    }

    /* 탭2 메모리 그림: 위에 a, b / 아래 swap 프레임(x, y, temp) + 화살표 */
    function swapSvg(st) {
        var s = '<svg viewBox="0 0 360 226" role="img" aria-label="' +
            st.pic + '" focusable="false">';
        if (!st.a) {
            s += '<text class="cpv-svg-empty" x="180" y="100" text-anchor="middle">아직 메모리에 아무것도 없습니다</text>';
            s += '<text class="cpv-svg-empty" x="180" y="120" text-anchor="middle">다음 단계를 눌러 보세요</text>';
            return s + "</svg>";
        }
        /* main의 a, b */
        s += '<text class="cpv-svg-name" x="34" y="19">a (int)</text>';
        s += '<rect class="cpv-svg-box' + moodCls(st.a.mood) +
            '" x="32" y="26" width="130" height="52" rx="8"></rect>';
        s += '<text class="cpv-svg-val' + valCls(st.a.mood) +
            '" x="97" y="52" text-anchor="middle">' + st.a.val + "</text>";
        s += '<text class="cpv-svg-addr" x="97" y="70" text-anchor="middle">주소 ' +
            ADDR_A + "</text>";
        s += '<text class="cpv-svg-name" x="200" y="19">b (int)</text>';
        s += '<rect class="cpv-svg-box' + moodCls(st.b.mood) +
            '" x="198" y="26" width="130" height="52" rx="8"></rect>';
        s += '<text class="cpv-svg-val' + valCls(st.b.mood) +
            '" x="263" y="52" text-anchor="middle">' + st.b.val + "</text>";
        s += '<text class="cpv-svg-addr" x="263" y="70" text-anchor="middle">주소 ' +
            ADDR_B + "</text>";

        if (st.frame) {
            s += '<rect class="cpv-svg-frame" x="14" y="112" width="332" height="104" rx="10"></rect>';
            s += '<text class="cpv-svg-framelabel" x="24" y="130">swap 함수 프레임</text>';
            /* 화살표를 상자보다 먼저 그려 상자가 위에 오게 한다 */
            s += arrowMarkup(50, 156, 90, 80, st.hotArrows.indexOf("x") !== -1);
            s += arrowMarkup(156, 156, 255, 80, st.hotArrows.indexOf("y") !== -1);
            /* x */
            s += '<text class="cpv-svg-name" x="74" y="150" text-anchor="middle">x</text>';
            s += '<rect class="cpv-svg-box' + moodCls(st.xMood) +
                '" x="28" y="156" width="92" height="48" rx="8"></rect>';
            s += '<text class="cpv-svg-val cpv-svg-val--addr' + valCls(st.xMood) +
                '" x="74" y="185" text-anchor="middle">' + SHORT_A + "</text>";
            /* y */
            s += '<text class="cpv-svg-name" x="180" y="150" text-anchor="middle">y</text>';
            s += '<rect class="cpv-svg-box' + moodCls(st.yMood) +
                '" x="134" y="156" width="92" height="48" rx="8"></rect>';
            s += '<text class="cpv-svg-val cpv-svg-val--addr' + valCls(st.yMood) +
                '" x="180" y="185" text-anchor="middle">' + SHORT_B + "</text>";
            /* temp */
            s += '<text class="cpv-svg-name" x="286" y="150" text-anchor="middle">temp</text>';
            s += '<rect class="cpv-svg-box' + moodCls(st.tempMood) +
                '" x="240" y="156" width="92" height="48" rx="8"></rect>';
            s += '<text class="cpv-svg-val' + valCls(st.tempMood) +
                '" x="286" y="187" text-anchor="middle">' +
                (st.temp === null ? "?" : st.temp) + "</text>";
        } else if (st.done) {
            s += '<text class="cpv-svg-empty" x="180" y="150" text-anchor="middle">swap 함수 종료 (지역변수 x, y, temp 사라짐)</text>';
        }
        return s + "</svg>";
    }

    /* ------------------------------------------------------------------
       위젯 등록
       ------------------------------------------------------------------ */
    window.SIM.register("c-pointer-vis", {
        title: "포인터 시각화 (& 와 *)",
        /* node 테스트에서 순수 로직에 접근하기 위한 노출 */
        logic: {
            ADDR_A: ADDR_A,
            ADDR_P: ADDR_P,
            ADDR_B: ADDR_B,
            BASIC_CODE: BASIC_CODE,
            SWAP_CODE: SWAP_CODE,
            makeBasicSteps: makeBasicSteps,
            makeSwapSteps: makeSwapSteps,
            nextIndex: nextIndex,
            isLast: isLast,
            basicSvg: basicSvg,
            swapSvg: swapSvg
        },
        build: function (root) {
            var scenario = "basic";
            var steps = makeBasicSteps();
            var idx = 0;
            var i;

            root.innerHTML = ""
                + '<div class="sim__tabs" role="tablist">'
                +     '<button type="button" class="sim__tab active" data-tab="basic" role="tab" aria-selected="true">기본 (&amp;a 와 *p)</button>'
                +     '<button type="button" class="sim__tab" data-tab="swap" role="tab" aria-selected="false">swap(&amp;a, &amp;b)</button>'
                + '</div>'
                + '<div class="cpv-layout">'
                +     '<div class="cpv-code" role="group" aria-label="C 예제 코드"></div>'
                +     '<div class="cpv-diagram"></div>'
                + '</div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary" data-act="next" aria-label="다음 단계 실행">다음 단계</button>'
                +     '<button type="button" class="sim__btn" data-act="reset" aria-label="처음부터 다시 시작">처음부터</button>'
                +     '<span class="cpv-count" aria-hidden="true"></span>'
                + '</div>'
                + '<p class="cpv-outlabel">printf 출력</p>'
                + '<pre class="sim__out cpv-out" aria-live="polite" aria-label="printf 출력 결과"></pre>'
                + '<p class="cpv-msg" role="status" aria-live="polite"></p>'
                + '<p class="sim__note">&amp;변수 = 그 변수의 <strong>주소</strong>를 구한다 / '
                + '*포인터 = 가리키는 곳의 <strong>값</strong>을 읽고 쓴다. '
                + 'scanf("%d", &amp;n)에 &amp;를 붙이는 이유: scanf가 내 변수가 있는 곳(주소)에 '
                + '값을 써넣어야 하기 때문이다.</p>';

            var tabEls = root.querySelectorAll(".sim__tab");
            var codeEl = root.querySelector(".cpv-code");
            var diagramEl = root.querySelector(".cpv-diagram");
            var nextBtn = root.querySelector('[data-act="next"]');
            var resetBtn = root.querySelector('[data-act="reset"]');
            var countEl = root.querySelector(".cpv-count");
            var outEl = root.querySelector(".cpv-out");
            var msgEl = root.querySelector(".cpv-msg");

            /* 시나리오의 코드 줄을 다시 그린다 (textContent로만 주입) */
            function renderCode() {
                var lines = scenario === "basic" ? BASIC_CODE : SWAP_CODE;
                var j, row, ln, code;
                while (codeEl.firstChild) {
                    codeEl.removeChild(codeEl.firstChild);
                }
                for (j = 0; j < lines.length; j++) {
                    row = document.createElement("div");
                    row.className = "cpv-line";
                    ln = document.createElement("span");
                    ln.className = "cpv-ln";
                    ln.setAttribute("aria-hidden", "true");
                    ln.textContent = String(j + 1);
                    code = document.createElement("code");
                    code.textContent = lines[j];
                    row.appendChild(ln);
                    row.appendChild(code);
                    codeEl.appendChild(row);
                }
            }

            function render() {
                var st = steps[idx];
                var rows = codeEl.querySelectorAll(".cpv-line");
                var j, active;
                for (j = 0; j < rows.length; j++) {
                    active = st.lines.indexOf(j + 1) !== -1;
                    if (active) {
                        rows[j].classList.add("is-active");
                    } else {
                        rows[j].classList.remove("is-active");
                    }
                }
                diagramEl.innerHTML =
                    scenario === "basic" ? basicSvg(st) : swapSvg(st);
                outEl.textContent =
                    st.out.length ? st.out.join("\n") : "(아직 출력 없음)";
                msgEl.textContent = st.msg;
                msgEl.className =
                    "cpv-msg" + (st.tone ? " cpv-msg--" + st.tone : "");
                countEl.textContent = "단계 " + idx + "/" + (steps.length - 1);
                nextBtn.disabled = isLast(idx, steps.length);
            }

            function setScenario(name) {
                var j, sel;
                scenario = name;
                steps = name === "basic" ? makeBasicSteps() : makeSwapSteps();
                idx = 0;
                for (j = 0; j < tabEls.length; j++) {
                    sel = tabEls[j].getAttribute("data-tab") === name;
                    if (sel) {
                        tabEls[j].classList.add("active");
                    } else {
                        tabEls[j].classList.remove("active");
                    }
                    tabEls[j].setAttribute("aria-selected", sel ? "true" : "false");
                }
                renderCode();
                render();
            }

            function onTabClick(ev) {
                var name = ev.currentTarget.getAttribute("data-tab");
                if (name !== scenario) {
                    setScenario(name);
                }
            }

            for (i = 0; i < tabEls.length; i++) {
                tabEls[i].addEventListener("click", onTabClick);
            }
            nextBtn.addEventListener("click", function () {
                idx = nextIndex(idx, steps.length);
                render();
            });
            resetBtn.addEventListener("click", function () {
                idx = 0;
                render();
            });

            renderCode();
            render();
        }
    });
})();

/* sim:c-ptr-array - 배열과 포인터: arr[i] = *(arr+i) */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* 정수를 0x.. 16진 문자열로 (영문자는 대문자) */
        hex: function (n) {
            return "0x" + n.toString(16).toUpperCase();
        },
        /* i번째 원소의 주소 = base + size*i */
        addr: function (base, size, i) {
            return base + size * i;
        },
        /* i번째 원소에 대한 세 표기(arr[i], *(arr+i), *(p+i)) 평가 자료.
           범위 밖 i면 null */
        evalCase: function (arr, base, size, i) {
            if (typeof i !== "number" || i !== Math.floor(i)) return null;
            if (i < 0 || i >= arr.length) return null;
            var a = this.addr(base, size, i);
            return {
                i: i,
                addr: a,
                addrHex: this.hex(a),
                calc: this.hex(base) + " + " + i + "×" + size + " = " + this.hex(a),
                value: arr[i]
            };
        },
        /* p++ 한 번. 배열 끝 다음 칸(len)까지만 이동하고 그 뒤로는 멈춘다 */
        pNext: function (len, pIndex) {
            var next = pIndex + 1;
            if (next > len) next = len;
            return { pIndex: next, over: next >= len };
        },
        /* 현재 p 상태: 주소와 *p 값(범위 밖이면 value: null, over: true) */
        pInfo: function (arr, base, size, pIndex) {
            var a = this.addr(base, size, pIndex);
            if (pIndex < 0 || pIndex >= arr.length) {
                return { addrHex: this.hex(a), over: true, value: null };
            }
            return { addrHex: this.hex(a), over: false, value: arr[pIndex] };
        }
    };

    /* 본문 12장 예제 그대로: int arr[3] = {10, 20, 30}; int *p = arr; */
    var ARR = [10, 20, 30];
    var BASE = 0x100;
    var SIZE = 4;

    window.SIM.register("c-ptr-array", {
        title: "배열과 포인터: arr[i] = *(arr+i)",
        _logic: logic,
        build: function (root) {
            var i;

            var cells = "";
            for (i = 0; i < ARR.length; i++) {
                cells += '<div class="cpa-cell" data-i="' + i + '">'
                    + '<span class="cpa-cell__idx">arr[' + i + ']</span>'
                    + '<span class="cpa-cell__val">' + ARR[i] + '</span>'
                    + '<span class="cpa-cell__addr">' + logic.hex(logic.addr(BASE, SIZE, i)) + '</span>'
                    + '</div>';
            }
            cells += '<div class="cpa-cell cpa-cell--ghost">'
                + '<span class="cpa-cell__idx">범위 밖</span>'
                + '<span class="cpa-cell__val">?</span>'
                + '<span class="cpa-cell__addr">' + logic.hex(logic.addr(BASE, SIZE, ARR.length)) + '</span>'
                + '</div>';

            var aslots = "";
            var pslots = "";
            for (i = 0; i <= ARR.length; i++) {
                aslots += '<div class="cpa-aslot">'
                    + (i === 0 ? '<span class="cpa-amark">arr ▼</span>' : "")
                    + '</div>';
                pslots += '<div class="cpa-pslot"><span class="cpa-pmark">▲ p</span></div>';
            }

            var ibtns = "";
            for (i = 0; i < ARR.length; i++) {
                ibtns += '<button type="button" class="sim__btn cpa-ibtn" data-i="' + i + '"'
                    + ' aria-pressed="false" aria-label="i를 ' + i + '로 선택">i = ' + i + '</button>';
            }

            root.innerHTML = ""
                + '<div class="sim__out cpa-decl">int arr[3] = {10, 20, 30};&nbsp;&nbsp;int *p = arr;</div>'
                + '<div class="cpa-mem" role="img" aria-label="메모리 그림: int 배열 arr 세 칸이 주소 0x100, 0x104, 0x108에 4바이트 간격으로 놓여 있고, 화살표 p가 현재 가리키는 칸을 표시한다">'
                +     '<div class="cpa-arow">' + aslots + '</div>'
                +     '<div class="cpa-cells">' + cells + '</div>'
                +     '<div class="cpa-prow">' + pslots + '</div>'
                + '</div>'
                + '<p class="cpa-subhead"><span class="sim__chip">1. 세 표기 비교</span></p>'
                + '<div class="sim__row" role="group" aria-label="인덱스 i 선택">' + ibtns + '</div>'
                + '<p class="sim__note">비교는 p = arr 기준입니다. i 버튼을 누르면 p가 첫 칸(0x100)으로 돌아갑니다.</p>'
                + '<div class="cpa-eval" aria-live="polite">'
                +     '<p class="sim__note">i 버튼을 누르면 arr[i], *(arr + i), *(p + i)가 왜 같은 값인지 단계별로 보여줍니다.</p>'
                + '</div>'
                + '<p class="cpa-subhead"><span class="sim__chip">2. 포인터 증가 (p++)</span></p>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary cpa-pinc" aria-label="포인터 p를 한 칸 증가">p++</button>'
                +     '<button type="button" class="sim__btn cpa-reset" aria-label="포인터 p를 arr로 초기화">초기화 (p = arr)</button>'
                + '</div>'
                + '<div class="cpa-plive" aria-live="polite">'
                +     '<div class="sim__out cpa-pout"></div>'
                +     '<div class="cpa-warn" hidden></div>'
                + '</div>'
                + '<p class="sim__note">배열 이름은 첫 원소의 주소처럼 동작한다. 포인터 산술은 바이트가 아니라 원소 단위!</p>';

            var dataCells = root.querySelectorAll(".cpa-cell[data-i]");
            var pslotEls = root.querySelectorAll(".cpa-pslot");
            var ghostEl = root.querySelector(".cpa-cell--ghost");
            var ibtnEls = root.querySelectorAll(".cpa-ibtn");
            var evalEl = root.querySelector(".cpa-eval");
            var pincBtn = root.querySelector(".cpa-pinc");
            var resetBtn = root.querySelector(".cpa-reset");
            var poutEl = root.querySelector(".cpa-pout");
            var warnEl = root.querySelector(".cpa-warn");

            var state = { sel: -1, pIndex: 0 };

            function update() {
                var k;
                for (k = 0; k < dataCells.length; k++) {
                    if (k === state.sel) {
                        dataCells[k].classList.add("is-sel");
                    } else {
                        dataCells[k].classList.remove("is-sel");
                    }
                }
                for (k = 0; k < pslotEls.length; k++) {
                    if (k === state.pIndex) {
                        pslotEls[k].classList.add("is-here");
                    } else {
                        pslotEls[k].classList.remove("is-here");
                    }
                }
                for (k = 0; k < ibtnEls.length; k++) {
                    ibtnEls[k].setAttribute("aria-pressed", k === state.sel ? "true" : "false");
                }

                var info = logic.pInfo(ARR, BASE, SIZE, state.pIndex);
                if (info.over) {
                    ghostEl.classList.add("is-over");
                    poutEl.textContent = "p = " + info.addrHex + " (배열 끝 다음 칸)   *p = ? (읽으면 안 됨)";
                    warnEl.textContent = "경고: p가 배열의 끝을 넘었습니다! " + info.addrHex
                        + "는 arr 범위 밖이라 *p로 값을 읽으면 정의되지 않은 동작(UB)입니다. "
                        + "초기화 버튼으로 p = arr로 되돌리세요.";
                    warnEl.hidden = false;
                } else {
                    ghostEl.classList.remove("is-over");
                    poutEl.textContent = "p = " + info.addrHex + " (= &arr[" + state.pIndex + "])   *p = " + info.value;
                    warnEl.hidden = true;
                }
                pincBtn.disabled = info.over;
            }

            function renderEval(idx) {
                var c = logic.evalCase(ARR, BASE, SIZE, idx);
                if (!c) return;
                evalEl.innerHTML = ""
                    + '<div class="cpa-step"><span class="cpa-no">1</span><span class="cpa-step__txt">'
                    +     '주소 계산: <code>arr + ' + c.i + '</code> = ' + c.calc
                    +     ' <span class="cpa-key">(주소 연산은 자료형 크기 단위!)</span>'
                    + '</span></div>'
                    + '<div class="cpa-step"><span class="cpa-no">2</span><span class="cpa-step__txt">'
                    +     '역참조: <code>*(' + c.addrHex + ')</code> = <strong>' + c.value + '</strong>'
                    +     ' (그 주소에 든 값을 꺼냄)'
                    + '</span></div>'
                    + '<div class="cpa-step"><span class="cpa-no">3</span><span class="cpa-step__txt">'
                    +     '<code>arr[' + c.i + ']</code>와 동일! <code>p = arr</code>이므로 <code>*(p + ' + c.i + ')</code>도 같은 계산입니다.'
                    + '</span></div>'
                    + '<div class="cpa-chain">'
                    +     '<code>arr[' + c.i + ']</code><span class="cpa-eq">=</span>'
                    +     '<code>*(arr + ' + c.i + ')</code><span class="cpa-eq">=</span>'
                    +     '<code>*(p + ' + c.i + ')</code><span class="cpa-eq">=</span>'
                    +     '<strong class="cpa-val">' + c.value + '</strong>'
                    + '</div>';
            }

            function bindIBtn(idx) {
                ibtnEls[idx].addEventListener("click", function () {
                    state.sel = idx;
                    state.pIndex = 0;
                    renderEval(idx);
                    update();
                });
            }
            for (i = 0; i < ibtnEls.length; i++) {
                bindIBtn(i);
            }

            pincBtn.addEventListener("click", function () {
                var r = logic.pNext(ARR.length, state.pIndex);
                state.pIndex = r.pIndex;
                update();
            });

            resetBtn.addEventListener("click", function () {
                state.pIndex = 0;
                update();
            });

            update();
        }
    });
})();

/* sim:c-recursion-stack - 재귀 호출 스택 추적 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* 코드 미니 뷰에서 하이라이트할 줄 번호 */
        LINE_BASE: 2,
        LINE_REC: 3,
        LINE_MAIN: 6,

        /* k! 계산 */
        fact: function (k) {
            var r = 1;
            var i;
            for (i = 2; i <= k; i++) {
                r *= i;
            }
            return r;
        },

        /* 숫자의 한자어 읽기가 받침으로 끝나는지 (조사 선택용)
           일(1)/삼(3)/육(6)/칠(7)/팔(8)과 영(0)/십/백 계열은 받침 있음 */
        hasBatchim: function (num) {
            var d = num % 10;
            return d === 0 || d === 1 || d === 3 || d === 6 || d === 7 || d === 8;
        },
        eulReul: function (num) {
            return logic.hasBatchim(num) ? "을" : "를";
        },
        iGa: function (num) {
            return logic.hasBatchim(num) ? "이" : "가";
        },
        neunEun: function (num) {
            return logic.hasBatchim(num) ? "은" : "는";
        },

        /* 본문 17장 예제와 같은 코드의 미니 뷰 줄 목록 */
        codeLines: function (n) {
            return [
                "int factorial(int n)",
                "{",
                "    if (n <= 1) return 1;          // 종료 조건",
                "    return n * factorial(n - 1);   // 자기 자신 호출",
                "}",
                "",
                "printf(\"" + n + "! = %d\\n\", factorial(" + n + "));"
            ];
        },

        /* factorial(n) 추적 단계 목록.
           각 단계는 화면 전체 상태를 기술한다:
           { line, frames(아래->위 순서), retValue, result, narration }
           frame: { k, status: "active"|"waiting"|"base", detail } */
        buildSteps: function (n) {
            var steps = [];
            var frames;
            var k;
            var fk;
            var fk1;
            var fn = logic.fact(n);

            /* from부터 to까지(내림차순) 결과 대기 중인 프레임 목록 */
            function waiting(from, to) {
                var arr = [];
                var j;
                for (j = from; j >= to; j--) {
                    arr.push({
                        k: j,
                        status: "waiting",
                        detail: j + " x factorial(" + (j - 1) + ") 결과 대기"
                    });
                }
                return arr;
            }

            /* 0단계: 호출 전 */
            steps.push({
                line: -1,
                frames: [],
                retValue: null,
                result: null,
                narration: "아직 호출 전이다. \"다음 단계\"를 누르면 main이 factorial("
                    + n + ")" + logic.eulReul(n) + " 호출한다."
            });

            /* 1단계: main이 factorial(n) 호출 */
            steps.push({
                line: logic.LINE_MAIN,
                frames: [{ k: n, status: "active", detail: "n = " + n }],
                retValue: null,
                result: null,
                narration: "main이 factorial(" + n + ")" + logic.eulReul(n)
                    + " 호출한다. 스택에 첫 프레임이 쌓인다."
            });

            /* 호출 단계: factorial(k)가 factorial(k-1)을 부른다 (k = n..2) */
            for (k = n; k >= 2; k--) {
                frames = waiting(n, k);
                frames.push({ k: k - 1, status: "active", detail: "n = " + (k - 1) });
                steps.push({
                    line: logic.LINE_REC,
                    frames: frames,
                    retValue: null,
                    result: null,
                    narration: "factorial(" + k + ")" + logic.neunEun(k)
                        + " n <= 1이 거짓이라 " + k + " x factorial(" + (k - 1) + ")"
                        + logic.eulReul(k - 1) + " 계산하려고 자신을 다시 부른다."
                });
            }

            /* 기저 조건 도달 */
            frames = waiting(n, 2);
            frames.push({ k: 1, status: "base", detail: "n <= 1 참 -> return 1" });
            steps.push({
                line: logic.LINE_BASE,
                frames: frames,
                retValue: null,
                result: null,
                narration: "factorial(1)은 n <= 1이 참! 기저 조건에 도달했다. "
                    + "더 부르지 않고 1을 반환할 차례다."
            });

            /* 반환 단계: factorial(k)가 k!을 돌려주며 사라진다 (k = 1..n-1) */
            for (k = 1; k <= n - 1; k++) {
                fk = logic.fact(k);
                fk1 = logic.fact(k + 1);
                frames = waiting(n, k + 2);
                frames.push({
                    k: k + 1,
                    status: "active",
                    detail: (k + 1) + " x " + fk + " = " + fk1
                });
                steps.push({
                    line: k === 1 ? logic.LINE_BASE : logic.LINE_REC,
                    frames: frames,
                    retValue: fk,
                    result: null,
                    narration: "factorial(" + k + ")" + logic.iGa(k) + " " + fk
                        + logic.eulReul(fk) + " 반환하며 프레임이 사라진다. 기다리던 factorial("
                        + (k + 1) + ")" + logic.neunEun(k + 1) + " " + (k + 1) + " x " + fk
                        + " = " + fk1 + logic.eulReul(fk1) + " 계산한다."
                });
            }

            /* 마지막: factorial(n)이 n!을 main에 반환 */
            steps.push({
                line: logic.LINE_MAIN,
                frames: [],
                retValue: fn,
                result: fn,
                narration: "factorial(" + n + ")" + logic.iGa(n) + " " + fn
                    + logic.eulReul(fn) + " main에 반환하고 스택이 모두 비었다. 최종 결과: "
                    + n + "! = " + fn
            });

            return steps;
        }
    };

    window.SIM.register("c-recursion-stack", {
        title: "재귀 호출 스택 추적",
        _logic: logic,
        build: function (root) {
            var n = 5;
            var steps = logic.buildSteps(n);
            var idx = 0;
            var lineEls = [];

            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="rs-nlabel">factorial(n)의 n = '
                +         '<select class="sim__select rs-n" aria-label="팩토리얼에 넣을 n 값 선택">'
                +             '<option value="3">3</option>'
                +             '<option value="4">4</option>'
                +             '<option value="5" selected>5</option>'
                +             '<option value="6">6</option>'
                +         '</select>'
                +     '</label>'
                +     '<button type="button" class="sim__btn sim__btn--primary rs-next" aria-label="다음 단계 실행">다음 단계</button>'
                +     '<button type="button" class="sim__btn rs-reset" aria-label="처음부터 다시 시작">처음부터</button>'
                +     '<span class="sim__chip rs-step"></span>'
                + '</div>'
                + '<div class="rs-layout">'
                +     '<div class="rs-code" aria-label="factorial 함수 코드"></div>'
                +     '<div class="rs-stackwrap">'
                +         '<div class="rs-stacktitle">호출 스택 (위가 최신)</div>'
                +         '<div class="rs-ret" hidden></div>'
                +         '<div class="rs-stack"></div>'
                +         '<div class="rs-mainbar">main()</div>'
                +     '</div>'
                + '</div>'
                + '<div class="sim__out rs-narration" aria-live="polite"></div>'
                + '<div class="sim__out rs-result" hidden></div>'
                + '<div class="rs-warn" hidden>기저 조건이 없으면? <code>if (n &lt;= 1)</code> 줄을 빠뜨리면 '
                +     '호출이 끝없이 쌓여 스택이 넘친다(stack overflow). 재귀 함수는 종료 조건부터 챙기자.</div>'
                + '<p class="sim__note">프레임은 호출 순서대로 쌓이고(LIFO), 반환값은 역순으로 한 칸씩 아래로 전달된다.</p>';

            var selectEl = root.querySelector(".rs-n");
            var nextBtn = root.querySelector(".rs-next");
            var resetBtn = root.querySelector(".rs-reset");
            var stepEl = root.querySelector(".rs-step");
            var codeEl = root.querySelector(".rs-code");
            var stackEl = root.querySelector(".rs-stack");
            var retEl = root.querySelector(".rs-ret");
            var narrEl = root.querySelector(".rs-narration");
            var resultEl = root.querySelector(".rs-result");
            var warnEl = root.querySelector(".rs-warn");

            function renderCode() {
                var lines = logic.codeLines(n);
                var i;
                var div;
                codeEl.innerHTML = "";
                lineEls = [];
                for (i = 0; i < lines.length; i++) {
                    div = document.createElement("div");
                    div.className = "rs-codeline";
                    div.textContent = lines[i] === "" ? " " : lines[i];
                    codeEl.appendChild(div);
                    lineEls.push(div);
                }
            }

            function render() {
                var step = steps[idx];
                var i;
                var f;
                var box;
                var name;
                var det;
                var empty;

                /* 코드 줄 하이라이트 */
                for (i = 0; i < lineEls.length; i++) {
                    lineEls[i].className = i === step.line
                        ? "rs-codeline rs-codeline--on"
                        : "rs-codeline";
                }

                /* 스택 프레임 (위가 최신이므로 역순 렌더) */
                stackEl.innerHTML = "";
                if (step.frames.length === 0) {
                    empty = document.createElement("div");
                    empty.className = "rs-empty";
                    empty.textContent = "(비어 있음)";
                    stackEl.appendChild(empty);
                } else {
                    for (i = step.frames.length - 1; i >= 0; i--) {
                        f = step.frames[i];
                        box = document.createElement("div");
                        box.className = "rs-frame rs-frame--" + f.status;
                        name = document.createElement("div");
                        name.className = "rs-frame__name";
                        name.textContent = "factorial(" + f.k + ")";
                        det = document.createElement("div");
                        det.className = "rs-frame__detail";
                        det.textContent = f.detail;
                        box.appendChild(name);
                        box.appendChild(det);
                        stackEl.appendChild(box);
                    }
                }

                /* 아래로 전달되는 반환값 배지 */
                if (step.retValue !== null) {
                    retEl.hidden = false;
                    retEl.textContent = "반환값 " + step.retValue + " ↓";
                } else {
                    retEl.hidden = true;
                    retEl.textContent = "";
                }

                /* 내레이션 / 최종 결과 / 경고 */
                narrEl.textContent = step.narration;
                if (step.result !== null) {
                    resultEl.hidden = false;
                    resultEl.textContent = n + "! = " + step.result;
                    warnEl.hidden = false;
                } else {
                    resultEl.hidden = true;
                    resultEl.textContent = "";
                    warnEl.hidden = true;
                }

                stepEl.textContent = "단계 " + idx + " / " + (steps.length - 1);
                nextBtn.disabled = idx >= steps.length - 1;
            }

            nextBtn.addEventListener("click", function () {
                if (idx < steps.length - 1) {
                    idx += 1;
                    render();
                }
            });

            resetBtn.addEventListener("click", function () {
                idx = 0;
                render();
            });

            selectEl.addEventListener("change", function () {
                var v = parseInt(selectEl.value, 10);
                if (isNaN(v) || v < 3 || v > 6) v = 5;
                n = v;
                steps = logic.buildSteps(n);
                idx = 0;
                renderCode();
                render();
            });

            renderCode();
            render();
        }
    });
})();

/* sim:ai-ml3-quiz - 학습 방식 3종 분류 퀴즈 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var TYPES = [
        { key: "sup", name: "지도학습" },
        { key: "unsup", name: "비지도학습" },
        { key: "rl", name: "강화학습" }
    ];

    /* 문제 은행 9개 (본문 4장 기준)
       answer: sup(지도) / unsup(비지도) / rl(강화)
       why: 레이블 유무·보상 근거 해설
       sub/subWhy: 지도학습일 때만 분류/회귀 구분 보조 */
    var BANK = [
        {
            text: "'스팸/정상' 라벨을 단 메일 데이터로 스팸 분류기를 학습시킨다.",
            answer: "sup",
            why: "'스팸/정상'이라는 정답 레이블이 입력과 함께 주어진다. 정답지를 보며 배우는 지도학습이다.",
            sub: "분류",
            subWhy: "스팸이냐 정상이냐, 카테고리를 맞히는 문제라서 분류다."
        },
        {
            text: "과거 거래 데이터를 바탕으로 어떤 집의 가격을 예측하는 모델을 만든다.",
            answer: "sup",
            why: "과거 거래(입력)와 실제 거래 가격(정답)이 짝으로 주어진다. 정답이 있으니 지도학습이다.",
            sub: "회귀",
            subWhy: "집값이라는 연속 수치를 예측하는 문제라서 회귀다."
        },
        {
            text: "쇼핑몰 고객을 구매 패턴에 따라 자동으로 몇 개 그룹으로 나눈다.",
            answer: "unsup",
            why: "정답 레이블이 없다. 비슷한 고객끼리 스스로 묶어 숨은 구조를 찾는 비지도학습(군집화)이다."
        },
        {
            text: "알파고가 수많은 대국을 반복하며 이기는 수를 스스로 배운다.",
            answer: "rl",
            why: "정답지 대신 승패라는 보상이 있다. 보상을 최대화하는 수를 시행착오로 배우는 강화학습이다."
        },
        {
            text: "사진 1만 장에 '고양이/강아지' 라벨을 붙여 학습시킨 뒤 새 사진을 구분한다.",
            answer: "sup",
            why: "'고양이/강아지'라는 정답 레이블이 붙은 데이터로 배운다. 정답이 있으니 지도학습이다.",
            sub: "분류",
            subWhy: "고양이냐 강아지냐, 카테고리를 맞히는 문제라서 분류다."
        },
        {
            text: "과거 날씨 데이터로 내일 기온을 예측하는 모델을 만든다.",
            answer: "sup",
            why: "과거 데이터(입력)와 실제 기온(정답)이 짝으로 주어진다. 정답이 있으니 지도학습이다.",
            sub: "회귀",
            subWhy: "기온이라는 연속 수치를 예측하는 문제라서 회귀다."
        },
        {
            text: "로봇이 수없이 넘어지면서 스스로 걷는 법을 터득한다.",
            answer: "rl",
            why: "정답 동작을 알려주는 레이블이 없다. 넘어지면 벌점, 잘 걸으면 보상을 받으며 전략을 터득하는 강화학습이다."
        },
        {
            text: "정답 없이 고차원 데이터의 차원을 줄여 핵심 정보만 남게 요약한다.",
            answer: "unsup",
            why: "정답 레이블 없이 데이터 자체의 구조를 요약한다. 비지도학습의 대표 작업인 차원 축소다."
        },
        {
            text: "게임 점수를 보상으로 삼아 점수를 최대화하는 플레이 전략을 학습한다.",
            answer: "rl",
            why: "게임 점수가 곧 보상이다. 보상을 최대화하는 전략을 시행착오로 배우는 강화학습이다."
        }
    ];

    var logic = {
        types: TYPES,
        bank: BANK,

        /* key -> 한국어 이름 */
        nameOf: function (key) {
            var i;
            for (i = 0; i < TYPES.length; i++) {
                if (TYPES[i].key === key) return TYPES[i].name;
            }
            return "";
        },

        /* Fisher-Yates 셔플 (원본 보존, rng는 [0,1) 함수) */
        shuffle: function (arr, rng) {
            var a = arr.slice();
            var i, j, tmp;
            for (i = a.length - 1; i > 0; i--) {
                j = Math.floor(rng() * (i + 1));
                tmp = a[i];
                a[i] = a[j];
                a[j] = tmp;
            }
            return a;
        },

        /* 9문제 덱 생성 (순서 셔플) */
        makeDeck: function (rng) {
            return this.shuffle(BANK, rng);
        },

        /* 선택 판정: 정오 + 해설 + (지도학습이면) 분류/회귀 보조 정보 */
        judge: function (q, key) {
            return {
                correct: q.answer === key,
                answerName: this.nameOf(q.answer),
                why: q.why,
                sub: q.sub || null,
                subWhy: q.subWhy || null
            };
        },

        /* 점수대별 마무리 멘트 */
        grade: function (score, total) {
            var r = total > 0 ? score / total : 0;
            if (r === 1) return "만점! 레이블 유무와 보상 기준을 완벽하게 잡았다.";
            if (r >= 0.7) return "좋은 점수. 틀린 시나리오만 해설을 한 번 더 읽어 보자.";
            if (r >= 0.4) return "절반쯤 왔다. 먼저 정답(레이블)이 있는지부터 따지는 습관을 들이자.";
            return "아직 낯설다. 본문 4장의 세 방식 비교표를 먼저 훑고 다시 도전하자.";
        }
    };

    window.SIM.register("ai-ml3-quiz", {
        title: "학습 방식 3종 분류 퀴즈",
        _logic: logic,
        build: function (root) {
            var state = { deck: [], index: 0, score: 0, answered: false };

            root.innerHTML = ""
                + '<div class="sim__row mq-bar">'
                +     '<span class="sim__chip mq-progress">문제 1 / 9</span>'
                +     '<span class="sim__chip mq-score">점수 0</span>'
                +     '<button type="button" class="sim__btn mq-restart" aria-label="퀴즈 처음부터 다시 시작">다시 시작</button>'
                + '</div>'
                + '<div class="mq-quiz">'
                +     '<p class="mq-ask">이 시나리오는 어떤 학습 방식일까?</p>'
                +     '<div class="mq-scenario"></div>'
                +     '<div class="mq-choices" role="group" aria-label="학습 방식 선택">'
                +         '<button type="button" class="mq-choice" data-key="sup" aria-label="지도학습 선택">지도학습</button>'
                +         '<button type="button" class="mq-choice" data-key="unsup" aria-label="비지도학습 선택">비지도학습</button>'
                +         '<button type="button" class="mq-choice" data-key="rl" aria-label="강화학습 선택">강화학습</button>'
                +     '</div>'
                +     '<div class="mq-feedback" aria-live="polite"></div>'
                +     '<div class="sim__row mq-nav">'
                +         '<button type="button" class="sim__btn sim__btn--primary mq-next" hidden>다음 문제</button>'
                +     '</div>'
                + '</div>'
                + '<div class="mq-result" aria-live="polite" hidden></div>'
                + '<p class="sim__note">구분 요령: 정답(레이블)이 있으면 지도학습, 정답 없이 구조를 찾으면 비지도학습, 정답 대신 보상이 있으면 강화학습.</p>';

            var progressEl = root.querySelector(".mq-progress");
            var scoreEl = root.querySelector(".mq-score");
            var restartBtn = root.querySelector(".mq-restart");
            var quizEl = root.querySelector(".mq-quiz");
            var scenarioEl = root.querySelector(".mq-scenario");
            var choiceBtns = root.querySelectorAll(".mq-choice");
            var feedbackEl = root.querySelector(".mq-feedback");
            var nextBtn = root.querySelector(".mq-next");
            var resultEl = root.querySelector(".mq-result");

            function updateBar() {
                progressEl.textContent = "문제 " + (state.index + 1) + " / " + state.deck.length;
                scoreEl.textContent = "점수 " + state.score;
            }

            /* 판정 + 해설 + (지도학습이면) 분류/회귀 보조 칩 표시 */
            function renderFeedback(result) {
                var verdict = document.createElement("p");
                var why = document.createElement("p");
                var subRow, subChip, subWhy;

                feedbackEl.innerHTML = "";

                verdict.className = "mq-verdict " + (result.correct ? "is-ok" : "is-bad");
                verdict.textContent = result.correct
                    ? "정답! " + result.answerName
                    : "오답. 정답은 " + result.answerName + ".";
                feedbackEl.appendChild(verdict);

                why.className = "mq-why";
                why.textContent = result.why;
                feedbackEl.appendChild(why);

                if (result.sub) {
                    subRow = document.createElement("div");
                    subRow.className = "mq-subrow";
                    subChip = document.createElement("span");
                    subChip.className = "sim__chip";
                    subChip.textContent = "지도학습 세부: " + result.sub;
                    subWhy = document.createElement("span");
                    subWhy.className = "mq-subwhy";
                    subWhy.textContent = result.subWhy;
                    subRow.appendChild(subChip);
                    subRow.appendChild(subWhy);
                    feedbackEl.appendChild(subRow);
                }
            }

            function onChoice(ev) {
                if (state.answered) return;
                state.answered = true;

                var picked = ev.currentTarget;
                var key = picked.getAttribute("data-key");
                var q = state.deck[state.index];
                var result = logic.judge(q, key);
                var i, b;

                for (i = 0; i < choiceBtns.length; i++) {
                    b = choiceBtns[i];
                    b.disabled = true;
                    if (b.getAttribute("data-key") === q.answer) {
                        b.className = "mq-choice is-correct";
                    } else if (b === picked) {
                        b.className = "mq-choice is-wrong";
                    }
                }

                if (result.correct) state.score++;
                renderFeedback(result);
                updateBar();
                nextBtn.textContent = state.index === state.deck.length - 1 ? "결과 보기" : "다음 문제";
                nextBtn.hidden = false;
            }

            function renderQuestion() {
                var q = state.deck[state.index];
                var i, b;

                state.answered = false;
                updateBar();
                scenarioEl.textContent = q.text;
                feedbackEl.innerHTML = "";
                nextBtn.hidden = true;

                for (i = 0; i < choiceBtns.length; i++) {
                    b = choiceBtns[i];
                    b.disabled = false;
                    b.className = "mq-choice";
                }
            }

            /* 종료 요약: 점수 + 멘트 + 비교표 한 줄 + 다시 풀기 */
            function showResult() {
                var scoreLine = document.createElement("p");
                var gradeLine = document.createElement("p");
                var tableTitle = document.createElement("p");
                var tableWrap = document.createElement("div");
                var table = document.createElement("table");
                var thead = document.createElement("thead");
                var headRow = document.createElement("tr");
                var tbody = document.createElement("tbody");
                var bodyRow = document.createElement("tr");
                var heads = ["지도학습", "비지도학습", "강화학습"];
                var cells = ["정답 있음", "구조 발견", "보상 최대화"];
                var row = document.createElement("div");
                var againBtn = document.createElement("button");
                var i, th, td;

                scoreLine.className = "mq-result-score";
                scoreLine.textContent = "퀴즈 완료: " + state.deck.length + "문제 중 " + state.score + "문제 정답";

                gradeLine.className = "mq-result-grade";
                gradeLine.textContent = logic.grade(state.score, state.deck.length);

                tableTitle.className = "mq-result-title";
                tableTitle.textContent = "세 방식 한 줄 비교";

                for (i = 0; i < heads.length; i++) {
                    th = document.createElement("th");
                    th.textContent = heads[i];
                    headRow.appendChild(th);
                    td = document.createElement("td");
                    td.textContent = cells[i];
                    bodyRow.appendChild(td);
                }
                thead.appendChild(headRow);
                tbody.appendChild(bodyRow);
                table.appendChild(thead);
                table.appendChild(tbody);
                tableWrap.className = "mq-tablewrap";
                tableWrap.appendChild(table);

                row.className = "sim__row";
                againBtn.type = "button";
                againBtn.className = "sim__btn sim__btn--primary";
                againBtn.textContent = "다시 풀기";
                againBtn.setAttribute("aria-label", "퀴즈 다시 풀기");
                againBtn.addEventListener("click", restart);
                row.appendChild(againBtn);

                resultEl.innerHTML = "";
                resultEl.appendChild(scoreLine);
                resultEl.appendChild(gradeLine);
                resultEl.appendChild(tableTitle);
                resultEl.appendChild(tableWrap);
                resultEl.appendChild(row);

                quizEl.hidden = true;
                resultEl.hidden = false;
                updateBar();
            }

            function restart() {
                state.deck = logic.makeDeck(Math.random);
                state.index = 0;
                state.score = 0;
                state.answered = false;
                resultEl.hidden = true;
                resultEl.innerHTML = "";
                quizEl.hidden = false;
                renderQuestion();
            }

            var ci;
            for (ci = 0; ci < choiceBtns.length; ci++) {
                choiceBtns[ci].addEventListener("click", onChoice);
            }

            nextBtn.addEventListener("click", function () {
                if (!state.answered) return;
                if (state.index === state.deck.length - 1) {
                    showResult();
                } else {
                    state.index++;
                    renderQuestion();
                }
            });

            restartBtn.addEventListener("click", restart);

            restart();
        }
    });
})();

/* sim:ai-neuron-lab - 뉴런(가중치) 실험실 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */
    var logic = {
        /* 소수 2자리 반올림 (부동소수점 오차 정리) */
        round2: function (v) {
            return Math.round(v * 100) / 100;
        },
        /* 소수 1자리 반올림 (슬라이더 값 정규화) */
        snap1: function (v) {
            return Math.round(v * 10) / 10;
        },
        /* 가중합 x1*w1 + x2*w2 (2자리 반올림) */
        weightedSum: function (x1, w1, x2, w2) {
            return logic.round2(x1 * w1 + x2 * w2);
        },
        /* 계단 활성화: 가중합이 임계값 이상이면 1, 아니면 0 */
        activate: function (sum, threshold) {
            return sum >= threshold ? 1 : 0;
        },
        /* 숫자 -> 표시 문자열 (2자리 반올림) */
        fmt: function (v) {
            return String(logic.round2(v));
        },
        /* 곱셈 인자 표기: 음수는 괄호로 감싼다 */
        fmtFactor: function (v) {
            var s = logic.fmt(v);
            return v < 0 ? "(" + s + ")" : s;
        },
        /* 가중합 식 문자열: x1xw1 + x2xw2 = 0.8x0.5 + 0.3x(-0.2) = 0.34 */
        equation: function (x1, w1, x2, w2) {
            var sum = logic.weightedSum(x1, w1, x2, w2);
            return "x1xw1 + x2xw2 = "
                + logic.fmt(x1) + "x" + logic.fmtFactor(w1) + " + "
                + logic.fmt(x2) + "x" + logic.fmtFactor(w2)
                + " = " + logic.fmt(sum);
        },
        /* 연결선 굵기: |w|에 비례 (viewBox 좌표 기준) */
        strokeWidth: function (w) {
            return logic.round2(1.5 + Math.abs(w) * 6);
        },
        /* 연결선 색 분류: pos / neg / zero */
        lineKind: function (w) {
            if (w < 0) return "neg";
            if (w === 0) return "zero";
            return "pos";
        },
        /* 판정 문장 */
        statusText: function (sum, threshold) {
            var out = logic.activate(sum, threshold);
            var cmp = out === 1 ? ">=" : "<";
            return "가중합 " + logic.fmt(sum) + " " + cmp + " 임계값 "
                + logic.fmt(threshold) + " → 출력 " + out
                + (out === 1 ? " (켜짐)" : " (꺼짐)");
        }
    };

    var THRESHOLD = 0.5;
    var DEFAULTS = { x1: 0.8, x2: 0.3, w1: 0.5, w2: -0.2 };

    window.SIM.register("ai-neuron-lab", {
        title: "뉴런(가중치) 실험실",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<svg class="nl-svg" viewBox="0 0 340 195" xmlns="http://www.w3.org/2000/svg" role="img"'
                +     ' aria-label="인공 뉴런 다이어그램: 입력 노드 2개가 각각 가중치를 곱해 합산 노드로 모이고, 가중합이 임계값 0.5 이상이면 출력 노드가 켜집니다">'
                +     '<line class="nl-line nl-line--pos" data-ref="line1" x1="45" y1="55" x2="175" y2="95" stroke-width="4.5"></line>'
                +     '<line class="nl-line nl-line--neg" data-ref="line2" x1="45" y1="135" x2="175" y2="95" stroke-width="2.7"></line>'
                +     '<line class="nl-outline" data-ref="lineout" x1="175" y1="95" x2="295" y2="95" stroke-width="3"></line>'
                +     '<circle class="nl-node" cx="45" cy="55" r="22"></circle>'
                +     '<circle class="nl-node" cx="45" cy="135" r="22"></circle>'
                +     '<circle class="nl-node nl-node--sum" cx="175" cy="95" r="27"></circle>'
                +     '<circle class="nl-out-node" data-ref="outnode" cx="295" cy="95" r="24"></circle>'
                +     '<text class="nl-caption" x="45" y="24">입력 x1</text>'
                +     '<text class="nl-caption" x="45" y="170">입력 x2</text>'
                +     '<text class="nl-caption" x="175" y="138">Σ 가중합</text>'
                +     '<text class="nl-caption" x="235" y="83">임계값 0.5</text>'
                +     '<text class="nl-caption" x="295" y="134">출력</text>'
                +     '<text class="nl-wlabel nl-wlabel--pos" data-ref="w1label" x="104" y="59"></text>'
                +     '<text class="nl-wlabel nl-wlabel--neg" data-ref="w2label" x="104" y="133"></text>'
                +     '<text class="nl-text" data-ref="x1text" x="45" y="55"></text>'
                +     '<text class="nl-text" data-ref="x2text" x="45" y="135"></text>'
                +     '<text class="nl-text" data-ref="sumtext" x="175" y="95"></text>'
                +     '<text class="nl-text" data-ref="outtext" x="295" y="95"></text>'
                + '</svg>'
                + '<div class="nl-controls">'
                +     '<div class="nl-group">'
                +         '<p class="nl-group-title">입력 (0 ~ 1)</p>'
                +         '<label class="nl-slider">'
                +             '<span class="nl-slider-label">x1 = <span class="nl-val" data-ref="valx1"></span></span>'
                +             '<input type="range" class="nl-range" data-ref="x1" min="0" max="1" step="0.1" value="0.8" aria-label="입력 x1, 0부터 1까지 0.1 단위">'
                +         '</label>'
                +         '<label class="nl-slider">'
                +             '<span class="nl-slider-label">x2 = <span class="nl-val" data-ref="valx2"></span></span>'
                +             '<input type="range" class="nl-range" data-ref="x2" min="0" max="1" step="0.1" value="0.3" aria-label="입력 x2, 0부터 1까지 0.1 단위">'
                +         '</label>'
                +     '</div>'
                +     '<div class="nl-group">'
                +         '<p class="nl-group-title">가중치 (-1 ~ 1)</p>'
                +         '<label class="nl-slider">'
                +             '<span class="nl-slider-label">w1 = <span class="nl-val" data-ref="valw1"></span></span>'
                +             '<input type="range" class="nl-range" data-ref="w1" min="-1" max="1" step="0.1" value="0.5" aria-label="가중치 w1, -1부터 1까지 0.1 단위">'
                +         '</label>'
                +         '<label class="nl-slider">'
                +             '<span class="nl-slider-label">w2 = <span class="nl-val" data-ref="valw2"></span></span>'
                +             '<input type="range" class="nl-range" data-ref="w2" min="-1" max="1" step="0.1" value="-0.2" aria-label="가중치 w2, -1부터 1까지 0.1 단위">'
                +         '</label>'
                +     '</div>'
                + '</div>'
                + '<div class="nl-result" aria-live="polite">'
                +     '<div class="sim__out nl-eq" data-ref="eq"></div>'
                +     '<div class="nl-status" data-ref="status"></div>'
                + '</div>'
                + '<div class="sim__row nl-mission">'
                +     '<span class="sim__chip">미션: 출력을 1로 켜 보세요</span>'
                +     '<span class="nl-badge" data-ref="badge" role="status" hidden>성공! 가중치를 조정해 뉴런을 켰습니다</span>'
                +     '<button type="button" class="sim__btn nl-reset" data-ref="reset" aria-label="입력과 가중치를 처음 값으로 초기화">초기화</button>'
                + '</div>'
                + '<p class="sim__note">연결선 굵기는 가중치 절댓값 |w|에 비례하고, 음(-)의 가중치는 경고색으로 표시됩니다. 가중합이 임계값 0.5 이상이면 출력이 1로 켜집니다.</p>'
                + '<p class="sim__note">학습이란 오차를 줄이도록 가중치(w)를 조금씩 조정하는 일입니다(역전파, 경사하강법). 이런 뉴런을 층층이 깊게 쌓으면 딥러닝이 됩니다.</p>';

            var ranges = {
                x1: root.querySelector('[data-ref="x1"]'),
                x2: root.querySelector('[data-ref="x2"]'),
                w1: root.querySelector('[data-ref="w1"]'),
                w2: root.querySelector('[data-ref="w2"]')
            };
            var vals = {
                x1: root.querySelector('[data-ref="valx1"]'),
                x2: root.querySelector('[data-ref="valx2"]'),
                w1: root.querySelector('[data-ref="valw1"]'),
                w2: root.querySelector('[data-ref="valw2"]')
            };
            var line1 = root.querySelector('[data-ref="line1"]');
            var line2 = root.querySelector('[data-ref="line2"]');
            var lineOut = root.querySelector('[data-ref="lineout"]');
            var w1Label = root.querySelector('[data-ref="w1label"]');
            var w2Label = root.querySelector('[data-ref="w2label"]');
            var x1Text = root.querySelector('[data-ref="x1text"]');
            var x2Text = root.querySelector('[data-ref="x2text"]');
            var sumText = root.querySelector('[data-ref="sumtext"]');
            var outNode = root.querySelector('[data-ref="outnode"]');
            var outText = root.querySelector('[data-ref="outtext"]');
            var eqEl = root.querySelector('[data-ref="eq"]');
            var statusEl = root.querySelector('[data-ref="status"]');
            var badge = root.querySelector('[data-ref="badge"]');
            var resetBtn = root.querySelector('[data-ref="reset"]');
            var achieved = false;

            function readVals() {
                return {
                    x1: logic.snap1(parseFloat(ranges.x1.value)),
                    x2: logic.snap1(parseFloat(ranges.x2.value)),
                    w1: logic.snap1(parseFloat(ranges.w1.value)),
                    w2: logic.snap1(parseFloat(ranges.w2.value))
                };
            }

            function applyLine(lineEl, labelEl, name, w) {
                var kind = logic.lineKind(w);
                lineEl.setAttribute("class", "nl-line nl-line--" + kind);
                lineEl.setAttribute("stroke-width", String(logic.strokeWidth(w)));
                labelEl.setAttribute("class", "nl-wlabel nl-wlabel--" + kind);
                labelEl.textContent = name + "=" + w.toFixed(1);
            }

            function update() {
                var v = readVals();
                var sum = logic.weightedSum(v.x1, v.w1, v.x2, v.w2);
                var out = logic.activate(sum, THRESHOLD);

                vals.x1.textContent = v.x1.toFixed(1);
                vals.x2.textContent = v.x2.toFixed(1);
                vals.w1.textContent = v.w1.toFixed(1);
                vals.w2.textContent = v.w2.toFixed(1);

                x1Text.textContent = v.x1.toFixed(1);
                x2Text.textContent = v.x2.toFixed(1);
                applyLine(line1, w1Label, "w1", v.w1);
                applyLine(line2, w2Label, "w2", v.w2);
                sumText.textContent = logic.fmt(sum);

                lineOut.setAttribute("class", "nl-outline" + (out === 1 ? " nl-outline--on" : ""));
                outNode.setAttribute("class", "nl-out-node" + (out === 1 ? " nl-out-node--on" : ""));
                outText.setAttribute("class", "nl-text" + (out === 1 ? " nl-text--out-on" : ""));
                outText.textContent = String(out);

                eqEl.textContent = logic.equation(v.x1, v.w1, v.x2, v.w2);
                statusEl.textContent = logic.statusText(sum, THRESHOLD);
                statusEl.className = "nl-status" + (out === 1 ? " nl-status--on" : "");

                if (out === 1 && !achieved) {
                    achieved = true;
                    badge.hidden = false;
                }
            }

            var keys = ["x1", "x2", "w1", "w2"];
            for (var i = 0; i < keys.length; i++) {
                ranges[keys[i]].addEventListener("input", update);
            }

            resetBtn.addEventListener("click", function () {
                ranges.x1.value = String(DEFAULTS.x1);
                ranges.x2.value = String(DEFAULTS.x2);
                ranges.w1.value = String(DEFAULTS.w1);
                ranges.w2.value = String(DEFAULTS.w2);
                achieved = false;
                badge.hidden = true;
                update();
            });

            update();
        }
    });
})();

/* sim:ai-token-predict - LLM 다음 단어 예측 체험 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 내장 토큰 트리 데이터 ----
       각 노드의 후보는 상위 3개만 보여주는 것이므로 확률 합이 100%가 아니어도 된다.
       cand.next가 있으면 다음 단계 노드, null이면 그 토큰으로 문장이 완성된다. */
    var DATA = [
        {
            id: "lunch",
            start: "오늘 점심으로",
            root: {
                cands: [
                    {
                        t: "김치찌개를", p: 45,
                        next: {
                            cands: [
                                { t: "먹었다.", p: 55, next: null },
                                {
                                    t: "끓여서", p: 25,
                                    next: {
                                        cands: [
                                            { t: "먹었다.", p: 70, next: null },
                                            { t: "가족과 나눠 먹었다.", p: 20, next: null },
                                            { t: "박물관에 보냈다.", p: 2, next: null }
                                        ]
                                    }
                                },
                                { t: "그렸다.", p: 3, next: null }
                            ]
                        }
                    },
                    {
                        t: "샐러드를", p: 30,
                        next: {
                            cands: [
                                { t: "먹었다.", p: 60, next: null },
                                { t: "주문했다.", p: 25, next: null },
                                { t: "화분에 심었다.", p: 3, next: null }
                            ]
                        }
                    },
                    {
                        t: "코딩을", p: 5,
                        next: {
                            cands: [
                                { t: "하며 샌드위치를 먹었다.", p: 40, next: null },
                                { t: "먹을 수는 없다.", p: 35, next: null },
                                { t: "튀겨 먹었다.", p: 4, next: null }
                            ]
                        }
                    }
                ]
            }
        },
        {
            id: "knou",
            start: "방송대에서 컴퓨터과학을",
            root: {
                cands: [
                    {
                        t: "공부하고", p: 50,
                        next: {
                            cands: [
                                { t: "있다.", p: 55, next: null },
                                {
                                    t: "있으면", p: 25,
                                    next: {
                                        cands: [
                                            { t: "취업 준비에 도움이 된다.", p: 50, next: null },
                                            { t: "과제가 많아진다.", p: 30, next: null },
                                            { t: "우주의 비밀이 풀린다.", p: 3, next: null }
                                        ]
                                    }
                                },
                                { t: "있는 고양이를 봤다.", p: 2, next: null }
                            ]
                        }
                    },
                    {
                        t: "전공하면", p: 28,
                        next: {
                            cands: [
                                { t: "개발자가 될 수 있다.", p: 45, next: null },
                                { t: "수학도 함께 배운다.", p: 30, next: null },
                                { t: "마법사가 된다.", p: 3, next: null }
                            ]
                        }
                    },
                    {
                        t: "춤추며", p: 3,
                        next: {
                            cands: [
                                { t: "배우는 사람은 드물다.", p: 40, next: null },
                                { t: "외울 수는 없다.", p: 30, next: null },
                                { t: "가르치는 학원이 생겼다.", p: 4, next: null }
                            ]
                        }
                    }
                ]
            }
        },
        {
            id: "ai",
            start: "인공지능은 앞으로",
            root: {
                cands: [
                    {
                        t: "더 발전해서", p: 48,
                        next: {
                            cands: [
                                { t: "일상 곳곳에 쓰일 것이다.", p: 55, next: null },
                                { t: "사람의 일을 도울 것이다.", p: 30, next: null },
                                { t: "꿈을 꾸기 시작할 것이다.", p: 4, next: null }
                            ]
                        }
                    },
                    {
                        t: "일자리를", p: 30,
                        next: {
                            cands: [
                                { t: "크게 바꿔 놓을 것이다.", p: 50, next: null },
                                { t: "일부 대체할 수도 있다.", p: 35, next: null },
                                { t: "요리해 버릴 것이다.", p: 2, next: null }
                            ]
                        }
                    },
                    {
                        t: "라면을", p: 3,
                        next: {
                            cands: [
                                { t: "끓이는 로봇에 들어갈 것이다.", p: 40, next: null },
                                { t: "추천해 주게 될 것이다.", p: 30, next: null },
                                { t: "무서워하게 될 것이다.", p: 3, next: null }
                            ]
                        }
                    }
                ]
            }
        }
    ];

    /* ---- 순수 로직 (DOM 비의존) ---- */
    var logic = {
        /* 확률 10% 이하를 "낮은 확률의 길"로 본다 (temperature 직관용) */
        isLow: function (p) {
            return typeof p === "number" && p <= 10;
        },
        /* 시작 문장 + 선택 토큰들을 한 문장으로. 미완성이면 빈칸 표시를 붙인다 */
        sentence: function (start, tokens, done) {
            var s = start;
            for (var i = 0; i < tokens.length; i++) {
                s += " " + tokens[i];
            }
            return done ? s : s + " ___";
        },
        /* 한 노드(후보 세트) 검사. 문제가 있으면 errors에 메시지를 쌓는다 */
        checkNode: function (node, depth, path, errors, leaves) {
            var where = path.length ? path.join(" > ") : "(root)";
            if (!node || !node.cands || node.cands.length !== 3) {
                errors.push(where + ": 후보는 정확히 3개여야 함");
                return;
            }
            if (depth > 3) {
                errors.push(where + ": 깊이가 3단계를 초과함");
                return;
            }
            var sum = 0;
            for (var i = 0; i < node.cands.length; i++) {
                var c = node.cands[i];
                if (typeof c.t !== "string" || c.t.length === 0) {
                    errors.push(where + ": 토큰 문자열이 비어 있음");
                    continue;
                }
                if (typeof c.p !== "number" || c.p <= 0 || c.p > 100) {
                    errors.push(where + " > " + c.t + ": 확률 범위 오류 (" + c.p + ")");
                }
                if (i > 0 && c.p > node.cands[i - 1].p) {
                    errors.push(where + ": 후보가 확률 내림차순이 아님");
                }
                sum += c.p;
                var endsSentence = c.t.charAt(c.t.length - 1) === ".";
                if (c.next) {
                    if (endsSentence) {
                        errors.push(where + " > " + c.t + ": 마침표 토큰인데 다음 단계가 있음");
                    }
                    logic.checkNode(c.next, depth + 1, path.concat(c.t), errors, leaves);
                } else {
                    if (!endsSentence) {
                        errors.push(where + " > " + c.t + ": 종결 토큰이 마침표로 끝나지 않음");
                    }
                    leaves.push({ tokens: path.concat(c.t), depth: depth });
                }
            }
            if (sum > 100) {
                errors.push(where + ": 후보 확률 합이 100을 초과 (" + sum + ")");
            }
        },
        /* 전체 데이터 무결성 검사: 모든 경로가 2~3단계 안에 완성 문장에 도달하는지 */
        validate: function (data) {
            var errors = [];
            var sentences = [];
            if (!data || data.length !== 3) {
                errors.push("시작 문장은 3개여야 함");
            }
            for (var i = 0; i < (data ? data.length : 0); i++) {
                var tree = data[i];
                if (typeof tree.start !== "string" || tree.start.length === 0) {
                    errors.push("트리 " + i + ": 시작 문장이 비어 있음");
                    continue;
                }
                var leaves = [];
                logic.checkNode(tree.root, 1, [], errors, leaves);
                for (var j = 0; j < leaves.length; j++) {
                    var leaf = leaves[j];
                    if (leaf.depth < 2 || leaf.depth > 3) {
                        errors.push(tree.start + ": 경로 깊이가 2~3단계 범위 밖 (" + leaf.depth + ")");
                    }
                    sentences.push({
                        start: tree.start,
                        depth: leaf.depth,
                        text: logic.sentence(tree.start, leaf.tokens, true)
                    });
                }
            }
            return { ok: errors.length === 0, errors: errors, sentences: sentences };
        }
    };

    window.SIM.register("ai-token-predict", {
        title: "LLM 다음 단어 예측 체험",
        _logic: logic,
        _data: DATA,
        build: function (root) {
            var tabsHtml = "";
            for (var ti = 0; ti < DATA.length; ti++) {
                tabsHtml += '<button type="button" class="sim__tab' + (ti === 0 ? " active" : "")
                    + '" data-idx="' + ti + '" role="tab" aria-selected="' + (ti === 0 ? "true" : "false")
                    + '">' + DATA[ti].start + ' ___</button>';
            }
            root.innerHTML = ""
                + '<p class="sim__note tp-intro">시작 문장을 고르고, LLM이 된 것처럼 다음 토큰을 하나씩 골라 문장을 완성해 보세요.</p>'
                + '<div class="sim__tabs" role="tablist" aria-label="시작 문장 선택">' + tabsHtml + '</div>'
                + '<div class="sim__out tp-sentence" aria-live="polite"></div>'
                + '<p class="tp-cands-head">다음 토큰 후보 <span class="sim__chip tp-step"></span></p>'
                + '<div class="tp-cands"></div>'
                + '<div class="tp-status" aria-live="polite"></div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn tp-reset" aria-label="시작 문장부터 다시 선택">다시</button>'
                + '</div>'
                + '<p class="sim__note">확률은 학습 데이터를 흉내 낸 내장 값이고, 상위 3개 후보만 보여주므로 합이 100%가 아닐 수 있습니다.</p>'
                + '<div class="tp-guide">LLM은 사실이 아니라 <strong>그럴듯함(다음 토큰 확률)</strong>을 생성한다 - 그래서 환각(hallucination)이 생긴다. 중요한 사실은 반드시 1차 출처로 검증하자.</div>';

            var tabs = root.querySelectorAll(".sim__tab");
            var sentenceBox = root.querySelector(".tp-sentence");
            var candsHead = root.querySelector(".tp-cands-head");
            var stepChip = root.querySelector(".tp-step");
            var candsBox = root.querySelector(".tp-cands");
            var statusBox = root.querySelector(".tp-status");
            var resetBtn = root.querySelector(".tp-reset");

            var state = {
                idx: 0,
                node: DATA[0].root,
                tokens: [],
                done: false,
                lowPicked: false
            };

            function clearNode(node) {
                while (node.firstChild) {
                    node.removeChild(node.firstChild);
                }
            }

            function renderSentence() {
                clearNode(sentenceBox);
                var fixed = document.createElement("span");
                fixed.className = "tp-fixed";
                fixed.textContent = DATA[state.idx].start;
                sentenceBox.appendChild(fixed);
                for (var i = 0; i < state.tokens.length; i++) {
                    sentenceBox.appendChild(document.createTextNode(" "));
                    var tok = document.createElement("span");
                    tok.className = "tp-tok";
                    tok.textContent = state.tokens[i];
                    sentenceBox.appendChild(tok);
                }
                if (!state.done) {
                    sentenceBox.appendChild(document.createTextNode(" "));
                    var blank = document.createElement("span");
                    blank.className = "tp-blank";
                    blank.textContent = "___";
                    sentenceBox.appendChild(blank);
                }
            }

            function makeCandButton(cand) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "tp-cand";
                btn.setAttribute("aria-label", "후보 " + cand.t + ", 확률 " + cand.p + "퍼센트");
                var top = document.createElement("span");
                top.className = "tp-cand__top";
                var tokenEl = document.createElement("span");
                tokenEl.className = "tp-cand__token";
                tokenEl.textContent = cand.t;
                var pctEl = document.createElement("span");
                pctEl.className = "tp-cand__pct";
                pctEl.textContent = cand.p + "%";
                top.appendChild(tokenEl);
                top.appendChild(pctEl);
                var bar = document.createElement("span");
                bar.className = "tp-cand__bar";
                var fill = document.createElement("span");
                fill.className = "tp-cand__fill";
                fill.style.width = cand.p + "%";
                bar.appendChild(fill);
                btn.appendChild(top);
                btn.appendChild(bar);
                btn.addEventListener("click", function () {
                    pick(cand);
                });
                return btn;
            }

            function renderCands() {
                clearNode(candsBox);
                if (state.done) {
                    candsHead.hidden = true;
                    return;
                }
                candsHead.hidden = false;
                stepChip.textContent = (state.tokens.length + 1) + "단계";
                for (var i = 0; i < state.node.cands.length; i++) {
                    candsBox.appendChild(makeCandButton(state.node.cands[i]));
                }
            }

            function renderStatus() {
                clearNode(statusBox);
                if (state.done) {
                    var doneChip = document.createElement("span");
                    doneChip.className = "sim__chip tp-chip--done";
                    doneChip.textContent = "문장 완성!";
                    statusBox.appendChild(doneChip);
                }
                if (state.lowPicked) {
                    var lowChip = document.createElement("span");
                    lowChip.className = "sim__chip tp-chip--warn";
                    lowChip.textContent = "낮은 확률의 길로 갔다 - 창의적이지만 엉뚱할 수 있다 (temperature 직관)";
                    statusBox.appendChild(lowChip);
                }
                if (state.done) {
                    var note = document.createElement("p");
                    note.className = "sim__note";
                    note.textContent = "다시를 누르거나 다른 시작 문장 탭을 골라 또 한 번 생성해 보세요.";
                    statusBox.appendChild(note);
                }
            }

            function renderAll() {
                renderSentence();
                renderCands();
                renderStatus();
            }

            function pick(cand) {
                if (state.done) return;
                state.tokens.push(cand.t);
                if (logic.isLow(cand.p)) {
                    state.lowPicked = true;
                }
                if (cand.next) {
                    state.node = cand.next;
                } else {
                    state.node = null;
                    state.done = true;
                }
                renderAll();
            }

            function reset(idx) {
                state.idx = idx;
                state.node = DATA[idx].root;
                state.tokens = [];
                state.done = false;
                state.lowPicked = false;
                for (var i = 0; i < tabs.length; i++) {
                    var active = i === idx;
                    tabs[i].classList.toggle("active", active);
                    tabs[i].setAttribute("aria-selected", active ? "true" : "false");
                }
                renderAll();
            }

            for (var bi = 0; bi < tabs.length; bi++) {
                (function (i) {
                    tabs[i].addEventListener("click", function () {
                        reset(i);
                    });
                })(bi);
            }

            resetBtn.addEventListener("click", function () {
                reset(state.idx);
            });

            reset(0);
        }
    });
})();

/* sim:ai-prompt-builder - CRTF 프롬프트 빌더 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 조립 로직 (DOM 비의존) ---- */
    var logic = {
        /* 문장 끝에 마침표가 없으면 붙인다 */
        withPeriod: function (s) {
            if (!s) return "";
            var last = s.charAt(s.length - 1);
            if (last === "." || last === "!" || last === "?") return s;
            return s + ".";
        },
        /* parts: { context, role, task, format } - 각 값은 "" 또는 문장 */
        count: function (parts) {
            var n = 0;
            if (parts.context) n++;
            if (parts.role) n++;
            if (parts.task) n++;
            if (parts.format) n++;
            return n;
        },
        /* CRTF 순서로 이어 붙인 완성 프롬프트.
           - "없음"("")은 생략
           - 형식은 작업 앞에 붙여 자연스럽게 연결 ("3문장으로 AI 개념을 설명해줘")
           - 작업 없이 형식만 있으면 "...(형식) 답해줘"로 보완 */
        assemble: function (parts) {
            var s = [];
            if (parts.context) s.push(logic.withPeriod(parts.context));
            if (parts.role) s.push(logic.withPeriod(parts.role));
            if (parts.task && parts.format) {
                s.push(logic.withPeriod(parts.format + " " + parts.task));
            } else if (parts.task) {
                s.push(logic.withPeriod(parts.task));
            } else if (parts.format) {
                s.push(logic.withPeriod(parts.format + " 답해줘"));
            }
            return s.join(" ");
        },
        /* 채운 개수 -> 평가 등급 */
        verdict: function (n) {
            if (n === 0) return { grade: "bad", label: "나쁜 프롬프트" };
            if (n === 4) return { grade: "good", label: "좋은 프롬프트!" };
            return { grade: "mid", label: n + "개 요소 채움" };
        }
    };

    /* ---- 본문 7장 예시 기반 선택지 ---- */
    var FIELDS = [
        {
            key: "context",
            code: "C",
            name: "맥락(Context)",
            options: [
                "나는 방통대 1학년 학생이야",
                "컴퓨터를 처음 배우는 부모님께 설명할 거야"
            ]
        },
        {
            key: "role",
            code: "R",
            name: "역할(Role)",
            options: [
                "너는 친절한 컴퓨터과학 튜터야",
                "너는 초등학교 선생님이야"
            ]
        },
        {
            key: "task",
            code: "T",
            name: "작업(Task)",
            options: [
                "AI 개념을 설명해줘",
                "1~100 합을 구하는 파이썬 코드를 짜줘"
            ]
        },
        {
            key: "format",
            code: "F",
            name: "형식(Format)",
            options: [
                "3문장으로",
                "표로 정리해서",
                "비유를 들어 쉽게"
            ]
        }
    ];

    window.SIM.register("ai-prompt-builder", {
        title: "CRTF 프롬프트 빌더",
        _logic: logic,
        build: function (root) {
            var i;
            var j;
            var fieldsHtml = "";
            for (i = 0; i < FIELDS.length; i++) {
                var f = FIELDS[i];
                var opts = '<option value="">없음</option>';
                for (j = 0; j < f.options.length; j++) {
                    opts += '<option value="' + f.options[j] + '">'
                        + f.options[j] + '</option>';
                }
                fieldsHtml += '<label class="pb-field">'
                    + '<span class="pb-label"><span class="pb-code">' + f.code
                    + '</span> ' + f.name + '</span>'
                    + '<select class="sim__select pb-select" data-key="' + f.key
                    + '" aria-label="' + f.name + ' 선택">' + opts + '</select>'
                    + '</label>';
            }

            var chipsHtml = "";
            for (i = 0; i < FIELDS.length; i++) {
                chipsHtml += '<span class="pb-el" data-key="' + FIELDS[i].key
                    + '">' + FIELDS[i].code + '</span>';
            }

            root.innerHTML = ""
                + '<p class="sim__note pb-guide">CRTF = Context(맥락) Role(역할) Task(작업) Format(형식). 네 요소를 채울수록 AI의 답이 정확해집니다.</p>'
                + '<div class="pb-fields">' + fieldsHtml + '</div>'
                + '<div class="pb-status">'
                +     '<div class="pb-gauge" role="img" aria-label="완성도 4점 만점에 0점">'
                +         '<span class="pb-seg"></span><span class="pb-seg"></span>'
                +         '<span class="pb-seg"></span><span class="pb-seg"></span>'
                +     '</div>'
                +     '<span class="pb-count">완성도 0/4</span>'
                +     '<span class="pb-els">' + chipsHtml + '</span>'
                +     '<button type="button" class="sim__btn pb-reset" aria-label="모든 선택 초기화">초기화</button>'
                + '</div>'
                + '<div class="sim__out pb-out" aria-live="polite" aria-label="완성 프롬프트"></div>'
                + '<div class="pb-verdicts" aria-live="polite">'
                +     '<div class="pb-verdict pb-verdict--bad" hidden>'
                +         '<span class="pb-badge pb-badge--warn">나쁜 프롬프트</span>'
                +         '<p class="pb-vtext">지금은 나쁜 예 "AI 설명해줘"와 같은 수준입니다. 네 요소를 골라 채워 보세요.</p>'
                +     '</div>'
                +     '<div class="pb-verdict pb-verdict--mid" hidden>'
                +         '<p class="pb-vtext pb-mid-text"></p>'
                +     '</div>'
                +     '<div class="pb-verdict pb-verdict--good" hidden>'
                +         '<span class="pb-badge pb-badge--tip">좋은 프롬프트!</span>'
                +         '<p class="pb-vtext">CRTF 네 요소가 모두 채워졌습니다. 더 좋은 답을 받는 보너스 팁:</p>'
                +         '<ul class="pb-bonus">'
                +             '<li><strong>단계적 사고 유도</strong>: "차근차근 단계별로 설명해줘"를 덧붙이면 더 논리적인 답이 나온다.</li>'
                +             '<li><strong>예시 제공(few-shot)</strong>: 원하는 답의 예를 1~2개 보여주면 형식을 잘 따른다.</li>'
                +             '<li><strong>반복 개선(iteration)</strong>: 한 번에 완벽을 기대하지 말고 "더 짧게", "더 쉽게"로 다듬는다.</li>'
                +         '</ul>'
                +     '</div>'
                + '</div>';

            var selects = root.querySelectorAll(".pb-select");
            var segs = root.querySelectorAll(".pb-seg");
            var chips = root.querySelectorAll(".pb-el");
            var gauge = root.querySelector(".pb-gauge");
            var countEl = root.querySelector(".pb-count");
            var out = root.querySelector(".pb-out");
            var vBad = root.querySelector(".pb-verdict--bad");
            var vMid = root.querySelector(".pb-verdict--mid");
            var vGood = root.querySelector(".pb-verdict--good");
            var midText = root.querySelector(".pb-mid-text");
            var resetBtn = root.querySelector(".pb-reset");

            function readParts() {
                var parts = {};
                for (var k = 0; k < selects.length; k++) {
                    parts[selects[k].getAttribute("data-key")] = selects[k].value;
                }
                return parts;
            }

            function update() {
                var parts = readParts();
                var n = logic.count(parts);
                var text = logic.assemble(parts);
                var v = logic.verdict(n);
                var k;

                if (n === 0) {
                    out.textContent = "(요소를 선택하면 완성 프롬프트가 여기에 나타납니다)";
                } else {
                    out.textContent = text;
                }
                out.classList.toggle("pb-out--empty", n === 0);

                for (k = 0; k < segs.length; k++) {
                    segs[k].classList.toggle("on", k < n);
                }
                gauge.setAttribute("aria-label", "완성도 4점 만점에 " + n + "점");
                countEl.textContent = "완성도 " + n + "/4";

                for (k = 0; k < chips.length; k++) {
                    chips[k].classList.toggle("on", !!parts[FIELDS[k].key]);
                }

                vBad.hidden = v.grade !== "bad";
                vMid.hidden = v.grade !== "mid";
                vGood.hidden = v.grade !== "good";
                if (v.grade === "mid") {
                    var missing = [];
                    for (k = 0; k < FIELDS.length; k++) {
                        if (!parts[FIELDS[k].key]) missing.push(FIELDS[k].name);
                    }
                    midText.textContent = "요소 " + n + "개를 채웠습니다. 아직 비어 있는 요소: "
                        + missing.join(", ") + ". 채울수록 답이 더 정확해집니다.";
                }
            }

            function onChange() {
                update();
            }

            for (i = 0; i < selects.length; i++) {
                selects[i].addEventListener("change", onChange);
            }
            resetBtn.addEventListener("click", function () {
                for (var k = 0; k < selects.length; k++) {
                    selects[k].value = "";
                }
                update();
            });

            update();
        }
    });
})();

/* sim:ai-bias-sim - 데이터 편향 시뮬레이터 */
(function () {
    "use strict";
    if (!window.SIM) return;

    /* ---- 순수 계산 로직 (DOM 비의존) ---- */
    var logic = {
        /* 전체 학습 사진 수 (표시용) */
        TOTAL_PHOTOS: 1000,
        /* 이 격차(%p)를 넘으면 편향 발생으로 판정 */
        GAP_LIMIT: 15,
        /* A그룹 비율(%)을 50~95 정수로 클램프. 숫자가 아니면 기본값 50 */
        clampPct: function (p) {
            if (typeof p !== "number" || isNaN(p)) return 50;
            p = Math.round(p);
            if (p < 50) p = 50;
            if (p > 95) p = 95;
            return p;
        },
        /* 교육용 단순 모델: 그룹 정확도(%) = 60 + 38 x (그 그룹 데이터 비율)^0.7
           - 실제 학습이 아니라 "데이터가 적은 그룹일수록 정확도가 낮다"는
             경향만 보여 주는 단조 증가 함수다.
           - ratio: 그 그룹 사진이 전체에서 차지하는 비율 (0~1)
           - 50:50이면 두 그룹 모두 83.4%, 95:5면 A 96.7% / B 64.7% */
        accuracy: function (ratio) {
            return 60 + 38 * Math.pow(ratio, 0.7);
        },
        /* 소수 첫째 자리 반올림 */
        round1: function (x) {
            return Math.round(x * 10) / 10;
        },
        /* aPct(50~95)에서 두 그룹 정확도와 격차 계산.
           격차가 GAP_LIMIT(15%p)를 넘으면 biased=true */
        simulate: function (aPct) {
            var p = logic.clampPct(aPct);
            var rawA = logic.accuracy(p / 100);
            var rawB = logic.accuracy((100 - p) / 100);
            var gap = rawA - rawB;
            return {
                aPct: p,
                bPct: 100 - p,
                accA: logic.round1(rawA),
                accB: logic.round1(rawB),
                gap: logic.round1(gap),
                biased: gap > logic.GAP_LIMIT
            };
        },
        /* 아이콘 스택 개수: 사진 5%당 1개 (50% -> 10개, 95% -> 19개, 5% -> 1개) */
        iconCount: function (pct) {
            var n = Math.round(pct / 5);
            return n < 1 ? 1 : n;
        }
    };

    window.SIM.register("ai-bias-sim", {
        title: "데이터 편향 시뮬레이터",
        _logic: logic,
        build: function (root) {
            root.innerHTML = ""
                + '<div class="sim__row">'
                +     '<label class="ab-sliderwrap">'
                +         '<span class="ab-slidertext">A그룹 사진 비율</span>'
                +         '<input type="range" class="ab-slider" min="50" max="95" step="1" value="50" aria-label="A그룹 사진 비율, 50퍼센트부터 95퍼센트까지">'
                +     '</label>'
                +     '<span class="sim__chip ab-ratio" data-el="ratio">A 50% : B 50%</span>'
                + '</div>'
                + '<div class="ab-data">'
                +     '<div class="ab-group">'
                +         '<div class="ab-group-head">'
                +             '<span class="ab-tag ab-tag--a">A그룹</span>'
                +             '<span class="ab-count" data-el="countA"></span>'
                +         '</div>'
                +         '<div class="ab-stack" data-el="stackA" aria-hidden="true"></div>'
                +     '</div>'
                +     '<div class="ab-group">'
                +         '<div class="ab-group-head">'
                +             '<span class="ab-tag ab-tag--b">B그룹</span>'
                +             '<span class="ab-count" data-el="countB"></span>'
                +         '</div>'
                +         '<div class="ab-stack" data-el="stackB" aria-hidden="true"></div>'
                +     '</div>'
                + '</div>'
                + '<div class="sim__row">'
                +     '<button type="button" class="sim__btn sim__btn--primary ab-train" aria-label="현재 데이터 구성으로 모델 학습시키기">학습시키기</button>'
                +     '<button type="button" class="sim__btn ab-reset" aria-label="데이터 구성과 학습 결과 초기화">초기화</button>'
                + '</div>'
                + '<div class="ab-result" aria-live="polite">'
                +     '<p class="sim__note" data-el="placeholder">아직 학습 전입니다. 슬라이더로 학습 데이터 구성을 정하고 "학습시키기"를 눌러 보세요.</p>'
                +     '<div class="ab-trained" data-el="trained" hidden>'
                +         '<div class="ab-bar-row">'
                +             '<span class="ab-tag ab-tag--a">A그룹</span>'
                +             '<div class="ab-track"><div class="ab-fill ab-fill--a" data-el="barA"></div></div>'
                +             '<span class="ab-acc" data-el="accA"></span>'
                +         '</div>'
                +         '<div class="ab-bar-row">'
                +             '<span class="ab-tag ab-tag--b">B그룹</span>'
                +             '<div class="ab-track"><div class="ab-fill ab-fill--b" data-el="barB"></div></div>'
                +             '<span class="ab-acc" data-el="accB"></span>'
                +         '</div>'
                +         '<p class="ab-gap" data-el="gap"></p>'
                +         '<div class="ab-badge ab-badge--warn" data-el="warnBadge" hidden>'
                +             '<strong>편향 발생: 데이터가 적은 그룹에서 자주 틀린다</strong>'
                +             '<span class="ab-case">본문 사례처럼 얼굴 인식이 특정 피부색에서 오류율이 더 높거나, 채용 AI가 특정 성별을 불리하게 평가하는 일이 이렇게 생긴다.</span>'
                +         '</div>'
                +         '<div class="ab-badge ab-badge--ok" data-el="okBadge" hidden>격차 15%p 이내 - 두 그룹 정확도가 비슷하다.</div>'
                +     '</div>'
                +     '<p class="sim__note" data-el="staleNote" hidden>데이터 구성이 바뀌었습니다 - 다시 학습시켜 보세요.</p>'
                + '</div>'
                + '<p class="sim__note">AI는 데이터를 비추는 거울이다 - 치우친 데이터는 치우친 판단을 만든다. 대응: 다양한 데이터 수집, 편향 점검, 사람의 검토.</p>';

            function el(name) {
                return root.querySelector('[data-el="' + name + '"]');
            }

            var slider = root.querySelector(".ab-slider");
            var trainBtn = root.querySelector(".ab-train");
            var resetBtn = root.querySelector(".ab-reset");
            var ratioChip = el("ratio");
            var countA = el("countA");
            var countB = el("countB");
            var stackA = el("stackA");
            var stackB = el("stackB");
            var placeholder = el("placeholder");
            var trainedBox = el("trained");
            var barA = el("barA");
            var barB = el("barB");
            var accA = el("accA");
            var accB = el("accB");
            var gapEl = el("gap");
            var warnBadge = el("warnBadge");
            var okBadge = el("okBadge");
            var staleNote = el("staleNote");

            var trained = false;

            /* 고정 마크업만 사용 (사용자 입력 문자열 아님) */
            function renderStack(target, n, mod) {
                var html = "";
                for (var i = 0; i < n; i++) {
                    html += '<span class="ab-icon ' + mod + '"></span>';
                }
                target.innerHTML = html;
            }

            function renderData(p) {
                var bp = 100 - p;
                ratioChip.textContent = "A " + p + "% : B " + bp + "%";
                countA.textContent = Math.round(logic.TOTAL_PHOTOS * p / 100) + "장 (" + p + "%)";
                countB.textContent = Math.round(logic.TOTAL_PHOTOS * bp / 100) + "장 (" + bp + "%)";
                renderStack(stackA, logic.iconCount(p), "ab-icon--a");
                renderStack(stackB, logic.iconCount(bp), "ab-icon--b");
            }

            function train() {
                var r = logic.simulate(parseInt(slider.value, 10));
                placeholder.hidden = true;
                trainedBox.hidden = false;
                trainedBox.className = "ab-trained";
                staleNote.hidden = true;
                barA.style.width = r.accA + "%";
                barB.style.width = r.accB + "%";
                barB.className = r.biased
                    ? "ab-fill ab-fill--b ab-fill--low"
                    : "ab-fill ab-fill--b";
                accA.textContent = r.accA.toFixed(1) + "%";
                accB.textContent = r.accB.toFixed(1) + "%";
                gapEl.textContent = "두 그룹 정확도 격차: " + r.gap.toFixed(1) + "%p";
                warnBadge.hidden = !r.biased;
                okBadge.hidden = r.biased;
                trained = true;
            }

            function reset() {
                slider.value = "50";
                renderData(50);
                trained = false;
                placeholder.hidden = false;
                trainedBox.hidden = true;
                trainedBox.className = "ab-trained";
                staleNote.hidden = true;
            }

            slider.addEventListener("input", function () {
                var p = logic.clampPct(parseInt(slider.value, 10));
                renderData(p);
                if (trained) {
                    /* 데이터가 바뀌면 이전 학습 결과는 더 이상 유효하지 않음 */
                    trainedBox.className = "ab-trained ab-trained--stale";
                    staleNote.hidden = false;
                }
            });
            trainBtn.addEventListener("click", train);
            resetBtn.addEventListener("click", reset);

            renderData(50);
        }
    });
})();

/* ----------------------------------------------------------------------
   부트 - data-sim 마운트를 찾아 위젯을 초기화
   ---------------------------------------------------------------------- */
(function () {
    "use strict";
    function boot() {
        var mounts = document.querySelectorAll("[data-sim]");
        Array.prototype.forEach.call(mounts, function (m) {
            var name = m.getAttribute("data-sim");
            var def = window.SIM.widgets[name];
            if (!def || m.getAttribute("data-sim-ready")) return;
            m.setAttribute("data-sim-ready", "1");
            m.classList.add("sim", "sim--" + name);

            var head = document.createElement("p");
            head.className = "sim__head";
            var badge = document.createElement("span");
            badge.className = "sim__badge";
            badge.textContent = "직접 해보기";
            var title = document.createElement("strong");
            title.textContent = def.title || name;
            head.appendChild(badge);
            head.appendChild(title);
            m.appendChild(head);

            var body = document.createElement("div");
            body.className = "sim__body";
            m.appendChild(body);

            try {
                def.build(body);
            } catch (e) {
                body.textContent = "";
                var err = document.createElement("p");
                err.className = "sim__note";
                err.textContent = "위젯을 불러오지 못했습니다. 새로고침해 보세요.";
                body.appendChild(err);
            }
        });
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
