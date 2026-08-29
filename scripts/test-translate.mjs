import { readFileSync } from 'fs';
const envFile = readFileSync('.env.local', 'utf-8');
const match = envFile.match(/GOOGLE_TRANSLATE_API_KEY=(.*)/);
if (!match || !match[1]) {
    console.error("No GOOGLE_TRANSLATE_API_KEY found in .env.local");
    process.exit(1);
}

const key = match[1].trim();
const url = `https://translation.googleapis.com/language/translate/v2?key=${key}`;

fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        q: 'Hello, how are you?',
        target: 'hi'
    })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
