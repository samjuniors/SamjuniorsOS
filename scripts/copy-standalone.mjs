import fs from 'node:fs';
import path from 'node:path';

const copy = (src, dest) => {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  }
};

copy('.next/static', '.next/standalone/.next/static');
copy('public', '.next/standalone/public');
