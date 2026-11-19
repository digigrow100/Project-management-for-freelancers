const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const Renderer=require('react-test-renderer');
const {act}=Renderer;

class EmailInput { constructor(value){this.value=value;} }
function loadForm(request){
 const source=fs.readFileSync('app/login/auth-forms.tsx','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(js,{module:mod,exports:mod.exports,HTMLInputElement:EmailInput,FormData,
  require:name=>name==='./actions'?{requestPasswordResetAction:request,updatePasswordAction:async()=>{}}:
   name==='react-dom'?{useFormStatus:()=>({pending:false})}:
   name==='next/navigation'?{unstable_rethrow:error=>{if(error?.digest==='NEXT_REDIRECT')throw error;}}:require(name)});
 return mod.exports.PasswordResetRequestForm;
}
function event(value){
 return {prevented:false,preventDefault(){this.prevented=true;},currentTarget:{elements:{namedItem:()=>new EmailInput(value)}}};
}

test('reset button rejects a double click and unlocks after repeated same-page errors',async()=>{
 let finish,calls=0;
 const Form=loadForm(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 let view;
 act(()=>{view=Renderer.create(React.createElement(Form));});
 for(let attempt=0;attempt<2;attempt++){
  const first=event(' owner@example.invalid ');
  act(()=>view.root.findByType('form').props.onSubmit(first));
  assert.equal(first.prevented,false);
  assert.equal(view.root.findByType('button').props.disabled,true);
  assert.equal(view.root.findByType('button').children.join(''),'Sending reset link…');
  const duplicate=event('owner@example.invalid');
  act(()=>view.root.findByType('form').props.onSubmit(duplicate));
  assert.equal(duplicate.prevented,true);
  let result;
  act(()=>{result=view.root.findByType('form').props.action(new FormData());});
  assert.equal(calls,attempt+1);
  // Next can retain the same client component when only search params change.
  act(()=>view.update(React.createElement(Form,{serverError:'The email service is unavailable.'})));
  await act(async()=>{finish();await result;});
  assert.equal(view.root.findByType('button').props.disabled,false);
  assert.equal(view.root.findByType('button').children.join(''),'Send reset link');
 }
 act(()=>view.unmount());
});

test('transport errors unlock the form and show an error without swallowing navigation',async()=>{
 let fail;
 const Form=loadForm(()=>new Promise((_resolve,reject)=>{fail=reject;}));
 let view,result;
 act(()=>{view=Renderer.create(React.createElement(Form));});
 act(()=>view.root.findByType('form').props.onSubmit(event('owner@example.invalid')));
 act(()=>{result=view.root.findByType('form').props.action(new FormData());});
 await act(async()=>{fail(new Error('connection lost'));await result;});
 assert.equal(view.root.findByType('button').props.disabled,false);
 assert.match(view.root.findByProps({role:'alert'}).children.join(''),/Please try again later/);
 act(()=>view.root.findByType('form').props.onSubmit(event('owner@example.invalid')));
 act(()=>{result=view.root.findByType('form').props.action(new FormData());});
 const redirect={digest:'NEXT_REDIRECT'};
 await act(async()=>{fail(redirect);await assert.rejects(result,error=>error===redirect);});
 assert.equal(view.root.findByType('button').props.disabled,false);
 act(()=>view.unmount());
});

test('invalid email never locks or submits the reset form',()=>{
 let calls=0;
 const Form=loadForm(async()=>{calls++;});
 let view;
 act(()=>{view=Renderer.create(React.createElement(Form));});
 for(const value of ['', 'invalid-address']){
  const submit=event(value);
  act(()=>view.root.findByType('form').props.onSubmit(submit));
  assert.equal(submit.prevented,true);
  assert.equal(view.root.findByType('button').props.disabled,false);
  assert.equal(calls,0);
 }
 act(()=>view.unmount());
});
