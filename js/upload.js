(function () {
    'use strict';

    App.init('upload');

    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const fileList = document.getElementById('fileList');
    const actions = document.getElementById('uploadActions');
    const progress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressLabel = document.getElementById('progressLabel');
    const uploadButton = document.getElementById('uploadFilesButton');
    let selectedFiles = [];

    document.getElementById('openDriveButton').href = App.config.DRIVE_FOLDER_URL;

    function chooseFiles() {
        fileInput.click();
    }

    function setFiles(files) {
        selectedFiles = Array.from(files).map(file => ({
            file,
            status: 'Đang chờ',
            type: file.size <= App.config.LIGHT_UPLOAD_LIMIT ? 'Nhanh' : 'Tệp lớn',
            resultUrl: '',
            qrVisible: false
        }));
        renderFiles();
    }

    function renderFiles() {
        actions.hidden = selectedFiles.length === 0;
        if (!selectedFiles.length) {
            fileList.innerHTML = '';
            progress.hidden = true;
            return;
        }
        fileList.innerHTML = selectedFiles.map((entry, index) => {
            const url = entry.resultUrl ? App.safeUrl(entry.resultUrl) : '';
            const status = url ? `<a href="${App.escapeHTML(url)}" target="_blank" rel="noopener noreferrer">✅ Mở tệp</a>` : App.escapeHTML(entry.status);
            const result = url ? `<div class="file-share-result">
                <span class="file-share-label">Liên kết tệp vừa tải</span>
                <div class="file-link-row">
                    <a class="file-result-link" href="${App.escapeHTML(url)}" target="_blank" rel="noopener noreferrer" title="${App.escapeHTML(url)}">${App.escapeHTML(url)}</a>
                    <div class="file-share-actions">
                        <button class="btn btn-secondary btn-sm" type="button" data-file-action="copy-link">📋 Sao chép link</button>
                        <button class="btn btn-success btn-sm" type="button" data-file-action="toggle-qr" aria-expanded="${entry.qrVisible}" aria-controls="file-qr-panel-${index}">▦ ${entry.qrVisible ? 'Ẩn QR' : 'QR code'}</button>
                    </div>
                </div>
                <div class="file-qr-panel" id="file-qr-panel-${index}"${entry.qrVisible ? '' : ' hidden'}>
                    <canvas class="file-qr-canvas" id="file-qr-${index}" aria-label="Mã QR mở tệp ${App.escapeHTML(entry.file.name)}"></canvas>
                    <p>Quét mã để mở tệp trên điện thoại.</p>
                    <button class="btn btn-secondary btn-sm" type="button" data-file-action="download-qr">⬇ Tải mã QR</button>
                </div>
            </div>` : '';
            return `<div class="file-item${url ? ' file-item-complete' : ''}" data-index="${index}"><div><span class="file-name" title="${App.escapeHTML(entry.file.name)}">${App.escapeHTML(entry.file.name)}</span><span class="file-size">${App.formatBytes(entry.file.size)} · ${entry.type}</span></div><span class="file-status">${status}</span>${result}</div>`;
        }).join('');
        selectedFiles.forEach((entry, index) => {
            if (entry.resultUrl && entry.qrVisible) renderQrCode(index);
        });
    }

    function renderQrCode(index) {
        const entry = selectedFiles[index];
        const url = entry?.resultUrl ? App.safeUrl(entry.resultUrl) : '';
        const canvas = document.getElementById(`file-qr-${index}`);
        if (!url || !canvas) return;
        try {
            if (!window.EGVQRCode) throw new Error('Thư viện QR chưa sẵn sàng.');
            window.EGVQRCode.render(canvas, url, { errorLevel: 'M', cellSize: 10, margin: 4 });
        } catch (error) {
            const panel = canvas.closest('.file-qr-panel');
            if (panel) panel.innerHTML = `<p class="file-qr-error">❌ ${App.escapeHTML(error.message)}</p>`;
        }
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Không thể sao chép liên kết.');
    }

    function qrDownloadName(fileName) {
        const baseName = String(fileName || 'tep-drive').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9À-ỹ_-]+/g, '_');
        return `QR_${baseName || 'tep-drive'}.png`;
    }

    function updateFile(index, status, resultUrl = '') {
        selectedFiles[index].status = status;
        selectedFiles[index].resultUrl = resultUrl;
        renderFiles();
    }

    function setProgress(value, label) {
        progress.hidden = false;
        progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
        progressLabel.textContent = label;
    }

    function readBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = event => resolve(String(event.target.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Không thể đọc tệp.'));
            reader.readAsDataURL(file);
        });
    }

    async function uploadLight(entry, index) {
        updateFile(index, 'Đang mã hóa…');
        const base64 = await readBase64(entry.file);
        updateFile(index, 'Đang gửi…');
        const result = await App.apiPost('upload', {
            fileName: entry.file.name,
            mimeType: entry.file.type || 'application/octet-stream',
            base64
        });
        updateFile(index, 'Hoàn tất', result.fileUrl || '');
    }

    function putLargeFile(url, file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url, true);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.upload.onprogress = event => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            };
            xhr.onload = () => {
                if (![200, 201].includes(xhr.status)) return reject(new Error(`Tải tệp thất bại (${xhr.status}).`));
                try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(new Error('Không nhận được mã tệp từ Google Drive.')); }
            };
            xhr.onerror = () => reject(new Error('Mất kết nối khi tải tệp.'));
            xhr.send(file);
        });
    }

    async function uploadLarge(entry, index, baseProgress, stepSize) {
        updateFile(index, 'Đang khởi tạo…');
        const session = await App.apiPost('getResumableUrl', {
            fileName: entry.file.name,
            mimeType: entry.file.type || 'application/octet-stream',
            fileSize: entry.file.size,
            origin: window.location.origin
        });
        if (!session.resumableUrl) throw new Error('Máy chủ chưa tạo được phiên tải tệp.');
        updateFile(index, 'Đang tải 0%');
        const fileInfo = await putLargeFile(session.resumableUrl, entry.file, percent => {
            updateFile(index, `Đang tải ${percent}%`);
            setProgress(baseProgress + stepSize * percent / 100, `Đang tải ${entry.file.name}: ${percent}%`);
        });
        if (!fileInfo.id) throw new Error('Không nhận được mã tệp.');
        updateFile(index, 'Đang thiết lập quyền…');
        const permission = await App.apiPost('setPermission', { fileId: fileInfo.id });
        updateFile(index, 'Hoàn tất', permission.fileUrl || '');
    }

    async function uploadAll() {
        if (!selectedFiles.length) return;
        uploadButton.disabled = true;
        const original = uploadButton.textContent;
        const stepSize = 100 / selectedFiles.length;
        let success = 0;
        for (let index = 0; index < selectedFiles.length; index += 1) {
            const entry = selectedFiles[index];
            const baseProgress = index * stepSize;
            uploadButton.textContent = `Đang tải ${index + 1}/${selectedFiles.length}`;
            setProgress(baseProgress, `Đang xử lý ${entry.file.name}`);
            try {
                if (entry.file.size <= App.config.LIGHT_UPLOAD_LIMIT) await uploadLight(entry, index);
                else await uploadLarge(entry, index, baseProgress, stepSize);
                success += 1;
            } catch (error) {
                updateFile(index, `❌ ${error.message}`);
            }
            setProgress((index + 1) * stepSize, `Đã xử lý ${index + 1}/${selectedFiles.length} tệp`);
        }
        uploadButton.disabled = false;
        uploadButton.textContent = original;
        App.toast(`Hoàn tất ${success}/${selectedFiles.length} tệp.`, success === selectedFiles.length ? 'success' : 'error');
    }

    document.getElementById('chooseFilesButton').addEventListener('click', event => { event.stopPropagation(); chooseFiles(); });
    dropZone.addEventListener('click', chooseFiles);
    dropZone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseFiles(); }
    });
    fileInput.addEventListener('change', () => setFiles(fileInput.files));
    ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', event => setFiles(event.dataTransfer.files));
    fileList.addEventListener('click', async event => {
        const button = event.target.closest('[data-file-action]');
        const item = event.target.closest('.file-item');
        if (!button || !item) return;
        const index = Number(item.dataset.index);
        const entry = selectedFiles[index];
        const url = entry?.resultUrl ? App.safeUrl(entry.resultUrl) : '';
        if (!entry || !url) return;

        if (button.dataset.fileAction === 'copy-link') {
            try {
                await copyText(url);
                App.toast('Đã sao chép liên kết tệp.', 'success');
            } catch (error) {
                App.toast(error.message, 'error');
            }
        }
        if (button.dataset.fileAction === 'toggle-qr') {
            entry.qrVisible = !entry.qrVisible;
            renderFiles();
        }
        if (button.dataset.fileAction === 'download-qr') {
            const canvas = document.getElementById(`file-qr-${index}`);
            if (!canvas) return;
            const downloadLink = document.createElement('a');
            downloadLink.href = canvas.toDataURL('image/png');
            downloadLink.download = qrDownloadName(entry.file.name);
            downloadLink.click();
            App.toast('Đã tải mã QR.', 'success');
        }
    });
    document.getElementById('clearFilesButton').addEventListener('click', () => { selectedFiles = []; fileInput.value = ''; renderFiles(); });
    uploadButton.addEventListener('click', uploadAll);
})();
