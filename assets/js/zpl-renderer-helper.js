// Local ZPL renderer helper (replaces remote Labelary calls)
(function () {
    let rendererApiPromise = null;

    function toDpmm(dpiValue) {
        if (typeof dpiValue === 'number') return dpiValue;
        const normalized = String(dpiValue || '').toLowerCase().replace('dpmm', '').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
    }

    function toMillimeters(inches) {
        return Number(inches || 0) * 25.4;
    }

    async function getRendererApi() {
        if (!rendererApiPromise) {
            rendererApiPromise = (async () => {
                if (!window.zpljs?.ready) {
                    throw new Error('Local renderer not loaded. Refresh and try again.');
                }
                const { api } = await window.zpljs.ready;
                if (!api?.zplToBase64MultipleAsync) {
                    throw new Error('Local renderer API unavailable.');
                }
                return api;
            })();
        }
        return rendererApiPromise;
    }

    async function renderZplToBase64(zpl, options = {}) {
        const api = await getRendererApi();
        const widthMm = toMillimeters(options.widthInches ?? 4);
        const heightMm = toMillimeters(options.heightInches ?? 2);
        const dpmm = toDpmm(options.dpi ?? '8dpmm');
        const index = Number(options.index ?? 0);

        const labels = await api.zplToBase64MultipleAsync(String(zpl || ''), widthMm, heightMm, dpmm);
        const selected = labels?.[index];
        if (!selected) {
            throw new Error(`Label index ${index} not found in rendered output.`);
        }
        return selected;
    }

    async function renderZplToBlob(zpl, options = {}) {
        const base64 = await renderZplToBase64(zpl, options);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: 'image/png' });
    }

    async function renderZplToObjectUrl(zpl, options = {}) {
        const blob = await renderZplToBlob(zpl, options);
        return URL.createObjectURL(blob);
    }

    async function renderZplToDataUrl(zpl, options = {}) {
        const base64 = await renderZplToBase64(zpl, options);
        return `data:image/png;base64,${base64}`;
    }

    window.LocalZplRenderer = {
        getRendererApi,
        renderZplToBase64,
        renderZplToBlob,
        renderZplToObjectUrl,
        renderZplToDataUrl
    };
})();
