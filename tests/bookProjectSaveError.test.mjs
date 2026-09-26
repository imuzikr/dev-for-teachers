import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const module=new vm.SourceTextModule(readFileSync(new URL("../lib/bookProjectSaveError.js",import.meta.url),"utf8"));
await module.link(()=>{});await module.evaluate();
const message=module.namespace.bookProjectSaveErrorMessage;
test("permission denial explains authorization and rules without advising blind retry",()=>{
 const text=message({code:"permission-denied"});
 assert.match(text,/보안 규칙/);assert.match(text,/입력 내용은 유지/);assert.doesNotMatch(text,/잠시 후/);
});
test("resource limit and trash errors retain their actionable detail",()=>{
 for(const code of ["book-project/resource-content-limit","book-trash/conflict"]){
  assert.equal(message({code,message:"자료 이름과 복구 방법"}),"자료 이름과 복구 방법");
 }
});
test("unknown transient failures still give a retry message",()=>assert.match(message({code:"unavailable"}),/다시 시도/));
