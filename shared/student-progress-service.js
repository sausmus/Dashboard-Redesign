(() => {
  "use strict";
  const KEY = "teacherDashboard.studentProgressSync.v1";
  const read = () => {
    const data = JSON.parse(localStorage.getItem(KEY) || '{"receipts":{},"docs":{},"options":{}}');
    const now = new Date(), year = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
    data.options = {docs:true,links:true,recordYear:`${year}-${year+1}`, ...data.options};
    return data;
  };
  const write = data => localStorage.setItem(KEY, JSON.stringify(data));
  const prefix = utility => utility === "timeliness" ? "Timeliness" : "Participation";
  const term = utility => DashboardData[`getActive${prefix(utility)}TermId`]();
  const context = (utility, classId, termId = term(utility)) => {
    const p = prefix(utility);
    const settings = DashboardData[`get${p}GradeSync`](termId);
    const assignment = DashboardData[`get${p}GradeAssignment`](classId, termId);
    const mapping = DashboardData.getClassroomMapping(classId);
    const rows = DashboardData[`get${p}GradePreview`](classId, termId);
    return {utility, classId, termId, settings, assignment, mapping, rows};
  };
  const ready = c => Boolean(c.assignment?.courseWorkId && c.mapping?.courseId === c.assignment.courseId && Number(c.assignment.maxPoints) === Number(c.settings.assignmentPoints) && c.assignment.state === "PUBLISHED");
  const key = c => JSON.stringify([c.utility, c.mapping?.courseId, c.assignment?.courseWorkId, c.termId]);
  const fingerprint = (c, student) => JSON.stringify({student, settings:c.settings.title, policy:c.utility === "timeliness" ? DashboardData.getTimelinessRecord(c.classId, student.id, c.termId) : null, options:c.utility === "timeliness" ? read().options : null});
  function status(utility, classId) {
    const c = context(utility, classId);
    if (!ready(c)) return "Needs setup";
    const receipt = read().receipts[key(c)];
    return c.rows.length && c.rows.every(row => row.eligible && receipt?.[row.id] === fingerprint(c, row)) ? "Synced" : "Changes not synced";
  }
  function options(updates) { const data = read(); if (updates) { data.options = {...data.options, ...updates}; write(data); } return data.options; }
  function documentKey(c, student) { return JSON.stringify([options().recordYear, c.mapping?.courseId, c.termId, student.googleId]); }
  function docInfo(c, student) { return read().docs[documentKey(c, student)] || null; }
  function saveDoc(k, value) { const data = read(); data.docs[k] = value; write(data); }
  async function syncDoc(c, student, roster) {
    const person = roster.find(s => s.id === student.googleId);
    if (!person?.email) throw new Error("Classroom roster has no student email; record not shared.");
    const k = documentKey(c, student);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k)))).map(n => n.toString(16).padStart(2,"0")).join("");
    let saved = docInfo(c, student);
    const record = DashboardData.getTimelinessRecord(c.classId, student.id, c.termId);
    const label = DashboardData.getTimelinessTerms().find(t => t.id === c.termId)?.label || c.termId;
    if (!saved?.id) {
      // appProperties recover an existing record after lost local state or interrupted creation.
      const files = await ClassroomService.progressRequest("drive", "/files", {params:{q:`trashed = false and appProperties has { key='tdTimelinessRecord' and value='${digest}' }`,fields:"files(id),nextPageToken",pageSize:100}});
      if (files.files?.length > 1 || files.nextPageToken) throw new Error("Multiple matching records found; resolve in Drive before syncing.");
      let id = files.files?.[0]?.id;
      if (!id) {
        const file = await ClassroomService.progressRequest("drive", "/files", {method:"POST",body:{name:`${student.name} — ${options().recordYear} ${label} Timeliness Record`,mimeType:"application/vnd.google-apps.document",appProperties:{tdTimelinessRecord:digest}},params:{fields:"id"}});
        id = file.id;
      }
      saved = {id, url:`https://docs.google.com/document/d/${id}/edit`};
      saveDoc(k,saved); // persist before rewriting/sharing, including failed later steps
    }
    const file = await ClassroomService.progressRequest("drive", `/files/${saved.id}`, {params:{fields:"id,ownedByMe,trashed,appProperties"}});
    if (!file.ownedByMe || file.trashed || file.appProperties?.tdTimelinessRecord !== digest) throw new Error("Record ownership or identity changed. Restore the original teacher-owned Doc; no replacement created.");
    const permissions = await ClassroomService.progressRequest("drive", `/files/${saved.id}/permissions`, {params:{fields:"permissions(id,type,role,emailAddress),nextPageToken",pageSize:100}});
    if (permissions.nextPageToken || (permissions.permissions || []).some(p => p.role !== "owner" && (p.type !== "user" || p.emailAddress?.toLowerCase() !== person.email.toLowerCase()))) throw new Error("Record has unexpected sharing. Restrict access in Drive before syncing.");
    const studentPermission = permissions.permissions?.find(p => p.emailAddress?.toLowerCase() === person.email.toLowerCase() && p.role !== "owner");
    if (studentPermission && studentPermission.role !== "reader") await ClassroomService.progressRequest("drive", `/files/${saved.id}/permissions/${studentPermission.id}`, {method:"PATCH",body:{role:"reader"}});
    const doc = await ClassroomService.progressRequest("docs", `/documents/${saved.id}`);
    const end = doc.body?.content?.at(-1)?.endIndex;
    if (!end) throw new Error("Unsupported document structure; record was not rewritten.");
    const text = `${student.name}\n${options().recordYear} · ${label} · Timeliness Record\nCurrent score: ${record.score} / ${record.startingPoints}\nLate assignments: ${record.entries.length}\n\n${record.entries.length ? record.entries.map((e,i) => `${i+1}. ${e.note || e.assignment || e.title || "Late assignment"} — ${new Date(e.createdAt).toLocaleDateString()}`).join("\n") : "No late assignments recorded."}\n\nTeacher Dashboard is the source of this record. Contact your teacher about corrections.\n`;
    const requests = [];
    if (end > 2) requests.push({deleteContentRange:{range:{startIndex:1,endIndex:end-1}}});
    requests.push({insertText:{location:{index:1},text}});
    requests.push({updateParagraphStyle:{range:{startIndex:1,endIndex:student.name.length+1},paragraphStyle:{namedStyleType:"TITLE"},fields:"namedStyleType"}});
    await ClassroomService.progressRequest("docs", `/documents/${saved.id}:batchUpdate`, {method:"POST",body:{requests,writeControl:{requiredRevisionId:doc.revisionId}}});
    if (!studentPermission) await ClassroomService.progressRequest("drive", `/files/${saved.id}/permissions`, {method:"POST",params:{sendNotificationEmail:false},body:{type:"user",role:"reader",emailAddress:person.email}});
    saved = {...saved, updatedAt:new Date().toISOString()}; saveDoc(k,saved);
    if (options().links) {
      // A private material is teacher-writable; submission attachments are student-controlled.
      const marker = `Teacher Dashboard record ${digest}`;
      if (!saved.materialId) {
        let pageToken = "", matches = [];
        do {
          const page = await ClassroomService.progressRequest("classroom", `/courses/${c.mapping.courseId}/courseWorkMaterials`, {params:{pageSize:100,pageToken,courseWorkMaterialStates:"PUBLISHED"}});
          matches.push(...(page.courseWorkMaterial || []).filter(m => m.description?.includes(marker)));
          pageToken = page.nextPageToken || "";
        } while (pageToken);
        if (matches.length > 1) throw new Error("Multiple Classroom record links found; resolve before syncing.");
        if (matches[0]) { saved.materialId = matches[0].id; saveDoc(k,saved); }
      }
      const body = {title:`${label} Timeliness Record`,description:`Your record for ${c.assignment.title || c.settings.title}.\n${marker}`,materials:[{link:{url:saved.url}},{link:{url:c.assignment.alternateLink || `https://classroom.google.com/c/${c.mapping.courseId}`}}],state:"PUBLISHED",assigneeMode:"INDIVIDUAL_STUDENTS",individualStudentsOptions:{studentIds:[student.googleId]}};
      if (saved.materialId) {
        const existing = await ClassroomService.progressRequest("classroom", `/courses/${c.mapping.courseId}/courseWorkMaterials/${saved.materialId}`);
        if (existing.state !== "PUBLISHED" || existing.assigneeMode !== "INDIVIDUAL_STUDENTS" || existing.individualStudentsOptions?.studentIds?.length !== 1 || existing.individualStudentsOptions.studentIds[0] !== student.googleId) throw new Error("Classroom record link audience changed. Restore its private audience before syncing.");
        await ClassroomService.progressRequest("classroom", `/courses/${c.mapping.courseId}/courseWorkMaterials/${saved.materialId}`,{method:"PATCH",params:{updateMask:"title,description,materials"},body:{title:body.title,description:body.description,materials:body.materials}});
      } else {
        const material = await ClassroomService.progressRequest("classroom", `/courses/${c.mapping.courseId}/courseWorkMaterials`,{method:"POST",body});
        saved.materialId = material.id;
      }
      saved.linkedAt = new Date().toISOString(); saveDoc(k,saved);
    }
    return saved;
  }
  async function sync(utility,classId,onProgress = () => {}) {
    const c = context(utility,classId);
    if (!ready(c)) throw new Error("Use the gear → Assignment setup to create/publish the matching assignment first.");
    const run = async () => {
      await ClassroomService.connect({progressDocs:utility === "timeliness" && options().docs});
      const live = await ClassroomService.getCourseWork(c.mapping.courseId,c.assignment.courseWorkId);
      if (live.state !== "PUBLISHED" || Number(live.maxPoints) !== Number(c.settings.assignmentPoints)) throw new Error("Classroom assignment changed. Review setup in Settings first.");
      const submissions = await ClassroomService.listStudentSubmissions(c.mapping.courseId,c.assignment.courseWorkId);
      const roster = utility === "timeliness" && options().docs ? await ClassroomService.listStudents(c.mapping.courseId) : [];
      const result = {syncedCount:0,missingSubmissionCount:0,failedCount:0,errors:[]};
      for (const student of c.rows) {
        onProgress(`Syncing ${student.name}…`);
        const before = fingerprint(c,student);
        const pending = read(); pending.receipts[key(c)] ||= {}; delete pending.receipts[key(c)][student.id]; write(pending);
        let docError = null;
        if (student.eligible && utility === "timeliness" && options().docs) {
          try { await syncDoc(c,student,roster); } catch (e) { docError=e; }
        }
        const submission = submissions.find(s => s.userId === student.googleId);
        if (!student.eligible || !submission || !["TURNED_IN","RETURNED"].includes(submission.state)) {
          result.missingSubmissionCount++;
          result.errors.push(`${student.name}: ${docError ? "Record: " + docError.message + "; " : ""}grade waiting for Classroom link / Turn In.`); continue;
        }
        try {
          await ClassroomService.setReturnedGrade(c.mapping.courseId,c.assignment.courseWorkId,submission.id,student.classroomGrade);
          if (submission.state === "TURNED_IN") await ClassroomService.returnStudentSubmission(c.mapping.courseId,c.assignment.courseWorkId,submission.id);
          if (docError) throw new Error(`Grade synced; record: ${docError.message}`);
          const data = read(); data.receipts[key(c)] ||= {}; data.receipts[key(c)][student.id] = before; write(data);
          result.syncedCount++;
        } catch(e) { result.failedCount++; result.errors.push(`${student.name}: ${e.message}`); }
      }
      DashboardData[`mark${prefix(utility)}GradeSynced`](classId,c.termId,result);
      return result;
    };
    if (!navigator.locks) throw new Error("Use a current browser supporting Web Locks to prevent duplicate records across tabs.");
    return navigator.locks.request("teacherDashboard.progressSync", {ifAvailable:true}, lock => {if (!lock) throw new Error("Another Dashboard tab is syncing. Wait for it to finish."); return run();});
  }
  window.StudentProgressService = Object.freeze({status,context,options,sync,docInfo});
})();
