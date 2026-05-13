/**
 * Zebra Web Print - Main Application Logic
 */

/**
 * Zebra Web Print - Dynamic Component Designer
 */

(function() {
    // Label Settings
    let labelWidth = 4;
    let labelHeight = 2;
    let dpi = 8; // 8 dpmm (203 dpi)
    
    // Core State: Array of label elements
    let elements = [];
    let lastZpl = "";
    let previewDebounceTimer;
    let zoomLevel = 1;

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', () => {
        loadState();
        renderElements();
        renderSimpleDesigner();
        updatePreview();

        // ZPL Live Update
        const zplEditor = document.getElementById('zpl-source');
        zplEditor.addEventListener('input', () => {
            debouncedManualPreview();
        });

        // Global Drag Listeners
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    });

    // --- State Management ---
    function saveState() {
        localStorage.setItem('zebra_designer_elements', JSON.stringify(elements));
        localStorage.setItem('zebra_label_settings', JSON.stringify({
            width: labelWidth,
            height: labelHeight
        }));
    }

    function loadState() {
        const savedElements = localStorage.getItem('zebra_designer_elements');
        if (savedElements) {
            try {
                elements = JSON.parse(savedElements);
            } catch (e) { 
                console.warn("Failed to load saved state", e); 
                elements = getDefaultElements();
            }
        } else {
            elements = getDefaultElements();
        }

        const savedSettings = localStorage.getItem('zebra_label_settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            labelWidth = settings.width || 4;
            labelHeight = settings.height || 2;
            
            // Sync UI
            const wInput = document.getElementById('cfg-width');
            const hInput = document.getElementById('cfg-height');
            if (wInput) wInput.value = labelWidth;
            if (hInput) hInput.value = labelHeight;
        }
    }

    window.updateLabelSettings = () => {
        labelWidth = parseFloat(document.getElementById('cfg-width').value) || 4;
        labelHeight = parseFloat(document.getElementById('cfg-height').value) || 2;
        saveState();
        debouncedPreview();
    };

    function getDefaultElements() {
        return [
            { id: 1, type: 'box', x: 20, y: 20, w: 770, h: 370, t: 3 },
            { id: 2, type: 'text', x: 50, y: 80, content: "PRODUCT RECEIPT", size: 40, bold: true, underline: false, isVariable: false, prefix: "", prefixBold: false },
            { id: 3, type: 'text', x: 50, y: 160, prefix: "ITEM: ", content: "Wireless Keyboard", size: 28, bold: false, underline: false, prefixBold: true, isVariable: true },
            { id: 4, type: 'text', x: 50, y: 220, prefix: "SKU: ", content: "WK-9000-B", size: 28, bold: false, underline: false, prefixBold: true, isVariable: true },
            { id: 5, type: 'barcode', x: 50, y: 260, content: "WK-9000-B", height: 70, ratio: 2 }
        ];
    }

    window.addElement = (type) => {
        const newElement = {
            id: Date.now(),
            type: type,
            x: 30,
            y: 100,
            content: type === 'barcode' ? '12345678' : (type === 'text' ? 'New Text' : ''),
            isVariable: type === 'barcode' ? true : false,
            prefix: '',
            ...(type === 'text' ? { size: 24, bold: false, underline: false, prefixBold: false, prefixUnderline: false } : {}),
            ...(type === 'barcode' ? { height: 60, ratio: 2 } : {}),
            ...(type === 'box' ? { w: 100, h: 50, t: 2 } : {})
        };
        elements.push(newElement);
        saveState();
        renderElements();
        renderSimpleDesigner();
        updatePreview();
    };

    window.removeElement = (id) => {
        elements = elements.filter(el => el.id !== id);
        lastZpl = ""; // Force preview refresh
        saveState();
        renderElements();
        renderSimpleDesigner();
        updatePreview();
        // Also clean up drag handles immediately
        renderDragOverlay('drag-overlay-advanced');
    };

    window.updateElement = (id, field, value) => {
        const el = elements.find(e => e.id === id);
        if (el) {
            // Convert to number if applicable
            if (['x', 'y', 'size', 'height', 'ratio', 'w', 'h', 't', 'scale'].includes(field)) {
                const numVal = parseInt(value) || 0;
                
                // Handle Image Scaling
                if (el.type === 'image' && field === 'scale') {
                    const safeScale = Math.max(1, numVal);
                    el.scale = safeScale;
                    el.w = Math.round(el.origW * (safeScale / 100));
                    el.h = Math.round(el.origH * (safeScale / 100));
                    debouncedReprocess(el);
                } else {
                    el[field] = numVal;
                }
            } else if (['bold', 'underline', 'prefixBold', 'prefixUnderline', 'isVariable'].includes(field)) {
                el[field] = value;
            } else {
                el[field] = value;
            }
            saveState();
            
            // Re-render if it's a structural change or toggle
            if (['isVariable', 'bold', 'underline', 'prefixBold', 'prefixUnderline', 'type'].includes(field)) {
                renderElements();
                renderSimpleDesigner();
            }
            
            debouncedPreview();
        }
    };

    window.clearFields = () => {
        if (confirm("Clear all label content values? (Layout will be preserved)")) {
            elements.forEach(el => {
                if (el.type !== 'box') el.content = "";
            });
            saveState();
            renderElements();
            renderSimpleDesigner();
            updatePreview();
        }
    };

    // --- UI Rendering ---
    window.renderElements = () => {
        const container = document.getElementById('elements-container');
        if (elements.length === 0) {
            container.innerHTML = `
                <div class="empty-state card">
                    <i data-lucide="plus-circle"></i>
                    <p>No elements added. Click above to start designing.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        container.innerHTML = elements.map(el => `
            <div class="element-card card mb-3" data-id="${el.id}">
                <div class="element-header">
                    <div class="element-title">
                        <i data-lucide="${getElementIcon(el.type)}"></i>
                        <span>${el.type.toUpperCase()}</span>
                    </div>
                    <button class="btn-icon text-error" onclick="removeElement(${el.id})">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
                <div class="element-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>X Pos (dots)</label>
                            <input type="number" value="${el.x}" oninput="updateElement(${el.id}, 'x', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Y Pos (dots)</label>
                            <input type="number" value="${el.y}" oninput="updateElement(${el.id}, 'y', this.value)">
                        </div>
                        ${renderTypeSpecificInputs(el)}
                    </div>
                </div>
            </div>
        `).join('');
        lucide.createIcons();
    }

    function getElementIcon(type) {
        if (type === 'text') return 'type';
        if (type === 'barcode') return 'barcode';
        return 'square';
    }

    function renderFormatToolbar(el, type = 'content') {
        const isPrefix = type === 'prefix';
        const boldField = isPrefix ? 'prefixBold' : 'bold';
        const underlineField = isPrefix ? 'prefixUnderline' : 'underline';
        const isBold = el[boldField];
        const isUnderline = el[underlineField];

        return `
            <div class="format-toolbar">
                <button class="btn-format ${isBold ? 'active' : ''}" onclick="updateElement(${el.id}, '${boldField}', ${!isBold})">
                    <i data-lucide="bold"></i>
                </button>
                <button class="btn-format ${isUnderline ? 'active' : ''}" onclick="updateElement(${el.id}, '${underlineField}', ${!isUnderline})">
                    <i data-lucide="underline"></i>
                </button>
            </div>
        `;
    }

    function renderTypeSpecificInputs(el) {
        if (el.type === 'text') {
            return `
                <div class="form-group">
                    <label>Text Mode</label>
                    <select onchange="updateElement(${el.id}, 'isVariable', this.value === 'true')" class="form-select">
                        <option value="false" ${!el.isVariable ? 'selected' : ''}>Normal (Static)</option>
                        <option value="true" ${el.isVariable ? 'selected' : ''}>Input Field (Dynamic)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Font Size</label>
                    <input type="number" value="${el.size}" oninput="updateElement(${el.id}, 'size', this.value)">
                </div>
                
                ${!el.isVariable ? `
                <div class="form-group col-span-2 template-box">
                    <div class="template-header">STATIC TEXT CONFIGURATION</div>
                    <div class="form-group">
                        <div class="flex-between">
                            <label>Fixed Text Content</label>
                            ${renderFormatToolbar(el, 'content')}
                        </div>
                        <input type="text" value="${el.content}" placeholder="Enter static text..." oninput="updateElement(${el.id}, 'content', this.value)">
                    </div>
                </div>
                ` : `
                <div class="form-group col-span-2 template-box">
                    <div class="template-header">INPUT FIELD CONFIGURATION</div>
                    <div class="form-grid">
                        <div class="form-group col-span-2">
                            <div class="flex-between">
                                <label>Fixed Label / Prefix</label>
                                ${renderFormatToolbar(el, 'prefix')}
                            </div>
                            <input type="text" value="${el.prefix || ''}" placeholder="e.g. Name: " oninput="updateElement(${el.id}, 'prefix', this.value)">
                        </div>
                        <div class="form-group col-span-2">
                            <div class="flex-between">
                                <label>Dynamic Value (Changeable in Designer)</label>
                                ${renderFormatToolbar(el, 'content')}
                            </div>
                            <input type="text" value="${el.content}" placeholder="e.g. John Doe" oninput="updateElement(${el.id}, 'content', this.value)">
                        </div>
                    </div>
                </div>
                `}
            `;
        }
        if (el.type === 'image') {
            return `
                <div class="form-group col-span-2 template-box">
                    <div class="template-header">IMAGE CONFIGURATION</div>
                    <div class="form-grid">
                        <div class="form-group col-span-2 flex-row gap-4" style="align-items: center; background: white; padding: 10px; border-radius: 8px;">
                            <img src="${el.previewData || ''}" style="max-width: 100px; max-height: 50px; border: 1px solid #eee;">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">
                                <div>Original: ${el.origW}x${el.origH}</div>
                                <button class="btn-link" onclick="document.getElementById('image-upload').click()" style="padding: 0; font-size: 0.7rem;">Change Image</button>
                            </div>
                        </div>
                        <div class="form-group col-span-2">
                            <label>Scale (%)</label>
                            <div class="flex-row gap-2">
                                <input type="number" value="${el.scale || 100}" min="1" max="1000" oninput="updateElement(${el.id}, 'scale', this.value)">
                                <button class="btn-outline btn-sm" onclick="updateElement(${el.id}, 'scale', 100)" style="white-space: nowrap;">Reset</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        if (el.type === 'barcode') {
            return `
                <div class="form-group">
                    <label>Bar Height</label>
                    <input type="number" value="${el.height}" oninput="updateElement(${el.id}, 'height', this.value)">
                </div>
                <div class="form-group">
                    <label>Wide Ratio</label>
                    <input type="number" value="${el.ratio}" oninput="updateElement(${el.id}, 'ratio', this.value)">
                </div>
                <div class="form-group col-span-2 template-box">
                    <div class="template-header">BARCODE CONFIGURATION</div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Field Label (for Designer)</label>
                            <input type="text" value="${el.prefix || ''}" placeholder="e.g. Serial Number" oninput="updateElement(${el.id}, 'prefix', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Default Barcode Value</label>
                            <input type="text" value="${el.content}" placeholder="e.g. 123456" oninput="updateElement(${el.id}, 'content', this.value)">
                        </div>
                    </div>
                </div>
            `;
        }
        if (el.type === 'box') {
            return `
                <div class="form-group">
                    <label>Width</label>
                    <input type="number" value="${el.w}" oninput="updateElement(${el.id}, 'w', this.value)">
                </div>
                <div class="form-group">
                    <label>Height</label>
                    <input type="number" value="${el.h}" oninput="updateElement(${el.id}, 'h', this.value)">
                </div>
                <div class="form-group">
                    <label>Thickness</label>
                    <input type="number" value="${el.t}" oninput="updateElement(${el.id}, 't', this.value)">
                </div>
                <div class="form-group col-span-1">
                    <label>Internal Box Label</label>
                    <input type="text" value="${el.content}" placeholder="Label for this box" oninput="updateElement(${el.id}, 'content', this.value)">
                </div>
            `;
        }
        return '';
    }

    window.renderSimpleDesigner = () => {
        const container = document.getElementById('simple-elements-container');
        if (elements.length === 0) {
            container.innerHTML = `
                <div class="empty-state card">
                    <i data-lucide="layout"></i>
                    <p>No elements defined. Go to the Advanced tab to add fields.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        // Only show elements marked as Variable/Input Field
        const variableElements = elements.filter(el => el.isVariable);
        
        if (variableElements.length === 0) {
             container.innerHTML = `
                <div class="empty-state card">
                    <i data-lucide="info"></i>
                    <p>No Input Fields found. Set text elements to "Input Field" mode in the Advanced tab to see them here.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        container.innerHTML = `
            <div class="card">
                <div class="simple-form-grid">
                    ${variableElements.map((el, index) => `
                        <div class="form-group">
                            <label>${el.prefix || `Field ${index + 1} (${el.type.toUpperCase()})`}</label>
                            <input type="text" value="${el.content}" 
                                placeholder="Enter value..."
                                oninput="updateElement(${el.id}, 'content', this.value)">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- Image Handling ---
    window.handleImageUpload = (input) => {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const zplImg = processImageToZpl(img);
                const newElement = {
                    id: Date.now(),
                    type: 'image',
                    x: 30,
                    y: 30,
                    w: img.width,
                    h: img.height,
                    scale: 100, // Default 100%
                    ratio: img.width / img.height,
                    origW: img.width,
                    origH: img.height,
                    hex: zplImg.hex,
                    bytesPerRow: zplImg.bytesPerRow,
                    byteCount: zplImg.byteCount,
                    previewData: e.target.result
                };
                elements.push(newElement);
                saveState();
                renderElements();
                updatePreview();
                input.value = '';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    let reprocessDebounceTimer;
    function debouncedReprocess(el) {
        clearTimeout(reprocessDebounceTimer);
        reprocessDebounceTimer = setTimeout(() => reprocessImage(el), 300);
    }

    function reprocessImage(el) {
        if (!el.previewData) return;
        const img = new Image();
        img.onload = () => {
            // Process at current target size
            const zplImg = processImageToZpl(img, parseInt(el.w), parseInt(el.h));
            el.hex = zplImg.hex;
            el.bytesPerRow = zplImg.bytesPerRow;
            el.byteCount = zplImg.byteCount;
            updatePreview();
        };
        img.src = el.previewData;
    }

    function processImageToZpl(img, targetW, targetH) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Use target size for scaling
        canvas.width = targetW || img.width;
        canvas.height = targetH || img.height;
        
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        
        let zplHex = "";
        let bytesPerRow = Math.ceil(canvas.width / 8);
        
        for (let y = 0; y < canvas.height; y++) {
            for (let b = 0; b < bytesPerRow; b++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    let x = b * 8 + bit;
                    if (x < canvas.width) {
                        let i = (y * canvas.width + x) * 4;
                        // Simple threshold: grayscale < 128
                        let gray = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
                        if (gray < 128) byte |= (1 << (7 - bit));
                    }
                }
                zplHex += byte.toString(16).padStart(2, '0').toUpperCase();
            }
        }
        
        return {
            hex: zplHex,
            bytesPerRow: bytesPerRow,
            byteCount: zplHex.length / 2
        };
    }

    // --- Drag and Drop Logic ---
    let dragData = {
        isDragging: false,
        elementId: null,
        startX: 0,
        startY: 0,
        startElX: 0,
        startElY: 0,
        scale: 1
    };

    window.initDrag = (e, id) => {
        const el = elements.find(item => item.id === id);
        if (!el) return;

        e.preventDefault();
        e.stopPropagation();

        const overlay = e.target.parentElement;
        const zplWidth = labelWidth * 25.4 * dpi;
        const scale = zplWidth / overlay.offsetWidth;

        dragData = {
            isDragging: true,
            elementId: id,
            startX: e.clientX,
            startY: e.clientY,
            startElX: el.x,
            startElY: el.y,
            scale: scale
        };

        e.target.classList.add('dragging');
    };

    function handleDragMove(e) {
        if (!dragData.isDragging) return;

        const deltaX = (e.clientX - dragData.startX) * dragData.scale;
        const deltaY = (e.clientY - dragData.startY) * dragData.scale;

        const el = elements.find(item => item.id === dragData.elementId);
        if (el) {
            el.x = Math.max(0, Math.round(dragData.startElX + deltaX));
            el.y = Math.max(0, Math.round(dragData.startElY + deltaY));
            
            // Fast preview update (image only)
            debouncedPreview();
            
            // Sync sidebars (but without re-render to keep focus if any)
            syncSidebarInputs(el);
        }
    }

    function handleDragEnd() {
        if (!dragData.isDragging) return;
        
        dragData.isDragging = false;
        document.querySelectorAll('.drag-handle').forEach(h => h.classList.remove('dragging'));
        
        saveState();
        renderElements();
        renderSimpleDesigner();
        updatePreview();
    }

    function syncSidebarInputs(el) {
        // Find inputs in the sidebar and update their values visually
        const inputs = document.querySelectorAll(`input[oninput*="updateElement(${el.id}, 'x'"], input[oninput*="updateElement(${el.id}, 'y'"]`);
        inputs.forEach(input => {
            if (input.getAttribute('oninput').includes("'x'")) input.value = el.x;
            if (input.getAttribute('oninput').includes("'y'")) input.value = el.y;
        });
    }

    window.renderDragOverlay = (overlayId) => {
        const overlay = document.getElementById(overlayId);
        const img = overlay.parentElement.querySelector('.label-preview-img');
        
        if (!img || img.style.display === 'none' || img.offsetWidth === 0) {
            overlay.innerHTML = '';
            return;
        }

        overlay.style.width = img.offsetWidth + 'px';
        overlay.style.height = img.offsetHeight + 'px';
        
        const zplWidth = labelWidth * 25.4 * dpi;
        const scale = zplWidth / img.offsetWidth;

        overlay.innerHTML = elements.map(el => {
            const screenX = el.x / scale;
            let screenY = el.y / scale;
            
            // Estimate size for handle
            let w = 40, h = 20;
            if (el.type === 'box') { 
                w = el.w / scale; h = el.h / scale; 
            }
            if (el.type === 'text') { 
                const content = (el.prefix || '') + (el.content || '');
                w = (content.length * el.size * 0.5) / scale; 
                h = el.size / scale; 
                // ZPL ^FT uses baseline. Subtract height to get top-left for CSS.
                screenY -= h;
            }
            if (el.type === 'barcode') { 
                // Code 128 estimate: (chars + 3) * 11 modules * ratio
                const modules = ((el.content || '').length + 3) * 11;
                w = (modules * el.ratio) / scale; 
                h = (el.height + 25) / scale; // height + text buffer
                // Barcode ^FO is top-left, so no adjustment needed
            }
            if (el.type === 'image') {
                w = el.w / scale;
                h = el.h / scale;
                // Image ^FO is top-left, no adjustment
            }

            return `<div class="drag-handle" 
                         style="left: ${screenX}px; top: ${screenY}px; width: ${Math.max(25, w)}px; height: ${Math.max(15, h)}px;"
                         onmousedown="initDrag(event, ${el.id})"
                         title="Drag to reposition">
                    </div>`;
        }).join('');
    };
    // --- ZPL Generation ---
    function generateZpl() {
        let zpl = `^XA\n^PR6,6\n^PW${Math.round(labelWidth * 25.4 * dpi)}\n^LL${Math.round(labelHeight * 25.4 * dpi)}\n^LH0,0\n^CI27\n\n`;

        elements.forEach(el => {
            if (el.type === 'text') {
                const font = 'A0'; 
                const charWidth = el.size * 0.55; 

                if (el.isVariable && el.prefix) {
                    // Render Prefix
                    zpl += `^FT${el.x},${el.y}^${font}N,${el.size},${el.size}^FD${el.prefix}^FS\n`;
                    if (el.prefixBold) zpl += `^FT${el.x + 1},${el.y}^${font}N,${el.size},${el.size}^FD${el.prefix}^FS\n`;
                    if (el.prefixUnderline) {
                        const lineLen = el.prefix.length * charWidth;
                        zpl += `^FO${el.x},${el.y + 4}^GB${Math.round(lineLen)},${Math.max(1, Math.round(el.size/12))},${Math.max(1, Math.round(el.size/12))}^FS\n`;
                    }

                    // Render Content with Offset
                    const offset = el.prefix.length * charWidth;
                    const contentX = el.x + offset;
                    zpl += `^FT${Math.round(contentX)},${el.y}^${font}N,${el.size},${el.size}^FD${el.content}^FS\n`;
                    if (el.bold) zpl += `^FT${Math.round(contentX) + 1},${el.y}^${font}N,${el.size},${el.size}^FD${el.content}^FS\n`;
                    if (el.underline) {
                        const lineLen = el.content.length * charWidth;
                        zpl += `^FO${Math.round(contentX)},${el.y + 4}^GB${Math.round(lineLen)},${Math.max(1, Math.round(el.size/12))},${Math.max(1, Math.round(el.size/12))}^FS\n`;
                    }
                } else {
                    // Render Standard Text
                    zpl += `^FT${el.x},${el.y}^${font}N,${el.size},${el.size}^FD${el.content}^FS\n`;
                    if (el.bold) zpl += `^FT${el.x + 1},${el.y}^${font}N,${el.size},${el.size}^FD${el.content}^FS\n`;
                    if (el.underline) {
                        const lineLen = el.content.length * charWidth;
                        zpl += `^FO${el.x},${el.y + 4}^GB${Math.round(lineLen)},${Math.max(1, Math.round(el.size/12))},${Math.max(1, Math.round(el.size/12))}^FS\n`;
                    }
                }
            } else if (el.type === 'image') {
                // ^GFA, byteCount, byteCount, bytesPerRow, hexData
                zpl += `^FO${el.x},${el.y}^GFA,${el.byteCount},${el.byteCount},${el.bytesPerRow},${el.hex}^FS\n`;
            } else if (el.type === 'barcode') {
                zpl += `^BY${el.ratio}^FO${el.x},${el.y}^BCN,${el.height},Y,N,N^FD${el.content}^FS\n`;
            } else if (el.type === 'box') {
                zpl += `^FO${el.x},${el.y}^GB${el.w},${el.h},${el.t}^FS\n`;
            }
        });

        zpl += `\n^XZ`;
        return zpl;
    }

    // --- Preview Logic ---
    function debouncedPreview() {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(updatePreview, 50); // Fast for dragging
    }

    function debouncedManualPreview() {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(updatePreviewFromZpl, 500);
    }

    async function updatePreview() {
        const zpl = generateZpl();
        const sourceEditor = document.getElementById('zpl-source');
        if (sourceEditor) sourceEditor.value = zpl;

        if (elements.length === 0) {
            const imgs = document.querySelectorAll('.label-preview-img');
            const placeholders = document.querySelectorAll('.preview-placeholder');
            imgs.forEach(img => img.style.display = 'none');
            placeholders.forEach(p => {
                p.style.display = 'flex';
                p.innerHTML = `<i data-lucide="layout"></i><p>Label is empty. Add elements in the ZPL Editor to begin.</p>`;
            });
            lucide.createIcons();
            lastZpl = "";
            renderDragOverlay('drag-overlay-advanced');
            return;
        }

        if (zpl === lastZpl) return;
        lastZpl = zpl;

        await updatePreviewWithCustomZpl(zpl);
    }

    window.updatePreviewFromZpl = () => {
        const zpl = document.getElementById('zpl-source').value;
        lastZpl = ""; 
        updatePreviewWithCustomZpl(zpl);
    };

    async function updatePreviewWithCustomZpl(zpl) {
        const imgs = document.querySelectorAll('.label-preview-img');
        const placeholders = document.querySelectorAll('.preview-placeholder');
        
        // Wipe the old image immediately so it doesn't "ghost" during deletion
        imgs.forEach(img => img.style.display = 'none');
        placeholders.forEach(p => {
            p.style.display = 'flex';
            p.innerHTML = `<i data-lucide="loader-2" class="spin"></i><p>Rendering...</p>`;
        });
        lucide.createIcons();

        try {
            const url = await LocalZplRenderer.renderZplToObjectUrl(zpl, {
                dpi: '8dpmm',
                widthInches: labelWidth,
                heightInches: labelHeight
            });
            
            imgs.forEach(img => {
                img.src = url;
                img.onload = () => {
                    placeholders.forEach(p => p.style.display = 'none');
                    imgs.forEach(i => i.style.display = 'block');
                    
                    // Update Drag Overlay ONLY for the advanced/architecture tab
                    renderDragOverlay('drag-overlay-advanced');
                };
            });
        } catch (err) {
            console.error("Preview failed", err);
            placeholders.forEach(p => p.innerHTML = `<p style="color: var(--error)">Render Error</p>`);
        }
    }

    window.zoomPreview = (delta) => {
        zoomLevel = Math.max(0.5, Math.min(2, zoomLevel + delta));
        document.querySelectorAll('.label-preview-img').forEach(img => {
            img.style.transform = `scale(${zoomLevel})`;
        });
        // Re-sync overlay after zoom
        setTimeout(() => {
            renderDragOverlay('drag-overlay-advanced');
        }, 100);
    };

    // --- Print Execution ---
    window.handlePrint = async () => {
        const zpl = generateZpl();
        await executePrint(zpl, document.getElementById('print-btn'));
    };

    async function executePrint(zpl, btn) {
        if (!btn) return;
        const originalHtml = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> SENDING...';
            lucide.createIcons();

            await PrinterManager.sendJob(zpl);

            btn.classList.add('success');
            btn.innerHTML = '<i data-lucide="check"></i> PRINTED';
            lucide.createIcons();

            setTimeout(() => {
                btn.disabled = false;
                btn.classList.remove('success');
                btn.innerHTML = originalHtml;
                lucide.createIcons();
            }, 3000);

        } catch (err) {
            alert("Printing Failed: " + err.message);
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            lucide.createIcons();
        }
    }

    // --- Initialization & Event Listeners ---
    let zoomFrame;
    document.addEventListener('mousemove', (e) => {
        if (zoomFrame) cancelAnimationFrame(zoomFrame);
        
        zoomFrame = requestAnimationFrame(() => {
            const zoomContainers = document.querySelectorAll('.preview-canvas-wrapper.enable-zoom');
            zoomContainers.forEach(container => {
                const rect = container.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right && 
                    e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    container.style.transformOrigin = `${x}% ${y}%`;
                }
            });
        });
    });

    window.refreshConnection = () => {
        PrinterManager.checkConnection(true);
    };

    // --- Backup & Restore ---
    window.downloadBackup = () => {
        const data = {
            elements,
            labelWidth,
            labelHeight
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zebra-template-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    window.handleBackupUpload = (input) => {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.elements && Array.isArray(data.elements)) {
                    elements = data.elements;
                    labelWidth = data.labelWidth || labelWidth;
                    labelHeight = data.labelHeight || labelHeight;
                    
                    // Update UI inputs
                    if (document.getElementById('cfg-width')) document.getElementById('cfg-width').value = labelWidth;
                    if (document.getElementById('cfg-height')) document.getElementById('cfg-height').value = labelHeight;
                    
                    saveState();
                    renderElements();
                    renderSimpleDesigner();
                    updatePreview();
                    alert("Template imported successfully!");
                }
            } catch (err) {
                console.error("Import error", err);
                alert("Invalid template file.");
            }
            input.value = '';
        };
        reader.readAsText(file);
    };

})();

