const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
for(const file of ['index.html','admin.html']){
  const source=fs.readFileSync(file,'utf8');
  for(const [i,match] of [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].entries())if(match[1].trim())new vm.Script(match[1],{filename:`${file}:${i}`});
  for(const match of source.matchAll(/(?:src|href)="([^"#?]+)"/g))if(!/^(https?:|\/)/.test(match[1])&&!fs.existsSync(match[1]))throw new Error(`Missing asset ${match[1]}`);
}
for(const dir of ['api','.'])for(const file of fs.readdirSync(dir))if(file.endsWith('.js'))new vm.Script(fs.readFileSync(path.join(dir,file),'utf8'),{filename:path.join(dir,file)});
console.log('All browser/API scripts parse; referenced local assets exist.');
