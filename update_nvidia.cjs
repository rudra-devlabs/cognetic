const fs = require('fs');
const providers = JSON.parse(fs.readFileSync('src/views/agents/providers.json', 'utf8'));

// Only map Nvidia models to their correct IDs based on the API standard
providers['Nvidia'].models = [
  "nvidia/nemotron-4-340b-instruct",
  "nvidia/nemotron-4-340b-reward",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "mistralai/mistral-large-2407",
  "mistralai/mistral-nemo-12b-instruct",
  "microsoft/phi-3-medium-128k-instruct"
];

fs.writeFileSync('src/views/agents/providers.json', JSON.stringify(providers, null, 2));
console.log('Updated providers.json for NVIDIA');
