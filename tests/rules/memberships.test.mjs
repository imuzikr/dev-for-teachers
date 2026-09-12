import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, documentId, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { asAdmin, asStudent, asTeacher, makeEnv, seed } from './helpers.mjs';

describe('Private class codes and explicit claims', () => {
  let env;
  before(async () => { env = await makeEnv('demo-private-class-joins'); });
  after(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, 'system/admin'), { uid: 'root' });
      for (const [classId, code, extra] of [
        ['active', '111111', {}], ['closed', '222222', { joinEnabled: false }],
        ['archived', '333333', { archived: true }], ['next', '444444', {}],
        ['foreign', '555555', { createdBy: 'other' }],
        ['legacy', '666666', { accessVersion: 1, joinCode: '666666' }],
        ['implicit', '777777', { archived: null }],
      ]) {
        await setDoc(doc(db, 'classes', classId), {
          name: classId, createdBy: 'owner', purpose: 'internal',
          accessVersion: 2, archived: false, joinEnabled: true, ...extra,
        });
        await setDoc(doc(db, 'classJoinSecrets', classId), { joinCode: code });
        await setDoc(doc(db, 'classJoinLookup', code), { classId });
      }
      for (const [classId, extra] of [['active', {}], ['archived', {}], ['legacy', { joinCode: '666666' }]]) {
        await setDoc(doc(db, 'memberships', 'member_' + classId), {
          uid: 'member', classId, joinedAt: new Date(0), accessVersion: 2, ...extra,
        });
      }
    });
  });
  const student = () => asStudent(env, 'new').firestore();
  const claim = (extra = {}) => ({ uid: 'new', classId: 'active', joinCode: '111111', createdAt: serverTimestamp(), ...extra });
  const membership = (extra = {}) => ({ uid: 'new', classId: 'active', joinedAt: serverTimestamp(), accessVersion: 2, ...extra });
  function join(db, claimExtra = {}, memberExtra = {}, claimId = 'new', memberId = 'new_active') {
    const batch = writeBatch(db);
    batch.set(doc(db, 'classJoinClaims', claimId), claim(claimExtra));
    batch.set(doc(db, 'memberships', memberId), membership(memberExtra));
    return batch.commit();
  }
  it('accepts atomic own claim and code-free membership, keeping the claim unreadable', async () => {
    const db = student();
    await assertSucceeds(join(db));
    assert.deepEqual(Object.keys((await getDoc(doc(db, 'memberships/new_active'))).data()).sort(), ['accessVersion', 'classId', 'joinedAt', 'uid']);
    await assertFails(getDoc(doc(db, 'classJoinClaims/new')));
    await assertSucceeds(getDoc(doc(asAdmin(env, 'root').firestore(), 'classJoinClaims/new')));
  });
  it('supports literal custom UIDs for empty membership reads without exposing other paths', async () => {
    const db = asStudent(env, 'custom.a+[b]').firestore();
    await assertSucceeds(getDoc(doc(db, 'memberships/custom.a+[b]_active')));
    await assertFails(getDoc(doc(db, 'memberships/customXaab_active')));
    await assertFails(getDoc(doc(db, 'memberships/short')));
  });
  for (const [label, change] of [
    ['wrong code', { joinCode: '999999' }], ['short code', { joinCode: '11111' }],
    ['numeric code', { joinCode: 111111 }], ['closed class', { classId: 'closed', joinCode: '222222' }],
    ['archived class', { classId: 'archived', joinCode: '333333' }],
    ['legacy class', { classId: 'legacy', joinCode: '666666' }],
    ['implicit archive state', { classId: 'implicit', joinCode: '777777' }],
    ['forged uid', { uid: 'victim' }], ['extra field', { approved: true }],
    ['stale timestamp', { createdAt: new Date(0) }], ['missing class', { classId: 'missing' }],
  ]) it('rejects claim with ' + label, async () => {
    await assertFails(join(student(), change));
  });
  it('rejects another claim path and another membership identity', async () => {
    await assertFails(join(student(), {}, {}, 'victim'));
    await assertFails(join(student(), {}, { uid: 'victim' }, 'new', 'victim_active'));
    await assertFails(join(student(), {}, {}, 'new', 'forged-id'));
    await assertFails(join(student(), {}, { classId: 'next' }, 'new', 'new_next'));
  });
  it('rejects raw codes, missing markers, and extra fields on new memberships', async () => {
    for (const extra of [{ joinCode: '111111' }, { accessVersion: 1 }, { approved: true }]) {
      await assertFails(join(student(), {}, extra));
    }
    await assertFails(setDoc(doc(student(), 'memberships/new_active'), {
      uid: 'new', classId: 'active', joinedAt: serverTimestamp(), joinCode: '111111',
    }));
    await assertFails(setDoc(doc(student(), 'memberships/new_active'), membership()));
  });
  it('rejects replay of a previously accepted standalone claim', async () => {
    const db = student();
    await assertSucceeds(setDoc(doc(db, 'classJoinClaims/new'), claim()));
    await assertFails(setDoc(doc(db, 'memberships/new_active'), membership()));
    await assertSucceeds(join(db));
  });
  it('rechecks the private code after rotation', async () => {
    await seed(env, (db) => updateDoc(doc(db, 'classJoinSecrets/active'), { joinCode: '888888' }));
    await assertFails(join(student()));
    await assertSucceeds(join(student(), { joinCode: '888888' }));
  });
  it('allows only an exact active lookup and returns classId alone', async () => {
    const db = student();
    assert.deepEqual((await assertSucceeds(getDoc(doc(db, 'classJoinLookup/111111')))).data(), { classId: 'active' });
    for (const code of ['222222', '333333', '666666', '777777', '999999', 'abc', '11111']) {
      await assertFails(getDoc(doc(db, 'classJoinLookup', code)));
    }
    await assertFails(getDocs(collection(db, 'classJoinLookup')));
    await assertFails(getDocs(query(collection(db, 'classJoinLookup'), where(documentId(), '==', '111111'))));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classJoinLookup/111111')));
    await seed(env, (db) => updateDoc(doc(db, 'classJoinLookup/111111'), { extra: 'secret' }));
    await assertFails(getDoc(doc(db, 'classJoinLookup/111111')));
  });
  it('does not treat an admin role token or profile as the system administrator', async () => {
    await seed(env, (db) => setDoc(doc(db, 'users/impostor'), { role: 'admin' }));
    for (const db of [student(), asTeacher(env, 'owner').firestore(), asAdmin(env, 'impostor').firestore()]) {
      await assertFails(getDoc(doc(db, 'classJoinSecrets/active')));
      await assertFails(getDocs(collection(db, 'classJoinSecrets')));
      await assertFails(setDoc(doc(db, 'classJoinSecrets/active'), { joinCode: '999999' }));
      await assertFails(deleteDoc(doc(db, 'classJoinSecrets/active')));
      await assertFails(setDoc(doc(db, 'classJoinLookup/999999'), { classId: 'active' }));
      await assertFails(getDocs(collection(db, 'classJoinLookup')));
      await assertFails(getDocs(collection(db, 'classJoinClaims')));
    }
  });
  it('allows administrator private management with strict payloads', async () => {
    const db = asStudent(env, 'root').firestore();
    await assertSucceeds(getDocs(collection(db, 'classJoinSecrets')));
    await assertSucceeds(getDocs(collection(db, 'classJoinLookup')));
    await assertSucceeds(setDoc(doc(db, 'classJoinSecrets/active'), { joinCode: '888888' }));
    await assertFails(setDoc(doc(db, 'classJoinSecrets/active'), { joinCode: '12345' }));
    await assertFails(setDoc(doc(db, 'classJoinSecrets/active'), { joinCode: '888888', extra: true }));
    await assertSucceeds(setDoc(doc(db, 'classJoinLookup/888888'), { classId: 'active' }));
    await assertFails(updateDoc(doc(db, 'classJoinLookup/888888'), { joinCode: '888888' }));
    await assertFails(setDoc(doc(db, 'classJoinLookup/123'), { classId: 'active' }));
    await assertFails(setDoc(doc(db, 'classJoinLookup/999999'), { classId: 123 }));
    await assertSucceeds(deleteDoc(doc(db, 'classJoinLookup/888888')));
  });
  it('exposes only active migrated classes and self code-free membership gets', async () => {
    const db = asStudent(env, 'member').firestore();
    await assertSucceeds(getDoc(doc(db, 'classes/active')));
    for (const classId of ['archived', 'legacy', 'implicit']) await assertFails(getDoc(doc(db, 'classes', classId)));
    await assertFails(getDocs(collection(db, 'classes')));
    await assertSucceeds(getDocs(query(collection(db, 'classes'), where('accessVersion', '==', 2), where('archived', '==', false))));
    await assertSucceeds(getDoc(doc(db, 'memberships/member_active')));
    await assertFails(getDoc(doc(student(), 'memberships/member_active')));
    for (const classId of ['archived', 'legacy']) await assertFails(getDoc(doc(db, 'memberships', 'member_' + classId)));
    await assertFails(getDocs(query(collection(db, 'memberships'), where('uid', '==', 'member'))));
    await seed(env, (db) => updateDoc(doc(db, 'memberships/member_active'), { joinCode: '' }));
    await assertFails(getDoc(doc(db, 'memberships/member_active')));
  });
  it('preserves manager legacy reads and owner restoration without code edits', async () => {
    for (const db of [asTeacher(env, 'owner').firestore(), asAdmin(env, 'root').firestore()]) {
      await assertSucceeds(getDoc(doc(db, 'classes/legacy')));
      await assertSucceeds(getDoc(doc(db, 'memberships/member_legacy')));
      await assertSucceeds(getDocs(query(collection(db, 'memberships'), where('classId', '==', 'archived'))));
      await assertSucceeds(updateDoc(doc(db, 'classes/archived'), { archived: false }));
    }
    const owner = asTeacher(env, 'owner').firestore();
    await assertFails(updateDoc(doc(owner, 'classes/active'), { joinCode: '111111' }));
    await assertFails(updateDoc(doc(owner, 'classes/active'), { accessVersion: 1 }));
    await assertFails(updateDoc(doc(student(), 'classes/archived'), { archived: false }));
    const root = asAdmin(env, 'root').firestore();
    await assertFails(updateDoc(doc(root, 'classes/active'), { joinCode: '111111' }));
    await assertFails(setDoc(doc(root, 'classes/new'), { createdBy: 'root', accessVersion: 2 }));
    await assertSucceeds(setDoc(doc(root, 'classes/new'), { createdBy: 'root', accessVersion: 2, archived: false }));
  });
  it('allows inherited membership only for the owner or administrator', async () => {
    const data = { uid: 'member', classId: 'next', inheritedFromClassId: 'active', accessVersion: 2, joinedAt: serverTimestamp() };
    await assertFails(setDoc(doc(asStudent(env, 'member').firestore(), 'memberships/member_next'), data));
    await assertFails(setDoc(doc(asTeacher(env, 'other').firestore(), 'memberships/member_next'), data));
    await assertSucceeds(setDoc(doc(asTeacher(env, 'owner').firestore(), 'memberships/member_next'), data));
    await assertFails(setDoc(doc(asTeacher(env, 'owner').firestore(), 'memberships/member_foreign'), { ...data, classId: 'foreign' }));
    await seed(env, (db) => deleteDoc(doc(db, 'memberships/member_next')));
    await assertSucceeds(setDoc(doc(asAdmin(env, 'root').firestore(), 'memberships/member_next'), data));
  });
});
