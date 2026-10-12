const STORAGE_KEY = 'daywell-v1';
const $ = (selector) => document.querySelector(selector);
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (value) => new Date(`${value}T12:00:00`);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const starterActivities = [
  { id: 'exercise', name: 'Exercise', icon: '◉', sections: [{ id: 'stepper', name: 'Stepper', fields: [{ id: 'strength', name: 'Strength', unit: '', example: '4' }, { id: 'minutes', name: 'Minutes', unit: 'min', example: '10' }] }] },
  { id: 'writing', name: 'Writing', icon: '✎', sections: [{ id: 'writing-session', name: 'Writing session', fields: [{ id: 'writing-minutes', name: 'Minutes', unit: 'min' }, { id: 'words', name: 'Words', unit: 'words' }] }] },
  { id: 'journaling', name: 'Journaling', icon: '◈', sections: [{ id: 'journal-entry', name: 'Journal entry', fields: [{ id: 'journal-minutes', name: 'Minutes', unit: 'min' }] }] },
  { id: 'projects', name: 'Other projects', icon: '✦', sections: [{ id: 'project-work', name: 'Project work', fields: [{ id: 'project-minutes', name: 'Minutes', unit: 'min' }] }] }
];

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.activities) && Array.isArray(parsed.entries)) return parsed;
  } catch (_) {}
  return { activities: starterActivities, entries: [] };
}
let state = loadState();
let selectedDate = localDate();
let editingEntryId = null;
let sectionActivityId = null;
let fieldTarget = null;
let rating = 4;
let activeView = 'today';
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const activityById = (id) => state.activities.find((activity) => activity.id === id);
const sectionById = (activity, id) => activity?.sections.find((section) => section.id === id);
const entryForDate = (date) => state.entries.filter((entry) => entry.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const sectionLabel = (entry) => sectionById(activityById(entry.activityId), entry.sectionId)?.name || 'Removed section';

function showView(view) {
  activeView = view;
  for (const name of ['today', 'history', 'activities']) $(`#${name}View`).classList.toggle('hidden', view !== name);
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb').textContent = `Overview / ${view[0].toUpperCase()}${view.slice(1)}`;
  $('.sidebar').classList.remove('open');
  render();
}

function render() {
  if (activeView === 'today') renderToday();
  if (activeView === 'history') renderHistory();
  if (activeView === 'activities') renderActivities();
}

function formatDate(date, options) { return new Intl.DateTimeFormat('en', options).format(parseDate(date)); }
function totalMinutes(entries) {
  return entries.reduce((sum, entry) => {
    const section = sectionById(activityById(entry.activityId), entry.sectionId);
    return sum + (section?.fields || []).reduce((part, field) => part + (/minute/i.test(field.name) || field.unit === 'min' ? Number(entry.values?.[field.id] || 0) : 0), 0);
  }, 0);
}
function average(entries) { return entries.length ? entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / entries.length : 0; }

function renderToday() {
  const entries = entryForDate(selectedDate);
  const today = localDate();
  document.querySelector('.day-panel h2').textContent = selectedDate === today ? "Today's actions" : 'Actions on this day';
  $('#dateLabel').textContent = selectedDate === today ? 'Today,' : `${formatDate(selectedDate, { weekday: 'long' })},`;
  $('#selectedDate').value = selectedDate;
  $('#averageScore').textContent = entries.length ? average(entries).toFixed(1) : '—';
  $('#scoreHint').textContent = entries.length ? 'Across your actions today' : 'Log an action to start reflecting';
  $('#actionCount').textContent = entries.length;
  $('#minutesTotal').textContent = totalMinutes(entries);
  $('#entriesCount').textContent = `${entries.length} ${entries.length === 1 ? 'action' : 'actions'}`;
  $('#entriesList').innerHTML = entries.length ? entries.map(entryMarkup).join('') : `<div class="empty-state"><div class="empty-icon">✳</div><h3>A fresh page for today</h3><p>Log an action to remember what brought you satisfaction.</p><button data-action="new-entry">＋ Log your first action</button></div>`;
  renderWeek();
  $('#quickGrid').innerHTML = state.activities.flatMap((activity) => activity.sections.map((section) => `<button class="quick-card" data-action="quick-log" data-activity="${escapeHtml(activity.id)}" data-section="${escapeHtml(section.id)}"><span class="quick-icon">${escapeHtml(activity.icon)}</span><strong>${escapeHtml(section.name)}</strong><small>${escapeHtml(activity.name)}</small></button>`)).join('') || `<button class="quick-card" data-view="activities">Create your first activity ＋</button>`;
}

function entryMarkup(entry) {
  const activity = activityById(entry.activityId);
  const section = sectionById(activity, entry.sectionId);
  const details = (section?.fields || []).filter((field) => entry.values?.[field.id] !== '' && entry.values?.[field.id] != null).map((field) => `${escapeHtml(field.name)}: ${escapeHtml(entry.values[field.id])}${field.unit ? ` ${escapeHtml(field.unit)}` : ''}`).join(' · ');
  return `<article class="entry-row"><span class="entry-icon">${escapeHtml(activity?.icon || '✦')}</span><div class="entry-body"><div class="entry-title">${escapeHtml(sectionLabel(entry))}<small>${escapeHtml(activity?.name || 'Activity')}</small></div>${details ? `<div class="entry-meta">${details}</div>` : ''}${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ''}</div><span class="entry-score" title="Satisfaction: ${entry.rating} out of 5">✦ ${entry.rating}</span><div class="entry-actions"><button data-action="edit-entry" data-id="${escapeHtml(entry.id)}" aria-label="Edit entry">✎</button><button data-action="delete-entry" data-id="${escapeHtml(entry.id)}" aria-label="Delete entry">×</button></div></article>`;
}

function renderWeek() {
  const selected = parseDate(selectedDate);
  const monday = new Date(selected);
  monday.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
  $('#weekChart').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday); date.setDate(monday.getDate() + index);
    const key = localDate(date);
    const score = average(entryForDate(key));
    const day = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date);
    return `<div class="week-day ${key === selectedDate ? 'current' : ''}" title="${escapeHtml(day)}: ${score ? score.toFixed(1) : 'No entries'}"><div class="bar-track"><div class="bar-fill" style="height:${score ? score / 5 * 100 : 0}%"></div></div><span>${escapeHtml(day)}</span></div>`;
  }).join('');
}

