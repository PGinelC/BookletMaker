const pdfFileInput = document.getElementById('pdfFile');
const imposeButton = document.getElementById('imposeBtn');
const statusDiv = document.getElementById('status');

imposeButton.disabled = true;

pdfFileInput.addEventListener('change', function() {
    if (this.files.length > 0) {
        if (this.files[0].type == 'application/pdf') {
            statusDiv.textContent = `Selected file: ${this.files[0].name}`;
            imposeButton.disabled = false; // Enable button when a file is selected
        } else {
            statusDiv.textContent = 'Please upload a valid PDF file.';
            imposeButton.disabled = true;
        }
    } else {
        statusDiv.textContent = 'Please upload a PDF.';
        imposeButton.disabled = true;
    }
});

imposeButton.addEventListener('click', async function() {
    const file = pdfFileInput.files[0];
    if (!file) {
        statusDiv.textContent = 'No PDF file selected.';
        return;
    }

    statusDiv.textContent = 'Processing...';
    imposeButton.disabled = true;

    try {
        // Read the PDF file
        const arrayBuffer = await file.arrayBuffer();

        // Load the PDF document using pdf-lib
        const originalPdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        let originalPages = originalPdfDoc.getPages();
        let originalPageCount = originalPages.length;
        const initialPageCountBeforePadding = originalPageCount;

        if (originalPageCount === 0) {
            statusDiv.textContent = 'The uploaded PDF has no pages.';
            imposeButton.disabled = false;
            return;
        }

        // Create a new PDF document for the imposed output
        const imposedPdfDoc = await PDFLib.PDFDocument.create();

        // --- Imposition Logic (Saddle Stitch) ---

        const pagesToPad = (4 - (originalPageCount % 4)) % 4;

        if (pagesToPad > 0) {
            statusDiv.textContent = `Padding PDF with ${pagesToPad} blank page(s) to make total a multiple of 4 for saddle stitch. Processing...`;
            await new Promise(resolve => setTimeout(resolve, 0));

            const firstPageForSize = originalPages[0]; // Safe as originalPageCount > 0
            const pageSizeForPadding = firstPageForSize.getSize();

            for (let k = 0; k < pagesToPad; k++) {
                originalPdfDoc.addPage([pageSizeForPadding.width, pageSizeForPadding.height]);
            }
            originalPages = originalPdfDoc.getPages();
            originalPageCount = originalPages.length;
        }

        // All original pages (including padded ones) are assumed to be of the same primary size
        const DFLT_PAGE_SIZE = {width: 595, height: 842}; // fallback A4 size
        const firstOriginalPageForSize = originalPageCount > 0 ? originalPages[0] : null;
        const referencePageSize = firstOriginalPageForSize ? firstOriginalPageForSize.getSize() : DFLT_PAGE_SIZE;

        const margin = 20;
        const imposedPageWidth = referencePageSize.width * 2 + margin * 3;
        const imposedPageHeight = referencePageSize.height + margin * 2;

        let frontPageIndex = 0;
        let backPageIndex = originalPageCount - 1;

        for (let i = 0; i < originalPageCount / 2; i++) {
            const imposedPage = imposedPdfDoc.addPage([imposedPageWidth, imposedPageHeight]);

            let actualIndexForLeftPage, actualIndexForRightPage;

            if (i % 2 === 0) { // Outer pages: (Last, First), etc.
                actualIndexForLeftPage = backPageIndex;
                actualIndexForRightPage = frontPageIndex;
                backPageIndex--;
                frontPageIndex++;
            } else { // Inner pages: (First+1, Last-1), etc.
                actualIndexForLeftPage = frontPageIndex;
                actualIndexForRightPage = backPageIndex;
                frontPageIndex++;
                backPageIndex--;
            }

            if (actualIndexForLeftPage < initialPageCountBeforePadding) {
                const pageToEmbedOnLeft = originalPages[actualIndexForLeftPage];
                const embeddedPageLeft = await imposedPdfDoc.embedPage(pageToEmbedOnLeft);
                imposedPage.drawPage(embeddedPageLeft, {
                    x: margin,
                    y: margin,
                    width: referencePageSize.width,
                    height: referencePageSize.height,
                });
            } // Else: it's a padded page. Leave this slot blank.

            // Embed and draw right page ONLY if it's an original page (not a padded one)
            if (actualIndexForRightPage < initialPageCountBeforePadding) {
                const pageToEmbedOnRight = originalPages[actualIndexForRightPage];
                const embeddedPageRight = await imposedPdfDoc.embedPage(pageToEmbedOnRight);
                imposedPage.drawPage(embeddedPageRight, {
                    x: referencePageSize.width + margin * 2,
                    y: margin,
                    width: referencePageSize.width,
                    height: referencePageSize.height,
                });
            } // Else: it's a padded page. Leave this slot blank.
        }
        // --- End of Imposition Logic ---

        // Save the imposed PDF
        const imposedPdfBytes = await imposedPdfDoc.save();
        const blob = new Blob([imposedPdfBytes], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = `imposed_saddle_${file.name}`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadUrl);

        statusDiv.textContent = 'Imposition complete. Your download should start shortly.';

    } catch (error) {
        console.error('Error during PDF imposition:', error);
        statusDiv.textContent = `Error: ${error.message}`;
    } finally {
        imposeButton.disabled = false;
    }
});