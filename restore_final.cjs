const fs = require('fs');
// Read the recovered template (handling potential UTF-16/BOM)
const content = fs.readFileSync('original_template.txt', 'utf16le').replace(/^\uFEFF/, '');
// Find the base64 string
const match = content.match(/window\.closureTemplateXlsxBase64\s*=\s*['"]([^'"]+)['"]/);
if (match) {
    const base64 = match[1];
    const moduleContent = `export const closureTemplateXlsxBase64 = '${base64}';\n`;
    fs.writeFileSync('js/utils/template_chiusura_base64.js', moduleContent);
    console.log('Successfully restored template module. Length: ' + base64.length);
} else {
    // Try reading as utf8 if utf16 failed
    const content2 = fs.readFileSync('original_template.txt', 'utf8').replace(/^\uFEFF/, '');
    const match2 = content2.match(/window\.closureTemplateXlsxBase64\s*=\s*['"]([^'"]+)['"]/);
    if (match2) {
        const base64 = match2[1];
        const moduleContent = `export const closureTemplateXlsxBase64 = '${base64}';\n`;
        fs.writeFileSync('js/utils/template_chiusura_base64.js', moduleContent);
        console.log('Successfully restored template module (UTF8 fallback). Length: ' + base64.length);
    } else {
        console.log('Failed to extract base64 from recovered template.');
    }
}