function renderHistory() {
  const dates = [...new Set(state.entries.map((entry) => entry.date))].sort().reverse();
  $('#historyList').innerHTML = dates.length ? dates.map((date) => `<div class="history-day"><h3>${escapeHtml(formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))} · ${entryForDate(date).length} actions · ${average(entryForDate(date)).toFixed(1)} / 5</h3>${entryForDate(date).map(entryMarkup).join('')}</div>`).join('') : `<div class="empty-state"><div class="empty-icon">▦</div><h3>No history yet</h3><p>Once you log an action, your days will appear here.</p><button data-view="today">Go to today</button></div>`;
}

function renderActivities() {
  $('#activityCards').innerHTML = state.activities.map((activity) => `<article class="activity-card"><div class="activity-card-head"><span class="activity-icon">${escapeHtml(activity.icon)}</span><div><h2>${escapeHtml(activity.name)}</h2><small>${activity.sections.length} ${activity.sections.length === 1 ? 'section' : 'sections'}</small></div></div>${activity.sections.map((section) => `<div class="section-item"><div class="section-title"><span>${escapeHtml(section.name)}</span><button data-action="add-field" data-activity="${escapeHtml(activity.id)}" data-section="${escapeHtml(section.id)}">＋ Add field</button></div><div class="field-chips">${section.fields.map((field) => `<span class="field-chip">${escapeHtml(field.name)}${field.unit ? ` · ${escapeHtml(field.unit)}` : ''}</span>`).join('') || '<span class="field-chip">No fields yet</span>'}</div></div>`).join('')}<button class="add-section" data-action="add-section" data-activity="${escapeHtml(activity.id)}">＋ Add section</button></article>`).join('') || `<div class="panel empty-state"><div class="empty-icon">◈</div><h3>No activities yet</h3><p>Create one to start tracking.</p></div>`;
}

