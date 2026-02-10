import {execSync} from 'node:child_process';

execSync('npm run build', {stdio: 'inherit'});

await import(new URL('../build/src/index.js', import.meta.url).toString());
