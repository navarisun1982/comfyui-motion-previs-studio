const readline = require('readline');
const fs = require('fs');

const path = 'C:/Users/gfara/.gemini/antigravity-ide/brain/35bf269f-fbb9-4e57-8ae5-390b52ee8f73/.system_generated/logs/transcript.jsonl';
if (!fs.existsSync(path)) {
  console.log('Transcript not found');
  process.exit(1);
}

const rl = readline.createInterface({ input: fs.createReadStream(path) });
let count = 0;
rl.on('line', (line) => {
  try {
    const d = JSON.parse(line);
    if (d.type === 'USER_INPUT') {
      count++;
      console.log(`\n=== USER INPUT #${count} (step ${d.step_index}) ===`);
      console.log(d.content ? d.content.slice(0, 500) : '<empty>');
    }
  } catch {}
});