function fillActivityOptions(activityId) {
  $('#entryActivity').innerHTML = state.activities.map((activity) => `<option value="${escapeHtml(activity.id)}">${escapeHtml(activity.name)}</option>`).join('');
  $('#entryActivity').value = activityId || state.activities[0]?.id || '';
  fillSectionOptions();
}
function fillSectionOptions(sectionId) {
  const activity = activityById($('#entryActivity').value);
  $('#entrySection').innerHTML = (activity?.sections || []).map((section) => `<option value="${escapeHtml(section.id)}">${escapeHtml(section.name)}</option>`).join('');
  if (sectionId) $('#entrySection').value = sectionId;
  renderEntryFields();
}
function renderEntryFields(values = {}) {
  const section = sectionById(activityById($('#entryActivity').value), $('#entrySection').value);
  $('#dynamicFields').innerHTML = (section?.fields || []).map((field) => `<label>${escapeHtml(field.name)}${field.unit ? ` <span class="optional">(${escapeHtml(field.unit)})</span>` : ''}<input type="number" inputmode="decimal" step="any" min="0" data-field="${escapeHtml(field.id)}" value="${escapeHtml(values[field.id] ?? '')}" placeholder="${escapeHtml(field.example || '0')}" /></label>`).join('');
}
function renderRating() {
  $('#ratingPicker').innerHTML = [1, 2, 3, 4, 5].map((number) => `<button type="button" role="radio" aria-checked="${number === rating}" class="${number === rating ? 'selected' : ''}" data-rating="${number}" aria-label="${number} out of 5">${number}</button>`).join('');
}
function openEntry(activityId, sectionId, entryId) {
  if (!state.activities.length) { showView('activities'); $('#newActivityButton').click(); return; }
  editingEntryId = entryId || null;
  const entry = state.entries.find((item) => item.id === entryId);
  $('#entryDialogTitle').textContent = entry ? 'Edit action' : 'Log an action';
  $('#entryError').classList.add('hidden');
  fillActivityOptions(entry?.activityId || activityId);
  fillSectionOptions(entry?.sectionId || sectionId);
  renderEntryFields(entry?.values || {});
  $('#entryNote').value = entry?.note || '';
  rating = entry?.rating || 4;
  renderRating();
  $('#entryDialog').showModal();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) { showView(button.dataset.view); return; }
  if (button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
  const action = button.dataset.action;
  if (action === 'new-entry') openEntry();
  if (action === 'quick-log') openEntry(button.dataset.activity, button.dataset.section);
  if (action === 'edit-entry') openEntry(null, null, button.dataset.id);
  if (action === 'delete-entry' && confirm('Delete this action?')) { state.entries = state.entries.filter((entry) => entry.id !== button.dataset.id); save(); render(); }
  if (action === 'add-section') { sectionActivityId = button.dataset.activity; $('#sectionDialogTitle').textContent = `Add to ${activityById(sectionActivityId)?.name}`; $('#sectionForm').reset(); $('#sectionDialog').showModal(); }
  if (action === 'add-field') { fieldTarget = { activityId: button.dataset.activity, sectionId: button.dataset.section }; $('#fieldDialogTitle').textContent = `Add to ${sectionById(activityById(fieldTarget.activityId), fieldTarget.sectionId)?.name}`; $('#fieldForm').reset(); $('#fieldDialog').showModal(); }
  if (button.dataset.rating) { rating = Number(button.dataset.rating); renderRating(); }
});

$('#entryActivity').addEventListener('change', () => fillSectionOptions());
$('#entrySection').addEventListener('change', () => renderEntryFields());
$('#entryForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const activity = activityById($('#entryActivity').value);
  const section = sectionById(activity, $('#entrySection').value);
  if (!section) { $('#entryError').textContent = 'Choose an activity and section first.'; $('#entryError').classList.remove('hidden'); return; }
  const values = {};
  document.querySelectorAll('#dynamicFields [data-field]').forEach((input) => { values[input.dataset.field] = input.value; });
  const existing = state.entries.find((entry) => entry.id === editingEntryId);
  const entry = { id: existing?.id || uid(), date: existing?.date || selectedDate, activityId: activity.id, sectionId: section.id, values, rating, note: $('#entryNote').value.trim(), createdAt: existing?.createdAt || new Date().toISOString() };
  if (existing) Object.assign(existing, entry); else state.entries.push(entry);
  save(); $('#entryDialog').close(); render();
});
$('#activityForm').addEventListener('submit', (event) => {
  event.preventDefault();
  state.activities.push({ id: uid(), name: $('#activityName').value.trim(), icon: $('#activityIcon').value, sections: [{ id: uid(), name: $('#activityFirstSection').value.trim(), fields: [] }] });
  save(); $('#activityDialog').close(); renderActivities();
});
$('#sectionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  activityById(sectionActivityId)?.sections.push({ id: uid(), name: $('#sectionName').value.trim(), fields: [] });
  save(); $('#sectionDialog').close(); renderActivities();
});
$('#fieldForm').addEventListener('submit', (event) => {
  event.preventDefault();
  sectionById(activityById(fieldTarget?.activityId), fieldTarget?.sectionId)?.fields.push({ id: uid(), name: $('#fieldName').value.trim(), unit: $('#fieldUnit').value.trim() });
  save(); $('#fieldDialog').close(); renderActivities();
});
$('#newEntryButton').addEventListener('click', () => openEntry());
$('#newActivityButton').addEventListener('click', () => { $('#activityForm').reset(); $('#activityDialog').showModal(); });
$('#selectedDate').addEventListener('change', (event) => { if (event.target.value) { selectedDate = event.target.value; renderToday(); } });
$('#previousDay').addEventListener('click', () => shiftDate(-1));
$('#nextDay').addEventListener('click', () => shiftDate(1));
$('#jumpToday').addEventListener('click', () => { selectedDate = localDate(); renderToday(); });
function shiftDate(offset) { const date = parseDate(selectedDate); date.setDate(date.getDate() + offset); selectedDate = localDate(date); renderToday(); }
$('#menuButton').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#exportButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `daywell-export-${localDate()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();
