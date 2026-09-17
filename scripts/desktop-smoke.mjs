import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
const require = createRequire(import.meta.url);
const userData = await mkdtemp(join(tmpdir(), 'heis-desktop-smoke-'));
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const entitlement = { accountId:'test', installationId:'test', mode:'creator', checkedAt:new Date().toISOString(), validUntil:new Date(Date.now()+3600000).toISOString(), deviceLimit:3, canEdit:true, canExport:true, canUseManagedGeneration:true };
entitlement.signature = sign(null, Buffer.from(JSON.stringify(entitlement,Object.keys(entitlement).sort())),privateKey).toString('base64');
if(process.env.HEIS_TEST_FREE !== '1') await writeFile(join(userData,'entitlement.json'),JSON.stringify(entitlement));
const env = {...process.env, HEIS_DISABLE_UPDATES:"1", HEIS_ENTITLEMENT_PUBLIC_KEY:publicKey.export({type:'spki',format:'pem'}), HEIS_CODEX_BINARY:resolve('scripts/fixtures/codex-mock.mjs')};
if(process.env.HEIS_TEST_REAL_CODEX === '1') delete env.HEIS_CODEX_BINARY;
delete env.ELECTRON_RUN_AS_NODE; delete env.HEIS_DEV_SERVER_URL;
const packaged = process.env.HEIS_TEST_EXECUTABLE;
const app = await electron.launch({executablePath:packaged || require('electron'),args:[...(packaged?[]:['.']),'--user-data-dir='+userData],env});
const errors=[];
try {
 const page=await app.firstWindow();
 await mkdir('test-results/theme',{recursive:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.waitForURL('heis-app://app/**');
 await page.waitForLoadState('domcontentloaded');
 assert.equal(new URL(page.url()).protocol,'heis-app:');
 if(process.env.HEIS_TEST_FREE === '1') {
   await page.getByRole('button',{name:'Settings',exact:true}).waitFor();
   const result=await page.evaluate(()=>window.heis.generation.listCapabilities('managed'));
   assert.equal(result.ok,false,'Free users cannot invoke managed generation');
 }
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 for(const tab of ['image','video','audio','lipsync','cinema','marketing','motion-control','vibe-motion','body-swap','ai-influencer']) {
  await page.goto('heis-app://app/studio/'+tab);
  await page.waitForTimeout(1200);
  assert.ok((await page.locator('body').innerText()).length>100,tab+' renders');
  assert.equal(await page.getByText('Loading studio...', {exact:true}).count(),0,tab+' loaded');
  assert.equal(await page.locator('a[href="https://vadoo.tv"]').count(),0,'No promotional banner');
  assert.ok(await page.locator('img.heis-brand').first().evaluate(img => img.src.endsWith('heis-wordmark-dark.svg') && img.naturalWidth > 0), 'Dark logo loaded');
  await page.screenshot({path:'test-results/theme/'+tab+'.png'});
  await page.getByRole('button',{name:'Use light theme',exact:true}).click();
  await page.waitForTimeout(250);
  assert.ok(await page.locator('img.heis-brand').first().evaluate(img => img.src.endsWith('heis-wordmark-light.svg') && img.naturalWidth > 0), 'Light logo loaded');
  await page.screenshot({path:'test-results/theme/'+tab+'-light.png'});
  await page.getByRole('button',{name:'Use dark theme',exact:true}).click();
  await page.waitForTimeout(250);
 }
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.waitForTimeout(450);
 await page.screenshot({path:'test-results/theme/settings.png'});
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,640));
 await page.goto('heis-app://app/studio/video');
 await page.waitForTimeout(1200);
 await page.screenshot({path:'test-results/theme/video-compact.png'});
 await page.getByRole('button',{name:/Seedance 1.0 Lite/}).first().click();
 await page.waitForTimeout(200);
 await page.screenshot({path:'test-results/theme/model-menu.png'});
 await page.keyboard.press('Escape');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
 await page.goto('heis-app://app/studio/agents');
 await page.getByText('Codex connected',{exact:true}).waitFor();
 assert.equal(await page.locator('.agent-sidebar-slot .sidebar').count(),1,'Agent controls share the main sidebar');
 assert.equal(await page.locator('.heis-agent-root:not(.agent-sidebar-slot) .sidebar').count(),0,'No nested agent sidebar');
 await page.getByRole('button',{name:'Use light theme',exact:true}).click();
  await page.waitForTimeout(250);
 await page.screenshot({path:'test-results/theme/agents-light.png'});
 await page.getByRole('button',{name:'Use dark theme',exact:true}).click();
  await page.waitForTimeout(250);
 await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},userData);
 await page.getByRole('button',{name:'Open a project',exact:true}).click();
 if(process.env.HEIS_TEST_REAL_CODEX === '1') {
  const id=await page.evaluate(dir=>window.heisAgent.send({project:dir,text:'Call the heis MCP tool heis_project_info exactly once. Do not edit files or generate media. Report whether the tool succeeded.',model:'gpt-6-astra'}),userData);
  let thread;
  const deadline=Date.now()+120000;
  do {
   const state=await page.evaluate(()=>window.heisAgent.snapshot());
   thread=state.threads.find(t=>t.id===id);
   if(thread?.status==='error'||(thread?.status==='idle'&&thread.items.some(i=>i.role==='assistant'))) break;
   await page.waitForTimeout(500);
  } while(Date.now()<deadline);
  console.log(JSON.stringify(thread));
  assert.equal(thread.status,'idle');
  assert.ok(thread.items.some(i=>i.role==='tool'&&JSON.stringify(i).includes('heis_project_info')),'real Codex invoked Heis MCP');
 } else {
 await page.getByRole('textbox',{name:'Message Codex'}).fill('approval-input');
 await page.getByRole('button',{name:'Send to Codex'}).click();
 await page.getByRole('button',{name:'Allow once'}).click();
 await page.getByRole('button',{name:'Blue',exact:true}).click();
 await page.getByRole('button',{name:'Send answers'}).click();
 await page.getByText('Hello from Codex.',{exact:true}).waitFor();
 await page.reload();
 await page.getByRole('button',{name:'approval-input',exact:true}).click();
 await page.getByText('Hello from Codex.',{exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Message Codex'}).fill('hold');
 await page.getByRole('button',{name:'Send to Codex'}).click();
 await page.getByRole('button',{name:'Stop Codex'}).click();
 await page.getByText('Turn stopped.',{exact:true}).waitFor();
 }
 await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/desktop-agent.png'});
 assert.deepEqual(errors,[]);
 console.log(process.env.HEIS_TEST_REAL_CODEX === '1' ? 'PASS: packaged Codex runtime and real Heis MCP project tool.' : 'PASS: static Electron renderer, ten studios, sandbox, Codex IPC, approvals, questions, persistence and interruption.');
} catch(error) {
 const page=await app.firstWindow();
 await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/desktop-failure.png'});
 console.log('Renderer errors:',errors,'Page:',(await page.locator('body').innerText()).slice(0,5000));
 throw error;
} finally {await app.close();await rm(userData,{recursive:true,force:true});}
