// ==UserScript==
// @name         NovelAI EXIF 제거기 & 폴더 지정 다운로더
// @namespace    http://tampermonkey.net/
// @version      4.4
// @description  NovelAI 이미지를 원본 해상도 유지, EXIF/프롬프트 완전 제거 후 15자리 랜덤 파일명으로 지정 폴더에 직접 저장 (PNG/JPG/WebP)
// @author       You
// @match        https://novelai.net/image*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY_POS = 'nai_dl_toolbar_pos';
    const DB_NAME = 'nai_dir_storage_db';
    const STORE_NAME = 'handles';
    const HANDLE_KEY = 'target_dir_handle';
    let targetDirectoryHandle = null; // 사용자가 선택한 저장 폴더 핸들

    // --- IndexedDB 핸들 저장/로드 유틸리티 ---
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveDirectoryHandle(handle) {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.error('디렉토리 핸들 저장 실패:', e);
        }
    }

    async function loadSavedDirectoryHandle() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
            return new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            console.error('디렉토리 핸들 불러오기 실패:', e);
            return null;
        }
    }

    // 다운로드 피드(토스트 팝업) 생성 함수
    function showDownloadToast(message) {
        let toastContainer = document.getElementById('nai-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'nai-toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                top: 24px;
                right: 145px;
                z-index: 1000000;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
                font-family: sans-serif;
            `;
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.innerText = message;
        toast.style.cssText = `
            background: rgba(20, 20, 30, 0.92);
            color: #fff;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(6px);
            opacity: 0;
            transform: translateY(-10px);
            transition: opacity 0.25s ease, transform 0.25s ease;
            pointer-events: auto;
            max-width: 360px;
            word-break: break-all;
        `;

        toastContainer.appendChild(toast);

        // 페이드 인
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // 3초 후 페이드 아웃 및 제거
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 250);
        }, 3000);
    }

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

    // 1. 툴바 UI 생성
    async function createToolbar() {
        if (document.getElementById('nai-dl-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'nai-dl-toolbar';

        toolbar.style.cssText = `
            position: fixed;
            z-index: 999999;
            background: rgba(20, 20, 30, 0.88);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            padding: 8px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
            font-family: sans-serif;
            color: #fff;
            user-select: none;
            width: 70px;
        `;

        loadSavedPosition(toolbar);

        const dragHandle = document.createElement('span');
        dragHandle.innerText = '⣿⣿';
        dragHandle.title = '드래그하여 이동 (Ctrl + Enter로 위치 초기화)';
        dragHandle.style.cssText = `
            cursor: grab;
            font-size: 14px;
            color: #aaa;
            padding: 2px 0;
            text-align: center;
            line-height: 1;
        `;

        // 폴더 선택 버튼 생성
        const folderBtn = document.createElement('button');
        folderBtn.id = 'nai-folder-btn';
        folderBtn.innerText = '📁 폴더';
        folderBtn.title = '저장할 폴더 선택 (다운로드/문서 폴더 안의 하위 폴더를 권장합니다)';
        folderBtn.style.cssText = `
            background: #475569;
            color: #fff;
            border: none;
            padding: 6px 4px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
            transition: transform 0.1s, filter 0.2s, background 0.2s;
            white-space: nowrap;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            text-align: center;
        `;
        folderBtn.onmouseover = () => folderBtn.style.filter = 'brightness(1.2)';
        folderBtn.onmouseout = () => folderBtn.style.filter = 'brightness(1.0)';
        folderBtn.onmousedown = () => folderBtn.style.transform = 'scale(0.95)';
        folderBtn.onmouseup = () => folderBtn.style.transform = 'scale(1.0)';

        // 저장된 폴더 핸들이 있으면 불러와 적용
        if (!targetDirectoryHandle) {
            const savedHandle = await loadSavedDirectoryHandle();
            if (savedHandle) {
                targetDirectoryHandle = savedHandle;
                folderBtn.innerText = `📁 ${targetDirectoryHandle.name}`;
                folderBtn.title = `저장 폴더: ${targetDirectoryHandle.name} (클릭하여 변경)`;
                folderBtn.style.background = '#6366f1';
            }
        }

        folderBtn.addEventListener('click', async () => {
            if (!window.showDirectoryPicker) {
                alert('사용 중인 브라우저가 직접 폴더 저장을 지원하지 않습니다.');
                return;
            }
            try {
                targetDirectoryHandle = await window.showDirectoryPicker();
                await saveDirectoryHandle(targetDirectoryHandle);
                folderBtn.innerText = `📁 ${targetDirectoryHandle.name}`;
                folderBtn.title = `저장 폴더: ${targetDirectoryHandle.name} (클릭하여 변경)`;
                folderBtn.style.background = '#6366f1';
            } catch (err) {
                if (err.name === 'SecurityError' || err.message?.includes('system')) {
                    alert("⚠️ 보안상 '다운로드'나 '문서' 루트 폴더는 직접 선택할 수 없습니다.\n\n해당 폴더 안에 새 폴더(예: '다운로드/NAI')를 만들어 그 하위 폴더를 선택해주세요!");
                } else if (err.name !== 'AbortError') {
                    console.error('폴더 선택 오류:', err);
                }
            }
        });

        function createBtn(label, color, format) {
            const btn = document.createElement('button');
            btn.innerText = label;
            btn.title = `${label}로 메타데이터 완전 제거 후 다운로드`;
            btn.style.cssText = `
                background: ${color};
                color: #fff;
                border: none;
                padding: 6px 4px;
                border-radius: 6px;
                font-weight: bold;
                font-size: 12px;
                cursor: pointer;
                transition: transform 0.1s, filter 0.2s;
                width: 100%;
                text-align: center;
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
        toolbar.appendChild(folderBtn);
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

    // 4. 화면 중앙 메인 이미지/캔버스 요소 탐색
    function getCenterImageElement() {
        const candidates = Array.from(document.querySelectorAll('img, canvas'));
        const screenCenterX = window.innerWidth / 2;
        const screenCenterY = window.innerHeight / 2;

        let bestElement = null;
        let minDistance = Infinity;

        for (const el of candidates) {
            const rect = el.getBoundingClientRect();

            if (rect.width < 100 || rect.height < 100) continue;
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

    // 5. EXIF/프롬프트 완전 제거 및 저장
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

            cleanCanvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('이미지 변환에 실패했습니다.');
                    return;
                }

                const randomFileName = `${generate15DigitRandomNumber()}.${format}`;

                // 1순위: 선택된 대상 폴더가 있으면 해당 폴더에 파일 직접 작성
                if (targetDirectoryHandle) {
                    try {
                        // 새로고침 후 권한이 만료된 경우 재요청
                        if (targetDirectoryHandle.queryPermission) {
                            const status = await targetDirectoryHandle.queryPermission({ mode: 'readwrite' });
                            if (status !== 'granted') {
                                const requestStatus = await targetDirectoryHandle.requestPermission({ mode: 'readwrite' });
                                if (requestStatus !== 'granted') {
                                    throw new Error('폴더 접근 권한이 승인되지 않았습니다.');
                                }
                            }
                        }

                        const fileHandle = await targetDirectoryHandle.getFileHandle(randomFileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        showDownloadToast(`/${targetDirectoryHandle.name} 경로로 '${randomFileName}'이 다운로드 되었습니다.`);
                        return;
                    } catch (dirErr) {
                        console.warn('지정 폴더 저장 실패, 일반 다운로드로 전환:', dirErr);
                    }
                }

                // 2순위 (폴더 미지정/오류 시): 기존 브라우저 다운로드 방식
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = randomFileName;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                showDownloadToast(`/기본 다운로드 경로로 '${randomFileName}'이 다운로드 되었습니다.`);

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
