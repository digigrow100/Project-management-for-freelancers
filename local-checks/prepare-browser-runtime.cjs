// Linux-only isolated test browser. Uses integrity-pinned npm assets, no download.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {pipeline}=require('node:stream/promises'),tar=require('tar-fs');
const pkg=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'../bin');
const root=path.resolve(process.env.HMS_BROWSER_RUNTIME_ROOT||path.resolve(__dirname,'../../browser-runtime'));
(async()=>{
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 for(const name of ['chromium','fonts','al2023','swiftshader']){
  const archive=name!=='chromium',target=path.join(root,name);
  if(archive){fs.mkdirSync(target,{recursive:true,mode:0o700});await pipeline(fs.createReadStream(path.join(pkg,name+'.tar.br')),zlib.createBrotliDecompress(),tar.extract(target,{chown:false,utimes:false}));}
  else{await pipeline(fs.createReadStream(path.join(pkg,'chromium.br')),zlib.createBrotliDecompress(),fs.createWriteStream(target,{mode:0o700}));fs.chmodSync(target,0o700);}
 }
 console.log('Pinned isolated Linux Chromium extracted. System fonts: /etc/fonts.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
