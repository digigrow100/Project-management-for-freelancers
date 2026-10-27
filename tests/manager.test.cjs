const {test}=require('node:test'),assert=require('node:assert/strict'),{buildSync}=require('esbuild'),path=require('node:path');
const React=require('react'),{act,create}=require('react-test-renderer');
const output=buildSync({entryPoints:[path.join(__dirname,'../components/hosting/BackupManager.tsx')],tsconfig:path.join(__dirname,'../tsconfig.focused.json'),bundle:true,platform:'node',format:'cjs',write:false,external:['react','react/jsx-runtime']});
const moduleOutput={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,moduleOutput,moduleOutput.exports);const {BackupManager}=moduleOutput.exports;
const point={id:'p',captured:100,default:true,components:['website','database','email','configuration']},sites=[{id:'a',clientId:'ca',name:'Site A',copies:3,points:[point]}];
const button=(view,text)=>view.root.findAllByType('button').find(b=>b.children.join('')===text);
test('date/component preview retains known job after uncertain stage, then status can be refreshed',async()=>{
 const calls=[];global.fetch=async(url,options)=>{const command=JSON.parse(options.body);calls.push(command);if(command.action==='list')return Response.json({sites});if(command.action==='plan')return Response.json({job:'j',digest:'a'.repeat(64),sites:[{site:'a',point:'p',captured:100,components:['website']}]});if(command.action==='stage')throw Error('timeout');if(command.action==='status')return Response.json({job:'j',state:'staged',activated:false,sites:[{site:'a',point:'p',state:'validated'}]});throw Error('unexpected');};
 let view;await act(async()=>{view=create(React.createElement(BackupManager,{owner:false,readOnly:false}));});
 assert.equal(button(view,'Make selected backup default'),undefined);assert.equal(view.root.findAllByType('input').filter(i=>i.props.type==='number').length,0);
 await act(async()=>{view.root.findByProps({'aria-label':'Recovery date for Site A'}).props.onChange({target:{value:'p'}});});
 await act(async()=>{button(view,'Preview restore').props.onClick();});assert.ok(button(view,'Prepare isolated restore'));
 await act(async()=>{button(view,'Prepare isolated restore').props.onClick();});assert.ok(button(view,'Refresh job status'));assert.equal(view.root.findAllByProps({role:'alert'}).length,1);
 await act(async()=>{button(view,'Refresh job status').props.onClick();});assert.ok(JSON.stringify(view.toJSON()).includes('validated'));assert.equal(calls.filter(c=>c.action==='stage').length,1);
 await act(async()=>{view.unmount();});
});
test('owner limit changes require submit; read-only mutation controls are disabled',async()=>{
 global.fetch=async()=>Response.json({sites});let view;await act(async()=>{view=create(React.createElement(BackupManager,{owner:true,readOnly:true}));});
 const input=view.root.findByProps({'aria-label':'Backup limit for Site A'});assert.equal(input.props.onBlur,undefined);assert.equal(input.props.disabled,true);
 for(const label of ['Save limit','Make selected backup default','Preview restore','Select displayed websites'])assert.equal(button(view,label).props.disabled,true);
 await act(async()=>view.unmount());
});
