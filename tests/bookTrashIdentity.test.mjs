import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const module=new vm.SourceTextModule(readFileSync(new URL("../lib/bookProjectTrash.js",import.meta.url),"utf8"));
await module.link(()=>{});await module.evaluate();
const {removedBookProjectTrashDocs:removed,restoreBookProjectFromTrash:restore}=module.namespace;
const step=(id,activities=[],resources=[])=>({id,title:id,activities,resources,itemOrder:[...activities.map(x=>({kind:"activity",id:x.id})),...resources.map(x=>({kind:"resource",id:x.id}))]});
const project=steps=>({classId:"c",version:"v",title:"p",steps});
const options={deletedBy:"t",deletedAt:new Date()};
test("same ID resource does not hide a removed activity or block restoring it",()=>{
 const before=project([step("s",[{id:"same",title:"a"}],[{id:"same",title:"r"}])]);
 const after=project([step("s",[],[{id:"same",title:"r"}])]);
 const docs=removed(before,after.steps,options);
 assert.equal(docs.length,1);assert.equal(docs[0].kind,"activity");
 const restored=restore(after,docs[0]);assert.equal(restored.steps[0].activities[0].id,"same");
 assert.equal(restored.steps[0].resources[0].id,"same");
});
test("deleting a Step preserves its activity when another Step has a same ID resource",()=>{
 const other=step("other",[],[{id:"same"}]);
 const docs=removed(project([step("s",[{id:"same"}]),other]),[other],options);
 assert.equal(docs.length,1);assert.equal(docs[0].payload.step.activities.length,1);
});
test("moves and actual kind conversions do not create trash",()=>{
 const before=project([step("s",[{id:"moved"},{id:"converted"}]),step("other")]);
 const after=[step("s",[],[{id:"converted"}]),step("other",[{id:"moved"}])];
 assert.equal(removed(before,after,options).length,0);
});
test("deleted Step omits only the exact moved item",()=>{
 const before=project([step("s",[{id:"move"},{id:"keep"}]),step("other")]);
 const docs=removed(before,[step("other",[{id:"move"}])],options);
 assert.equal(docs.length,1);assert.deepEqual(Array.from(docs[0].payload.step.activities,x=>x.id),["keep"]);
});
test("restoring Step into recreated Step preserves opposite kind ordering",()=>{
 const before=project([step("s",[{id:"same"}])]);
 const doc=removed(before,[],options)[0];
 const restored=restore(project([step("s",[],[{id:"same"}])]),doc);
 assert.equal(restored.steps[0].activities.length,1);
 assert.equal(restored.steps[0].resources.length,1);
 assert.equal(restored.steps[0].itemOrder.length,2);
});
test("restoring same kind ID elsewhere refuses overwrite",()=>{
 const doc=removed(project([step("s",[{id:"a"}])]),[step("s")],options)[0];
 assert.throws(()=>restore(project([step("other",[{id:"a"}])]),doc),{code:"book-trash/conflict"});
});
