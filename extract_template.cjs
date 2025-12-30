const fs = require('fs');
const content = fs.readFileSync('production_bundle.js', 'utf8');
const searchString = 'UEsDBBQABgAIAAAAIQC2mqBmdQEAAI0FAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtb';
const index = content.indexOf(searchString);
if (index !== -1) {
    let startQuote = -1;
    for (let i = index; i >= 0; i--) {
        if (content[i] === '"' || content[i] === "'") {
            startQuote = i;
            break;
        }
    }
    if (startQuote !== -1) {
        const quoteChar = content[startQuote];
        const endQuote = content.indexOf(quoteChar, startQuote + 1);
        if (endQuote !== -1) {
            const base64 = content.substring(startQuote + 1, endQuote);
            fs.writeFileSync('recovered_template.txt', base64);
            console.log('Successfully extracted ' + base64.length + ' characters.');
        } else {
            console.log('End quote not found');
        }
    } else {
        console.log('Start quote not found');
    }
} else {
    console.log('Prefix not found');
}
