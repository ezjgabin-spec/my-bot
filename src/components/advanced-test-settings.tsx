"use client";
import { type AdvancedSettings } from "@/lib/test-settings";
export function AdvancedTestSettings({value,onChange}:{value:AdvancedSettings;onChange:(v:AdvancedSettings)=>void}) {
  const set = (patch:Partial<AdvancedSettings>)=>onChange({...value,...patch});
  return <div className="form-stack"><h3>Advanced test settings</h3><div className="form-grid">
    <label>Multiple-choice questions<input type="number" min={0} max={40} value={value.multipleChoice} onChange={e=>set({multipleChoice:Number(e.target.value)})}/></label>
    <label>Written questions<input type="number" min={0} max={40} value={value.written} onChange={e=>set({written:Number(e.target.value)})}/></label>
    <label>Written format<select value={value.writtenKind} onChange={e=>set({writtenKind:e.target.value as AdvancedSettings["writtenKind"]})}><option value="short_answer">Short answer</option><option value="math">Math</option></select></label>
    <label>Reading format<select value={value.reading} onChange={e=>set({reading:e.target.value as AdvancedSettings["reading"]})}><option value="none">Independent questions</option><option value="shared_passage">One shared passage</option></select></label>
    <label>Practice mode<select value={value.mode} onChange={e=>set({mode:e.target.value as AdvancedSettings["mode"]})}><option value="exam">Realistic exam preparation</option><option value="adaptive">Adaptive challenge</option></select></label>
  </div><p className="helper">Adaptive practice advances one difficulty level after your two latest completed attempts for this exam score at least 85%. Teacher-Level stays realistic. The generated test shows its actual difficulty.</p>
  <label><input type="checkbox" checked={value.workingRequired} onChange={e=>set({workingRequired:e.target.checked})}/> Require mathematical working</label>
  <label>Teacher instructions<textarea maxLength={4000} value={value.teacherInstructions} onChange={e=>set({teacherInstructions:e.target.value})}/></label>
  <label>Grading expectations<textarea maxLength={2000} value={value.gradingExpectations} onChange={e=>set({gradingExpectations:e.target.value})}/></label>
  <label>Upcoming test instructions<textarea maxLength={2000} value={value.additionalInstructions} onChange={e=>set({additionalInstructions:e.target.value})}/></label></div>;
}
