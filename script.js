"use strict";

/* ---------- Data layer (saved in the browser with localStorage) ---------- */
const STORAGE_KEY = "attendance-manager-v1";
const MIN_PERCENT = 75; // students below this are highlighted

// state = { students: [{id, roll, name}], records: { "YYYY-MM-DD": { studentId: "P" | "A" | "L" } } }
let state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { students: [], records: {} };
  } catch {
    return { students: [], records: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const dateInput = $("date");

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function statusFor(studentId, date) {
  return (state.records[date] || {})[studentId] || "";
}

function setStatus(studentId, date, status) {
  if (!state.records[date]) state.records[date] = {};
  state.records[date][studentId] = status;
  saveState();
  render();
}

// Present and Late both count as attended.
function overallPercent(studentId) {
  let total = 0, attended = 0;
  for (const day of Object.values(state.records)) {
    const s = day[studentId];
    if (!s) continue;
    total++;
    if (s === "P" || s === "L") attended++;
  }
  return total === 0 ? null : Math.round((attended / total) * 100);
}

/* ---------- Rendering ---------- */
function render() {
  const date = dateInput.value;
  const query = $("search").value.trim().toLowerCase();
  const rows = $("rows");
  rows.innerHTML = "";

  const list = state.students
    .filter((s) => s.name.toLowerCase().includes(query) || s.roll.toLowerCase().includes(query))
    .sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));

  list.forEach((s) => rows.appendChild(buildRow(s, date)));
  $("empty").hidden = state.students.length > 0;
  renderStats(date);
}

function buildRow(student, date) {
  const tr = document.createElement("tr");

  const roll = document.createElement("td");
  roll.textContent = student.roll;

  const name = document.createElement("td");
  name.textContent = student.name; // textContent avoids HTML injection

  const statusCell = document.createElement("td");
  const seg = document.createElement("div");
  seg.className = "seg";
  const current = statusFor(student.id, date);
  [["P", "Present"], ["A", "Absent"], ["L", "Late"]].forEach(([code, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.s = code;
    b.textContent = label;
    b.setAttribute("aria-pressed", current === code);
    if (current === code) b.classList.add("on");
    b.addEventListener("click", () => setStatus(student.id, date, code));
    seg.appendChild(b);
  });
  statusCell.appendChild(seg);

  const pct = overallPercent(student.id);
  const pctCell = document.createElement("td");
  pctCell.className = "pct" + (pct !== null && pct < MIN_PERCENT ? " low" : "");
  pctCell.textContent = pct === null ? "-" : pct + "%";

  const delCell = document.createElement("td");
  const del = document.createElement("button");
  del.className = "del";
  del.type = "button";
  del.textContent = "\u2715";
  del.setAttribute("aria-label", "Remove " + student.name);
  del.addEventListener("click", () => removeStudent(student));
  delCell.appendChild(del);

  tr.append(roll, name, statusCell, pctCell, delCell);
  return tr;
}

function renderStats(date) {
  const day = state.records[date] || {};
  const counts = { P: 0, A: 0, L: 0 };
  state.students.forEach((s) => { if (day[s.id]) counts[day[s.id]]++; });
  const unmarked = state.students.length - counts.P - counts.A - counts.L;

  $("stats").innerHTML =
    stat("t", state.students.length, "Total students") +
    stat("p", counts.P, "Present") +
    stat("a", counts.A, "Absent") +
    stat("l", counts.L, "Late") +
    stat("t", unmarked, "Not marked yet");
}

function stat(cls, value, label) {
  return `<div class="stat ${cls}"><b>${value}</b><span>${label}</span></div>`;
}

/* ---------- Actions ---------- */
function addStudent(e) {
  e.preventDefault();
  const roll = $("roll").value.trim();
  const name = $("name").value.trim();
  const error = $("formError");

  if (state.students.some((s) => s.roll.toLowerCase() === roll.toLowerCase())) {
    error.textContent = "Roll no. " + roll + " already exists. Use a different roll no.";
    return;
  }
  error.textContent = "";
  state.students.push({ id: "s" + Date.now(), roll, name });
  saveState();
  $("addForm").reset();
  $("roll").focus();
  render();
}

function removeStudent(student) {
  if (!confirm("Remove " + student.name + " and all their attendance records?")) return;
  state.students = state.students.filter((s) => s.id !== student.id);
  Object.values(state.records).forEach((day) => delete day[student.id]);
  saveState();
  render();
}

function markAllPresent() {
  const date = dateInput.value;
  if (!state.records[date]) state.records[date] = {};
  state.students.forEach((s) => { state.records[date][s.id] = "P"; });
  saveState();
  render();
}

function exportCsv() {
  const dates = Object.keys(state.records).sort();
  const header = ["Roll no.", "Name", ...dates, "Overall %"];
  const lines = state.students.map((s) => [
    s.roll,
    s.name,
    ...dates.map((d) => statusFor(s.id, d) || "-"),
    overallPercent(s.id) ?? "-",
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","))
    .join("\n");

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "attendance-" + today() + ".csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function resetAll() {
  if (!confirm("Delete all students and attendance records? This cannot be undone.")) return;
  state = { students: [], records: {} };
  saveState();
  render();
}

/* ---------- Setup ---------- */
dateInput.value = today();
dateInput.addEventListener("change", render);
$("search").addEventListener("input", render);
$("addForm").addEventListener("submit", addStudent);
$("markAll").addEventListener("click", markAllPresent);
$("exportBtn").addEventListener("click", exportCsv);
$("resetBtn").addEventListener("click", resetAll);
render();
