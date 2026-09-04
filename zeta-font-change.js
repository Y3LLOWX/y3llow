// ==UserScript==
// @name         Zeta AI - 채팅방 글씨체 조절기
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  제타 AI 채팅방의 글씨체(폰트)를 경기천년제목, 마비옛체, 메이플스토리 L, 배민 연성, 굴림, KoPub 바탕, 나눔명조 등으로 자유롭게 변경합니다.
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
    // 1. 지원 폰트 목록 및 기본 설정
    // ==========================================
    const STORAGE_KEY = 'zeta_custom_font_settings_v3';

    const FONTS = [
        {
            id: 'default',
            name: '기본 글씨체',
            family: 'inherit'
        },
        {
            id: 'gyeonggi',
            name: '경기천년제목',
            family: "'GyeonggiTitle', sans-serif"
        },
        {
            id: 'mabinogi-classic',
            name: '마비옛체 (Mabinogi Classic)',
            family: "'MabinogiClassic', cursive, sans-serif"
        },
        {
            id: 'maplestory',
            name: '메이플스토리 Light',
            family: "'MaplestoryOTFLight', sans-serif"
        },
        {
            id: 'bm-yeonsung',
            name: '배달의민족 연성',
            family: "'BMYEONSUNG', cursive, sans-serif"
        },
        {
            id: 'gulim',
            name: '굴림',
            family: "'Gulim', '굴림', sans-serif"
        },
        {
            id: 'kopub-batang',
            name: 'KoPub 바탕',
            family: "'KoPub World Batang', serif"
        },
        {
            id: 'nanum-myeongjo',
            name: '나눔명조',
            family: "'Nanum Myeongjo', serif"
        }
    ];

    const DEFAULT_SETTINGS = {
        fontId: 'default'
    };

    let settings = Object.assign({}, DEFAULT_SETTINGS, GM_getValue(STORAGE_KEY, {}));
    let observerTimer = null;

    // ==========================================
    // 2. 동적 웹폰트 및 스타일 주입
    // ==========================================
    function applyCustomStyles() {
        let fontFaceEl = document.getElementById('zeta-custom-font-faces');
        if (!fontFaceEl) {
            fontFaceEl = document.createElement('style');
            fontFaceEl.id = 'zeta-custom-font-faces';
            fontFaceEl.innerHTML = `
                /* 경기천년제목 */
                @font-face {
                    font-family: 'GyeonggiTitle';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/GyeonggiTitleM.woff') format('woff');
                    font-weight: normal;
                    font-style: normal;
                }
                /* 마비옛체 (Mabinogi Classic) */
                @font-face {
                    font-family: 'MabinogiClassic';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2207-01@1.0/MabinogiClassicR.woff2') format('woff2');
                    font-weight: normal;
                    font-style: normal;
                }
                /* 넥슨 메이플스토리 Light */
                @font-face {
                    font-family: 'MaplestoryOTFLight';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MaplestoryOTFLight.woff') format('woff');
                    font-weight: normal;
                    font-style: normal;
                }
                /* 배달의민족 연성 */
                @font-face {
                    font-family: 'BMYEONSUNG';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/BMYEONSUNG.woff') format('woff');
                    font-weight: normal;
                    font-style: normal;
                }
                /* KoPub 바탕 */
                @import url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2109@1.0/KoPubWorldBatang.woff2');
                /* 나눔명조 */
                @import url('https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&display=swap');
            `;
            document.head.appendChild(fontFaceEl);
        }

        let styleEl = document.getElementById('zeta-custom-font-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'zeta-custom-font-style';
            document.head.appendChild(styleEl);
        }

        const selectedFont = FONTS.find(f => f.id === settings.fontId) || FONTS[0];

        styleEl.innerHTML = `
            [data-sentry-component="ChatBubbleContainer"] .chat,
            [data-sentry-component="NarratorBubble"] .chat {
                font-family: ${selectedFont.family} !important;
            }
        `;
    }

    // ==========================================
    // 3. 사이드바 메뉴 버튼 주입
    // ==========================================
    function injectSidebarButton() {
        if (document.getElementById('zeta-font-sidebar-btn')) return;

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
            btn.id = 'zeta-font-sidebar-btn';
            btn.className = targetBtn.className;
            btn.type = 'button';
            btn.innerHTML = `
                <span class="body14 flex-1 text-left font-medium text-gray-200">글씨체 변경</span>
                <span style="font-size: 13px; color: #60a5fa; margin-right: 4px;">🔤</span>
            `;

            targetBtn.parentNode.insertBefore(btn, targetBtn.nextSibling);
            btn.addEventListener('click', toggleFontModal);
        }
    }

    // ==========================================
    // 4. 글씨체 설정 모달 UI 생성
    // ==========================================
    function createFontModal() {
        if (document.getElementById('zeta-font-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'zeta-font-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 320px;
            max-height: 80vh;
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

        const optionsHtml = FONTS.map(font => `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255, 255, 255, 0.04); border-radius: 8px; cursor: pointer; border: 1px solid ${settings.fontId === font.id ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)'};">
                <span style="font-family: ${font.family}; font-size: 14px; color: ${settings.fontId === font.id ? '#60a5fa' : '#e4e4e7'};">
                    ${font.name}
                </span>
                <input type="radio" name="zeta-font-radio" value="${font.id}" ${settings.fontId === font.id ? 'checked' : ''} style="accent-color: #3b82f6; cursor: pointer;">
            </label>
        `).join('');

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 16px;">🔤</span>
                    <span style="font-weight: 600; font-size: 14px; color: #60a5fa;">채팅 글씨체 설정</span>
                </div>
                <button id="zeta-font-close" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 18px;">✕</button>
            </div>

            <!-- 글씨체 라디오 목록 -->
            <div id="zeta-font-list" style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 380px; padding-right: 4px;">
                ${optionsHtml}
            </div>

            <!-- 하단 버튼 -->
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                <button id="zeta-font-reset" style="background: rgba(255, 255, 255, 0.08); color: #a1a1aa; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">기본 글씨체로 복원</button>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('zeta-font-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        const radios = modal.querySelectorAll('input[name="zeta-font-radio"]');
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                settings.fontId = e.target.value;
                GM_setValue(STORAGE_KEY, settings);
                applyCustomStyles();
                updateModalSelection(modal);
            });
        });

        document.getElementById('zeta-font-reset').addEventListener('click', () => {
            settings.fontId = DEFAULT_SETTINGS.fontId;
            GM_setValue(STORAGE_KEY, settings);
            applyCustomStyles();
            updateModalSelection(modal);
        });
    }

    function updateModalSelection(modal) {
        const labels = modal.querySelectorAll('#zeta-font-list label');
        labels.forEach(label => {
            const radio = label.querySelector('input');
            const span = label.querySelector('span');
            const isChecked = radio.value === settings.fontId;
            radio.checked = isChecked;
            label.style.borderColor = isChecked ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)';
            span.style.color = isChecked ? '#60a5fa' : '#e4e4e7';
        });
    }

    function toggleFontModal() {
        createFontModal();
        const modal = document.getElementById('zeta-font-modal');
        if (modal) {
            modal.style.display = modal.style.display === 'none' || !modal.style.display ? 'flex' : 'none';
        }
    }

    // ==========================================
    // 5. DOM 감지 및 초기화
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
            console.log('[Zeta Font Selector] 로드 완료');
        }, 1000);
    }

    init();
})();