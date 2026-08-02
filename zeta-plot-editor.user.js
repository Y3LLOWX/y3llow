// ==UserScript==
// @name         제타 AI 플롯 수정 & 크리에이터 센터 입력창 높이 조절
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  /plots/{코드}/edit 및 /creator-center 경로에서만 설정 입력창 높이 제한 해제 (인트로 제외)
// @author       You
// @match        https://zeta-ai.io/ko
// @match        https://zeta-ai.io/ko/*
// @match        https://zeta-ai.io/*/plots/*/edit
// @match        https://zeta-ai.io/plots/*/edit
// @match        https://zeta-ai.io/*/creator-center*
// @match        https://zeta-ai.io/creator-center*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // 1. 현재 URL이 정확히 /plots/{코드}/edit 또는 /creator-center 패턴인지 검증
    function isTargetPage() {
        const isPlotEdit = /\/plots\/[^\/]+\/edit/.test(window.location.pathname);
        const isCreatorCenter = /\/creator-center/.test(window.location.pathname);
        return isPlotEdit || isCreatorCenter;
    }

    // 2. 설정 전용 textarea 확장 & 인트로 전용 textarea 고정 CSS
    const customCSS = `
        /* [대상 페이지 - 설정 탭] 모든 입력창 높이 조절 가능 */
        body.zeta-plot-edit-target textarea:not([name="message"]) {
            resize: vertical !important;
            max-height: none !important;
            min-height: 150px !important;
        }

        /* [대상 페이지 - 설정 탭] 부모 컨테이너 제한 해제 */
        body.zeta-plot-edit-target div[data-sentry-component="TextInputSection"] > div {
            height: auto !important;
        }

        /* [대상 페이지 - 인트로 탭] 크기 조절 완전 차단 및 기본 사양 고정 */
        body.zeta-plot-edit-target textarea[name="message"] {
            resize: none !important;
            max-height: 124px !important;
            min-height: 35px !important;
            height: auto !important;
        }
    `;

    // CSS 강제 주입
    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(customCSS);
    } else {
        const style = document.createElement('style');
        style.textContent = customCSS;
        document.head.appendChild(style);
    }

    // 3. DOM 감지 및 스타일 적용
    function applyResizableTextareas() {
        // 지정된 URL 형태가 아니면 동작 중단 및 클래스 제거
        if (!isTargetPage()) {
            document.body.classList.remove('zeta-plot-edit-target');
            return;
        }

        // 조건이 맞을 때만 body에 식별용 클래스 추가
        document.body.classList.add('zeta-plot-edit-target');

        // 1) 설정용 textarea만 드래그 조절 속성 부여
        const settingTextareas = document.querySelectorAll('textarea:not([name="message"])');
        settingTextareas.forEach(ta => {
            if (!ta.dataset.customResized) {
                ta.style.resize = 'vertical';
                ta.style.maxHeight = 'none';
                ta.dataset.customResized = 'true';
            }
        });

        // 2) 인트로 메세지(name="message") 원상복구
        const introTextareas = document.querySelectorAll('textarea[name="message"]');
        introTextareas.forEach(ta => {
            ta.style.resize = 'none';
            ta.style.maxHeight = '124px';
            delete ta.dataset.customResized;
        });
    }

    // SPA 페이지 이동 대응 MutationObserver
    const observer = new MutationObserver(() => {
        applyResizableTextareas();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 초기 실행
    applyResizableTextareas();
})();