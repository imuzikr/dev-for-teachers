import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
const require=createRequire(import.meta.url), {chromium}=require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root=process.cwd(), output=path.join(root,"artifacts","book-trash-"+Date.now()), fixture=path.join(output,"fixture");
const report={checks:[],screenshots:[],layout:[],errors:[],passed:false};
let server,browser,page,logs="";
const sidebar=()=>page.getByRole("complementary",{name:"선생님이 준비한 활동과 자료"});
const trash=()=>page.getByRole("dialog",{name:"휴지통",exact:true});
const card=title=>page.locator(".book-project-flow-detail-list > article").filter({hasText:title});
async function capture(name){await page.evaluate(()=>document.fonts.ready);const file=path.join(output,name+".png");await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);}
async function openTrash(){await page.getByRole("button",{name:"휴지통",exact:true}).click();await trash().waitFor();}
async function closeTrash(){if(!await trash().isVisible())return;await trash().getByRole("button",{name:"닫기",exact:true}).last().click();}
async function removeCard(title,kind){await card(title).getByRole("button",{name:kind+" 삭제",exact:true}).click();await page.getByRole("alertdialog").getByRole("button",{name:/^(삭제|휴지통으로 이동)$/}).click();await card(title).waitFor({state:"hidden"});}
async function restoreTitle(title){await trash().getByRole("button",{name:title+" 복원",exact:true}).click();await trash().getByRole("button",{name:title+" 복원",exact:true}).waitFor({state:"hidden"});}
async function preserveRecords(){
 const data=await page.evaluate(()=>window.trashQA);
 assert(JSON.stringify(data.entries).includes("학생이 작성한 보존할 답변"));
 assert(JSON.stringify(data.entries).includes("https://example.org/student-result"));
 assert(data.confirmations.some(c=>c.itemId===data.activityId&&c.confirmed));
 return data;
}
try{
 await mkdir(path.join(fixture,"app"),{recursive:true});
 for(const dir of ["components","lib"])await cp(path.join(root,dir),path.join(fixture,dir),{recursive:true});
 for(const name of ["package.json","jsconfig.json"])await cp(path.join(root,name),path.join(fixture,name));
 for(const name of ["globals.css","book-sidebar.css"])await cp(path.join(root,"app",name),path.join(fixture,"app",name));
 await cp(path.join(root,"tests/fixtures/BookTrashPage.jsx"),path.join(fixture,"app/page.jsx"));
 await writeFile(path.join(fixture,"lib/firebase.js"),"export const isFirebaseConfigured=false; export const db=null; export const auth=null; export const storage=null;");
 await writeFile(path.join(fixture,"app/layout.jsx"),'import "./globals.css";import "./book-sidebar.css";export default function Layout({children}){return <html lang="ko"><body>{children}</body></html>}');
 await writeFile(path.join(fixture,"next.config.mjs"),"export default {devIndicators:false};");
 const probe=createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"dev","--hostname","127.0.0.1","--port",String(port)],{cwd:fixture,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
 const until=Date.now()+120000;while(!logs.includes("Ready in")){if(server.exitCode!==null||Date.now()>until)throw Error(logs);await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({channel:"chrome",headless:true});page=await browser.newPage({viewport:{width:1280,height:900}});
 page.setDefaultTimeout(20000);page.on("pageerror",e=>report.errors.push(e.message));
 await page.goto("http://127.0.0.1:"+port,{timeout:120000});await card("복원할 활동").waitFor();await preserveRecords();
 for(const width of [375,768,1280]){
  await page.setViewportSize({width,height:900});
  const footer=page.locator(".book-project-trash-footer");
  const before=await footer.boundingBox();
  await sidebar().locator(".book-library-content").evaluate(el=>el.scrollTop=el.scrollHeight);
  const after=await footer.boundingBox();
  assert(Math.abs(before.y-after.y)<=1,"Trash remains pinned while content scrolls");
  report.layout.push({width,before,after,ancestors:await footer.evaluate(el=>{const rows=[];for(let v=el;v;v=v.parentElement){const c=getComputedStyle(v);rows.push({cls:v.className,height:c.height,maxHeight:c.maxHeight,minHeight:c.minHeight,display:c.display,box:v.getBoundingClientRect().toJSON()});}return rows;})});
  assert(after.y+after.height<=901,"Trash visible at viewport bottom");
  report.layout.push({width,before,after});await capture("sidebar-scrolled-"+width);
  await sidebar().locator(".book-library-content").evaluate(el=>el.scrollTop=0);
 }
 await openTrash();await trash().getByText("휴지통이 비어 있어요.").waitFor();await capture("trash-empty");await page.keyboard.press("Escape");
 assert.equal(await page.getByRole("button",{name:"휴지통",exact:true}).evaluate(el=>el===document.activeElement),true);
 await removeCard("복원할 활동","활동");await preserveRecords();await openTrash();await capture("activity-in-trash");await restoreTitle("복원할 활동");await closeTrash();await card("복원할 활동").waitFor();
 const restored=await preserveRecords();assert.equal(restored.project.steps[0].activities[0].id,restored.activityId);
 report.checks.push("Activity delete/restore preserves original ID, student answer, URL and confirmation");
 await removeCard("복원할 자료","자료");await openTrash();await restoreTitle("복원할 자료");await closeTrash();
 assert.equal(await page.evaluate(()=>window.trashQA.project.steps[0].resources[0].teacherDescription),"교사 설명 유지");
 report.checks.push("Resource restores explanation and copy body");
 await page.getByRole("button",{name:"첫 Step 삭제 저장",exact:true}).click();await card("복원할 활동").waitFor({state:"hidden"});await openTrash();await restoreTitle("복원할 Step");await closeTrash();await card("복원할 활동").waitFor();await preserveRecords();
 report.checks.push("Editor-style Step removal archives and restores its activities/resources");
 await page.getByRole("button",{name:"프로젝트 삭제",exact:true}).click();await page.getByRole("alertdialog").getByRole("button",{name:"삭제",exact:true}).click();await card("복원할 활동").waitFor({state:"hidden"});await preserveRecords();
 await page.getByRole("button",{name:"새 프로젝트",exact:true}).click();await sidebar().getByText("새 프로젝트",{exact:true}).waitFor();
 await openTrash();await trash().getByRole("button",{name:"복원할 프로젝트 복원",exact:true}).click();await trash().getByRole("alert").waitFor();await capture("restore-conflict");assert.equal(await page.evaluate(()=>window.trashQA.project.title),"새 프로젝트");await closeTrash();
 await page.getByRole("button",{name:"프로젝트 삭제",exact:true}).click();await page.getByRole("alertdialog").getByRole("button",{name:"삭제",exact:true}).click();
 await openTrash();
 for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await capture("project-trash-"+width);assert(await trash().evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
 await restoreTitle("복원할 프로젝트");await closeTrash();await card("복원할 활동").waitFor();const original=await preserveRecords();assert.equal(original.project.version,original.originalVersion);
 report.checks.push("Project restore retains original version/records and refuses replacement overwrite");
 await page.getByRole("button",{name:"반 전환",exact:true}).click();await openTrash();await trash().getByText("휴지통이 비어 있어요.").waitFor();await closeTrash();await page.getByRole("button",{name:"반 전환",exact:true}).click();
 await page.getByRole("button",{name:"역할 전환",exact:true}).click();assert.equal(await page.getByRole("button",{name:"휴지통",exact:true}).count(),0);
 report.checks.push("Trash scoped to current class and absent for students; Escape restores focus");
 assert.deepEqual(report.errors,[]);report.passed=true;console.log("PASS",report.checks);
}catch(error){report.failure=error.stack;if(page)await capture("failure").catch(()=>{});throw error;}
finally{
 await browser?.close();
 if(server&&server.exitCode===null)await promisify(execFile)("taskkill",["/PID",String(server.pid),"/T","/F"],{windowsHide:true}).catch(()=>{});
 await writeFile(path.join(output,"server.log"),logs);await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2));console.log("Report:",path.join(output,"report.json"));
}
