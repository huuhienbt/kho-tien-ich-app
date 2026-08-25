(function () {
    'use strict';

    App.init('ai');

    const state = { images: [], rawText: '', editing: false };
    const fileInput = document.getElementById('aiImage');
    const preview = document.getElementById('aiImageTags');
    const dropZone = document.getElementById('aiDropZone');
    const generateButton = document.getElementById('generateAiButton');
    const content = document.getElementById('aiContent');

    function addImages(files) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const key = `${file.name}-${file.size}-${file.lastModified}`;
            if (!state.images.some(item => item.key === key)) state.images.push({ key, file });
        });
        renderImages();
    }

    function renderImages() {
        preview.innerHTML = state.images.map((item, index) => `
            <span class="preview-item"><span>🖼️</span><span class="preview-item-name" title="${App.escapeHTML(item.file.name)}">${App.escapeHTML(item.file.name)}</span><button class="preview-remove" type="button" data-remove-image="${index}" aria-label="Xóa ảnh">×</button></span>
        `).join('');
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(`Không đọc được ảnh ${file.name}.`));
            reader.onload = event => {
                const image = new Image();
                image.onerror = () => reject(new Error(`Ảnh ${file.name} không hợp lệ.`));
                image.onload = () => {
                    const maxWidth = 1200;
                    const scale = Math.min(1, maxWidth / image.width);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(image.width * scale);
                    canvas.height = Math.round(image.height * scale);
                    const context = canvas.getContext('2d');
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve({ base64: canvas.toDataURL('image/jpeg', 0.76).split(',')[1], mimeType: 'image/jpeg' });
                };
                image.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function parseMarkdown(text) {
        let html = App.escapeHTML(text || '').replace(/\r\n/g, '\n');
        html = html.replace(/^\|(.+)\|\n\|(?:\s*[-:]+\s*\|)+\n((?:\|.*\|\n?)*)/gm, (_, header, body) => {
            const headers = header.split('|').map(cell => cell.trim());
            const rows = body.trim().split('\n').filter(Boolean).map(row => row.split('|').slice(1, -1).map(cell => cell.trim()));
            return `<table><thead><tr>${headers.map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        });
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/^[-•]\s+(.+)$/gm, '<div>• $1</div>');
        html = html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
        html = `<p>${html}</p>`;
        return html.replace(/<p>\s*(<h[1-3]>)/g, '$1').replace(/(<\/h[1-3]>)\s*<\/p>/g, '$1').replace(/<p>\s*(<table>)/g, '$1').replace(/(<\/table>)\s*<\/p>/g, '$1');
    }

    async function generatePlan() {
        const subject = document.getElementById('aiSubject').value.trim();
        const lesson = document.getElementById('aiLesson').value.trim();
        if (!subject && !lesson && !state.images.length) return App.toast('Nhập thông tin bài học hoặc cung cấp ít nhất một ảnh.', 'error');
        const original = generateButton.textContent;
        generateButton.disabled = true;
        document.getElementById('aiPlaceholder').hidden = false;
        document.getElementById('aiResult').hidden = true;
        try {
            const images = [];
            for (let index = 0; index < state.images.length; index += 1) {
                generateButton.textContent = `Đang nén ảnh ${index + 1}/${state.images.length}…`;
                images.push(await compressImage(state.images[index].file));
            }
            generateButton.textContent = 'AI đang phân tích và soạn bài…';
            const integrated = Array.from(document.querySelectorAll('#integrationOptions input:checked')).map(input => input.value);
            const other = document.getElementById('aiIntegratedOther').value.trim();
            if (other) integrated.push(other);
            const result = await App.apiPost('generate_lesson_plan', {
                subject,
                lesson,
                integrated: integrated.join(', '),
                images
            }, { auth: true });
            state.rawText = String(result.result || '');
            if (!state.rawText.includes('KẾ HOẠCH BÀI DẠY')) {
                state.rawText = `**KẾ HOẠCH BÀI DẠY**\n\n**Môn:** ${subject || '…'}\n**Tên bài:** ${lesson || '…'}\n\n${state.rawText}`;
            }
            content.innerHTML = parseMarkdown(state.rawText);
            content.contentEditable = 'false';
            state.editing = false;
            document.getElementById('editAiButton').textContent = '✏️ Chỉnh sửa';
            document.getElementById('aiPlaceholder').hidden = true;
            document.getElementById('aiResult').hidden = false;
            document.getElementById('aiResultBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
            App.toast('Đã tạo bản nháp kế hoạch bài dạy.', 'success');
        } catch (error) {
            App.toast(error.message || 'Không thể tạo kế hoạch bài dạy.', 'error');
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = original;
        }
    }

    function toggleEditing() {
        state.editing = !state.editing;
        content.contentEditable = String(state.editing);
        document.getElementById('editAiButton').textContent = state.editing ? '✅ Hoàn tất' : '✏️ Chỉnh sửa';
        if (state.editing) content.focus();
    }

    async function copyResult() {
        try {
            await navigator.clipboard.writeText(content.innerText);
            App.toast('Đã sao chép kế hoạch bài dạy.', 'success');
        } catch (_) {
            App.toast('Không thể sao chép nội dung.', 'error');
        }
    }

    function safeFilePart(value, fallback) {
        return (value || fallback).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    }

    function exportWord() {
        const subject = safeFilePart(document.getElementById('aiSubject').value, 'MON');
        const lesson = safeFilePart(document.getElementById('aiLesson').value, 'BAI');
        const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>@page{size:A4;margin:2cm}body,p,td,th,li,span{font-family:'Times New Roman',serif;font-size:14pt;line-height:1.15}h1,h2,h3{font-family:'Times New Roman',serif;font-weight:bold}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:6pt;vertical-align:top}th{background:#f2f2f2}</style></head><body>${content.innerHTML}</body></html>`;
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `KHBD_${subject}_${lesson}.doc`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    }

    document.getElementById('chooseAiImages').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { addImages(fileInput.files); fileInput.value = ''; });
    preview.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-image]');
        if (!button) return;
        state.images.splice(Number(button.dataset.removeImage), 1);
        renderImages();
    });
    ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', event => addImages(event.dataTransfer.files));
    document.addEventListener('paste', event => {
        const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
        if (files.length) { addImages(files); App.toast(`Đã thêm ${files.length} ảnh từ bộ nhớ tạm.`, 'success'); }
    });
    document.getElementById('aiForm').addEventListener('submit', event => {
        event.preventDefault();
        App.requireAdmin(generatePlan);
    });
    document.getElementById('editAiButton').addEventListener('click', toggleEditing);
    document.getElementById('copyAiButton').addEventListener('click', copyResult);
    document.getElementById('exportAiButton').addEventListener('click', exportWord);
})();
