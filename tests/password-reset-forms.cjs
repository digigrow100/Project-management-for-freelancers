const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const Renderer = require('react-test-renderer');

test('reset form unlocks after repeated errors and preserves framework redirects', async () => {
  let finish;
  let failure;
  let requests = 0;
  class Input { constructor(value) { this.value = value; } }
  const module = { exports: {} };
  const mocks = {
    'react-dom': { useFormStatus: () => ({ pending: false }) },
    'next/navigation': { unstable_rethrow: error => { if (error.digest === 'NEXT_REDIRECT') throw error; } },
    './actions': {
      requestPasswordResetAction: async () => {
        requests++;
        await new Promise(resolve => { finish = resolve; });
        if (failure) throw failure;
      },
      updatePasswordAction: async () => {},
    },
  };
  const source = fs.readFileSync('app/login/auth-forms.tsx', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: name => mocks[name] || require(name), HTMLInputElement: Input });
  let tree;
  Renderer.act(() => { tree = Renderer.create(React.createElement(module.exports.PasswordResetRequestForm)); });
  const form = () => tree.root.findByType('form');
  const button = () => tree.root.findByType('button');
  const submit = () => {
    let prevented = false;
    Renderer.act(() => form().props.onSubmit({ preventDefault() { prevented = true; }, currentTarget: {
      elements: { namedItem: () => new Input('owner@example.test') },
    } }));
    return prevented;
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(submit(), false);
    assert.equal(button().props.disabled, true);
    assert.equal(submit(), true, 'duplicate submission must be stopped');
    failure = new Error('provider unavailable');
    const request = form().props.action(new FormData());
    await Renderer.act(async () => { finish(); await request; });
    assert.equal(button().props.disabled, false, 'same error must not leave button locked');
    assert.match(tree.root.findByProps({ role: 'alert' }).children.join(''), /Please try again later/);
  }
  assert.equal(requests, 2);
  failure = Object.assign(new Error('navigation'), { digest: 'NEXT_REDIRECT' });
  assert.equal(submit(), false);
  const redirect = form().props.action(new FormData());
  await Renderer.act(async () => { finish(); await assert.rejects(redirect, error => error === failure); });
  assert.equal(button().props.disabled, false);
  failure = undefined;
  assert.equal(submit(), false);
  const success = form().props.action(new FormData());
  await Renderer.act(async () => { finish(); await success; });
  assert.equal(button().props.disabled, false);
  Renderer.act(() => tree.unmount());
});
