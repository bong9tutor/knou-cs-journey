(() => {
    'use strict';
    const { units } = JSON.parse(document.getElementById('textbook-data').textContent);
    const labels = { reading: '본문', vocabulary: '어휘', verbs: '동사 예문', workbook: '워크북' };
    const panel = document.getElementById('reader-panel');
    const status = document.getElementById('reader-status');
    const search = document.getElementById('reader-search');
    const storageKey = 'knou-english-textbook-v1';
    let progress = { mastered: {}, answers: {} };
    let canSave = true;
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (saved && typeof saved.mastered === 'object' && saved.mastered !== null) progress.mastered = saved.mastered;
        if (saved && typeof saved.answers === 'object' && saved.answers !== null) progress.answers = saved.answers;
    } catch (_) { canSave = false; }
    let unit = units[0];
    let view = 'reading';
    let hiddenTranslation = false;
    let pendingFocus = null;
    const speechAvailable = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const wordKey = word => `${unit.id}:${word.number}:${word.word}`;
    const answerKey = (group, number) => `${unit.id}:${group}:${number}`;
    const speakButton = text => speechAvailable ? `<button class="reader-button" data-speak="${esc(text)}" aria-label="영어 읽기">영어 읽기</button>` : '';

    function save() {
        try {
            localStorage.setItem(storageKey, JSON.stringify(progress));
            canSave = true;
            status.textContent = '현재 브라우저에 저장했습니다.';
        } catch (_) {
            canSave = false;
            status.textContent = '브라우저 저장을 사용할 수 없습니다. 답안을 별도로 보관해 주세요.';
        }
    }

    function stopSpeech() {
        if (speechAvailable) window.speechSynthesis.cancel();
        document.getElementById('stop-speech').hidden = true;
    }

    function readingHTML() {
        return unit.paragraphs.map(p => `<article class="reading-block"><h3>문단 ${p.number}</h3><div class="parallel"><div><span class="language-label">TEXTBOOK · ENGLISH</span><p class="english-text" lang="en">${esc(p.english)}</p>${speakButton(p.english)}</div><div class="translation"><span class="language-label">WORKBOOK · 한국어 해석</span><p>${esc(p.korean)}</p></div></div></article>`).join('');
    }

    function vocabularyHTML() {
        return `<p class="reader-muted">단어를 눌러 뜻을 확인하고, 기억한 단어에 ‘암기 완료’를 표시하세요.</p><div class="vocab-grid">${unit.vocabulary.map(word => {
            const key = wordKey(word);
            const mastered = Boolean(progress.mastered[key]);
            return `<article class="word-card${mastered ? ' is-mastered' : ''}" data-word-number="${word.number}"><details><summary lang="en">${esc(word.word)}</summary><p>${esc(word.meaning)}</p></details><div class="word-footer">${speakButton(word.word)}<label><input type="checkbox" data-mastered="${esc(key)}" ${mastered ? 'checked' : ''}>암기 완료<span class="sr-only">: ${esc(word.word)}</span></label></div></article>`;
        }).join('')}</div><p id="no-words" class="reader-muted" hidden>검색 결과가 없습니다.</p>`;
    }

    function filterWords() {
        const term = search.value.trim().toLocaleLowerCase();
        let visible = 0;
        panel.querySelectorAll('[data-word-number]').forEach(card => {
            const word = unit.vocabulary.find(item => item.number === Number(card.dataset.wordNumber));
            card.hidden = !`${word.word} ${word.meaning}`.toLocaleLowerCase().includes(term);
            if (!card.hidden) visible++;
        });
        document.getElementById('no-words').hidden = visible > 0;
        const mastered = unit.vocabulary.filter(word => progress.mastered[wordKey(word)]).length;
        status.textContent = `${visible}개 표시 · 암기 완료 ${mastered}/${unit.vocabulary.length}${canSave ? '' : ' · 브라우저 저장을 사용할 수 없습니다.'}`;
    }

    function verbsHTML() {
        return unit.verbs.map(verb => `<article class="verb-block"><h3>${esc(verb.title)}</h3>${verb.examples.map(example => `<div class="example"><p class="english-text" lang="en">${esc(example.english)}</p><p class="translation">${esc(example.korean)}</p>${speakButton(example.english)}</div>`).join('')}${verb.checks ? `<div class="verb-checks"><strong>교재 확인 사항</strong>${verb.checks}</div>` : ''}</article>`).join('');
    }

    function exerciseHTML(item, group) {
        const key = answerKey(group, item.number);
        const solution = item.answer ? `<p class="answer-key">원문 정답: ${esc(item.answer.answer)}</p><p class="reader-muted">확인 근거: ${esc(item.answer.evidence)}</p>` : '<p class="reader-muted">원문 정답 미확인. 제공된 자료에 정답이 없어 표시하지 않았습니다.</p>';
        return `<article class="exercise-card"><h3>${group === 'vocab' ? '어휘 연습' : '연습문제'} ${item.number}</h3>${item.prompt}<label for="answer-${group}-${item.number}">내 답안</label><textarea id="answer-${group}-${item.number}" data-answer="${esc(key)}" placeholder="답안이나 풀이 메모를 적어 보세요.">${esc(progress.answers[key] || '')}</textarea><details class="answer-details"><summary>정답·해설 보기</summary>${solution}${item.explanation ? `<strong>워크북 해설</strong>${item.explanation}` : ''}</details></article>`;
    }

    function workbookHTML() {
        return `<p class="reader-muted">먼저 답안을 적고 정답·해설을 펼쳐 확인하세요. ${unit.confirmedAnswers}/${unit.exercises.length}문항의 정답이 원문에서 확인되었습니다.</p>${unit.answerNote ? `<div class="verb-checks">${unit.answerNote}</div>` : ''}<details class="exercise-group"><summary>어휘 연습 · ${unit.vocabularyExercises.length}문항</summary>${unit.vocabularyExercises.map(item => exerciseHTML(item, 'vocab')).join('')}</details><details class="exercise-group" open><summary>연습문제 · ${unit.exercises.length}문항</summary>${unit.exercises.map(item => exerciseHTML(item, 'practice')).join('')}</details>`;
    }

    function render() {
        stopSpeech();
        document.getElementById('unit-switch').innerHTML = units.map(item => `<button data-unit="${item.id}" aria-pressed="${unit.id === item.id}">${esc(item.title.replace('UNIT ', 'Unit '))}</button>`).join('');
        document.getElementById('unit-title').textContent = unit.title;
        document.getElementById('unit-counts').innerHTML = [`본문 ${unit.paragraphs.length}문단`, `어휘 ${unit.vocabulary.length}개`, `동사 ${unit.verbs.length}개`, `워크북 ${unit.vocabularyExercises.length + unit.exercises.length}문항`].map(text => `<span>${text}</span>`).join('');
        document.getElementById('view-tabs').innerHTML = Object.entries(labels).map(([id, label]) => `<button id="tab-${id}" role="tab" data-view="${id}" aria-selected="${view === id}" aria-controls="reader-panel" tabindex="${view === id ? 0 : -1}">${label}</button>`).join('');
        panel.setAttribute('aria-labelledby', `tab-${view}`);
        panel.innerHTML = ({ reading: readingHTML, vocabulary: vocabularyHTML, verbs: verbsHTML, workbook: workbookHTML })[view]();
        panel.classList.toggle('translations-hidden', hiddenTranslation);
        document.getElementById('search-wrap').hidden = view !== 'vocabulary';
        document.getElementById('translation-toggle').hidden = !['reading', 'verbs'].includes(view);
        status.textContent = canSave ? '암기 표시와 답안은 현재 브라우저에 저장됩니다.' : '브라우저 저장을 사용할 수 없습니다.';
        if (view === 'vocabulary') filterWords();
        const sourceURL = filename => `https://github.com/bong9tutor/knou-cs-journey/blob/master/year1/${encodeURIComponent('1-2_대학영어')}/notes/${encodeURIComponent(filename)}`;
        document.getElementById('source-info').innerHTML = `<p><a href="${sourceURL(unit.bookFile)}">교재 원문 · ${esc(unit.bookFile)}</a></p><p>${esc(unit.bookSource)}</p><p><a href="${sourceURL(unit.workbookFile)}">워크북 원문 · ${esc(unit.workbookFile)}</a></p><p>${esc(unit.workbookSource)}</p>`;
    }

    function navigate() {
        const match = location.hash.match(/^#unit-(\d+)-(reading|vocabulary|verbs|workbook)$/);
        if (match) {
            unit = units.find(item => item.id === match[1]) || units[0];
            view = match[2];
        }
        render();
        if (pendingFocus) {
            document.querySelector(pendingFocus)?.focus();
            pendingFocus = null;
        }
    }

    document.getElementById('unit-switch').addEventListener('click', event => {
        const button = event.target.closest('[data-unit]');
        if (button) {
            pendingFocus = `[data-unit="${button.dataset.unit}"]`;
            location.hash = `unit-${button.dataset.unit}-${view}`;
        }
    });
    document.getElementById('view-tabs').addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (button) {
            pendingFocus = `#tab-${button.dataset.view}`;
            location.hash = `unit-${unit.id}-${button.dataset.view}`;
        }
    });
    document.getElementById('view-tabs').addEventListener('keydown', event => {
        const ids = Object.keys(labels);
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let index = ids.indexOf(view);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = ids.length - 1;
        else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
        view = ids[index];
        history.replaceState(null, '', `#unit-${unit.id}-${view}`);
        render();
        document.getElementById(`tab-${view}`).focus();
    });
    document.getElementById('translation-toggle').addEventListener('click', event => {
        hiddenTranslation = !hiddenTranslation;
        panel.classList.toggle('translations-hidden', hiddenTranslation);
        event.currentTarget.setAttribute('aria-pressed', String(hiddenTranslation));
        event.currentTarget.textContent = hiddenTranslation ? '해석 보이기' : '해석 가리기';
    });
    search.addEventListener('input', filterWords);
    panel.addEventListener('change', event => {
        if (!event.target.matches('[data-mastered]')) return;
        const checkbox = event.target;
        progress.mastered[checkbox.dataset.mastered] = checkbox.checked;
        checkbox.closest('.word-card').classList.toggle('is-mastered', checkbox.checked);
        save();
        filterWords();
    });
    panel.addEventListener('input', event => {
        if (event.target.matches('[data-answer]')) {
            progress.answers[event.target.dataset.answer] = event.target.value;
            save();
        }
    });
    panel.addEventListener('click', event => {
        const button = event.target.closest('[data-speak]');
        if (!button || !speechAvailable) return;
        stopSpeech();
        const utterance = new SpeechSynthesisUtterance(button.dataset.speak);
        utterance.lang = 'en-US';
        utterance.rate = .85;
        const voice = window.speechSynthesis.getVoices().find(item => item.lang.startsWith('en'));
        if (voice) utterance.voice = voice;
        utterance.onend = utterance.onerror = () => { document.getElementById('stop-speech').hidden = true; };
        document.getElementById('stop-speech').hidden = false;
        window.speechSynthesis.speak(utterance);
    });
    document.getElementById('stop-speech').addEventListener('click', stopSpeech);
    window.addEventListener('hashchange', navigate);
    window.addEventListener('pagehide', stopSpeech);
    navigate();
})();
