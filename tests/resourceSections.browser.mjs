import assert from "node:assert/strict";
import {spawn,execFile} from "node:child_process";
import {createRequire} from "node:module";
import {cp,mkdir,writeFile} from "node:fs/promises";
import {promisify} from "node:util";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const root=process.cwd(),output=path.join(root,"artifacts","resource-sections-"+Date.now()),fixture=path.join(output,"fixture");
let server,browser,page,logs="";
const report={checks:[],screenshots:[],errors:[],passed:false};
const expected="첫 번째 줄 & 설명\nnpm install clasp\n  clasp login";
const panel=()=>page.getByRole("complementary",{name:"자료 패널"});
async function capture(name){
 await page.evaluate(()=>document.fonts.ready);
 const file=path.join(output,name+".png");await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"No horizontal overflow");
}
async function copied(container,text=expected){
 await container.getByRole("button",{name:/^복사(됨)?$/}).click();
 assert.equal(await page.evaluate(()=>window.resourceCopied),text);
}
try{
 await mkdir(path.join(fixture,"app"),{recursive:true});
 for(const dir of ["components","lib"])await cp(path.join(root,dir),path.join(fixture,dir),{recursive:true});
 for(const f of ["package.json","jsconfig.json"])await cp(path.join(root,f),path.join(fixture,f));
 for(const f of ["globals.css","book-sidebar.css"])await cp(path.join(root,"app",f),path.join(fixture,"app",f));
 await cp(path.join(root,"tests/fixtures/ResourceSectionsPage.jsx"),path.join(fixture,"app/page.jsx"));
 await writeFile(path.join(fixture,"lib/firebase.js"),"export const isFirebaseConfigured=false;export const db=null;export const auth=null;export const storage=null;");
 await writeFile(path.join(fixture,"app/layout.jsx"),'import "./globals.css";import "./book-sidebar.css";export default function Layout({children}){return <html lang="ko"><body>{children}</body></html>}');
 await writeFile(path.join(fixture,"next.config.mjs"),"export default {devIndicators:false};");
 server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"dev","--hostname","127.0.0.1","--port","3197"],{cwd:fixture,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const deadline=Date.now()+120000;while(!logs.includes("Ready in")){if(server.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({channel:"chrome",headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{if(window.resourceCopyFail)throw Error("denied");window.resourceCopied=text;}}}));
 page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",e=>report.errors.push(e.message));
 await page.goto("http://127.0.0.1:3197",{timeout:120000});
 await panel().getByRole("region",{name:"교사 설명"}).waitFor();await copied(panel());
 await page.getByRole("button",{name:"자료 복사",exact:true}).click();assert.equal(await page.evaluate(()=>window.resourceCopied),expected);
 report.checks.push("panel/card copy body only, preserving newlines/entities/indentation");
 for(const width of [375,768,1280]){
  await page.setViewportSize({width,height:900});await capture("panel-"+width);
  await panel().getByRole("button",{name:"확대",exact:true}).click();await copied(page.getByRole("dialog"));await capture("modal-"+width);await page.getByRole("button",{name:"닫기",exact:true}).click();
 }
 await page.getByRole("button",{name:"edit",exact:true}).click();const edit=page.getByRole("dialog");
 await edit.getByLabel("교사 설명",{exact:true}).fill("새로운 교사 설명");await capture("editor-1280");await edit.getByRole("button",{name:"자료 저장",exact:true}).click();
 await panel().getByText("새로운 교사 설명",{exact:true}).waitFor();await copied(panel());
 await page.getByRole("button",{name:"edit",exact:true}).click();assert.equal(await edit.getByLabel("교사 설명",{exact:true}).inputValue(),"새로운 교사 설명");await edit.getByRole("button",{name:"닫기",exact:true}).last().click();
 for(const view of ["presentation","broadcast"])for(const width of [375,768,1280]){
  await page.setViewportSize({width,height:900});await page.getByRole("button",{name:view,exact:true}).click();const modal=page.getByRole("alertdialog");await modal.getByText("새로운 교사 설명",{exact:true}).waitFor();await copied(modal);await capture(view+"-"+width);await page.getByRole("button",{name:"발표 종료",exact:true}).click();
 }
 await page.getByRole("button",{name:"edit",exact:true}).click();await edit.getByLabel("교사 설명",{exact:true}).fill("");await edit.getByRole("button",{name:"자료 저장",exact:true}).click();
 assert.equal(await panel().getByRole("region",{name:"교사 설명"}).count(),0);await copied(panel());
 report.checks.push("editor save/reopen/clear, presentation and broadcast across 375/768/1280");
 await page.getByRole("button",{name:"legacy",exact:true}).click();await copied(panel());assert.equal(await panel().getByRole("region",{name:"교사 설명"}).count(),0);
 await page.evaluate(()=>window.resourceCopyFail=true);await panel().getByRole("button",{name:/^복사(됨)?$/}).click();await page.getByText(/복사하지 못했어요/).waitFor();await page.evaluate(()=>window.resourceCopyFail=false);await copied(panel());
 report.checks.push("legacy content and clipboard failure/retry");
 await page.getByRole("button",{name:"template",exact:true}).click();await panel().getByLabel("이름",{exact:true}).fill("학생");assert.equal(await panel().getByRole("button",{name:"복사",exact:true}).count(),0);await panel().getByRole("button",{name:"복사하기",exact:true}).click();assert.equal(await page.evaluate(()=>window.resourceCopied),"학생의 결과입니다.");
 await panel().getByRole("button",{name:"확대",exact:true}).click();assert.equal(await page.getByRole("dialog").getByLabel("이름",{exact:true}).inputValue(),"학생");await capture("template-modal");await page.getByRole("button",{name:"닫기",exact:true}).click();report.checks.push("template input/generated copy/expanded shared values");
 await page.getByRole("button",{name:"empty",exact:true}).click();await copied(page.getByRole("alertdialog"),"");report.checks.push("empty broadcast does not copy fallback");
 assert.deepEqual(report.errors,[]);report.passed=true;console.log("PASS",report.checks);
}catch(error){report.failure=error.stack;if(page)await capture("failure").catch(()=>{});throw error;}
finally{
 await browser?.close();
 if(server&&server.exitCode===null)await promisify(execFile)("taskkill",["/PID",String(server.pid),"/T","/F"],{windowsHide:true}).catch(()=>{});
 await writeFile(path.join(output,"server.log"),logs);await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2));console.log("Report:",path.join(output,"report.json"));
}
