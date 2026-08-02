// ==UserScript==
// @name         Zeta Lorebook One-Click Copy & Paste Tool (Bug Fixed)
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  로어북 항목 접기/펴기 시 툴바가 증식하는 버그 수정 버전
// @match        https://zeta-ai.io/ko
// @match        https://zeta-ai.io/ko/*
// @match        https://zeta-ai.io/ko/creator-center*
// @match        https://zeta-ai.io/ko/plots/*/edit*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    // React State 강제 동기화 (Input & Textarea)
    function setInputValue(element, value) {
        if (!element) return;

        const prototype = Object.getPrototypeOf(element);
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // 항목 데이터 추출
    function extractLoreItemData(formElement) {
        const titleInput = formElement.querySelector('input[name*=".name"]');
        const keywordInput = formElement.querySelector('textarea[name*=".keywords"]');
        const contentInput = formElement.querySelector('textarea[name*=".content"]');

        const title = titleInput ? titleInput.value.trim() : '';
        const keywords = keywordInput ? keywordInput.value.trim() : '';
        const content = contentInput ? contentInput.value.trim() : '';

        return JSON.stringify({ title, keywords, content });
    }

    // 항목 데이터 적용
    function applyLoreItemData(formElement, data) {
        let parsed = null;
        try {
            parsed = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
            const titleMatch = data.match(/\[TITLE\]\n([\s\S]*?)(?=\n\[KEYWORDS\]|$)/);
            const keywordMatch = data.match(/\[KEYWORDS\]\n([\s\S]*?)(?=\n\[CONTENT\]|$)/);
            const contentMatch = data.match(/\[CONTENT\]\n([\s\S]*?)$/);

            parsed = {
                title: titleMatch ? titleMatch[1].trim() : '',
                keywords: keywordMatch ? keywordMatch[1].trim() : '',
                content: contentMatch ? contentMatch[1].trim() : ''
            };
        }

        if (!parsed) return;

        const titleInput = formElement.querySelector('input[name*=".name"]');
        const keywordInput = formElement.querySelector('textarea[name*=".keywords"]');
        const contentInput = formElement.querySelector('textarea[name*=".content"]');

        if (titleInput) setInputValue(titleInput, parsed.title || '');
        if (keywordInput) setInputValue(keywordInput, parsed.keywords || '');
        if (contentInput) setInputValue(contentInput, parsed.content || '');
    }

    // UI 툴바 주입
    function injectToolbars() {
        const forms = document.querySelectorAll('[data-sentry-component="LorebookItemEditForm"]');

        forms.forEach((form) => {
            const rowContainer = form.closest('[data-sentry-component="LorebookItemRow"]');
            if (!rowContainer) return;

            const headerContainer = rowContainer.querySelector('.relative.flex.w-full.flex-row.items-start');
            if (!headerContainer) return;

            // 이미 동일한 헤더에 툴바가 존재하는지 검사 및 중복 툴바 정리
            const existingToolbars = headerContainer.querySelectorAll('.zeta-lorebook-toolbar');
            if (existingToolbars.length > 0) {
                // 1개 이상 존재하면 첫 번째만 남기고 나머지는 제거 (증식 방지)
                for (let i = 1; i < existingToolbars.length; i++) {
                    existingToolbars[i].remove();
                }
                return; // 이미 정리가 끝났고 정상 툴바가 1개 존재하므로 생성 중단
            }

            // 툴바 버튼 그룹 생성
            const toolbar = document.createElement('div');
            // 식별용 전용 클래스(zeta-lorebook-toolbar) 추가
            toolbar.className = 'zeta-lorebook-toolbar z-20 flex flex-row items-center gap-1.5 ml-auto mr-2';

            // 1. 복사 버튼
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.innerText = '📋 복사';
            copyBtn.className = 'body12 px-2 py-1 rounded-6 bg-white/10 hover:bg-white/20 text-white transition-colors font-medium';
            copyBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const jsonStr = extractLoreItemData(form);
                GM_setValue('zeta_lore_temp', jsonStr);

                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(jsonStr);
                } else {
                    navigator.clipboard.writeText(jsonStr);
                }

                copyBtn.innerText = '✅ 복사됨!';
                setTimeout(() => { copyBtn.innerText = '📋 복사'; }, 1200);
            };

            // 2. 붙여넣기 버튼
            const pasteBtn = document.createElement('button');
            pasteBtn.type = 'button';
            pasteBtn.innerText = '📥 싹다 붙여넣기';
            pasteBtn.className = 'body12 px-2 py-1 rounded-6 bg-primary-500/20 hover:bg-primary-500/30 text-primary-300 transition-colors font-medium';
            pasteBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                let savedData = GM_getValue('zeta_lore_temp', null);

                if (!savedData) {
                    try {
                        savedData = await navigator.clipboard.readText();
                    } catch (err) {
                        savedData = prompt("복사한 텍스트를 아래에 붙여넣어주세요:");
                    }
                }

                if (!savedData) {
                    alert('복사된 로어북 데이터가 없습니다. 먼저 [📋 복사] 버튼을 눌러주세요.');
                    return;
                }

                applyLoreItemData(form, savedData);

                pasteBtn.innerText = '✅ 완료!';
                setTimeout(() => { pasteBtn.innerText = '📥 싹다 붙여넣기'; }, 1200);
            };

            toolbar.appendChild(copyBtn);
            toolbar.appendChild(pasteBtn);

            const deleteBtn = headerContainer.querySelector('button[data-sentry-element="IconButton"]');
            if (deleteBtn) {
                headerContainer.insertBefore(toolbar, deleteBtn);
            } else {
                headerContainer.appendChild(toolbar);
            }
        });
    }

    // Observer 등록 (중복 실행 디바운싱 적용)
    let isPending = false;
    const observer = new MutationObserver(() => {
        if (!isPending) {
            isPending = true;
            requestAnimationFrame(() => {
                injectToolbars();
                isPending = false;
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    injectToolbars();
})();