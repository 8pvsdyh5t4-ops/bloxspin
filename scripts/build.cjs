const fs=require('node:fs'),path=require('node:path');
require('./check.cjs');
// Publish only the app, never SQL, tests or operational documentation.
fs.mkdirSync('dist/assets',{recursive:true});
for(const name of fs.readdirSync('.'))if(/\.(html|css|js)$/.test(name))fs.copyFileSync(name,path.join('dist',name));
for(const name of fs.readdirSync('assets'))if(name.endsWith('.webp'))fs.copyFileSync(path.join('assets',name),path.join('dist/assets',name));
console.log('Static app built in dist/. Vercel deploys api/ as Node functions.');
