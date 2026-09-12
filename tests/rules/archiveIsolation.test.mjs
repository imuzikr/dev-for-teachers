import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { asAdmin, asStudent, asTeacher, makeEnv, seed } from './helpers.mjs';

describe('Archive isolation uses the real parent class', () => {
  let env;
  before(async () => { env = await makeEnv('demo-archive-isolation'); });
  after(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, 'system/admin'), { uid: 'root' });
      for (const [classId, extra] of [
        ['active', {}], ['archived', { archived: true }],
        ['foreign', { createdBy: 'other' }], ['legacy', { accessVersion: 1 }],
      ]) {
        await setDoc(doc(db, 'classes', classId), { name: classId, createdBy: 'owner', accessVersion: 2, archived: false, ...extra });
        if (classId !== 'foreign') await setDoc(doc(db, 'memberships', 'student_' + classId), { uid: 'student', classId, accessVersion: 2 });
        await setDoc(doc(db, 'classes', classId, 'questionSignals/student'), { uid: 'student', classId, createdAt: new Date(0), updatedAt: new Date(0) });
        await setDoc(doc(db, 'presence', 'student_' + classId), { uid: 'student', classId, visible: true });
        for (const mode of ['individual', 'group']) {
          const boardId = classId + '-' + mode;
          await setDoc(doc(db, 'studyBoards', boardId), { classId, type: 'cards', activityType: mode, viewMode: 'private', editMode: 'open' });
          await setDoc(doc(db, 'studyBoards', boardId, 'cards/student'), { authorId: 'student', classId: 'active', memberUids: ['student'], content: 'own' });
          await setDoc(doc(db, 'studyBoards', boardId, 'cards/group'), { authorId: 'other', classId: 'active', memberUids: ['student'], content: 'group' });
          await setDoc(doc(db, 'studyBoards', boardId, 'cards/other'), { authorId: 'other', memberUids: ['other'], content: 'other' });
        }
        await setDoc(doc(db, 'bookActivities', classId), { classId, locked: false });
        await setDoc(doc(db, 'bookActivities', classId, 'entries/student'), { authorId: 'student', classId: 'active', content: 'own' });
        await setDoc(doc(db, 'bookActivities', classId, 'groups/g/words/w'), { text: 'saved' });
      }
      for (const path of ['unrelated/x/cards/student', 'unrelated/x/entries/student', 'studyBoards/missing/cards/student', 'bookActivities/missing/entries/student']) {
        await setDoc(doc(db, path), { authorId: 'student', classId: 'active', memberUids: ['student'] });
      }
    });
  });
  const participant = () => asStudent(env, 'student').firestore();
  for (const classId of ['archived', 'foreign', 'legacy']) {
    it('denies participant direct reads and mutations for ' + classId, async () => {
      const db = participant();
      for (const path of [
        'classes/' + classId + '/questionSignals/student',
        'studyBoards/' + classId + '-individual', 'studyBoards/' + classId + '-group',
        'studyBoards/' + classId + '-individual/cards/student',
        'studyBoards/' + classId + '-group/cards/student',
        'studyBoards/' + classId + '-group/cards/group',
        'bookActivities/' + classId, 'bookActivities/' + classId + '/entries/student',
      ]) await assertFails(getDoc(doc(db, path)));
      await assertFails(deleteDoc(doc(db, 'classes', classId, 'questionSignals/student')));
      await assertFails(deleteDoc(doc(db, 'presence', 'student_' + classId)));
      await assertFails(updateDoc(doc(db, 'presence', 'student_' + classId), { visible: false }));
      await assertFails(updateDoc(doc(db, 'classes', classId, 'questionSignals/student'), { updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(db, 'studyBoards', classId + '-individual', 'cards/student'), { content: 'edit' }));
      await assertFails(updateDoc(doc(db, 'studyBoards', classId + '-group', 'cards/group'), { content: 'edit' }));
      await assertFails(setDoc(doc(db, 'bookActivities', classId, 'entries/student'), { authorId: 'student', content: 'edit' }));
    });
    it('denies participant parent-scoped lists for ' + classId, async () => {
      const db = participant();
      await assertFails(getDocs(query(collection(db, 'studyBoards'), where('classId', '==', classId))));
      await assertFails(getDocs(collection(db, 'classes', classId, 'questionSignals')));
      await assertFails(getDocs(query(collection(db, 'studyBoards', classId + '-individual', 'cards'), where('authorId', '==', 'student'))));
      await assertFails(getDocs(query(collection(db, 'studyBoards', classId + '-group', 'cards'), where('memberUids', 'array-contains', 'student'))));
      await assertFails(getDocs(query(collection(db, 'bookActivities', classId, 'entries'), where('authorId', '==', 'student'))));
    });
  }
  it('allows active participant own and group workflows', async () => {
    const db = participant();
    for (const path of ['classes/active/questionSignals/student', 'studyBoards/active-individual', 'studyBoards/active-group/cards/group', 'bookActivities/active/entries/student']) {
      await assertSucceeds(getDoc(doc(db, path)));
    }
    await assertSucceeds(getDocs(query(collection(db, 'studyBoards'), where('classId', '==', 'active'))));
    await assertSucceeds(getDocs(collection(db, 'studyBoards/active-individual/cards')));
    await assertSucceeds(getDocs(query(collection(db, 'studyBoards/active-group/cards'), where('memberUids', 'array-contains', 'student'))));
    await assertFails(getDoc(doc(db, 'studyBoards/active-group/cards/other')));
    await assertSucceeds(updateDoc(doc(db, 'studyBoards/active-group/cards/group'), { content: 'edit' }));
    await assertSucceeds(updateDoc(doc(db, 'studyBoards/active-individual/cards/student'), { content: 'edit' }));
    await assertSucceeds(setDoc(doc(db, 'bookActivities/active/entries/student'), { authorId: 'student', content: 'edit' }));
    await assertSucceeds(deleteDoc(doc(db, 'presence/student_active')));
    await assertSucceeds(deleteDoc(doc(db, 'classes/active/questionSignals/student')));
  });
  it('denies author/group bypasses on arbitrary or orphaned paths', async () => {
    for (const path of ['unrelated/x/cards/student', 'unrelated/x/entries/student', 'studyBoards/missing/cards/student', 'bookActivities/missing/entries/student']) {
      await assertFails(getDoc(doc(participant(), path)));
    }
  });
  it('denies collection-group reports to participants, owners, and fake admins', async () => {
    for (const db of [participant(), asTeacher(env, 'owner').firestore(), asAdmin(env, 'fake').firestore(), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDocs(query(collectionGroup(db, 'cards'), where('authorId', '==', 'student'))));
      await assertFails(getDocs(query(collectionGroup(db, 'cards'), where('memberUids', 'array-contains', 'student'))));
      await assertFails(getDocs(query(collectionGroup(db, 'entries'), where('authorId', '==', 'student'))));
    }
    const db = asAdmin(env, 'root').firestore();
    await assertSucceeds(getDocs(collectionGroup(db, 'cards')));
    await assertSucceeds(getDocs(collectionGroup(db, 'entries')));
  });
  it('preserves archived manager direct/list reads but blocks owner data writes', async () => {
    for (const db of [asTeacher(env, 'owner').firestore(), asAdmin(env, 'root').firestore()]) {
      for (const path of ['classes/archived', 'memberships/student_archived', 'presence/student_archived', 'classes/archived/questionSignals/student', 'studyBoards/archived-group', 'studyBoards/archived-group/cards/group', 'bookActivities/archived/entries/student', 'bookActivities/archived/groups/g/words/w']) {
        await assertSucceeds(getDoc(doc(db, path)));
      }
      await assertSucceeds(getDocs(collection(db, 'studyBoards/archived-group/cards')));
      await assertSucceeds(getDocs(collection(db, 'bookActivities/archived/entries')));
      await assertSucceeds(getDocs(collection(db, 'classes/archived/questionSignals')));
    }
    const db = asTeacher(env, 'owner').firestore();
    for (const path of ['presence/student_archived', 'classes/archived/questionSignals/student', 'studyBoards/archived-group/cards/group', 'bookActivities/archived/entries/student', 'bookActivities/archived/groups/g/words/w']) {
      await assertFails(deleteDoc(doc(db, path)));
    }
    await assertFails(updateDoc(doc(db, 'studyBoards/archived-group/cards/group'), { content: 'edit' }));
    await assertFails(updateDoc(doc(asTeacher(env, 'other').firestore(), 'classes/archived'), { archived: false }));
  });
  for (const role of ['owner', 'root']) it(role + ' can restore a class and participant access', async () => {
    const manager = role === 'root' ? asAdmin(env, role).firestore() : asTeacher(env, role).firestore();
    await assertSucceeds(updateDoc(doc(manager, 'classes/archived'), { archived: false }));
    await assertSucceeds(getDoc(doc(participant(), 'memberships/student_archived')));
    await assertSucceeds(getDoc(doc(participant(), 'studyBoards/archived-group/cards/group')));
    await assertSucceeds(getDoc(doc(participant(), 'bookActivities/archived/entries/student')));
    await assertSucceeds(updateDoc(doc(participant(), 'studyBoards/archived-group/cards/group'), { content: 'restored' }));
  });
});
