// ==UserScript==
// @name         Zeta AI - 채팅방 커스텀 올인원
// @namespace    http://tampermonkey.net/
// @version      6.6
// @description  제타 AI 채팅방 전용
// @author       You
// @match        https://zeta-ai.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    function isRoomPage() {
        // /ko/rooms/ 뒤에 실제 방 ID가 붙은 상세 방 페이지만 인식하도록 엄격화 (목록 페이지 제외)
        return /^\/ko\/rooms\/[^/?#]+/.test(location.pathname);
    }

    function getRoomId() {
        const match = location.pathname.match(/\/ko\/rooms\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    function getRoomDisplayName() {
        const profileBtn = document.querySelector('button[data-testid="chat-header-profile"] span, button[aria-label="Open plot profile"] span');
        if (profileBtn && profileBtn.innerText.trim()) {
            return profileBtn.innerText.trim();
        }
        const headerTitle = document.querySelector('header [class*="title16"], header h1');
        if (headerTitle && headerTitle.innerText.trim()) {
            return headerTitle.innerText.trim();
        }
        return '';
    }

    // ==========================================
    // 1. 설정 저장소 및 헬퍼
    // ==========================================
    const STORAGE_KEY = 'zeta_all_in_one_settings_v3';
    const ROOM_BG_STORAGE_KEY = 'zeta_room_bg_settings_v1';
    const POS_STORAGE_KEY = 'zeta_all_in_one_pos_v1';
    const SECTIONS_STORAGE_KEY = 'zeta_all_in_one_sections_v1';

    const FONTS = [
        { id: 'default', name: '기본 글씨체', family: 'inherit' },
        { id: 'gyeonggi', name: '경기천년제목', family: "'GyeonggiTitle', sans-serif" },
        { id: 'mabinogi-classic', name: '마비옛체 (Mabinogi Classic)', family: "'MabinogiClassic', cursive, sans-serif" },
        { id: 'maplestory', name: '메이플스토리 Light', family: "'MaplestoryOTFLight', sans-serif" },
        { id: 'bm-yeonsung', name: '배달의민족 연성', family: "'BMYEONSUNG', cursive, sans-serif" },
        { id: 'gulim', name: '굴림', family: "'Gulim', '굴림', sans-serif" },
        { id: 'kopub-batang', name: 'KoPub 바탕', family: "'KoPubWorldBatang', 'KoPub World Batang', serif" }
    ];

    const DEFAULT_SETTINGS = {
        bgColor: '#151516',
        blur: 3,
        dim: 35,
        fontSize: 15,
        lineHeight: 1.5,
        bubblePadding: 12,
        bgOpacity: 85,
        fontId: 'default'
    };

    function getSettings() {
        return Object.assign({}, DEFAULT_SETTINGS, GM_getValue(STORAGE_KEY, {}));
    }

    function getRoomBgMap() {
        return GM_getValue(ROOM_BG_STORAGE_KEY, {});
    }

    let settings = getSettings();
    let roomBgMap = getRoomBgMap();
    let modalPos = GM_getValue(POS_STORAGE_KEY, null);
    let sectionState = Object.assign({ bg: true, list: true, layout: false, font: false }, GM_getValue(SECTIONS_STORAGE_KEY, {}));

    function getCurrentRoomBg() {
        const roomId = getRoomId();
        const map = getRoomBgMap();
        if (roomId && map[roomId]) {
            return map[roomId];
        }
        return { bgData: '', bgOriginalData: '', bgName: '', charName: '' };
    }

    function saveCurrentRoomBg(bgData, bgOriginalData, bgName) {
        const roomId = getRoomId();
        if (!roomId) return;

        const map = getRoomBgMap();
        if (!bgData && !bgOriginalData) {
            delete map[roomId];
        } else {
            const charName = getRoomDisplayName() || (map[roomId] && map[roomId].charName) || '이름 로딩 중...';
            map[roomId] = { bgData, bgOriginalData, bgName, charName };
        }
        GM_setValue(ROOM_BG_STORAGE_KEY, map);
        roomBgMap = map;
        renderRegisteredBgList();
    }

    function syncCurrentRoomCharName() {
        const roomId = getRoomId();
        if (!roomId) return;

        const map = getRoomBgMap();
        if (!map[roomId]) return;

        const currentName = getRoomDisplayName();
        if (currentName && (!map[roomId].charName || map[roomId].charName === '이름 로딩 중...' || map[roomId].charName.startsWith('방 ('))) {
            map[roomId].charName = currentName;
            GM_setValue(ROOM_BG_STORAGE_KEY, map);
            roomBgMap = map;
            renderRegisteredBgList();
        }
    }

    // ==========================================
    // 2. 배경 주입 및 투명화 CSS (Fade-in 적용)
    // ==========================================
    function removeCustomEffects() {
        const bgContainer = document.getElementById('zeta-custom-bg-container');
        if (bgContainer) bgContainer.remove();

        const mainStyle = document.getElementById('zeta-custom-main-style');
        if (mainStyle) mainStyle.remove();

        const sidebarBtn = document.getElementById('zeta-combo-sidebar-btn');
        if (sidebarBtn) sidebarBtn.remove();

        const comboModal = document.getElementById('zeta-combo-modal');
        if (comboModal) comboModal.remove();

        const cropModal = document.getElementById('zeta-crop-modal');
        if (cropModal) cropModal.remove();
    }

    function injectDirectBackground(bgData) {
        if (!isRoomPage()) return;
        if (!document.body) return;

        let bgContainer = document.getElementById('zeta-custom-bg-container');
        if (!bgContainer) {
            bgContainer = document.createElement('div');
            bgContainer.id = 'zeta-custom-bg-container';
            bgContainer.style.cssText = `
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                pointer-events: none !important;
                z-index: 0 !important;
                overflow: hidden !important;
                background-color: #000000 !important;
            `;
            document.body.prepend(bgContainer);
        } else {
            bgContainer.style.backgroundColor = '#000000 !important';
        }

        const curSettings = getSettings();

        if (bgData) {
            const existingImg = document.getElementById('zeta-custom-bg-image');

            if (existingImg && existingImg.getAttribute('data-bg-src') === bgData) {
                existingImg.style.filter = `blur(${curSettings.blur}px)`;
                const dimEl = document.getElementById('zeta-custom-bg-dim');
                if (dimEl) dimEl.style.opacity = `${curSettings.dim / 100}`;
                return;
            }

            bgContainer.innerHTML = `
                <div id="zeta-custom-bg-image" data-bg-src="${bgData}" style="
                    position: absolute !important;
                    inset: -20px !important;
                    background-image: url('${bgData}') !important;
                    background-position: center !important;
                    background-size: cover !important;
                    background-repeat: no-repeat !important;
                    filter: blur(${curSettings.blur}px) !important;
                    opacity: 0 !important;
                    transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) !important;
                "></div>
                <div id="zeta-custom-bg-dim" style="
                    position: absolute !important;
                    inset: 0 !important;
                    background: #000000 !important;
                    opacity: 0 !important;
                    transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) !important;
                "></div>
            `;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const imgEl = document.getElementById('zeta-custom-bg-image');
                    const dimEl = document.getElementById('zeta-custom-bg-dim');
                    if (imgEl) imgEl.style.setProperty('opacity', '1', 'important');
                    if (dimEl) dimEl.style.setProperty('opacity', `${curSettings.dim / 100}`, 'important');
                });
            });
        } else {
            bgContainer.innerHTML = '';
        }
    }

    function applyCustomStyles() {
        if (!isRoomPage()) {
            removeCustomEffects();
            return;
        }

        const currentBg = getCurrentRoomBg();
        const hasBg = Boolean(currentBg.bgData);
        injectDirectBackground(currentBg.bgData);

        // 폰트 등록
        let fontFaceEl = document.getElementById('zeta-custom-font-faces');
        if (!fontFaceEl && document.head) {
            fontFaceEl = document.createElement('style');
            fontFaceEl.id = 'zeta-custom-font-faces';
            fontFaceEl.innerHTML = `
                @font-face {
                    font-family: 'GyeonggiTitle';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/GyeonggiTitleM.woff') format('woff');
                }
                @font-face {
                    font-family: 'MabinogiClassic';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2207-01@1.0/MabinogiClassicR.woff2') format('woff2');
                }
                @font-face {
                    font-family: 'MaplestoryOTFLight';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MaplestoryOTFLight.woff') format('woff');
                }
                @font-face {
                    font-family: 'BMYEONSUNG';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/BMYEONSUNG.woff') format('woff');
                }
                @font-face {
                    font-family: 'KoPubWorldBatang';
                    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2109@1.0/KoPubWorldBatang_Medium.woff2') format('woff2');
                }
            `;
            document.head.appendChild(fontFaceEl);
        }

        let styleEl = document.getElementById('zeta-custom-main-style');
        if (!styleEl && (document.head || document.documentElement)) {
            styleEl = document.createElement('style');
            styleEl.id = 'zeta-custom-main-style';
            (document.head || document.documentElement).appendChild(styleEl);
        }

        const curSettings = getSettings();
        const selectedFont = FONTS.find(f => f.id === curSettings.fontId) || FONTS[0];
        const bubbleAlpha = curSettings.bgOpacity / 100;
        const currentChatBgColor = curSettings.bgColor || '#151516';

        if (styleEl) {
            styleEl.innerHTML = `
                /* 웹 전체 기본 바탕색: 000000 (순수 블랙) 고정 */
                html, body {
                    background-color: #000000 !important;
                }

                /* 최상위 래퍼 투명 처리하여 body의 #000000이 기본으로 보이도록 설정 */
                #__next,
                main,
                section {
                    background-color: transparent !important;
                }

                /*
                   채팅방 내부 영역:
                   - 이미지가 등록되어 있을 때: 투명 처리하여 배경 이미지가 비침
                   - 이미지가 없을 때: 컬러 피커에서 설정한 색상(기본 #151516) 적용
                */
                ${hasBg ? `
                div[class*="ChatRoom_"],
                div[class*="Chat_"],
                div[role="region"],
                div[class*="flex-1 overflow-y-auto"],
                div[class*="relative flex h-full"],
                div[class*="bg-zinc-"],
                div[class*="bg-gray-900"],
                div[class*="bg-gray-950"],
                div[class*="bg-black"] {
                    background-color: transparent !important;
                }
                ` : `
                div[class*="ChatRoom_"],
                div[class*="Chat_"],
                div[role="region"],
                div[class*="flex-1 overflow-y-auto"],
                div[class*="relative flex h-full"] {
                    background-color: ${currentChatBgColor} !important;
                }
                `}

                /* 말풍선 투명도 및 스타일 적용 */
                [data-sentry-component="ChatBubbleContainer"],
                [data-sentry-component="ChatBubbleContainer"] > div,
                [data-sentry-component="ChatBubbleContainer"].bg-gray-sub1,
                [data-sentry-component="ChatBubbleContainer"] .bg-gray-sub1,
                [data-sentry-component="NarratorBubble"] .bg-gray-main,
                [data-sentry-component="NarratorBubble"] > div,
                .message-context-menu-trigger {
                    background-color: rgba(24, 24, 27, ${bubbleAlpha}) !important;
                    backdrop-filter: blur(8px) !important;
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    padding: ${curSettings.bubblePadding}px !important;
                }

                [data-sentry-component="ChatBubbleContainer"] > div {
                    background-color: transparent !important;
                    border: none !important;
                    padding: 0 !important;
                    backdrop-filter: none !important;
                }

                [data-sentry-component="ChatBubbleContainer"] .chat,
                [data-sentry-component="ChatBubbleContainer"] p,
                [data-sentry-component="ChatBubbleContainer"] span,
                [data-sentry-component="NarratorBubble"] .chat,
                [data-sentry-component="NarratorBubble"] p,
                [data-sentry-component="NarratorBubble"] em,
                [data-sentry-component="NarratorBubble"] span {
                    font-family: ${selectedFont.family} !important;
                    font-size: ${curSettings.fontSize}px !important;
                    line-height: ${curSettings.lineHeight} !important;
                }
            `;
        }
    }

    // ==========================================
    // 3. 1920 x 915 고정비율 프레임 맞추기 모달
    // ==========================================
    function openInteractiveCropModal() {
        const currentBg = getCurrentRoomBg();
        if (!currentBg.bgOriginalData) {
            alert('자르기할 이미지가 없습니다.');
            return;
        }

        let cropModal = document.getElementById('zeta-crop-modal');
        if (cropModal) cropModal.remove();

        cropModal = document.createElement('div');
        cropModal.id = 'zeta-crop-modal';
        cropModal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            z-index: 1000000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(6px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            user-select: none;
        `;

        cropModal.innerHTML = `
            <div style="
                background: #18181b;
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 16px;
                padding: 18px;
                width: 680px;
                max-width: 95vw;
                color: #f4f4f5;
                box-shadow: 0 25px 60px rgba(0,0,0,0.85);
                display: flex;
                flex-direction: column;
                gap: 12px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 16px;">🎯</span>
                        <span style="font-weight: 600; font-size: 14px; color: #38bdf8;">배경 위치/크기 맞추기 (1920 × 915 고정)</span>
                    </div>
                    <button id="zeta-crop-close" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 18px;">✕</button>
                </div>

                <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
                    <span>박스 내부를 <b>드래그하여 위치 이동</b>, 우측 하단 <b>핸들(■)로 크기 조절</b></span>
                    <span id="zeta-crop-size-indicator" style="color: #38bdf8; font-weight: 600; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px;">1920 × 915</span>
                </div>

                <div id="zeta-crop-stage" style="
                    position: relative;
                    width: 100%;
                    height: 400px;
                    background: #09090b;
                    border-radius: 8px;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div id="zeta-crop-wrapper" style="position: relative; display: inline-block;">
                        <img id="zeta-crop-source-img" src="${currentBg.bgOriginalData}" style="display: block; max-width: 640px; max-height: 400px; pointer-events: none;">
                        <div id="zeta-crop-box" style="
                            position: absolute;
                            border: 2px solid #38bdf8;
                            background: rgba(56, 189, 248, 0.12);
                            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.65);
                            cursor: move;
                            box-sizing: border-box;
                        ">
                            <div style="position: absolute; top: 4px; left: 6px; font-size: 10px; color: #38bdf8; font-weight: bold; pointer-events: none;">1920:915</div>
                            <div id="zeta-crop-resize-handle" style="
                                position: absolute;
                                right: -5px;
                                bottom: -5px;
                                width: 12px;
                                height: 12px;
                                background: #38bdf8;
                                border: 2px solid #ffffff;
                                border-radius: 2px;
                                cursor: se-resize;
                            "></div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <button id="zeta-crop-reset-orig" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">원본으로 복원</button>
                    <div style="display: flex; gap: 8px;">
                        <button id="zeta-crop-cancel" style="background: rgba(255, 255, 255, 0.08); color: #a1a1aa; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px;">취소</button>
                        <button id="zeta-crop-apply" style="background: #0284c7; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">적용 완료</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(cropModal);

        const wrapper = document.getElementById('zeta-crop-wrapper');
        const sourceImg = document.getElementById('zeta-crop-source-img');
        const cropBox = document.getElementById('zeta-crop-box');
        const resizeHandle = document.getElementById('zeta-crop-resize-handle');
        const sizeIndicator = document.getElementById('zeta-crop-size-indicator');

        const TARGET_RATIO = 1920 / 915;

        let box = { x: 0, y: 0, w: 0, h: 0 };
        let mode = null;
        let dragStart = { x: 0, y: 0, initBox: null };

        function updateCropUI() {
            cropBox.style.left = `${box.x}px`;
            cropBox.style.top = `${box.y}px`;
            cropBox.style.width = `${box.w}px`;
            cropBox.style.height = `${box.h}px`;

            const wrapRect = wrapper.getBoundingClientRect();
            if (wrapRect.width > 0 && sourceImg.naturalWidth > 0) {
                const scaleX = sourceImg.naturalWidth / wrapRect.width;
                const scaleY = sourceImg.naturalHeight / wrapRect.height;
                const realW = Math.round(box.w * scaleX);
                const realH = Math.round(box.h * scaleY);
                sizeIndicator.innerText = `${realW} × ${realH} px (비율 1920:915)`;
            }
        }

        function initCropBox() {
            const wrapW = wrapper.offsetWidth;
            const wrapH = wrapper.offsetHeight;

            let w = wrapW * 0.9;
            let h = w / TARGET_RATIO;

            if (h > wrapH * 0.9) {
                h = wrapH * 0.9;
                w = h * TARGET_RATIO;
            }

            box.w = Math.max(w, 60);
            box.h = box.w / TARGET_RATIO;
            box.x = (wrapW - box.w) / 2;
            box.y = (wrapH - box.h) / 2;

            updateCropUI();
        }

        if (sourceImg.complete) {
            initCropBox();
        } else {
            sourceImg.onload = initCropBox;
        }

        cropBox.addEventListener('mousedown', (e) => {
            if (e.target === resizeHandle) return;
            mode = 'move';
            dragStart = { x: e.clientX, y: e.clientY, initBox: { ...box } };
            e.stopPropagation();
            e.preventDefault();
        });

        resizeHandle.addEventListener('mousedown', (e) => {
            mode = 'resize';
            dragStart = { x: e.clientX, y: e.clientY, initBox: { ...box } };
            e.stopPropagation();
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!mode) return;

            const wrapW = wrapper.offsetWidth;
            const wrapH = wrapper.offsetHeight;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            if (mode === 'move') {
                let nextX = dragStart.initBox.x + dx;
                let nextY = dragStart.initBox.y + dy;

                nextX = Math.max(0, Math.min(nextX, wrapW - box.w));
                nextY = Math.max(0, Math.min(nextY, wrapH - box.h));

                box.x = nextX;
                box.y = nextY;
            } else if (mode === 'resize') {
                let newW = dragStart.initBox.w + dx;
                let newH = newW / TARGET_RATIO;

                const minW = 60;
                const maxW = wrapW - dragStart.initBox.x;
                const maxH = wrapH - dragStart.initBox.y;

                if (newW < minW) {
                    newW = minW;
                    newH = newW / TARGET_RATIO;
                }
                if (newW > maxW) {
                    newW = maxW;
                    newH = newW / TARGET_RATIO;
                }
                if (newH > maxH) {
                    newH = maxH;
                    newW = newH * TARGET_RATIO;
                }

                box.w = newW;
                box.h = newH;
            }

            updateCropUI();
        });

        window.addEventListener('mouseup', () => {
            mode = null;
        });

        document.getElementById('zeta-crop-apply').addEventListener('click', () => {
            const wrapW = wrapper.offsetWidth;
            const wrapH = wrapper.offsetHeight;

            const scaleX = sourceImg.naturalWidth / wrapW;
            const scaleY = sourceImg.naturalHeight / wrapH;

            const cropX = Math.round(box.x * scaleX);
            const cropY = Math.round(box.y * scaleY);
            const cropW = Math.round(box.w * scaleX);
            const cropH = Math.round(box.h * scaleY);

            const canvas = document.createElement('canvas');
            canvas.width = 1920;
            canvas.height = 915;
            const ctx = canvas.getContext('2d');

            const fullImg = new Image();
            fullImg.onload = () => {
                ctx.drawImage(fullImg, cropX, cropY, cropW, cropH, 0, 0, 1920, 915);
                const croppedData = canvas.toDataURL('image/jpeg', 0.95);
                saveCurrentRoomBg(croppedData, currentBg.bgOriginalData, currentBg.bgName);
                applyCustomStyles();
                cropModal.remove();
            };
            fullImg.src = currentBg.bgOriginalData;
        });

        document.getElementById('zeta-crop-reset-orig').addEventListener('click', () => {
            saveCurrentRoomBg(currentBg.bgOriginalData, currentBg.bgOriginalData, currentBg.bgName);
            applyCustomStyles();
            cropModal.remove();
        });

        const closeModal = () => cropModal.remove();
        document.getElementById('zeta-crop-close').addEventListener('click', closeModal);
        document.getElementById('zeta-crop-cancel').addEventListener('click', closeModal);
    }

    // ==========================================
    // 4. 사이드바 메뉴 버튼 주입
    // ==========================================
    function injectSidebarButton() {
        if (!isRoomPage()) return;
        if (document.getElementById('zeta-combo-sidebar-btn')) return;

        const buttons = document.querySelectorAll('button');
        let targetBtn = null;

        for (let i = 0; i < buttons.length; i++) {
            if (buttons[i].innerText.includes('대화 캡처')) {
                targetBtn = buttons[i];
                break;
            }
        }

        if (targetBtn && targetBtn.parentNode) {
            const btn = document.createElement('button');
            btn.id = 'zeta-combo-sidebar-btn';
            btn.className = targetBtn.className;
            btn.type = 'button';
            btn.innerHTML = `
                <span class="body14 flex-1 text-left font-medium text-gray-200">채팅 뷰 커스텀</span>
                <span style="font-size: 13px; color: #38bdf8; margin-right: 4px;">🎨</span>
            `;

            targetBtn.parentNode.insertBefore(btn, targetBtn.nextSibling);
            btn.addEventListener('click', toggleComboModal);
        }
    }

    // ==========================================
    // 5. 모달 위치 제어 및 드래그 바인딩
    // ==========================================
    function applyModalPosition(modal) {
        if (modalPos && typeof modalPos.top === 'number' && typeof modalPos.left === 'number') {
            modal.style.top = `${modalPos.top}px`;
            modal.style.left = `${modalPos.left}px`;
            modal.style.transform = 'none';
        } else {
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
        }
    }

    function resetModalToCenter() {
        const modal = document.getElementById('zeta-combo-modal');
        modalPos = null;
        GM_setValue(POS_STORAGE_KEY, null);

        if (modal) {
            applyModalPosition(modal);
        }
    }

    function makeDraggable(modal, handle) {
        let isDragging = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

            isDragging = true;
            const rect = modal.getBoundingClientRect();

            modal.style.transform = 'none';
            modal.style.left = `${rect.left}px`;
            modal.style.top = `${rect.top}px`;

            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;

            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let nextLeft = initialLeft + deltaX;
            let nextTop = initialTop + deltaY;

            const minX = 0;
            const minY = 0;
            const maxX = window.innerWidth - modal.offsetWidth;
            const maxY = window.innerHeight - modal.offsetHeight;

            nextLeft = Math.max(minX, Math.min(nextLeft, maxX));
            nextTop = Math.max(minY, Math.min(nextTop, maxY));

            modal.style.left = `${nextLeft}px`;
            modal.style.top = `${nextTop}px`;
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            document.body.style.userSelect = '';

            const rect = modal.getBoundingClientRect();
            modalPos = { top: rect.top, left: rect.left };
            GM_setValue(POS_STORAGE_KEY, modalPos);
        });
    }

    // ==========================================
    // 6. 파일 처리 및 UI 헬퍼
    // ==========================================
    function processImageFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('이미지 파일(JPG, PNG, WEBP 등)만 등록 가능합니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            saveCurrentRoomBg(e.target.result, e.target.result, file.name);
            updateFileStatusUI();
            applyCustomStyles();
        };
        reader.readAsDataURL(file);
    }

    function updateFileStatusUI() {
        const nameEl = document.getElementById('zeta-file-name');
        const clearBtn = document.getElementById('btn-clear-file');
        const cropBtn = document.getElementById('btn-open-crop');
        const currentBg = getCurrentRoomBg();

        if (nameEl) {
            if (currentBg.bgData || currentBg.bgOriginalData) {
                nameEl.innerText = currentBg.bgName ? `이 방 배경: ${currentBg.bgName}` : '이미지 첨부됨';
                nameEl.style.color = '#38bdf8';
                if (clearBtn) clearBtn.style.display = 'inline-block';
                if (cropBtn) cropBtn.style.display = 'inline-flex';
            } else {
                nameEl.innerText = '이 방의 배경 이미지를 등록하세요';
                nameEl.style.color = '#a1a1aa';
                if (clearBtn) clearBtn.style.display = 'none';
                if (cropBtn) cropBtn.style.display = 'none';
            }
        }
    }

    function updateSectionAccordion(sectionKey) {
        const contentEl = document.getElementById(`zeta-section-${sectionKey}-content`);
        const toggleBtn = document.getElementById(`zeta-toggle-${sectionKey}`);

        if (!contentEl || !toggleBtn) return;

        const isCollapsed = !sectionState[sectionKey];
        if (isCollapsed) {
            contentEl.style.display = 'none';
            toggleBtn.innerHTML = '&#9660;';
            toggleBtn.title = '펼치기';
        } else {
            contentEl.style.display = 'flex';
            toggleBtn.innerHTML = '&#9650;';
            toggleBtn.title = '접기';
        }
    }

    function renderRegisteredBgList() {
        const listContainer = document.getElementById('zeta-registered-bg-list');
        const countBadge = document.getElementById('zeta-registered-bg-count');
        if (!listContainer) return;

        const map = getRoomBgMap();
        const roomIds = Object.keys(map);
        if (countBadge) {
            countBadge.innerText = `${roomIds.length}개`;
        }

        if (roomIds.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: #71717a; padding: 12px 0; font-size: 11px;">
                    등록된 캐릭터 배경 이미지가 없습니다.
                </div>
            `;
            return;
        }

        const currentRoomId = getRoomId();

        listContainer.innerHTML = roomIds.map(rId => {
            const item = map[rId];
            const isCurrent = rId === currentRoomId;
            const displayName = item.charName || '캐릭터';
            const fileName = item.bgName || '이미지 첨부됨';

            return `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: ${isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)'};
                    border: 1px solid ${isCurrent ? '#0284c7' : 'rgba(255, 255, 255, 0.06)'};
                    border-radius: 8px;
                    padding: 6px 8px;
                    gap: 8px;
                ">
                    <img src="${item.bgData || item.bgOriginalData}" style="
                        width: 44px;
                        height: 24px;
                        object-fit: cover;
                        border-radius: 4px;
                        border: 1px solid rgba(255,255,255,0.1);
                        flex-shrink: 0;
                    " alt="thumbnail">

                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                        <div style="font-size: 11px; font-weight: 600; color: ${isCurrent ? '#38bdf8' : '#e4e4e7'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${displayName} ${isCurrent ? '<span style="font-size: 9px; color: #38bdf8; margin-left: 2px;">(현재 방)</span>' : ''}
                        </div>
                        <div style="font-size: 10px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${fileName}
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                        ${!isCurrent ? `
                            <button class="zeta-btn-goto-room" data-room-id="${rId}" style="
                                background: rgba(56, 189, 248, 0.15);
                                border: none;
                                color: #38bdf8;
                                padding: 3px 6px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 10px;
                            ">이동</button>
                        ` : ''}
                        <button class="zeta-btn-delete-room-bg" data-room-id="${rId}" style="
                            background: rgba(248, 113, 113, 0.15);
                            border: none;
                            color: #f87171;
                            padding: 3px 6px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                        ">삭제</button>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.zeta-btn-goto-room').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-room-id');
                if (targetId) {
                    location.href = `https://zeta-ai.io/ko/rooms/${targetId}`;
                }
            });
        });

        listContainer.querySelectorAll('.zeta-btn-delete-room-bg').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-room-id');
                if (targetId && confirm('해당 캐릭터의 배경 이미지를 삭제하시겠습니까?')) {
                    const curMap = getRoomBgMap();
                    delete curMap[targetId];
                    GM_setValue(ROOM_BG_STORAGE_KEY, curMap);
                    roomBgMap = curMap;
                    renderRegisteredBgList();
                    if (targetId === getRoomId()) {
                        updateFileStatusUI();
                        applyCustomStyles();
                    }
                }
            });
        });
    }

    // ==========================================
    // 7. 통합 모달 UI 생성
    // ==========================================
    function createComboModal() {
        if (document.getElementById('zeta-combo-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'zeta-combo-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            width: 350px;
            max-height: 85vh;
            background: #18181b;
            color: #f4f4f5;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 16px;
            padding: 16px;
            font-size: 13px;
            z-index: 999999;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            flex-direction: column;
            gap: 12px;
        `;

        applyModalPosition(modal);

        const curSettings = getSettings();
        const optionsHtml = FONTS.map(font => `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(255, 255, 255, 0.04); border-radius: 8px; cursor: pointer; border: 1px solid ${curSettings.fontId === font.id ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)'};">
                <span style="font-family: ${font.family}; font-size: 13px; color: ${curSettings.fontId === font.id ? '#38bdf8' : '#e4e4e7'};">
                    ${font.name}
                </span>
                <input type="radio" name="zeta-font-radio" value="${font.id}" ${curSettings.fontId === font.id ? 'checked' : ''} style="accent-color: #0284c7; cursor: pointer;">
            </label>
        `).join('');

        modal.innerHTML = `
            <div id="zeta-combo-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; cursor: grab; user-select: none;">
                <div style="display: flex; align-items: center; gap: 6px; pointer-events: none;">
                    <span style="font-size: 16px;">🎨</span>
                    <span style="font-weight: 600; font-size: 14px; color: #38bdf8;">채팅 뷰 커스텀</span>
                </div>
                <button id="zeta-combo-close" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 16px; padding: 2px 4px;" title="닫기">✕</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: calc(85vh - 100px); padding-right: 4px;">
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px;">
                    <div id="zeta-header-bg" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                        <span style="font-weight: 600; font-size: 12px; color: #cbd5e1;">🖼️ 현재 캐릭터 배경 (1920×915 맞춤)</span>
                        <button id="zeta-toggle-bg" style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 11px; padding: 2px 4px;" title="접기/펼치기">&#9660;</button>
                    </div>

                    <div id="zeta-section-bg-content" style="display: none; flex-direction: column; gap: 10px; margin-top: 10px;">
                        <div>
                            <input type="file" id="zeta-bg-file-input" accept="image/*" style="display: none;">
                            <div id="zeta-bg-dropzone" style="
                                border: 2px dashed rgba(255, 255, 255, 0.2);
                                border-radius: 8px;
                                padding: 12px;
                                text-align: center;
                                cursor: pointer;
                                background: rgba(255, 255, 255, 0.02);
                            ">
                                <div style="font-size: 16px; margin-bottom: 2px;">📁</div>
                                <div id="zeta-file-name" style="font-size: 11px; color: #a1a1aa; word-break: break-all;">
                                    이미지를 클릭하거나 드래그하여 첨부
                                </div>
                            </div>

                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                                <button id="btn-open-crop" style="display: none; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 11px; align-items: center; gap: 4px;">
                                    🎯 1920×915 맞추기/자르기
                                </button>
                                <button id="btn-clear-file" style="display: none; background: none; border: none; color: #f87171; cursor: pointer; font-size: 11px; text-decoration: underline; margin-left: auto;">현재 방 이미지 제거</button>
                            </div>
                        </div>

                        <!-- 기본 배경 색상 선택 도구 (Color Picker) -->
                        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span style="color: #cbd5e1; font-size: 11px; font-weight: 500;">🎨 채팅방 배경 색상 (이미지 없을 시)</span>
                                <button id="btn-reset-bg-color" style="background: none; border: none; color: #71717a; cursor: pointer; font-size: 10px; text-decoration: underline;">#151516 복원</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="color" id="input-bg-color-picker" value="${curSettings.bgColor || '#151516'}" style="
                                    width: 34px;
                                    height: 26px;
                                    padding: 0;
                                    border: 1px solid rgba(255,255,255,0.2);
                                    border-radius: 4px;
                                    background: none;
                                    cursor: pointer;
                                ">
                                <input type="text" id="input-bg-color-text" value="${curSettings.bgColor || '#151516'}" maxlength="7" style="
                                    width: 80px;
                                    background: rgba(0, 0, 0, 0.4);
                                    border: 1px solid rgba(255, 255, 255, 0.15);
                                    border-radius: 4px;
                                    color: #38bdf8;
                                    font-size: 11px;
                                    font-family: monospace;
                                    padding: 4px 6px;
                                    text-align: center;
                                ">
                                <span style="font-size: 10px; color: #71717a;">외부: #000000 / 채팅창: 선택 색상</span>
                            </div>
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span style="color: #a1a1aa; font-size: 11px;">배경 블러(흐림)</span>
                                <span id="val-blur" style="color: #38bdf8; font-weight: 600; font-size: 11px;">${curSettings.blur}px</span>
                            </div>
                            <input type="range" id="input-blur" min="0" max="25" step="1" value="${curSettings.blur}" style="width: 100%; accent-color: #0284c7; cursor: pointer;">
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span style="color: #a1a1aa; font-size: 11px;">어둡게 (가독성)</span>
                                <span id="val-dim" style="color: #38bdf8; font-weight: 600; font-size: 11px;">${curSettings.dim}%</span>
                            </div>
                            <input type="range" id="input-dim" min="0" max="90" step="5" value="${curSettings.dim}" style="width: 100%; accent-color: #0284c7; cursor: pointer;">
                        </div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px;">
                    <div id="zeta-header-list" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-weight: 600; font-size: 12px; color: #cbd5e1;">📋 등록된 배경 관리</span>
                            <span id="zeta-registered-bg-count" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 10px;">0개</span>
                        </div>
                        <button id="zeta-toggle-list" style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 11px; padding: 2px 4px;" title="접기/펼치기">&#9660;</button>
                    </div>

                    <div id="zeta-section-list-content" style="display: none; flex-direction: column; gap: 6px; margin-top: 10px;">
                        <div id="zeta-registered-bg-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding-right: 2px;"></div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px;">
                    <div id="zeta-header-layout" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                        <span style="font-weight: 600; font-size: 12px; color: #cbd5e1;">📐 레이아웃 상세 설정</span>
                        <button id="zeta-toggle-layout" style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 11px; padding: 2px 4px;" title="접기/펼치기">&#9660;</button>
                    </div>

                    <div id="zeta-section-layout-content" style="display: none; flex-direction: column; gap: 10px; margin-top: 10px;">
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span style="color: #a1a1aa; font-size: 11px;">글자 크기</span>
                                <span id="val-fontSize" style="color: #38bdf8; font-weight: 600; font-size: 11px;">${curSettings.fontSize}px</span>
                            </div>
                            <input type="range" id="input-fontSize" min="12" max="24" step="1" value="${curSettings.fontSize}" style="width: 100%; accent-color: #0284c7; cursor: pointer;">
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span style="color: #a1a1aa; font-size: 11px;">줄간격</span>
                                <span id="val-lineHeight" style="color: #38bdf8; font-weight: 600; font-size: 11px;">${curSettings.lineHeight}</span>
                            </div>
                            <input type="range" id="input-lineHeight" min="1.0" max="2.2" step="0.1" value="${curSettings.lineHeight}" style="width: 100%; accent-color: #0284c7; cursor: pointer;">
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span style="color: #a1a1aa; font-size: 11px;">말풍선 여백 (Padding)</span>
                                <span id="val-bubblePadding" style="color: #38bdf8; font-weight: 600; font-size: 11px;">${curSettings.bubblePadding}px</span>
                            </div>
                            <input type="range" id="input-bubblePadding" min="4" max="24" step="1" value="${curSettings.bubblePadding}" style="width: 100%; accent-color: #0284c7; cursor: pointer;">
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span style="color: #a1a1aa; font-size: 11px;">말풍선 불투명도</span>
                                <span id="val-bgOpacity" style="color: #38bdf8; font-weight: 600; font-size: 11px;">${curSettings.bgOpacity}%</span>
                            </div>
                            <input type="range" id="input-bgOpacity" min="0" max="100" step="5" value="${curSettings.bgOpacity}" style="width: 100%; accent-color: #0284c7; cursor: pointer;">
                        </div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px;">
                    <div id="zeta-header-font" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                        <span style="font-weight: 600; font-size: 12px; color: #cbd5e1;">🔤 글씨체 선택</span>
                        <button id="zeta-toggle-font" style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 11px; padding: 2px 4px;" title="접기/펼치기">&#9660;</button>
                    </div>

                    <div id="zeta-section-font-content" style="display: none; flex-direction: column; gap: 6px; margin-top: 10px;">
                        <div id="zeta-font-list" style="display: flex; flex-direction: column; gap: 6px;">
                            ${optionsHtml}
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                <span style="color: #71717a; font-size: 11px;">중앙 정렬: Ctrl + Enter</span>
                <button id="zeta-combo-reset" style="background: rgba(255, 255, 255, 0.08); color: #a1a1aa; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 11px;">스타일 초기화</button>
            </div>
        `;

        document.body.appendChild(modal);

        const header = document.getElementById('zeta-combo-header');
        header.addEventListener('mousedown', () => { header.style.cursor = 'grabbing'; });
        window.addEventListener('mouseup', () => { header.style.cursor = 'grab'; });
        makeDraggable(modal, header);

        document.getElementById('zeta-combo-close').addEventListener('click', (e) => {
            e.stopPropagation();
            modal.style.display = 'none';
        });

        document.getElementById('btn-open-crop').addEventListener('click', openInteractiveCropModal);

        const bindSectionToggle = (key) => {
            const headerBtn = document.getElementById(`zeta-header-${key}`);
            if (headerBtn) {
                headerBtn.addEventListener('click', () => {
                    sectionState[key] = !sectionState[key];
                    GM_setValue(SECTIONS_STORAGE_KEY, sectionState);
                    updateSectionAccordion(key);
                });
            }
        };

        bindSectionToggle('bg');
        bindSectionToggle('list');
        bindSectionToggle('layout');
        bindSectionToggle('font');

        const dropzone = document.getElementById('zeta-bg-dropzone');
        const fileInput = document.getElementById('zeta-bg-file-input');
        const clearBtn = document.getElementById('btn-clear-file');

        dropzone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                processImageFile(e.target.files[0]);
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#38bdf8';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processImageFile(e.dataTransfer.files[0]);
            }
        });

        clearBtn.addEventListener('click', () => {
            saveCurrentRoomBg('', '', '');
            fileInput.value = '';
            updateFileStatusUI();
            applyCustomStyles();
        });

        // 배경 색상 피커 제어
        const colorPicker = document.getElementById('input-bg-color-picker');
        const colorText = document.getElementById('input-bg-color-text');
        const resetBgColorBtn = document.getElementById('btn-reset-bg-color');

        const updateBgColor = (newColor) => {
            const cur = getSettings();
            cur.bgColor = newColor;
            GM_setValue(STORAGE_KEY, cur);
            colorPicker.value = newColor;
            colorText.value = newColor;
            applyCustomStyles();
        };

        colorPicker.addEventListener('input', (e) => {
            updateBgColor(e.target.value);
        });

        colorText.addEventListener('change', (e) => {
            let val = e.target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                updateBgColor(val);
            } else {
                colorText.value = getSettings().bgColor || '#151516';
            }
        });

        resetBgColorBtn.addEventListener('click', () => {
            updateBgColor('#151516');
        });

        const bindSlider = (key, unit = '') => {
            const input = document.getElementById(`input-${key}`);
            const valDisplay = document.getElementById(`val-${key}`);

            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const cur = getSettings();
                cur[key] = val;
                GM_setValue(STORAGE_KEY, cur);
                valDisplay.innerText = `${val}${unit}`;
                applyCustomStyles();
            });
        };

        bindSlider('blur', 'px');
        bindSlider('dim', '%');
        bindSlider('fontSize', 'px');
        bindSlider('lineHeight', '');
        bindSlider('bubblePadding', 'px');
        bindSlider('bgOpacity', '%');

        const radios = modal.querySelectorAll('input[name="zeta-font-radio"]');
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const cur = getSettings();
                cur.fontId = e.target.value;
                GM_setValue(STORAGE_KEY, cur);
                applyCustomStyles();
                updateFontSelection(modal);
            });
        });

        document.getElementById('zeta-combo-reset').addEventListener('click', () => {
            const resetConf = Object.assign({}, DEFAULT_SETTINGS);
            GM_setValue(STORAGE_KEY, resetConf);

            updateFontSelection(modal);

            colorPicker.value = resetConf.bgColor;
            colorText.value = resetConf.bgColor;

            const sliders = [
                { k: 'blur', u: 'px' },
                { k: 'dim', u: '%' },
                { k: 'fontSize', u: 'px' },
                { k: 'lineHeight', u: '' },
                { k: 'bubblePadding', u: 'px' },
                { k: 'bgOpacity', u: '%' }
            ];

            sliders.forEach(({ k, u }) => {
                const input = document.getElementById(`input-${k}`);
                const valDisplay = document.getElementById(`val-${k}`);
                if (input) input.value = resetConf[k];
                if (valDisplay) valDisplay.innerText = `${resetConf[k]}${u}`;
            });

            applyCustomStyles();
        });

        updateFileStatusUI();
        renderRegisteredBgList();
        updateSectionAccordion('bg');
        updateSectionAccordion('list');
        updateSectionAccordion('layout');
        updateSectionAccordion('font');
    }

    function updateFontSelection(modal) {
        const curSettings = getSettings();
        const labels = modal.querySelectorAll('#zeta-font-list label');
        labels.forEach(label => {
            const radio = label.querySelector('input');
            const span = label.querySelector('span');
            const isChecked = radio.value === curSettings.fontId;
            radio.checked = isChecked;
            label.style.borderColor = isChecked ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)';
            span.style.color = isChecked ? '#38bdf8' : '#e4e4e7';
        });
    }

    function toggleComboModal() {
        createComboModal();
        const modal = document.getElementById('zeta-combo-modal');
        if (modal) {
            const isHidden = modal.style.display === 'none' || !modal.style.display;
            modal.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                applyModalPosition(modal);
                syncCurrentRoomCharName();
                updateFileStatusUI();
                renderRegisteredBgList();
                updateSectionAccordion('bg');
                updateSectionAccordion('list');
                updateSectionAccordion('layout');
                updateSectionAccordion('font');
            }
        }
    }

    // ==========================================
    // 8. 라우팅 감지 및 실시간 동기화
    // ==========================================
    function registerShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                resetModalToCenter();
            }
        });
    }

    function pollForButton(retryCount = 0) {
        if (!isRoomPage()) return;
        injectSidebarButton();
        if (!document.getElementById('zeta-combo-sidebar-btn') && retryCount < 25) {
            setTimeout(() => pollForButton(retryCount + 1), 200);
        }
    }

    let activeRoomId = null;

    // 방 전환 및 퇴장 감지 엔진
    function handleRoomSwitch() {
        // 1. 방 상세 페이지(/ko/rooms/*)가 아닌 경우 (예: /ko/rooms 목록 페이지 등)
        if (!isRoomPage()) {
            activeRoomId = null;
            removeCustomEffects(); // 사이드바 버튼, 모달 창, 배경 컨테이너 즉시 제거
            return;
        }

        const currentId = getRoomId();
        if (!currentId) return;

        // 2. 새로운 방 진입 시
        if (activeRoomId !== currentId) {
            activeRoomId = currentId;

            const oldContainer = document.getElementById('zeta-custom-bg-container');
            if (oldContainer) oldContainer.remove();

            applyCustomStyles();
            pollForButton();
            updateFileStatusUI();
            renderRegisteredBgList();

            [100, 300, 700, 1500].forEach((ms) => {
                setTimeout(() => {
                    if (isRoomPage() && getRoomId() === currentId) {
                        applyCustomStyles();
                        injectSidebarButton();
                        syncCurrentRoomCharName();
                    }
                }, ms);
            });
        }
    }

    function init() {
        registerShortcuts();

        // 초고속 URL 폴링 감지 (50ms마다 체크하여 방에서 나가는 즉시 정리)
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                handleRoomSwitch();
            }
        }, 50);

        window.addEventListener('popstate', handleRoomSwitch);
        window.addEventListener('pushState', handleRoomSwitch);
        window.addEventListener('replaceState', handleRoomSwitch);

        const observer = new MutationObserver(() => {
            if (isRoomPage()) {
                const currentId = getRoomId();
                if (currentId !== activeRoomId) {
                    handleRoomSwitch();
                } else {
                    if (!document.getElementById('zeta-custom-bg-container')) {
                        applyCustomStyles();
                    }
                    if (!document.getElementById('zeta-combo-sidebar-btn')) {
                        injectSidebarButton();
                    }
                    syncCurrentRoomCharName();
                }
            } else {
                // 방 외부에서 잔여 버튼/모달이 남아있는 경우 즉시 파기
                if (document.getElementById('zeta-combo-sidebar-btn') || document.getElementById('zeta-combo-modal')) {
                    removeCustomEffects();
                }
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        handleRoomSwitch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();