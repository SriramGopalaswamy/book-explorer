import { useState, useCallback } from 'react';

const usePdfExport = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const exportPdf = useCallback(async (data) => {
        setLoading(true);
        setError(null);

        try {
            // Create a new worker for PDF generation
            const worker = new Worker(new URL('../workers/pdfWorker.js', import.meta.url));

            // Send data to the worker
            worker.postMessage(data);

            // Handle the result from the worker
            worker.onmessage = (event) => {
                const { pdfBlob, error } = event.data;
                if (error) {
                    throw new Error(error);
                }
                // Create a URL for the PDF blob and trigger download
                const url = window.URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'exported-file.pdf';
                a.click();
                window.URL.revokeObjectURL(url);
                setLoading(false);
            };

            // Handle worker error
            worker.onerror = (err) => {
                setError(err);
                setLoading(false);
            };
        } catch (err) {
            setError(err);
            setLoading(false);
        }
    }, []);

    return { loading, error, exportPdf };
};

export default usePdfExport;
