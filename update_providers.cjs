const fs = require('fs');
const providers = JSON.parse(fs.readFileSync('src/views/agents/providers.json', 'utf8'));

for (const [key, value] of Object.entries(providers)) {
    if (!value.baseUrl) continue;
    try {
        const url = new URL(value.baseUrl);
        value.apiPath = url.pathname === '/' ? '' : url.pathname;
        value.baseUrl = url.origin;
    } catch (e) {
        // Ignore invalid URLs or empty ones
    }
}

fs.writeFileSync('src/views/agents/providers.json', JSON.stringify(providers, null, 2));
console.log('Updated providers.json');
