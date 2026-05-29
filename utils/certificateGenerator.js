const PDFDocument = require('pdfkit');

const generateCertificate = async ({
    studentName,
    rollNumber,
    examTitle,
    courseName,
    collegeName,
    score,
    totalMarks,
    percentage,
    date
}) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc
                .fillColor('#333')
                .fontSize(24)
                .text(collegeName || 'Certificate Issuer', { align: 'center' })
                .moveDown(1);

            doc
                .fontSize(18)
                .fillColor('#555')
                .text('Certificate of Achievement', { align: 'center' })
                .moveDown(2);

            doc
                .fontSize(14)
                .fillColor('#333')
                .text(`This is to certify that`, { align: 'center' })
                .moveDown(0.5);

            doc
                .fontSize(22)
                .fillColor('#000')
                .text(studentName || 'Student Name', { align: 'center', underline: true })
                .moveDown(1);

            doc
                .fontSize(14)
                .fillColor('#333')
                .text(`Roll Number: ${rollNumber || 'N/A'}`, { align: 'center' })
                .moveDown(1);

            doc
                .fontSize(14)
                .text(`has successfully passed the exam`, { align: 'center' })
                .moveDown(0.5);

            doc
                .fontSize(18)
                .fillColor('#000')
                .text(examTitle || 'Exam Title', { align: 'center', underline: true })
                .moveDown(1);

            doc
                .fontSize(12)
                .fillColor('#333')
                .text(`Course: ${courseName || 'N/A'}`, { align: 'center' })
                .moveDown(0.2);

            doc
                .text(`College: ${collegeName || 'N/A'}`, { align: 'center' })
                .moveDown(0.2);

            doc
                .text(`Score: ${score ?? 'N/A'} / ${totalMarks ?? 'N/A'} (${percentage ?? 'N/A'}%)`, { align: 'center' })
                .moveDown(2);

            if (date) {
                doc
                    .fontSize(12)
                    .text(`Date: ${date}`, { align: 'center' })
                    .moveDown(1);
            }

            const signatureY = doc.y + 30;
            doc
                .moveTo(100, signatureY)
                .lineTo(250, signatureY)
                .stroke('#888');
            doc
                .fontSize(12)
                .fillColor('#555')
                .text('Authorized Signature', 100, signatureY + 5, { width: 150, align: 'center' });

            doc
                .moveTo(350, signatureY)
                .lineTo(500, signatureY)
                .stroke('#888');
            doc
                .text('Registrar', 350, signatureY + 5, { width: 150, align: 'center' });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { generateCertificate };
