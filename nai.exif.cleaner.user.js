// ==UserScript==
// @name         NovelAI EXIF 제거기 & 폴더 지정 다운로더
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  NovelAI 이미지 생성 완료 즉시 EXIF 제거 후 자동 다운로드
// @author       You
// @match        https://novelai.net/image*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY_POS = 'nai_dl_toolbar_pos';
    const STORAGE_KEY_AUTO_COUNT = 'nai_dl_auto_count';
    const STORAGE_KEY_AUTO_INTERVAL = 'nai_dl_auto_interval';
    const STORAGE_KEY_TERMS_AGREED = 'nai_dl_terms_agreed'; // 이용약관 동의 여부 키
    const DB_NAME = 'nai_dir_storage_db';
    const STORE_NAME = 'handles';
    const HANDLE_KEY = 'target_dir_handle';
    let targetDirectoryHandle = null;

    // 자동 생성 상태 변수
    let isAutoGenerating = false;
    let autoGenTargetCount = 0;
    let autoGenCurrentCount = 0;
    let autoGenInterval = parseFloat(localStorage.getItem(STORAGE_KEY_AUTO_INTERVAL)) || 2;
    let selectedFormat = 'png';

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

    function getToastContainer() {
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
        return toastContainer;
    }

    function showDownloadToast(message) {
        const toastContainer = getToastContainer();

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

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

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

    function showToastConfirm(message) {
        return new Promise((resolve) => {
            const toastContainer = getToastContainer();

            const existingConfirms = toastContainer.querySelectorAll('.nai-confirm-toast');
            existingConfirms.forEach(confirmEl => {
                if (confirmEl.dataset.resolveFn) {
                    window[confirmEl.dataset.resolveFn](false);
                }
                confirmEl.remove();
            });

            const toast = document.createElement('div');
            toast.className = 'nai-confirm-toast';

            const resolveId = 'resolve_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            toast.dataset.resolveFn = resolveId;
            window[resolveId] = resolve;

            toast.style.cssText = `
                background: rgba(20, 20, 30, 0.95);
                color: #fff;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 13px;
                border: 1px solid rgba(255, 255, 255, 0.25);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                opacity: 0;
                transform: translateY(-10px);
                transition: opacity 0.25s ease, transform 0.25s ease;
                pointer-events: auto;
                max-width: 360px;
                word-break: break-all;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;

            const textSpan = document.createElement('span');
            textSpan.innerText = message;

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            `;

            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = '취소';
            cancelBtn.style.cssText = `
                background: #475569;
                color: #fff;
                border: none;
                padding: 5px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
            `;

            const confirmBtn = document.createElement('button');
            confirmBtn.innerText = '다운로드';
            confirmBtn.style.cssText = `
                background: #6366f1;
                color: #fff;
                border: none;
                padding: 5px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
            `;

            function closeToast(result) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                    if (window[resolveId]) {
                        delete window[resolveId];
                        resolve(result);
                    }
                }, 250);
            }

            cancelBtn.onclick = () => closeToast(false);
            confirmBtn.onclick = () => closeToast(true);

            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(confirmBtn);
            toast.appendChild(textSpan);
            toast.appendChild(btnContainer);

            toastContainer.prepend(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });
        });
    }

    // --- 이용약관 동의 모달 팝업 창 ---
    function showTermsModal() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'nai-terms-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(5px);
                z-index: 10000000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: sans-serif;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: #181825;
                color: #f3f4f6;
                width: 90%;
                max-width: 780px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            `;

            const title = document.createElement('h2');
            title.innerText = '🔄 약관 동의';
            title.style.cssText = `
                margin: 0;
                font-size: 18px;
                font-weight: bold;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                padding-bottom: 10px;
            `;

            const contentBox = document.createElement('div');
            contentBox.innerHTML = `
            <h3 style="margin: 0 0 6px 0;">자동 배치 생성·다운로드 이용 안내</h3>
            <p style="margin: 0 0 6px 0;">자동 배치 기능을 처음 실행하기 전에 아래 내용을 반드시 확인해 주세요.</p>
            <ul style="padding-left: 20px; margin: 0 0 6px 0;">
              <li style="margin-bottom: 3px;"><strong>생성 간격 설정:</strong> 처음 실행할 때 생성 간격을 반드시 <strong>2초 이상</strong>으로 설정해 주세요. 어떤 경우에도 <strong>1.5초 이하</strong>로 설정하여 실행하지 마세요.</li>
              <li style="margin-bottom: 3px;"><strong>약관 준수:</strong> NovelAI 이용약관은 자동화 자체를 일률적으로 금지하는 것이 아니라, 서비스에서 정한 제한을 무시하거나 서버에 과도한 부하를 주는 자동화 이용을 금지하고 있습니다.</li>
              <li><strong>계정 이용 책임:</strong> 자동화 기능을 통해 계정에서 발생하는 활동과 약관 위반으로 인한 불이익은 이용자 본인의 책임입니다.</li>
            </ul>
            <p style="margin: 0;">안전한 이용을 위해 위 사항을 준수해 주세요. 자세한 내용은 <a href="https://novelai.net/terms" target="_blank" style="color: #0066cc;">NovelAI 이용약관</a>을 참고하시기 바랍니다.</p>
            `
            contentBox.style.cssText = `
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                padding: 12px;
                font-size: 13px;
                line-height: 1.2;
                max-height: 520px;
                overflow-y: auto;
                color: #d1d5db;
                white-space: pre-wrap;
            `;

            const agreementText = document.createElement('div');
            agreementText.innerText = '위 내용을 확인했으며, 자동 배치 생성·다운로드 이용에 동의합니다.';
            agreementText.style.cssText = `
                font-size: 12px;
                color: #a1a1aa;
                text-align: center;
                line-height: 1.4;
            `;

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 4px;
            `;

            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = '취소';
            cancelBtn.style.cssText = `
                flex: 1;
                background: #475569;
                color: #fff;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
            `;

            const acceptBtn = document.createElement('button');
            acceptBtn.innerText = '동의하고 계속';
            acceptBtn.style.cssText = `
                flex: 1;
                background: #6366f1;
                color: #fff;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
            `;

            cancelBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };

            acceptBtn.onclick = () => {
                localStorage.setItem(STORAGE_KEY_TERMS_AGREED, 'true');
                document.body.removeChild(overlay);
                resolve(true);
            };

            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(acceptBtn);

            modal.appendChild(title);
            modal.appendChild(contentBox);
            modal.appendChild(agreementText);
            modal.appendChild(btnContainer);
            overlay.appendChild(modal);

            document.body.appendChild(overlay);
        });
    }

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
            width: 90px;
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

        const folderBtn = document.createElement('button');
        folderBtn.id = 'nai-folder-btn';
        folderBtn.innerText = '📁 폴더';
        folderBtn.title = '저장할 폴더 선택';
        folderBtn.style.cssText = `
            background: #475569;
            color: #fff;
            border: none;
            padding: 6px 4px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 11px;
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
                    alert("⚠ 보안상 '다운로드'나 '문서' 루트 폴더는 직접 선택할 수 없습니다.\n\n해당 폴더 안에 새 폴더를 만들어 선택해주세요!");
                } else if (err.name !== 'AbortError') {
                    console.error('폴더 선택 오류:', err);
                }
            }
        });

        // --- 포맷 변경 탭 (PNG/JPG/WebP) ---
        const formatContainer = document.createElement('div');
        formatContainer.style.cssText = `display: flex; gap: 2px; justify-content: space-between;`;

        const createFormatBtn = (fmt) => {
            const btn = document.createElement('button');
            btn.innerText = fmt.toUpperCase();
            btn.style.cssText = `
                flex: 1;
                background: ${selectedFormat === fmt ? '#6366f1' : '#334155'};
                color: #fff;
                border: none;
                padding: 4px 0;
                border-radius: 4px;
                font-weight: bold;
                font-size: 10px;
                cursor: pointer;
            `;
            btn.onclick = () => {
                selectedFormat = fmt;
                Array.from(formatContainer.children).forEach(child => child.style.background = '#334155');
                btn.style.background = '#6366f1';
            };
            return btn;
        };

        const pngFmtBtn = createFormatBtn('PNG', '#3b82f6', 'png');
        const jpgFmtBtn = createFormatBtn('JPG', '#eab308', 'jpg');
        const webpFmtBtn = createFormatBtn('WebP', '#10b981', 'webp');

        formatContainer.appendChild(pngFmtBtn);
        formatContainer.appendChild(jpgFmtBtn);
        formatContainer.appendChild(webpFmtBtn);

        // --- 다운로드 수동 실행 버튼 ---
        const manualDlBtn = document.createElement('button');
        manualDlBtn.innerText = '⬇ 다운로드';
        manualDlBtn.style.cssText = `
            background: #3b82f6;
            color: #fff;
            border: none;
            padding: 6px 4px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 11px;
            cursor: pointer;
            width: 100%;
        `;
        manualDlBtn.addEventListener('click', () => downloadCleanImage(selectedFormat, manualDlBtn));

        // --- 구분선 ---
        const hr = document.createElement('hr');
        hr.style.cssText = 'border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 2px 0;';

        // --- 약관 동의 철회 버튼 ---
        const revokeTermsBtn = document.createElement('button');
        revokeTermsBtn.id = 'nai-revoke-terms-btn';
        revokeTermsBtn.innerText = '❌ 동의 철회';
        revokeTermsBtn.title = '이용약관 동의 상태를 철회합니다.';
        revokeTermsBtn.style.cssText = `
            background: #dc2626;
            color: #fff;
            border: none;
            padding: 4px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            display: ${localStorage.getItem(STORAGE_KEY_TERMS_AGREED) === 'true' ? 'block' : 'none'};
        `;

        revokeTermsBtn.addEventListener('click', () => {
            if (confirm('이용약관 동의를 철회하시겠습니까?\n철회 시 자동 생성 사용 시 약관 동의가 다시 필요합니다.')) {
                localStorage.removeItem(STORAGE_KEY_TERMS_AGREED);
                revokeTermsBtn.style.display = 'none';
                if (isAutoGenerating) {
                    stopAutoGeneration('약관 동의 철회로 인해 중지됨');
                }
                showDownloadToast('❌ 이용약관 동의가 철회되었습니다.');
            }
        });

        // --- 자동 연속 생성 컨트롤 ---
        const autoControlContainer = document.createElement('div');
        autoControlContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        const countInputLabel = document.createElement('div');
        countInputLabel.innerText = '자동 생성 개수';
        countInputLabel.style.cssText = 'font-size: 10px; color: #ccc; text-align: center;';

        const countInput = document.createElement('input');
        countInput.type = 'number';
        const savedCount = localStorage.getItem(STORAGE_KEY_AUTO_COUNT);
        countInput.value = savedCount !== null ? savedCount : '4';
        countInput.min = '1';
        countInput.max = '999';
        countInput.style.cssText = `
            background: rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.3);
            color: #fff;
            padding: 4px;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
        `;

        countInput.addEventListener('change', () => {
            let val = parseInt(countInput.value, 10);
            if (isNaN(val) || val < 1) {
                val = 4;
                countInput.value = '4';
            }
            localStorage.setItem(STORAGE_KEY_AUTO_COUNT, val.toString());
        });

        const autoStartBtn = document.createElement('button');
        autoStartBtn.id = 'nai-auto-btn';
        autoStartBtn.innerText = '▶ 자동 생성';
        autoStartBtn.style.cssText = `
            background: #10b981;
            color: #fff;
            border: none;
            padding: 6px 4px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 11px;
            cursor: pointer;
            width: 100%;
        `;

        // --- 생성 간격 입력 폼 (최소 2초) ---
        const intervalInputLabel = document.createElement('div');
        intervalInputLabel.innerText = '생성 간격(초)';
        intervalInputLabel.style.cssText = 'font-size: 10px; color: #ccc; text-align: center; margin-top: 2px;';

        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        const savedInterval = localStorage.getItem(STORAGE_KEY_AUTO_INTERVAL);
        intervalInput.value = savedInterval !== null ? savedInterval : '2';
        intervalInput.min = '2';
        intervalInput.max = '3600';
        intervalInput.step = '1';
        intervalInput.title = '생성 간격 입력 (최소 2초)';
        intervalInput.style.cssText = `
            background: rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.3);
            color: #fff;
            padding: 4px;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
        `;

        intervalInput.addEventListener('change', () => {
            let val = parseFloat(intervalInput.value);
            if (isNaN(val) || val < 2) {
                val = 2;
                showDownloadToast('생성 간격은 최소 2초 이상이어야 합니다.');
            }
            autoGenInterval = val;
            localStorage.setItem(STORAGE_KEY_AUTO_INTERVAL, val.toString());
        });

        autoStartBtn.addEventListener('click', async () => {
            if (isAutoGenerating) {
                stopAutoGeneration('사용자에 의해 중지됨');
            } else {
                // 약관 동의 확인
                const isAgreed = localStorage.getItem(STORAGE_KEY_TERMS_AGREED) === 'true';
                if (!isAgreed) {
                    const agreedNow = await showTermsModal();
                    if (!agreedNow) return; // 취소 클릭 시 생성 중단
                    revokeTermsBtn.style.display = 'block'; // 약관 동의 완료 시 철회 버튼 표시
                }

                const count = parseInt(countInput.value, 10);
                let intervalVal = parseFloat(intervalInput.value);

                if (isNaN(count) || count <= 0) {
                    showDownloadToast('올바른 개수를 입력해 주세요.');
                    return;
                }

                if (isNaN(intervalVal) || intervalVal < 2) {
                    intervalVal = 2;
                    intervalInput.value = '2';
                    showDownloadToast('간격이 2초 미만이어서 2초로 자동 설정되었습니다.');
                }

                autoGenInterval = intervalVal;
                startAutoGeneration(count);
            }
        });

        autoControlContainer.appendChild(countInputLabel);
        autoControlContainer.appendChild(countInput);
        autoControlContainer.appendChild(autoStartBtn);
        autoControlContainer.appendChild(intervalInputLabel);
        autoControlContainer.appendChild(intervalInput);

        toolbar.appendChild(dragHandle);
        toolbar.appendChild(folderBtn);
        toolbar.appendChild(formatContainer);
        toolbar.appendChild(manualDlBtn);
        toolbar.appendChild(hr);
        toolbar.appendChild(revokeTermsBtn);
        toolbar.appendChild(autoControlContainer);

        document.body.appendChild(toolbar);
        makeDraggable(toolbar, dragHandle);
    }

    // --- NAI Generate 버튼 감지 ---
    function getNaiGenerateButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => {
            const text = b.innerText.toLowerCase();
            return text.includes('generate') || text.includes('생성');
        });
    }

    // --- 자동 생성 제어 ---
    async function startAutoGeneration(targetCount) {
        if (!targetDirectoryHandle) {
            showDownloadToast('⚠ 저장 폴더를 먼저 선택해 주세요!');
            return;
        }

        const genBtn = getNaiGenerateButton();
        if (!genBtn) {
            showDownloadToast('NovelAI 생성 버튼을 찾을 수 없습니다.');
            return;
        }

        isAutoGenerating = true;
        autoGenTargetCount = targetCount;
        autoGenCurrentCount = 0;

        updateAutoButtonUI();
        showDownloadToast(`🚀 ${targetCount}장 자동 생성 시작 (간격:${autoGenInterval}초)`);

        runAutoStep();
    }

    function stopAutoGeneration(reason = '') {
        isAutoGenerating = false;
        updateAutoButtonUI();
        if (reason) {
            showDownloadToast(`⏹ 자동 생성 중단: ${reason}`);
        }
    }

    function updateAutoButtonUI() {
        const autoBtn = document.getElementById('nai-auto-btn');
        if (!autoBtn) return;

        if (isAutoGenerating) {
            autoBtn.innerText = `■ 중지 (${autoGenCurrentCount}/${autoGenTargetCount})`;
            autoBtn.style.background = '#ef4444';
        } else {
            autoBtn.innerText = '▶ 자동 생성';
            autoBtn.style.background = '#10b981';
        }
    }

    async function runAutoStep() {
        if (!isAutoGenerating) return;

        if (autoGenCurrentCount >= autoGenTargetCount) {
            stopAutoGeneration('');
            showDownloadToast(`🎉 총 ${autoGenTargetCount}장 자동 생성이 완료되었습니다!`);
            return;
        }

        const genBtn = getNaiGenerateButton();
        if (!genBtn || genBtn.disabled) {
            setTimeout(runAutoStep, 1000);
            return;
        }

        // 이전 이미지 상태 저장
        const prevElement = getVisibleImageElements()[0];
        const prevSrc = prevElement ? (prevElement.src || prevElement.toDataURL?.()) : null;

        // 생성 버튼 클릭
        genBtn.click();

        // 1. 이미지가 완전히 새로 생성될 때까지 모니터링 및 대기
        const isSuccess = await waitForNewImage(prevSrc);

        if (isSuccess && isAutoGenerating) {
            autoGenCurrentCount++;
            updateAutoButtonUI();

            // 2. 완성이 확인되는 즉시 EXIF 제거 및 즉시 다운로드
            const currentImg = getVisibleImageElements()[0];
            if (currentImg) {
                try {
                    const blob = await processImageToCleanBlob(currentImg, selectedFormat);
                    const randomFileName = generate15DigitRandomNumber() + '.' + selectedFormat;
                    await saveSingleBlob(blob, randomFileName);
                    showDownloadToast(`[${autoGenCurrentCount}/${autoGenTargetCount}] '${randomFileName}' 저장 완료`);
                } catch (e) {
                    console.error('자동 저장 실패:', e);
                }
            }

            // 3. 다운로드 완료 후, 지정한 초 제한(간격)만큼 대기한 다음 다시 다음 생성 진행
            const delayMs = autoGenInterval * 1000;
            setTimeout(runAutoStep, delayMs);

        } else if (isAutoGenerating) {
            // 생성 타임아웃 발생 시 재시도
            setTimeout(runAutoStep, 1500);
        }
    }

    // 이미지 완성 감지 함수 (버튼 비활성화 해제 + 이미지 변환 감지)
    function waitForNewImage(prevSrc) {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 240; // 최대 120초 대기 (500ms * 240)

            const interval = setInterval(() => {
                attempts++;
                const genBtn = getNaiGenerateButton();
                const currentImg = getVisibleImageElements()[0];
                const currentSrc = currentImg ? (currentImg.src || currentImg.toDataURL?.()) : null;

                // 생성 버튼이 다시 활성화(disabled === false) 상태이고, 이미지 URL/Data가 변경되었을 때 완성으로 간주
                const isBtnReady = genBtn && !genBtn.disabled;
                const isImageChanged = currentSrc && currentSrc !== prevSrc;

                if (isBtnReady && isImageChanged) {
                    clearInterval(interval);
                    // 렌더링 안정화를 위해 200ms 지연 후 완료 반환
                    setTimeout(() => resolve(true), 200);
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 500);
        });
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

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            const toolbar = document.getElementById('nai-dl-toolbar');
            if (toolbar) {
                resetPosition(toolbar);
            }
        }
    });

    function getVisibleImageElements() {
        const candidates = Array.from(document.querySelectorAll('img, canvas'));
        const screenCenterX = window.innerWidth / 2;
        const screenCenterY = window.innerHeight / 2;

        const validElements = [];

        for (const el of candidates) {
            const rect = el.getBoundingClientRect();

            if (rect.width < 100 || rect.height < 100) continue;
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;

            const elCenterX = rect.left + rect.width / 2;
            const elCenterY = rect.top + rect.height / 2;
            const distance = Math.hypot(screenCenterX - elCenterX, screenCenterY - elCenterY);

            validElements.push({ el, distance });
        }

        validElements.sort((a, b) => a.distance - b.distance);
        return validElements.map(item => item.el);
    }

    function processImageToCleanBlob(targetElement, format) {
        return new Promise((resolve, reject) => {
            let width = 0, height = 0;

            if (targetElement.tagName.toLowerCase() === 'img') {
                width = targetElement.naturalWidth || targetElement.width;
                height = targetElement.naturalHeight || targetElement.height;
            } else if (targetElement.tagName.toLowerCase() === 'canvas') {
                width = targetElement.width;
                height = targetElement.height;
            }

            if (!width || !height) {
                return reject(new Error('이미지 크기 정보를 가져올 수 없습니다.'));
            }

            const cleanCanvas = document.createElement('canvas');
            cleanCanvas.width = width;
            cleanCanvas.height = height;

            const ctx = cleanCanvas.getContext('2d');

            if (!ctx) {
                return reject(new Error('Canvas 컨텍스트 생성 실패'));
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(targetElement, 0, 0, width, height);

            let mimeType = 'image/png';
            if (format === 'jpg') mimeType = 'image/jpeg';
            else if (format === 'webp') mimeType = 'image/webp';

            cleanCanvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Blob 생성 실패'));
            }, mimeType);
        });
    }

    async function saveSingleBlob(blob, filename) {
        if (targetDirectoryHandle) {
            try {
                if (targetDirectoryHandle.queryPermission) {
                    const status = await targetDirectoryHandle.queryPermission({ mode: 'readwrite' });
                    if (status !== 'granted') {
                        const requestStatus = await targetDirectoryHandle.requestPermission({ mode: 'readwrite' });
                        if (requestStatus !== 'granted') {
                            throw new Error('폴더 접근 권한이 승인되지 않았습니다.');
                        }
                    }
                }
                const fileHandle = await targetDirectoryHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err) {
                console.warn('지정 폴더 저장 실패, 기본 다운로드로 전환:', err);
            }
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return false;
    }

    async function downloadCleanImage(format, btn) {
        if (btn && btn.dataset.busy === '1') return;

        const targetElements = getVisibleImageElements();

        if (targetElements.length === 0) {
            showDownloadToast('화면에서 다운로드할 이미지를 찾지 못했습니다.');
            return;
        }

        // --- 이미지가 1장일 때: 바로 다운로드 ---
        if (targetElements.length === 1) {
            if (btn) {
                btn.dataset.busy = '1';
                btn.style.opacity = '0.6';
            }
            try {
                const blob = await processImageToCleanBlob(targetElements[0], format);
                const randomFileName = generate15DigitRandomNumber() + '.' + format;
                await saveSingleBlob(blob, randomFileName);
                showDownloadToast(`'${randomFileName}'이 다운로드 되었습니다.`);
            } catch (error) {
                console.error('[Clean Downloader Error]', error);
                showDownloadToast('다운로드 처리 중 오류가 발생했습니다: ' + error.message);
            } finally {
                if (btn) {
                    btn.dataset.busy = '0';
                    btn.style.opacity = '1.0';
                }
            }
            return;
        }

        // --- 이미지가 2장 이상일 때: 선택 다운로드 모달 창 띄우기 ---
        showImageSelectionModal(targetElements, format, btn);
    }

    // --- 선택 다운로드 모달 생성 함수 ---
    function showImageSelectionModal(targetElements, initialFormat, triggerBtn) {
        // 기존 선택 모달이 있다면 제거
        const existingModal = document.getElementById('nai-img-select-modal');
        if (existingModal) existingModal.remove();

        let currentFormat = initialFormat;

        // 모달 오버레이
        const overlay = document.createElement('div');
        overlay.id = 'nai-img-select-modal';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center;
            z-index: 999999; font-family: sans-serif;
        `;

        // 💡 [추가] 오버레이(팝업 바깥) 클릭 시 모달 닫기
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // 모달 본체
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1e293b; color: #fff; width: 500px; max-width: 90vw; max-height: 80vh;
            border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
        `;

        // 상단 헤더
        const header = document.createElement('div');
        header.style.cssText = `display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;`;
        header.innerHTML = `<span style="font-weight: bold; font-size: 14px;">📷 감지된 이미지 선택 (${targetElements.length}장)</span>`;

        // 전체 선택 / 해제 컨트롤 영역
        const selectCtrlRow = document.createElement('div');
        selectCtrlRow.style.cssText = `display: flex; align-items: center; justify-content: space-between; font-size: 12px;`;

        const selectAllContainer = document.createElement('label');
        // 👇 [수정] line-height, letter-spacing, white-space 명시 지정
        selectAllContainer.style.cssText = `
            display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;
            line-height: 1; letter-spacing: normal; white-space: nowrap; font-size: 12px;
        `;

        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.checked = true;
        selectAllCheckbox.style.cssText = `width: 14px; height: 14px; cursor: pointer; accent-color: #6366f1; margin: 0;`;

        selectAllContainer.appendChild(selectAllCheckbox);
        selectAllContainer.appendChild(document.createTextNode('전체 선택 / 해제'));

        // 모달 내 포맷 변경 탭
        const formatTabContainer = document.createElement('div');
        formatTabContainer.style.cssText = `display: flex; gap: 4px;`;
        ['png', 'jpg', 'webp'].forEach(fmt => {
            const fmtBtn = document.createElement('button');
            fmtBtn.innerText = fmt.toUpperCase();
            fmtBtn.style.cssText = `
                background: ${fmt === currentFormat ? '#6366f1' : '#334155'}; color: #fff; border: none;
                padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;
            `;
            fmtBtn.onclick = () => {
                currentFormat = fmt;
                Array.from(formatTabContainer.children).forEach(child => child.style.background = '#334155');
                fmtBtn.style.background = '#6366f1';
            };
            formatTabContainer.appendChild(fmtBtn);
        });

        selectCtrlRow.appendChild(selectAllContainer);
        selectCtrlRow.appendChild(formatTabContainer);

        // 이미지 아이템 목록 스크롤 영역
        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            display: flex; flex-direction: column; gap: 8px; max-height: 50vh; overflow-y: auto;
            padding-right: 4px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 8px;
        `;

        const itemCheckboxes = [];

        targetElements.forEach((el, index) => {
            const row = document.createElement('label');
            // 👇 [수정] padding을 줄이고 flex 정렬을 밀착
            row.style.cssText = `
                display: flex; align-items: center; gap: 10px; background: #334155; padding: 6px 10px;
                border-radius: 6px; cursor: pointer; transition: background 0.2s; user-select: none;
            `;
            row.onmouseover = () => row.style.background = '#475569';
            row.onmouseout = () => row.style.background = '#334155';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            // 👇 [수정/추가] 각 이미지 체크박스 크기 명시 지정 (width/height)
            checkbox.style.cssText = `width: 15px; height: 15px; cursor: pointer; accent-color: #6366f1; flex-shrink: 0;`;

            itemCheckboxes.push(checkbox);

            // 썸네일 이미지 추출
            const thumbImg = document.createElement('img');
            thumbImg.style.cssText = `width: 44px; height: 44px; object-fit: cover; border-radius: 4px; background: #000; flex-shrink: 0;`;
            if (el.tagName.toLowerCase() === 'img') {
                thumbImg.src = el.src;
            } else if (el.tagName.toLowerCase() === 'canvas') {
                try { thumbImg.src = el.toDataURL(); } catch (e) { }
            }

            const labelText = document.createElement('span');
            labelText.style.cssText = `font-size: 12px; flex: 1; word-break: break-all;`;
            const width = el.naturalWidth || el.width || '?';
            const height = el.naturalHeight || el.height || '?';
            labelText.innerText = `이미지 #${index + 1} (${width}x${height}px)`;

            row.appendChild(checkbox);
            row.appendChild(thumbImg);
            row.appendChild(labelText);
            listContainer.appendChild(row);
        });

        // 전체 선택 토글 이벤트
        selectAllCheckbox.addEventListener('change', () => {
            itemCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
        });

        // 하단 버튼 영역
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;`;

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = '취소';
        cancelBtn.style.cssText = `
            background: #475569; color: #fff; border: none; padding: 8px 16px; border-radius: 6px;
            font-size: 12px; font-weight: bold; cursor: pointer;
        `;
        cancelBtn.onclick = () => overlay.remove();

        const downloadBtn = document.createElement('button');
        downloadBtn.innerText = '선택 다운로드';
        downloadBtn.style.cssText = `
            background: #3b82f6; color: #fff; border: none; padding: 8px 16px; border-radius: 6px;
            font-size: 12px; font-weight: bold; cursor: pointer;
        `;

        downloadBtn.onclick = async () => {
            const selectedIndices = itemCheckboxes
                .map((cb, i) => cb.checked ? i : -1)
                .filter(i => i !== -1);

            if (selectedIndices.length === 0) {
                alert('다운로드할 이미지를 최소 1개 이상 선택해주세요.');
                return;
            }

            overlay.remove();

            if (triggerBtn) {
                triggerBtn.dataset.busy = '1';
                triggerBtn.style.opacity = '0.6';
            }

            try {
                for (let idx of selectedIndices) {
                    const el = targetElements[idx];
                    const blob = await processImageToCleanBlob(el, currentFormat);
                    const randomNum = generate15DigitRandomNumber();
                    const randomFileName = randomNum + '.' + currentFormat;

                    await saveSingleBlob(blob, randomFileName);
                    showDownloadToast(`'${randomFileName}'이 다운로드 되었습니다.`);

                    if (selectedIndices.length > 1) {
                        await new Promise(r => setTimeout(r, 150));
                    }
                }
            } catch (error) {
                console.error('[Clean Downloader Error]', error);
                showDownloadToast('다운로드 처리 중 오류가 발생했습니다: ' + error.message);
            } finally {
                if (triggerBtn) {
                    triggerBtn.dataset.busy = '0';
                    triggerBtn.style.opacity = '1.0';
                }
            }
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(downloadBtn);

        modal.appendChild(header);
        modal.appendChild(selectCtrlRow);
        modal.appendChild(listContainer);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        document.body.appendChild(overlay);
    }
    // 툴바 초기화 실행
    createToolbar();
})();
