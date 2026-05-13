/**
 * Zebra Web Print - Main Application Logic
 */

(function() {
    // Generic ZPL Template for Universal Labels
    // Size: 4" x 2" (typical shipping/product label)
    const ZPL_TEMPLATE = `^XA
^PR6,6
^PW812
^LL406
^LH0,0
^CI27

^FX --- Header ---
^FT30,60^A0N,40,40^FD{header}^FS

^FX --- Reference No ---
^FT30,110^A0N,24,24^FDREF: {ref_no}^FS

^FX --- Description ---
^FT30,145^A0N,24,24^FD{description}^FS

^FX --- Attributes Grid ---
^FT30,200^A0N,20,20^FD{attr1}:^FS
^FT150,200^A0N,20,20^FD{val1}^FS

^FT30,235^A0N,20,20^FD{attr2}:^FS
^FT150,235^A0N,20,20^FD{val2}^FS

^FX --- Notes ---
^FT30,285^A0N,18,18^FDNotes:^FS
^FT30,315^A0N,18,18^FB750,3,0,L,0^FD{notes}^FS

^FX --- Barcode ---
^BY2
^FO500,50^BCN,70,Y,N,N^FD{barcode}^FS

^XZ`;

    let previewDebounceTimer;
    let lastZpl = "";
    let zoomLevel = 1;

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('label-form');
        
        // Load saved data
        loadState();

        // Listen for changes
        form.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => {
                saveState();
                debouncedPreview();
            });
        });

        // Initial preview
        updatePreview();
    });

    // --- State Management ---
    function saveState() {
        const form = document.getElementById('label-form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        localStorage.setItem('zebra_print_data', JSON.stringify(data));
    }

    function loadState() {
        const saved = localStorage.getItem('zebra_print_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const form = document.getElementById('label-form');
                Object.keys(data).forEach(key => {
                    const input = form.querySelector(`[name="${key}"]`);
                    if (input) input.value = data[key];
                });
            } catch (e) { console.warn("Failed to load saved state", e); }
        }
    }

    window.clearFields = () => {
        if (confirm("Clear all label data?")) {
            const form = document.getElementById('label-form');
            form.reset();
            localStorage.removeItem('zebra_print_data');
            updatePreview();
        }
    };

    // --- ZPL Generation ---
    function generateZpl() {
        const form = document.getElementById('label-form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        let zpl = ZPL_TEMPLATE;
        
        // Replace placeholders
        zpl = zpl.replace(/{header}/g, data.header || '');
        zpl = zpl.replace(/{ref_no}/g, data.ref_no || '');
        zpl = zpl.replace(/{description}/g, data.description || '');
        zpl = zpl.replace(/{attr1}/g, data.attr1 || 'Attr 1');
        zpl = zpl.replace(/{val1}/g, data.val1 || '');
        zpl = zpl.replace(/{attr2}/g, data.attr2 || 'Attr 2');
        zpl = zpl.replace(/{val2}/g, data.val2 || '');
        zpl = zpl.replace(/{notes}/g, data.notes || '');
        zpl = zpl.replace(/{barcode}/g, data.barcode || '00000000');

        return zpl;
    }

    // --- Preview Logic ---
    function debouncedPreview() {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(updatePreview, 1000);
    }

    async function updatePreview() {
        const zpl = generateZpl();
        document.getElementById('zpl-source').value = zpl;

        if (zpl === lastZpl) return;
        lastZpl = zpl;

        const img = document.getElementById('label-preview-img');
        const placeholder = document.getElementById('preview-placeholder');
        
        img.style.display = 'none';
        placeholder.style.display = 'flex';

        try {
            const url = await LocalZplRenderer.renderZplToObjectUrl(zpl, {
                dpi: '8dpmm',
                widthInches: 4,
                heightInches: 2
            });
            
            img.src = url;
            img.onload = () => {
                placeholder.style.display = 'none';
                img.style.display = 'block';
            };
        } catch (err) {
            console.error("Preview failed", err);
            placeholder.innerHTML = `<p style="color: var(--error)">Preview Error</p>`;
        }
    }

    window.updatePreviewFromZpl = () => {
        const zpl = document.getElementById('zpl-source').value;
        lastZpl = ""; // Force update
        updatePreviewWithCustomZpl(zpl);
    };

    async function updatePreviewWithCustomZpl(zpl) {
        const img = document.getElementById('label-preview-img');
        const placeholder = document.getElementById('preview-placeholder');
        
        img.style.display = 'none';
        placeholder.style.display = 'flex';

        try {
            const url = await LocalZplRenderer.renderZplToObjectUrl(zpl, {
                dpi: '8dpmm',
                widthInches: 4,
                heightInches: 2
            });
            img.src = url;
            img.onload = () => {
                placeholder.style.display = 'none';
                img.style.display = 'block';
            };
        } catch (err) {
            console.error("Manual Preview failed", err);
            placeholder.innerHTML = `<p style="color: var(--error)">Invalid ZPL Source</p>`;
        }
    }

    window.zoomPreview = (delta) => {
        zoomLevel = Math.max(0.5, Math.min(2, zoomLevel + delta));
        document.getElementById('label-preview-img').style.transform = `scale(${zoomLevel})`;
    };

    // --- Print Execution ---
    window.handlePrint = async () => {
        const zpl = generateZpl();
        const btn = document.getElementById('print-btn');
        const originalHtml = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> SENDING TO PRINTER...';
            lucide.createIcons();

            await PrinterManager.sendJob(zpl);

            btn.classList.add('success');
            btn.innerHTML = '<i data-lucide="check"></i> PRINTED SUCCESSFULLY';
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
    };

    window.refreshConnection = () => {
        PrinterManager.checkConnection(true);
    };

})();
