// ==UserScript==
// @name         Zeta AI - 채팅방 레이아웃 조절기
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  제타 AI 채팅방의 폰트 크기, 줄간격, 여백, 배경 투명도를 자유롭게 조절합니다.
// @author       You
// @match        https://zeta-ai.io/ko*
// @match        https://zeta-ai.io/ko/rooms/*
// @match        https://zeta-ai.io/*/rooms/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // 1. 기본 설정값 및 저장소 로드
    // ==========================================
    const STORAGE_KEY = 'zeta_custom_layout_settings_v2';

    const DEFAULT_SETTINGS = {
        fontSize: 15,       // 대화 폰트 크기 (px)
        lineHeight: 1.5,    // 줄간격 (em)
        bubblePadding: 12,  // 말풍선 여백 (px)
        bgOpacity: 100,     // 말풍선 배경 투명도 (%)
    };

    let settings = Object.assign({}, DEFAULT_SETTINGS, GM_getValue(STORAGE_KEY, {}));
    let observerTimer = null;

    // ==========================================
    // 2. 동적 CSS 스타일 주입
    // ==========================================
    function applyCustomStyles() {
        let styleEl = document.getElementById('zeta-custom-layout-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'zeta-custom-layout-style';
            document.head.appendChild(styleEl);
        }

        const alpha = settings.bgOpacity / 100;

        styleEl.innerHTML = `
            /* 채팅 말풍선 여백 조정 */
            [data-sentry-component="ChatBubbleContainer"] {
                padding: ${settings.bubblePadding}px !important;
                opacity: ${alpha} !important;
            }

            /* 채팅 텍스트 폰트 크기 및 줄간격 조정 */
            [data-sentry-component="ChatBubbleContainer"] .chat,
            [data-sentry-component="NarratorBubble"] .chat {
                font-size: ${settings.fontSize}px !important;
                line-height: ${settings.lineHeight} !important;
            }
        `;
    }

    // ==========================================
    // 3. 사이드바 메뉴 버튼 주입
    // ==========================================
    function injectSidebarButton() {
        if (document.getElementById('zeta-layout-sidebar-btn')) return;

        const buttons = document.querySelectorAll('button');
        let targetBtn = null;

        for (let i = 0; i < buttons.length; i++) {
            if (buttons[i].innerText.includes('대화 캡처')) {
                targetBtn = buttons[i];
                break;
            }
        }

        if (targetBtn) {
            const btn = document.createElement('button');
            btn.id = 'zeta-layout-sidebar-btn';
            btn.className = targetBtn.className;
            btn.type = 'button';
            btn.innerHTML = `
                <span class="body14 flex-1 text-left font-medium text-gray-200">레이아웃 조절기</span>
                <span style="font-size: 11px; color: #60a5fa; margin-right: 4px;">🎨</span>
            `;

            targetBtn.parentNode.insertBefore(btn, targetBtn.nextSibling);
            btn.addEventListener('click', toggleLayoutModal);
        }
    }

    // ==========================================
    // 4. 컨트롤 모달 UI 생성
    // ==========================================
    function createLayoutModal() {
        if (document.getElementById('zeta-layout-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'zeta-layout-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 320px;
            background: #18181b;
            color: #f4f4f5;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 16px;
            padding: 18px;
            font-size: 13px;
            z-index: 999999;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            flex-direction: column;
            gap: 14px;
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 16px;">🎨</span>
                    <span style="font-weight: 600; font-size: 14px; color: #60a5fa;">채팅 레이아웃 설정</span>
                </div>
                <button id="zeta-layout-close" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 18px;">✕</button>
            </div>

            <!-- 컨트롤 슬라이더 목록 -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #a1a1aa; font-size: 12px;">글자 크기</span>
                        <span id="val-fontSize" style="color: #60a5fa; font-weight: 600; font-size: 12px;">${settings.fontSize}px</span>
                    </div>
                    <input type="range" id="input-fontSize" min="12" max="24" step="1" value="${settings.fontSize}" style="width: 100%; accent-color: #3b82f6; cursor: pointer;">
                </div>

                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #a1a1aa; font-size: 12px;">줄간격</span>
                        <span id="val-lineHeight" style="color: #60a5fa; font-weight: 600; font-size: 12px;">${settings.lineHeight}</span>
                    </div>
                    <input type="range" id="input-lineHeight" min="1.0" max="2.2" step="0.1" value="${settings.lineHeight}" style="width: 100%; accent-color: #3b82f6; cursor: pointer;">
                </div>

                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #a1a1aa; font-size: 12px;">말풍선 여백 (Padding)</span>
                        <span id="val-bubblePadding" style="color: #60a5fa; font-weight: 600; font-size: 12px;">${settings.bubblePadding}px</span>
                    </div>
                    <input type="range" id="input-bubblePadding" min="4" max="24" step="1" value="${settings.bubblePadding}" style="width: 100%; accent-color: #3b82f6; cursor: pointer;">
                </div>

                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #a1a1aa; font-size: 12px;">말풍선 불투명도</span>
                        <span id="val-bgOpacity" style="color: #60a5fa; font-weight: 600; font-size: 12px;">${settings.bgOpacity}%</span>
                    </div>
                    <input type="range" id="input-bgOpacity" min="20" max="100" step="5" value="${settings.bgOpacity}" style="width: 100%; accent-color: #3b82f6; cursor: pointer;">
                </div>
            </div>

            <!-- 하단 버튼 -->
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
                <button id="zeta-layout-reset" style="background: rgba(255, 255, 255, 0.08); color: #a1a1aa; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">기본값 복원</button>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트 이벤트 리스너 바인딩
        document.getElementById('zeta-layout-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        const bindControl = (key, unit = '') => {
            const input = document.getElementById(`input-${key}`);
            const valDisplay = document.getElementById(`val-${key}`);

            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                settings[key] = val;
                valDisplay.innerText = `${val}${unit}`;
                applyCustomStyles();
                GM_setValue(STORAGE_KEY, settings);
            });
        };

        bindControl('fontSize', 'px');
        bindControl('lineHeight', '');
        bindControl('bubblePadding', 'px');
        bindControl('bgOpacity', '%');

        document.getElementById('zeta-layout-reset').addEventListener('click', () => {
            settings = Object.assign({}, DEFAULT_SETTINGS);
            GM_setValue(STORAGE_KEY, settings);

            Object.keys(DEFAULT_SETTINGS).forEach(key => {
                const input = document.getElementById(`input-${key}`);
                const valDisplay = document.getElementById(`val-${key}`);
                if (input) input.value = DEFAULT_SETTINGS[key];
                if (valDisplay) valDisplay.innerText = `${DEFAULT_SETTINGS[key]}${key === 'lineHeight' ? '' : key === 'bgOpacity' ? '%' : 'px'}`;
            });

            applyCustomStyles();
        });
    }

    function toggleLayoutModal() {
        createLayoutModal();
        const modal = document.getElementById('zeta-layout-modal');
        if (modal) {
            modal.style.display = modal.style.display === 'none' || !modal.style.display ? 'flex' : 'none';
        }
    }

    // ==========================================
    // 5. DOM 감지 및 초기화 (디바운스 적용)
    // ==========================================
    function observeZeta() {
        const observer = new MutationObserver(() => {
            if (observerTimer) clearTimeout(observerTimer);
            observerTimer = setTimeout(() => {
                injectSidebarButton();
            }, 300);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        setTimeout(() => {
            applyCustomStyles();
            injectSidebarButton();
            observeZeta();
            console.log('[Zeta UI Layout Regulator] 로드 완료');
        }, 1000);
    }

    init();
})();