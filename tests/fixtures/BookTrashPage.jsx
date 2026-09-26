"use client";
import { useEffect, useState } from "react";
import BookWorkspace from "@/components/BookWorkspace";
import ProjectItemDeleteModal from "@/components/ProjectItemDeleteModal";
import { useBookProjectDeletion } from "@/components/useBookProjectDeletion";
import { addClass, getBookProject, saveBookProject, subscribeBookProject, subscribeBookActivities, saveBookDashboardText, subscribeBookEntries } from "@/lib/store";
import { saveBookConfirmation, subscribeBookConfirmations } from "@/lib/bookConfirmations";

const teacher = { uid: "trash-teacher", role: "admin", realName: "선생님" };
const student = { uid: "trash-student", role: "student", realName: "학생 하나" };
let seeded;
async function seed() {
  if (!seeded) seeded = (async () => {
    const room = await addClass(teacher, "휴지통 검증반");
    const other = await addClass(teacher, "다른 반");
    await saveBookProject(teacher, { classId: room.id, title: "복원할 프로젝트", steps: Array.from({ length: 18 }, (_, i) => ({
      id: "step-" + (i + 1), title: i === 0 ? "복원할 Step" : "수업 단계 " + (i + 1), description: "단계 안내",
      activities: i === 0 ? [{ id: "initial", title: "복원할 활동", content: "<p>활동 안내</p>", requiresAnswer: true }] : [],
      resources: i === 0 ? [{ id: "resource", title: "복원할 자료", teacherDescription: "교사 설명 유지", content: "복사 내용 유지", url: "https://example.org" }] : [],
      itemOrder: i === 0 ? [{ kind: "activity", id: "initial" }, { kind: "resource", id: "resource" }] : [],
    })) });
    const project = await getBookProject(room.id);
    const activityId = project.steps[0].activities[0].id;
    await saveBookDashboardText(activityId, student, "학생이 작성한 보존할 답변", ["https://example.org/student-result"]);
    await saveBookConfirmation({classId:room.id,projectId:room.id,itemKind:"activity",itemId:activityId,user:student,confirmed:true});
    window.trashQA = { roomId: room.id, otherId: other.id, activityId, originalVersion: project.version };
    subscribeBookEntries(activityId, rows => { window.trashQA.entries = rows; });
    subscribeBookConfirmations({classId:room.id,callback:rows=>{window.trashQA.confirmations=rows;}});
    return { room, other };
  })();
  return seeded;
}
export default function BookTrashPage() {
  const [rooms, setRooms] = useState(null), [classId,setClassId]=useState("");
  const [project,setProject]=useState(null), [activities,setActivities]=useState([]);
  const [mode,setMode]=useState("teacher"), [toast,setToast]=useState("");
  const [selectedStepId,setSelectedStepId]=useState("step-1");
  const [editing,setEditing]=useState(false);
  const user=mode==="teacher"?teacher:student;
  useEffect(()=>{let active=true;seed().then(value=>{if(active){setRooms(value);setClassId(value.room.id);}});return()=>{active=false;};},[]);
  useEffect(()=>{setProject(null);return subscribeBookProject(classId,setProject);},[classId]);
  useEffect(()=>subscribeBookActivities(classId,setActivities),[classId]);
  const deletion=useBookProjectDeletion({user,classId,project,ready:Boolean(classId),saveProject:saveBookProject,onToast:setToast});
  useEffect(()=>{if(window.trashQA)window.trashQA.project=project;},[project]);
  if(!rooms)return <p>준비 중...</p>;
  return <main>
    <nav aria-label="검증 제어" style={{display:"flex",gap:8,height:48,position:"fixed",top:0,right:0,zIndex:20}}>
      <button onClick={()=>setMode(mode==="teacher"?"student":"teacher")}>역할 전환</button>
      <button onClick={()=>setClassId(classId===rooms.room.id?rooms.other.id:rooms.room.id)}>반 전환</button>
      <button onClick={()=>saveBookProject(teacher,{classId,title:"새 프로젝트",steps:[]})}>새 프로젝트</button>
      <button onClick={()=>saveBookProject(teacher,{classId,title:project.title,steps:project.steps.slice(1)})}>첫 Step 삭제 저장</button>
    </nav>
    <div className="books-main books-main--split" style={{height:"100dvh"}}>
      <BookWorkspace user={user} isTeacher={mode==="teacher"} hasClass activeClassId={classId} className="검증반"
        project={project} activities={activities.filter(a=>project?.steps.some(s=>s.activities.some(v=>v.id===a.id)))} participants={[student]}
        selectedStepId={selectedStepId} onSelectStep={setSelectedStepId}
        editingProject={editing} projectEditorKey={editing?1:0}
        onEditProject={()=>setEditing(true)}
        onSaveProject={async patch=>{await saveBookProject(teacher,{classId,...patch});setEditing(false);return true;}}
        onDelete={mode==="teacher"?deletion.requestDelete:null} onToast={setToast}
        onProjectDeleted={()=>setToast("프로젝트를 휴지통으로 옮겼어요.")}
        header={<p>교사 휴지통 검증 · {toast}</p>} />
    </div>
    <ProjectItemDeleteModal target={deletion.target} pending={deletion.pending} error={deletion.error} onConfirm={deletion.confirmDelete} onClose={deletion.closeDelete} />
  </main>;
}
