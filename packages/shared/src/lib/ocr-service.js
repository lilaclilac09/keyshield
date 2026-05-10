let tesseract = null;
async function loadTesseract() {
    if (!tesseract) {
        tesseract = await import('tesseract.js');
    }
    return tesseract;
}
export async function ocrImage(fileOrUrl) {
    const T = await loadTesseract();
    let imageSource = fileOrUrl;
    const result = await T.recognize(imageSource, 'eng', {
        logger: () => { }, // silent
    });
    return {
        text: result.data.text,
        confidence: result.data.confidence,
    };
}
export async function captureScreenAndOcr() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(track);
        const bitmap = await imageCapture.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        track.stop();
        stream.getTracks().forEach((t) => t.stop());
        const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
        const file = new File([blob], 'screenshot.png', { type: 'image/png' });
        return ocrImage(file);
    }
    catch (err) {
        throw new Error(`Screen capture failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
export async function ocrAndDetectKeys(fileOrUrl) {
    const { text } = await ocrImage(fileOrUrl);
    const { detectKeys } = await import('./key-detector');
    return detectKeys(text);
}
//# sourceMappingURL=ocr-service.js.map