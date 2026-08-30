(function () {
    'use strict';

    App.init('ai');

    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const state = { images: [], rawText: '', editing: false, docxBlob: null, docxName: '' };
    const fileInput = document.getElementById('aiImage');
    const preview = document.getElementById('aiImageTags');
    const dropZone = document.getElementById('aiDropZone');
    const generateButton = document.getElementById('generateAiButton');
    const content = document.getElementById('aiContent');
    const integrationOptions = document.getElementById('integrationOptions');
    const integrationSelectionCount = document.getElementById('integrationSelectionCount');
    const integrationSelectedSummary = document.getElementById('integrationSelectedSummary');
    const integrationSelectedChips = document.getElementById('integrationSelectedChips');

    function updateIntegrationSelectionCount() {
        const checked = Array.from(integrationOptions.querySelectorAll('input:checked'));
        integrationSelectionCount.textContent = String(checked.length);

        integrationOptions.querySelectorAll('[data-integration-group]').forEach(group => {
            const count = group.querySelectorAll('input:checked').length;
            const badge = group.querySelector('[data-integration-group-count]');
            badge.textContent = String(count);
            badge.hidden = count === 0;
            group.classList.toggle('has-selection', count > 0);
        });

        integrationSelectedSummary.hidden = checked.length === 0;
        integrationSelectedChips.innerHTML = checked.map(input => {
            const label = input.closest('.check-card').querySelector('span').textContent.trim();
            const safeLabel = App.escapeHTML(label);
            return `<button type="button" class="integration-selected-chip" data-integration-remove="${encodeURIComponent(input.value)}" title="Bỏ chọn ${safeLabel}" aria-label="Bỏ chọn ${safeLabel}"><span>${safeLabel}</span><b aria-hidden="true">×</b></button>`;
        }).join('');
    }

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

    function normalizeAiText(value) {
        return String(value || '')
            .replace(/\r\n?/g, '\n')
            .replace(/&lt;br\s*\/?&gt;/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function inlineMarkdown(value) {
        return App.escapeHTML(value)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    }

    function splitTableRow(line) {
        let value = String(line || '').trim();
        if (value.startsWith('|')) value = value.slice(1);
        if (value.endsWith('|')) value = value.slice(0, -1);
        return value.split('|').map(cell => cell.trim());
    }

    function isTableSeparator(line) {
        const cells = splitTableRow(line);
        return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
    }

    function isActivityTableBoundary(line) {
        const value = String(line || '').trim();
        return /^#{1,3}\s+/.test(value)
            || /^[IVXLCDM]+\.\s+/i.test(value)
            || /^\d+[.)]\s+/.test(value)
            || /^[a-z]\)\s+(?:Mục\s+tiêu|Cách\s+tổ\s+chức)/i.test(value)
            || /^```/.test(value);
    }

    function activityColumnIndex(value, columnCount) {
        const text = String(value || '').trim().replace(/^\|+|\|+$/g, '').trim().replace(/^[-•]\s*/, '');
        if (/^GV\b/i.test(text)) return 0;
        if (/^HS\b/i.test(text)) return Math.min(1, Math.max(0, columnCount - 1));
        return -1;
    }

    function normalizeActivityItem(value) {
        const text = String(value || '').trim().replace(/^•\s*/, '- ');
        if (/^(?:GV|HS)\b/i.test(text)) return `- ${text}`;
        return text;
    }

    function startsBlock(lines, index) {
        const line = lines[index] || '';
        return /^#{1,3}\s+/.test(line) || /^[IVXLCDM]+\.\s+/i.test(line) || /^[-•]\s+/.test(line) || /^\d+[.)]\s+/.test(line) || (line.includes('|') && isTableSeparator(lines[index + 1] || ''));
    }

    function parseMarkdown(value) {
        const lines = normalizeAiText(value).split('\n');
        const blocks = [];
        let index = 0;
        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) { index += 1; continue; }

            if (line.includes('|') && isTableSeparator(lines[index + 1] || '')) {
                const headers = splitTableRow(line);
                index += 2;
                const cellItems = headers.map(() => []);
                let activeColumn = 0;
                let hasActivityContent = false;

                while (index < lines.length) {
                    const activityLine = String(lines[index] || '').trim();
                    if (!activityLine) {
                        index += 1;
                        continue;
                    }
                    if (isActivityTableBoundary(activityLine)) break;

                    if (activityLine.includes('|')) {
                        const cells = splitTableRow(activityLine);
                        if (cells.length > 1) {
                            headers.forEach((_, cellIndex) => {
                                const cellValue = normalizeActivityItem(cells[cellIndex] || '');
                                if (!cellValue) return;
                                cellItems[cellIndex].push(cellValue);
                                activeColumn = cellIndex;
                                hasActivityContent = true;
                            });
                            index += 1;
                            continue;
                        }
                    }

                    const detectedColumn = activityColumnIndex(activityLine, headers.length);
                    if (detectedColumn >= 0) activeColumn = detectedColumn;
                    else if (!hasActivityContent) break;

                    const item = normalizeActivityItem(activityLine);
                    if (item) {
                        cellItems[activeColumn].push(item);
                        hasActivityContent = true;
                    }
                    index += 1;
                }

                blocks.push(`<table><thead><tr>${headers.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody><tr>${headers.map((_, cellIndex) => `<td>${cellItems[cellIndex].map(inlineMarkdown).join('<br>')}</td>`).join('')}</tr></tbody></table>`);
                continue;
            }

            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
                const level = heading[1].length;
                blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
                index += 1;
                continue;
            }

            if (/^[IVXLCDM]+\.\s+/i.test(line)) {
                blocks.push(`<p><strong>${inlineMarkdown(line)}</strong></p>`);
                index += 1;
                continue;
            }

            if (/^[-•]\s+/.test(line)) {
                const items = [];
                while (index < lines.length && /^[-•]\s+/.test(lines[index])) {
                    items.push(`<li>${inlineMarkdown(lines[index].replace(/^[-•]\s+/, ''))}</li>`);
                    index += 1;
                }
                blocks.push(`<ul class="dash-list">${items.join('')}</ul>`);
                continue;
            }

            const numberedHeading = line.match(/^(\d+)[.)]\s+(.+)$/);
            if (numberedHeading) {
                const normalizedHeading = `${numberedHeading[1]}. ${numberedHeading[2]}`;
                blocks.push(`<p class="plan-numbered-item"><strong>${inlineMarkdown(normalizedHeading)}</strong></p>`);
                index += 1;
                continue;
            }

            const paragraph = [line];
            index += 1;
            while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
                paragraph.push(lines[index]);
                index += 1;
            }
            blocks.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
        }
        return blocks.join('');
    }

    async function generatePlan() {
        const subject = document.getElementById('aiSubject').value.trim();
        const grade = document.getElementById('aiClass').value.trim();
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
                grade,
                lesson,
                integrated: integrated.join(', '),
                images
            }, { auth: true });
            state.rawText = normalizeAiText(result.result || '');
            if (!state.rawText.includes('KẾ HOẠCH BÀI DẠY')) {
                state.rawText = `**KẾ HOẠCH BÀI DẠY**\n\n**Môn:** ${subject || '…'}\n**Lớp:** ${grade || '…'}\n**Tên bài:** ${lesson || '…'}\n\n${state.rawText}`;
            }
            content.innerHTML = parseMarkdown(state.rawText);
            syncPlanMetadataFields();
            content.contentEditable = 'false';
            state.editing = false;
            state.docxBlob = null;
            state.docxName = '';
            document.getElementById('driveWordLink').hidden = true;
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
        else state.docxBlob = null;
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
        return (value || fallback).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
    }

    function extractPlanValue(pattern) {
        const lines = String(content.innerText || '').replace(/\r\n?/g, '\n').split('\n');
        for (const line of lines) {
            const match = line.trim().match(pattern);
            if (match && String(match[1] || '').trim()) return String(match[1]).trim();
        }
        return '';
    }

    function cleanPlanValue(value, type) {
        let result = String(value || '').trim();
        if (type === 'subject') result = result.replace(/^m[oô]n(?:\s+h[oọ]c)?\s*[:\-–—]?\s*/i, '');
        if (type === 'grade') result = result.replace(/^l[oớ]p\s*[:\-–—]?\s*/i, '');
        if (type === 'lesson') result = result.replace(/^(?:t[eê]n\s+b[aà]i|b[aà]i)\s*[:\-–—]?\s*/i, '');
        return result.trim();
    }

    function getPlanMetadata(requireComplete = false) {
        const subjectInput = document.getElementById('aiSubject').value.trim();
        const gradeInput = document.getElementById('aiClass').value.trim();
        const lessonInput = document.getElementById('aiLesson').value.trim();
        const metadata = {
            subject: cleanPlanValue(subjectInput || extractPlanValue(/^M[oô]n(?:\s+h[oọ]c)?\s*:\s*(.+)$/i), 'subject'),
            grade: cleanPlanValue(gradeInput || extractPlanValue(/^L[oớ]p\s*:\s*(.+)$/i), 'grade'),
            lesson: cleanPlanValue(lessonInput || extractPlanValue(/^(?:T[eê]n\s+b[aà]i|B[aà]i)\s*:\s*(.+)$/i), 'lesson')
        };
        if (requireComplete) {
            const missing = [];
            if (!metadata.subject) missing.push('môn học');
            if (!metadata.grade) missing.push('lớp');
            if (!metadata.lesson) missing.push('tên bài');
            if (missing.length) throw new Error(`Chưa xác định được ${missing.join(', ')}. Vui lòng điền đủ thông tin trước khi xuất Word.`);
        }
        return metadata;
    }

    function syncPlanMetadataFields() {
        const metadata = getPlanMetadata(false);
        const fields = [
            ['aiSubject', metadata.subject],
            ['aiClass', metadata.grade],
            ['aiLesson', metadata.lesson]
        ];
        fields.forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (!field.value.trim() && value) field.value = value;
        });
    }

    function xmlEscape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
    }

    function textRunXml(value, format = {}) {
        const parts = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
        const properties = `${format.bold ? '<w:b/>' : ''}${format.italic ? '<w:i/>' : ''}${format.size ? `<w:sz w:val="${format.size}"/><w:szCs w:val="${format.size}"/>` : ''}`;
        return parts.map((part, index) => {
            const breakXml = index ? '<w:br/>' : '';
            const textXml = part ? `<w:t xml:space="preserve">${xmlEscape(part)}</w:t>` : '';
            return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}${breakXml}${textXml}</w:r>`;
        }).join('');
    }

    function nodeRunsXml(node, format = {}) {
        if (node.nodeType === Node.TEXT_NODE) return textRunXml(node.nodeValue, format);
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const tag = node.tagName.toLowerCase();
        if (tag === 'br') return textRunXml('\n', format);
        const next = {
            bold: format.bold || ['strong', 'b'].includes(tag),
            italic: format.italic || ['em', 'i'].includes(tag),
            size: format.size
        };
        return Array.from(node.childNodes).map(child => nodeRunsXml(child, next)).join('');
    }

    function paragraphFromNodesXml(nodes, options = {}) {
        const size = options.size || 28;
        const runs = nodes
            ? nodes.map(node => nodeRunsXml(node, { bold: options.bold, italic: false, size })).join('')
            : textRunXml(options.text || '', { bold: options.bold, size });
        const align = options.align ? `<w:jc w:val="${options.align}"/>` : '<w:jc w:val="both"/>';
        const indent = options.indent ? '<w:ind w:left="420" w:hanging="280"/>' : '';
        return `<w:p><w:pPr>${align}${indent}<w:wordWrap w:val="1"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>${runs || '<w:r><w:t></w:t></w:r>'}</w:p>`;
    }

    function paragraphXml(element, options = {}) {
        return paragraphFromNodesXml(element ? Array.from(element.childNodes) : null, options);
    }

    function splitParagraphXml(element, options = {}) {
        const groups = [[]];
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'br') groups.push([]);
            else groups[groups.length - 1].push(node);
        });
        return groups.map(nodes => {
            const lineText = nodes.map(node => node.textContent || '').join('').replace(/\s+/g, ' ').trim();
            const lineOptions = Object.assign({}, options);
            if (/^KẾ\s+HOẠCH\s+BÀI\s+DẠY$/i.test(lineText)) {
                lineOptions.align = 'center';
                lineOptions.bold = true;
                lineOptions.size = 34;
            } else if (/^(?:[IVXLCDM]+|\d+)\.\s+/i.test(lineText)) {
                lineOptions.align = 'left';
                lineOptions.bold = true;
            } else if (/^(?:Môn(?:\s+học)?|Lớp|Tên\s+bài|Thời\s+lượng)\s*:/i.test(lineText)) {
                lineOptions.align = 'left';
            }
            return paragraphFromNodesXml(nodes, lineOptions);
        }).join('');
    }

    function tableXml(table) {
        const columnCount = Math.max(1, ...Array.from(table.rows).map(row => row.cells.length));
        const columnWidths = columnCount === 2
            ? [5783, 3855]
            : Array.from({ length: columnCount }, (_, index) => index === columnCount - 1 ? 9638 - Math.floor(9638 / columnCount) * index : Math.floor(9638 / columnCount));
        const grid = columnWidths.map(width => `<w:gridCol w:w="${width}"/>`).join('');
        const rows = Array.from(table.rows).map(row => {
            const cells = Array.from(row.cells).map((cell, cellIndex) => {
                const heading = cell.tagName.toLowerCase() === 'th';
                const shading = heading ? '<w:shd w:fill="EDE9FE"/>' : '';
                const columnWidth = columnWidths[Math.min(cellIndex, columnWidths.length - 1)];
                const verticalAlign = heading ? 'center' : 'top';
                const textAlign = heading ? 'center' : 'left';
                return `<w:tc><w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/>${shading}<w:vAlign w:val="${verticalAlign}"/></w:tcPr>${splitParagraphXml(cell, { bold: heading, size: 26, align: textAlign })}</w:tc>`;
            }).join('');
            return `<w:tr>${cells}</w:tr>`;
        }).join('');
        return `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="64748B"/><w:left w:val="single" w:sz="8" w:color="64748B"/><w:bottom w:val="single" w:sz="8" w:color="64748B"/><w:right w:val="single" w:sz="8" w:color="64748B"/><w:insideH w:val="single" w:sz="6" w:color="94A3B8"/><w:insideV w:val="single" w:sz="6" w:color="94A3B8"/></w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
    }

    function contentToDocumentBody() {
        const blocks = [];
        Array.from(content.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.nodeValue.trim()) blocks.push(paragraphXml(null, { text: node.nodeValue }));
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.tagName.toLowerCase();
            if (tag === 'table') {
                blocks.push(tableXml(node));
            } else if (tag === 'ul' || tag === 'ol') {
                Array.from(node.children).forEach((item, index) => {
                    const prefix = tag === 'ol' ? `${index + 1}. ` : '- ';
                    const wrapper = document.createElement('span');
                    wrapper.append(document.createTextNode(prefix));
                    Array.from(item.childNodes).forEach(child => wrapper.append(child.cloneNode(true)));
                    blocks.push(paragraphXml(wrapper, { indent: true, bold: tag === 'ol', align: 'left' }));
                });
            } else if (/^h[1-3]$/.test(tag)) {
                const level = Number(tag[1]);
                blocks.push(paragraphXml(node, { bold: true, size: level === 1 ? 34 : level === 2 ? 31 : 29, align: level === 1 ? 'center' : 'left' }));
            } else {
                blocks.push(splitParagraphXml(node));
            }
        });
        return blocks.join('') || paragraphXml(null, { text: content.innerText });
    }

    function makeDocumentEntries() {
        const now = new Date().toISOString();
        const metadata = getPlanMetadata(false);
        const subject = metadata.subject || 'Kế hoạch bài dạy';
        const grade = metadata.grade;
        const lesson = metadata.lesson;
        const title = `${subject}${grade ? ` - Lớp ${grade}` : ''}${lesson ? ` - ${lesson}` : ''}`;
        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${contentToDocumentBody()}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
        const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
        return [
            ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
            ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
            ['word/document.xml', documentXml],
            ['word/styles.xml', stylesXml],
            ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
            ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>${xmlEscape(App.config.OWNER_NAME)}</dc:creator><cp:lastModifiedBy>${xmlEscape(App.config.OWNER_NAME)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`],
            ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>E-GV</Application><AppVersion>5.5</AppVersion></Properties>`]
        ];
    }

    const crcTable = (() => {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
            let value = index;
            for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
            table[index] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function zipTimestamp(date = new Date()) {
        const year = Math.max(1980, date.getFullYear());
        return {
            time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
            date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
        };
    }

    function concatBytes(parts) {
        const length = parts.reduce((total, part) => total + part.length, 0);
        const output = new Uint8Array(length);
        let offset = 0;
        parts.forEach(part => { output.set(part, offset); offset += part.length; });
        return output;
    }

    function makeZip(entries) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        const stamp = zipTimestamp();
        let offset = 0;
        entries.forEach(([name, text]) => {
            const nameBytes = encoder.encode(name);
            const data = encoder.encode(text);
            const crc = crc32(data);
            const localHeader = new Uint8Array(30);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, stamp.time, true);
            localView.setUint16(12, stamp.date, true);
            localView.setUint32(14, crc, true);
            localView.setUint32(18, data.length, true);
            localView.setUint32(22, data.length, true);
            localView.setUint16(26, nameBytes.length, true);

            const centralHeader = new Uint8Array(46);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, stamp.time, true);
            centralView.setUint16(14, stamp.date, true);
            centralView.setUint32(16, crc, true);
            centralView.setUint32(20, data.length, true);
            centralView.setUint32(24, data.length, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint32(42, offset, true);

            localParts.push(localHeader, nameBytes, data);
            centralParts.push(centralHeader, nameBytes);
            offset += localHeader.length + nameBytes.length + data.length;
        });
        const centralDirectory = concatBytes(centralParts);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(8, entries.length, true);
        endView.setUint16(10, entries.length, true);
        endView.setUint32(12, centralDirectory.length, true);
        endView.setUint32(16, offset, true);
        return concatBytes([...localParts, centralDirectory, end]);
    }

    function buildDocx() {
        if (!content.innerText.trim()) throw new Error('Chưa có nội dung để xuất Word.');
        const metadata = getPlanMetadata(true);
        const subject = safeFilePart(metadata.subject, 'MON');
        const grade = safeFilePart(metadata.grade, 'LOP');
        const lesson = safeFilePart(metadata.lesson, 'TEN_BAI');
        const name = `KHBD_MON_${subject}_LOP_${grade}_${lesson}.docx`;
        const blob = new Blob([makeZip(makeDocumentEntries())], { type: DOCX_MIME });
        state.docxBlob = blob;
        state.docxName = name;
        return { blob, name };
    }

    function currentDocx() {
        return state.docxBlob && state.docxName ? { blob: state.docxBlob, name: state.docxName } : buildDocx();
    }

    function exportWord() {
        try {
            const { blob, name } = buildDocx();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = name;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            link.remove();
            App.toast(`Đã tải ${name}.`, 'success');
        } catch (error) {
            App.toast(error.message || 'Không thể tạo tệp Word.', 'error');
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Không đọc được tệp Word vừa tạo.'));
            reader.readAsDataURL(blob);
        });
    }

    async function uploadWordToDrive() {
        const button = document.getElementById('uploadWordButton');
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Đang tạo Word…';
        try {
            const { blob, name } = currentDocx();
            button.textContent = 'Đang tải lên Drive…';
            const result = await App.apiPost('upload', { fileName: name, mimeType: DOCX_MIME, base64: await blobToBase64(blob) });
            const fileUrl = App.safeUrl(result.fileUrl || result.url || '');
            const driveLink = document.getElementById('driveWordLink');
            if (fileUrl) {
                driveLink.href = fileUrl;
                driveLink.hidden = false;
            }
            App.toast(`Đã lưu ${name} lên Drive.`, 'success');
        } catch (error) {
            App.toast(error.message || 'Không thể lưu tệp Word lên Drive.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    document.getElementById('chooseAiImages').addEventListener('click', () => fileInput.click());
    integrationOptions.querySelectorAll('[data-integration-group]').forEach(group => {
        group.addEventListener('toggle', () => {
            if (!group.open) return;
            integrationOptions.querySelectorAll('[data-integration-group][open]').forEach(openedGroup => {
                if (openedGroup !== group) openedGroup.open = false;
            });
        });
    });
    integrationOptions.addEventListener('change', updateIntegrationSelectionCount);
    integrationSelectedChips.addEventListener('click', event => {
        const button = event.target.closest('[data-integration-remove]');
        if (!button) return;
        const value = decodeURIComponent(button.dataset.integrationRemove);
        const input = Array.from(integrationOptions.querySelectorAll('input[type="checkbox"]')).find(option => option.value === value);
        if (!input) return;
        input.checked = false;
        updateIntegrationSelectionCount();
    });
    updateIntegrationSelectionCount();
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
    content.addEventListener('input', () => { state.docxBlob = null; state.docxName = ''; document.getElementById('driveWordLink').hidden = true; });
    ['aiSubject', 'aiClass', 'aiLesson'].forEach(id => document.getElementById(id).addEventListener('input', () => { state.docxBlob = null; state.docxName = ''; document.getElementById('driveWordLink').hidden = true; }));
    document.getElementById('editAiButton').addEventListener('click', toggleEditing);
    document.getElementById('copyAiButton').addEventListener('click', copyResult);
    document.getElementById('exportAiButton').addEventListener('click', exportWord);
    document.getElementById('uploadWordButton').addEventListener('click', uploadWordToDrive);
})();
