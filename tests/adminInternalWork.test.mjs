import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../lib/adminInternalWork.js", import.meta.url), "utf8");
const { internalClassesForUser, internalWorkRecord } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const base = { item: {kind:"activity",id:"a"}, uid:"u", classId:"c", projectId:"p", confirmations:[] };
const entry = {authorId:"u",activityId:"a",dashboardText:"답변",urls:["https://example.com"],images:["https://example.com/a.png"]};

test("only the selected user's internal memberships, including archived classes, are shown", () => {
  assert.deepEqual(internalClassesForUser([{id:"c",purpose:"internal"},{id:"t",purpose:"training"},{id:"x",purpose:"internal"},{id:"old",purpose:"internal",archived:true}], [{uid:"u",classId:"c"},{uid:"u",classId:"t"},{uid:"other",classId:"x"},{uid:"u",classId:"old"}], "u").map(item=>item.id),["c","old"]);
});
test("saved answers, legacy answers, URLs, images and unchecked checklists are represented", () => {
  const record=internalWorkRecord({...base,entry});
  assert.equal(record.answer,"답변");assert.equal(record.hasContent,true);assert.deepEqual(record.urls,entry.urls);assert.deepEqual(record.images,entry.images);
  assert.equal(internalWorkRecord({...base,entry:{...entry,dashboardText:undefined,answers:"예전 답변"}}).answer,"예전 답변");
  const legacy=internalWorkRecord({...base,entry:{authorId:"u",activityId:"a",answers:{dashboardText:"이전",질문:"응답"}}});
  assert.equal(legacy.answer,"이전");assert.deepEqual(legacy.answers,[["질문","응답"]]);
  const checklist=internalWorkRecord({...base,confirmations:[{authorId:"u",classId:"c",projectId:"p",itemKind:"activity",itemId:"a",checklistValues:[false,false]}]});
  assert.equal(checklist.hasContent,true);assert.deepEqual(checklist.checklist,[false,false]);
});
test("records cannot leak across users, items, projects, or courses", () => {
  for(const patch of [{authorId:"other"},{activityId:"other"}])assert.equal(internalWorkRecord({...base,entry:{...entry,...patch}}).hasContent,false);
  const confirmation={authorId:"u",classId:"c",projectId:"p",itemKind:"resource",itemId:"r",templateValues:{이름:"학생"},templateText:"학생의 결과"};
  const input={...base,item:{kind:"resource",id:"r"},entry,confirmations:[confirmation]};
  assert.equal(internalWorkRecord(input).hasTemplate,true);assert.equal(internalWorkRecord(input).answer,"");
  for(const patch of [{authorId:"x"},{classId:"x"},{projectId:"old"},{itemKind:"activity"},{itemId:"other"}])assert.equal(internalWorkRecord({...input,confirmations:[{...confirmation,...patch}]}).hasContent,false);
});
test("viewing alone is distinct from writing, and empty template input stays empty", () => {
  const record=internalWorkRecord({...base,confirmations:[{authorId:"u",classId:"c",projectId:"p",itemKind:"activity",itemId:"a",viewed:true,templateValues:{이름:""}}]});
  assert.equal(record.hasContent,false);assert.equal(record.viewed,true);
});
