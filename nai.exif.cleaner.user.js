// ==UserScript==
// @name         NovelAI EXIF 제거기
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  NovelAI 이미지를 원본 해상도 유지, EXIF/프롬프트 완전 제거 후 15자리 랜덤 파일명으로 다운로드 (PNG/JPG/WebP)
// @author       You
// @match        https://novelai.net/image*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY_POS = 'nai_dl_toolbar_pos';

    // 15자리 랜덤 숫자 문자열 생성
    function generate15DigitRandomNumber() {
        let result = '';
        for (let i = 0; i < 15; i++) {
            if (i === 0) {
                result += Math.floor(Math.random() * 9) + 1;
            } else {
                result += Math.floor(Math.random() * 10);
            }
        }
        return result;
    }

    // 1. 툴바 UI 생성 (지정된 디자인 유지)
    function createToolbar() {
        if (document.getElementById('nai-dl-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'nai-dl-toolbar';

        toolbar.style.cssText = `
            position: fixed;
            z-index: 999999;
            background: rgba(20, 20, 30, 0.88);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            padding: 8px 12px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: sans-serif;
            color: #fff;
            user-select: none;
        `;

        loadSavedPosition(toolbar);

        const dragHandle = document.createElement('span');
        dragHandle.innerText = '⣿';
        dragHandle.title = '드래그하여 이동 (Ctrl + Enter로 위치 초기화)';
        dragHandle.style.cssText = `
            cursor: grab;
            font-size: 16px;
            color: #aaa;
            padding: 2px 4px;
        `;

        function createBtn(label, color, format) {
            const btn = document.createElement('button');
            btn.innerText = label;
            btn.title = `${label}로 메타데이터 완전 제거 후 다운로드`;
            btn.style.cssText = `
                background: ${color};
                color: #fff;
                border: none;
                padding: 6px 10px;
                border-radius: 6px;
                font-weight: bold;
                font-size: 12px;
                cursor: pointer;
                transition: transform 0.1s, filter 0.2s;
            `;
            btn.onmouseover = () => btn.style.filter = 'brightness(1.2)';
            btn.onmouseout = () => btn.style.filter = 'brightness(1.0)';
            btn.onmousedown = () => btn.style.transform = 'scale(0.95)';
            btn.onmouseup = () => btn.style.transform = 'scale(1.0)';

            btn.addEventListener('click', () => downloadCleanImage(format, btn));
            return btn;
        }

        const pngBtn = createBtn('PNG', '#3b82f6', 'png');
        const jpgBtn = createBtn('JPG', '#eab308', 'jpg');
        const webpBtn = createBtn('WebP', '#10b981', 'webp');

        toolbar.appendChild(dragHandle);
        toolbar.appendChild(pngBtn);
        toolbar.appendChild(jpgBtn);
        toolbar.appendChild(webpBtn);

        document.body.appendChild(toolbar);
        makeDraggable(toolbar, dragHandle);
    }

    function resetPosition(element) {
        localStorage.removeItem(STORAGE_KEY_POS);
        element.style.top = 'auto';
        element.style.left = 'auto';
        element.style.bottom = '30px';
        element.style.right = '30px';
    }

    function loadSavedPosition(element) {
        const savedPos = localStorage.getItem(STORAGE_KEY_POS);
        if (savedPos) {
            try {
                const { left, top } = JSON.parse(savedPos);
                element.style.left = left;
                element.style.top = top;
                element.style.bottom = 'auto';
                element.style.right = 'auto';
                return;
            } catch (e) {
                console.error('위치 정보를 불러오는 중 오류 발생:', e);
            }
        }
        element.style.bottom = '30px';
        element.style.right = '30px';
        element.style.top = 'auto';
        element.style.left = 'auto';
    }

    // 2. 드래그 기능 구현
    function makeDraggable(element, handle) {
        let posX = 0, posY = 0, mouseX = 0, mouseY = 0;

        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();

            const rect = element.getBoundingClientRect();
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';

            mouseX = e.clientX;
            mouseY = e.clientY;
            handle.style.cursor = 'grabbing';

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            posX = mouseX - e.clientX;
            posY = mouseY - e.clientY;
            mouseX = e.clientX;
            mouseY = e.clientY;

            element.style.top = (element.offsetTop - posY) + 'px';
            element.style.left = (element.offsetLeft - posX) + 'px';
        }

        function closeDragElement() {
            handle.style.cursor = 'grab';
            document.onmouseup = null;
            document.onmousemove = null;

            const pos = {
                left: element.style.left,
                top: element.style.top
            };
            localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));
        }
    }

    // 3. 단축키 감지 (Ctrl + Enter -> 위치 초기화)
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            const toolbar = document.getElementById('nai-dl-toolbar');
            if (toolbar) {
                resetPosition(toolbar);
            }
        }
    });

    // 4. 화면 중앙 메인 이미지/캔버스 요소 탐색 (정상 작동 검증 로직)
    function getCenterImageElement() {
        const candidates = Array.from(document.querySelectorAll('img, canvas'));
        const screenCenterX = window.innerWidth / 2;
        const screenCenterY = window.innerHeight / 2;

        let bestElement = null;
        let minDistance = Infinity;

        for (const el of candidates) {
            const rect = el.getBoundingClientRect();

            // 썸네일 바 및 UI 아이콘 제외 (100px 미만)
            if (rect.width < 100 || rect.height < 100) continue;
            // 뷰포트 영역 바깥 요소 제외
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;

            const elCenterX = rect.left + rect.width / 2;
            const elCenterY = rect.top + rect.height / 2;

            const distance = Math.hypot(screenCenterX - elCenterX, screenCenterY - elCenterY);

            if (distance < minDistance) {
                minDistance = distance;
                bestElement = el;
            }
        }

        return bestElement;
    }

    // 5. EXIF/프롬프트 완전 제거 및 다운로드 처리 (새 Canvas에 순수 픽셀 재렌더링)
    async function downloadCleanImage(format, btn) {
        if (btn && btn.dataset.busy === '1') return;

        const targetElement = getCenterImageElement();

        if (!targetElement) {
            alert('화면 중앙에서 다운로드할 이미지를 찾지 못했습니다.');
            return;
        }

        let width = 0;
        let height = 0;

        if (targetElement.tagName.toLowerCase() === 'img') {
            width = targetElement.naturalWidth || targetElement.width;
            height = targetElement.naturalHeight || targetElement.height;
        } else if (targetElement.tagName.toLowerCase() === 'canvas') {
            width = targetElement.width;
            height = targetElement.height;
        }

        if (!width || !height) {
            alert('이미지 크기 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        if (btn) {
            btn.dataset.busy = '1';
            btn.style.opacity = '0.6';
        }

        try {
            // 순수 픽셀만 담을 새 캔버스 생성 -> 모든 메타데이터(EXIF, tEXt, iTXt 등) 영구 소멸
            const cleanCanvas = document.createElement('canvas');
            cleanCanvas.width = width;
            cleanCanvas.height = height;

            const ctx = cleanCanvas.getContext('2d', {
                alpha: false,
                willReadFrequently: false
            });

            if (!ctx) {
                throw new Error('Canvas 컨텍스트를 생성할 수 없습니다.');
            }

            ctx.globalCompositeOperation = 'copy';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);

            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(targetElement, 0, 0, width, height);

            let mimeType = 'image/png';
            let quality = 1.0;

            if (format === 'jpg') {
                mimeType = 'image/jpeg';
                quality = 1.0;
            } else if (format === 'webp') {
                mimeType = 'image/webp';
                quality = 1.0;
            }

            cleanCanvas.toBlob(blob => {
                if (!blob) {
                    alert('이미지 변환에 실패했습니다.');
                    return;
                }

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const randomFileName = generate15DigitRandomNumber();

                link.download = `${randomFileName}.${format}`;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, mimeType, quality);

        } catch (error) {
            console.error('[Clean Downloader Error]', error);
            alert('다운로드 처리 중 오류가 발생했습니다: ' + error.message);
        } finally {
            if (btn) {
                btn.dataset.busy = '0';
                btn.style.opacity = '1.0';
            }
        }
    }

    window.addEventListener('load', createToolbar);
    setInterval(createToolbar, 1500);
})();