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
state.weightKg = Number(state.weightKg) > 0 ? Number(state.weightKg) : 70;
state.todos = Array.isArray(state.todos) ? state.todos : [];
state.journals = Array.isArray(state.journals) ? state.journals.filter((journal) => journal && typeof journal.date === 'string' && typeof journal.content === 'string') : [];
let selectedDate = localDate();
let editingEntryId = null;
let sectionActivityId = null;
let fieldTarget = null;
let rating = 4;
let activeView = 'today';
let todoTab = 'active';
let editingTodoId = null;
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const activityById = (id) => state.activities.find((activity) => activity.id === id);
const sectionById = (activity, id) => activity?.sections.find((section) => section.id === id);
const entryForDate = (date) => state.entries.filter((entry) => entry.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const sectionLabel = (entry) => sectionById(activityById(entry.activityId), entry.sectionId)?.name || 'Removed section';
const journalForDate = (date) => state.journals.find((journal) => journal.date === date);
const journalIsDirty = () => $('#journalText').value !== (journalForDate(selectedDate)?.content || '');

function confirmJournalNavigation() {
  return activeView !== 'journal' || !journalIsDirty() || confirm('You have unsaved journal changes. Leave without saving?');
}

function showView(view) {
  if (view !== activeView && !confirmJournalNavigation()) return;
  activeView = view;
  for (const name of ['today', 'journal', 'todos', 'history', 'activities']) $(`#${name}View`).classList.toggle('hidden', view !== name);
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb').textContent = `Overview / ${view[0].toUpperCase()}${view.slice(1)}`;
  $('.sidebar').classList.remove('open');
  render();
}

function render() {
  if (activeView === 'today') renderToday();
  if (activeView === 'journal') renderJournal();
  if (activeView === 'todos') renderTodos();
  if (activeView === 'history') renderHistory();
  if (activeView === 'activities') renderActivities();
}

function renderJournal() {
  const journal = journalForDate(selectedDate);
  const today = localDate();
  $('#journalDate').value = selectedDate;
  $('#journalDateLabel').textContent = selectedDate === today ? 'Today,' : `${formatDate(selectedDate, { weekday: 'long' })},`;
  $('#journalHeading').textContent = selectedDate === today ? "Today's entry" : 'Entry for this day';
  $('#journalText').value = journal?.content || '';
  $('#journalSaveStatus').textContent = journal?.savedAt ? `Last saved ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(journal.savedAt))}` : 'No entry saved for this day';
}

function formatDate(date, options) { return new Intl.DateTimeFormat('en', options).format(parseDate(date)); }
function totalMinutes(entries) {
  return entries.reduce((sum, entry) => {
    const section = sectionById(activityById(entry.activityId), entry.sectionId);
    return sum + (section?.fields || []).reduce((part, field) => part + (/minute/i.test(field.name) || field.unit === 'min' ? Number(entry.values?.[field.id] || 0) : 0), 0);
  }, 0);
}
function ellipticalEstimate(entry) {
  const activity = activityById(entry.activityId);
  const section = sectionById(activity, entry.sectionId);
  if (activity?.id !== 'exercise' || section?.id !== 'stepper') return null;
  const strength = Number(entry.values?.strength);
  const minutes = Number(entry.values?.minutes);
  const weightKg = Number(entry.weightKg || state.weightKg || 70);
  if (!Number.isFinite(strength) || strength < 1 || strength > 8 || !Number.isFinite(minutes) || minutes <= 0) return null;
  // This trainer's 1–8 resistance dial is mapped evenly across moderate-to-vigorous elliptical effort.
  const met = 5 + ((strength - 1) / 7) * 4;
  return Math.round(met * 3.5 * weightKg / 200 * minutes);
}
function average(entries) { return entries.length ? entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / entries.length : 0; }

function renderToday() {
  const entries = entryForDate(selectedDate);
  const today = localDate();
  document.querySelector('.day-panel h2').textContent = selectedDate === today ? "Today's actions" : 'Actions on this day';
  $('#dateLabel').textContent = selectedDate === today ? 'Today,' : `${formatDate(selectedDate, { weekday: 'long' })},`;
  $('#selectedDate').value = selectedDate;
  $('#averageScore').textContent = entries.length ? average(entries).toFixed(1) : '—';
  $('#scoreHint').textContent = entries.length ? (selectedDate === today ? 'Across your actions today' : 'Across your actions that day') : 'Log an action to start reflecting';
  $('#actionCount').textContent = entries.length;
  $('#minutesTotal').textContent = totalMinutes(entries);
  $('#caloriesTotal').textContent = entries.reduce((sum, entry) => sum + (ellipticalEstimate(entry) || 0), 0);
  $('#entriesCount').textContent = `${entries.length} ${entries.length === 1 ? 'action' : 'actions'}`;
  $('#entriesList').innerHTML = entries.length ? entries.map(entryMarkup).join('') : `<div class="empty-state"><div class="empty-icon">✳</div><h3>${selectedDate === today ? 'A fresh page for today' : 'No actions on this day yet'}</h3><p>Log an action to remember what brought you satisfaction.</p><button data-action="new-entry">＋ Log your first action</button></div>`;
  renderWeek();
  $('#quickGrid').innerHTML = state.activities.flatMap((activity) => activity.sections.map((section) => `<button class="quick-card" data-action="quick-log" data-activity="${escapeHtml(activity.id)}" data-section="${escapeHtml(section.id)}"><span class="quick-icon">${escapeHtml(activity.icon)}</span><strong>${escapeHtml(section.name)}</strong><small>${escapeHtml(activity.name)}</small></button>`)).join('') || `<button class="quick-card" data-view="activities">Create your first activity ＋</button>`;
}

function entryMarkup(entry) {
  const activity = activityById(entry.activityId);
  const section = sectionById(activity, entry.sectionId);
  const details = (section?.fields || []).filter((field) => entry.values?.[field.id] !== '' && entry.values?.[field.id] != null).map((field) => `${escapeHtml(field.name)}: ${escapeHtml(entry.values[field.id])}${field.unit ? ` ${escapeHtml(field.unit)}` : ''}`).join(' · ');
  const calories = ellipticalEstimate(entry);
  return `<article class="entry-row"><span class="entry-icon">${escapeHtml(activity?.icon || '✦')}</span><div class="entry-body"><div class="entry-title">${escapeHtml(sectionLabel(entry))}<small>${escapeHtml(activity?.name || 'Activity')}</small></div>${details ? `<div class="entry-meta">${details}${calories ? ` · ~${calories} kcal` : ''}</div>` : ''}${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ''}</div><span class="entry-score" title="Satisfaction: ${entry.rating} out of 5">✦ ${entry.rating}</span><div class="entry-actions"><button data-action="edit-entry" data-id="${escapeHtml(entry.id)}" aria-label="Edit entry">✎</button><button data-action="delete-entry" data-id="${escapeHtml(entry.id)}" aria-label="Delete entry">×</button></div></article>`;
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
  const dates = [...new Set([...state.entries.map((entry) => entry.date), ...state.journals.map((journal) => journal.date)])].sort().reverse();
  $('#historyList').innerHTML = dates.length ? dates.map((date) => {
    const entries = entryForDate(date);
    const journal = journalForDate(date);
    const journalMarkup = journal ? `<article class="history-journal"><strong>Journal</strong><p>${escapeHtml(journal.content)}</p><button type="button" class="text-button" data-action="open-journal" data-date="${escapeHtml(date)}">Open entry</button></article>` : '';
    const summary = entries.length ? `${entries.length} ${entries.length === 1 ? 'action' : 'actions'} · ${average(entries).toFixed(1)} / 5` : 'Journal entry';
    return `<div class="history-day"><h3>${escapeHtml(formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))} · ${summary}</h3>${journalMarkup}${entries.map(entryMarkup).join('')}</div>`;
  }).join('') : `<div class="empty-state"><div class="empty-icon">▦</div><h3>No history yet</h3><p>Journal entries and logged actions will appear here.</p><button data-view="today">Go to today</button></div>`;
}

function renderTodos() {
  const archived = todoTab === 'archived';
  const visibleTodos = state.todos.filter((todo) => Boolean(todo.completed) === archived);
  const byDate = new Map();
  visibleTodos.forEach((todo) => {
    if (!byDate.has(todo.date)) byDate.set(todo.date, []);
    byDate.get(todo.date).push(todo);
  });
  const dates = [...byDate.keys()].sort().reverse();
  document.querySelectorAll('[data-todo-tab]').forEach((tab) => {
    const selected = tab.dataset.todoTab === todoTab;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  $('#todoPanelTitle').textContent = archived ? 'Archived todos' : 'Active todos';
  $('#todoPanelHint').textContent = archived ? 'Completed todos' : 'Things still to do';
  $('#todoList').setAttribute('aria-labelledby', archived ? 'archivedTodoTab' : 'activeTodoTab');
  $('#todoList').innerHTML = dates.length ? dates.map((date) => `<div class="history-day todo-day"><h3>${escapeHtml(formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</h3>${byDate.get(date).map((todo) => `<article class="todo-row ${archived ? 'todo-completed' : ''}"><label class="todo-check"><input type="checkbox" data-todo-id="${escapeHtml(todo.id)}" aria-label="${archived ? 'Move back to active' : 'Mark complete'}: ${escapeHtml(todo.title)}" ${archived ? 'checked' : ''}><span class="todo-content"><strong>${escapeHtml(todo.title)}</strong>${todo.description ? `<span class="todo-description">${escapeHtml(todo.description)}</span>` : ''}</span></label><div class="todo-actions"><button type="button" data-action="edit-todo" data-id="${escapeHtml(todo.id)}" aria-label="Edit todo: ${escapeHtml(todo.title)}" title="Edit">✎</button><button type="button" data-action="delete-todo" data-id="${escapeHtml(todo.id)}" aria-label="Delete todo: ${escapeHtml(todo.title)}" title="Delete">×</button></div></article>`).join('')}</div>`).join('') : `<div class="empty-state"><div class="empty-icon">☷</div><h3>${archived ? 'No archived todos' : 'No active todos'}</h3><p>${archived ? 'Completed todos will appear here.' : 'Add a todo with a date to start your list.'}</p>${archived ? '' : '<button data-action="new-todo">＋ Add a todo</button>'}</div>`;
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
  const isStepper = activityById($('#entryActivity').value)?.id === 'exercise' && section?.id === 'stepper';
  $('#estimateWeight').required = isStepper;
  $('#dynamicFields').innerHTML = (section?.fields || []).map((field) => {
    const isStrength = isStepper && field.id === 'strength';
    const isMinutes = isStepper && field.id === 'minutes';
    return `<label>${escapeHtml(field.name)}${field.unit ? ` <span class="optional">(${escapeHtml(field.unit)})</span>` : ''}<input type="number" inputmode="decimal" step="${isStrength ? '1' : 'any'}" min="${isStrength ? '1' : '0'}" ${isStrength ? 'max="8" required' : isMinutes ? 'required' : ''} data-field="${escapeHtml(field.id)}" value="${escapeHtml(values[field.id] ?? '')}" placeholder="${escapeHtml(field.example || '0')}" /></label>`;
  }).join('');
  $('#calorieCalculator').classList.toggle('hidden', !isStepper);
  if (isStepper) {
    $('#estimateWeight').value = state.weightKg;
    updateCaloriePreview();
  }
}
function updateCaloriePreview() {
  const strength = Number(document.querySelector('#dynamicFields [data-field="strength"]')?.value);
  const minutes = Number(document.querySelector('#dynamicFields [data-field="minutes"]')?.value);
  const weightKg = Number($('#estimateWeight').value);
  const estimate = Number.isFinite(strength) && strength >= 1 && strength <= 8 && Number.isFinite(minutes) && minutes > 0 && Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 250
    ? Math.round((5 + ((strength - 1) / 7) * 4) * 3.5 * weightKg / 200 * minutes)
    : null;
  $('#caloriePreview').textContent = estimate == null ? 'Enter strength and minutes' : `~${estimate} kcal`;
}
function renderRating() {
  $('#ratingPicker').innerHTML = [1, 2, 3, 4, 5].map((number) => `<button type="button" role="radio" aria-checked="${number === rating}" class="${number === rating ? 'selected' : ''}" data-rating="${number}" aria-label="${number} out of 5">${number}</button>`).join('');
}
function openEntry(activityId, sectionId, entryId) {
  if (!state.activities.length) { showView('activities'); $('#newActivityButton').click(); return; }
  editingEntryId = entryId || null;
  const entry = state.entries.find((item) => item.id === entryId);
  $('#entryDialogTitle').textContent = entry ? 'Edit action' : 'Log an action';
  $('#entryDate').value = entry?.date || selectedDate;
  $('#entryError').classList.add('hidden');
  fillActivityOptions(entry?.activityId || activityId);
  fillSectionOptions(entry?.sectionId || sectionId);
  renderEntryFields(entry?.values || {});
  if (entry?.weightKg) $('#estimateWeight').value = entry.weightKg;
  $('#entryNote').value = entry?.note || '';
  rating = entry?.rating || 4;
  renderRating();
  updateCaloriePreview();
  $('#entryDialog').showModal();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) { showView(button.dataset.view); return; }
  if (button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
  const action = button.dataset.action;
  if (action === 'open-journal') { if (confirmJournalNavigation()) { selectedDate = button.dataset.date; showView('journal'); } return; }
  if (button.dataset.todoTab) { todoTab = button.dataset.todoTab; renderTodos(); return; }
  if (action === 'new-entry') openEntry();
  if (action === 'new-todo') openTodo();
  if (action === 'edit-todo') openTodo(button.dataset.id);
  if (action === 'delete-todo' && confirm('Delete this todo?')) {
    state.todos = state.todos.filter((todo) => todo.id !== button.dataset.id);
    save();
    renderTodos();
  }
  if (action === 'quick-log') openEntry(button.dataset.activity, button.dataset.section);
  if (action === 'edit-entry') openEntry(null, null, button.dataset.id);
  if (action === 'delete-entry' && confirm('Delete this action?')) { state.entries = state.entries.filter((entry) => entry.id !== button.dataset.id); save(); render(); }
  if (action === 'add-section') { sectionActivityId = button.dataset.activity; $('#sectionDialogTitle').textContent = `Add to ${activityById(sectionActivityId)?.name}`; $('#sectionForm').reset(); $('#sectionDialog').showModal(); }
  if (action === 'add-field') { fieldTarget = { activityId: button.dataset.activity, sectionId: button.dataset.section }; $('#fieldDialogTitle').textContent = `Add to ${sectionById(activityById(fieldTarget.activityId), fieldTarget.sectionId)?.name}`; $('#fieldForm').reset(); $('#fieldDialog').showModal(); }
  if (button.dataset.rating) { rating = Number(button.dataset.rating); renderRating(); }
});

$('#entryActivity').addEventListener('change', () => fillSectionOptions());
$('#entrySection').addEventListener('change', () => renderEntryFields());
$('#dynamicFields').addEventListener('input', (event) => { if (event.target.matches('[data-field="strength"], [data-field="minutes"]')) updateCaloriePreview(); });
$('#estimateWeight').addEventListener('input', () => updateCaloriePreview());
$('#entryForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const activity = activityById($('#entryActivity').value);
  const section = sectionById(activity, $('#entrySection').value);
  if (!section) { $('#entryError').textContent = 'Choose an activity and section first.'; $('#entryError').classList.remove('hidden'); return; }
  const values = {};
  document.querySelectorAll('#dynamicFields [data-field]').forEach((input) => { values[input.dataset.field] = input.value; });
  const existing = state.entries.find((entry) => entry.id === editingEntryId);
  const entryDate = $('#entryDate').value;
  if (!entryDate || localDate(parseDate(entryDate)) !== entryDate) { $('#entryError').textContent = 'Choose a valid date for this action.'; $('#entryError').classList.remove('hidden'); return; }
  const weightKg = activity.id === 'exercise' && section.id === 'stepper' ? Number($('#estimateWeight').value) : undefined;
  if (weightKg && (weightKg < 30 || weightKg > 250)) { $('#entryError').textContent = 'Enter a weight between 30 and 250 kg for the calorie estimate.'; $('#entryError').classList.remove('hidden'); return; }
  if (weightKg) state.weightKg = weightKg;
  const entry = { id: existing?.id || uid(), date: entryDate, activityId: activity.id, sectionId: section.id, values, ...(weightKg ? { weightKg } : {}), rating, note: $('#entryNote').value.trim(), createdAt: existing?.createdAt || new Date().toISOString() };
  if (existing) Object.assign(existing, entry); else state.entries.push(entry);
  if (activeView === 'today') selectedDate = entryDate;
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
function openTodo(todoId = null) {
  const todo = state.todos.find((item) => item.id === todoId);
  editingTodoId = todo?.id || null;
  $('#todoForm').reset();
  $('#todoTitle').setCustomValidity('');
  $('#todoDialogTitle').textContent = todo ? 'Edit todo' : 'Add a todo';
  $('#saveTodoButton').textContent = todo ? 'Save changes' : 'Add todo';
  $('#todoDate').value = todo?.date || selectedDate;
  $('#todoTitle').value = todo?.title || '';
  $('#todoDescription').value = todo?.description || '';
  $('#todoDialog').showModal();
}
$('#newTodoButton').addEventListener('click', openTodo);
$('#todoTitle').addEventListener('input', () => $('#todoTitle').setCustomValidity(''));
$('#todoForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const date = $('#todoDate').value;
  const title = $('#todoTitle').value.trim();
  if (!title) { $('#todoTitle').setCustomValidity('Enter a title for this todo.'); $('#todoTitle').reportValidity(); return; }
  $('#todoTitle').setCustomValidity('');
  if (!date || localDate(parseDate(date)) !== date) return;
  const todo = state.todos.find((item) => item.id === editingTodoId);
  if (todo) {
    Object.assign(todo, { date, title, description: $('#todoDescription').value.trim() });
  } else {
    state.todos.push({ id: uid(), date, title, description: $('#todoDescription').value.trim() });
  }
  editingTodoId = null;
  todoTab = 'active';
  save();
  $('#todoDialog').close();
  renderTodos();
});
$('#todoList').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-todo-id]');
  if (!checkbox) return;
  const todo = state.todos.find((item) => item.id === checkbox.dataset.todoId);
  if (!todo) return;
  todo.completed = checkbox.checked;
  save();
  renderTodos();
});
$('#newActivityButton').addEventListener('click', () => { $('#activityForm').reset(); $('#activityDialog').showModal(); });
$('#journalText').addEventListener('input', () => {
  const journal = journalForDate(selectedDate);
  $('#journalSaveStatus').textContent = journal?.savedAt
    ? `Unsaved changes · last saved ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(journal.savedAt))}`
    : 'Unsaved changes';
});
$('#saveJournalButton').addEventListener('click', () => {
  const content = $('#journalText').value;
  const existing = journalForDate(selectedDate);
  if (!content.trim()) {
    if (existing) state.journals = state.journals.filter((journal) => journal.date !== selectedDate);
  } else if (existing) {
    Object.assign(existing, { content, savedAt: new Date().toISOString() });
  } else {
    state.journals.push({ date: selectedDate, content, savedAt: new Date().toISOString() });
  }
  save();
  renderJournal();
});
window.addEventListener('beforeunload', (event) => {
  if (activeView === 'journal' && journalIsDirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
$('#journalDate').addEventListener('change', (event) => {
  if (!event.target.value) return;
  if (journalIsDirty() && !confirm('You have unsaved journal changes. Leave without saving?')) {
    event.target.value = selectedDate;
    return;
  }
  selectedDate = event.target.value;
  renderJournal();
});
function shiftJournalDate(offset) {
  if (journalIsDirty() && !confirm('You have unsaved journal changes. Leave without saving?')) return;
  const date = parseDate(selectedDate);
  date.setDate(date.getDate() + offset);
  selectedDate = localDate(date);
  renderJournal();
}
$('#journalPreviousDay').addEventListener('click', () => shiftJournalDate(-1));
$('#journalNextDay').addEventListener('click', () => shiftJournalDate(1));
$('#journalJumpToday').addEventListener('click', () => {
  if (journalIsDirty() && !confirm('You have unsaved journal changes. Leave without saving?')) return;
  selectedDate = localDate();
  renderJournal();
});
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
$('#importButton').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('The selected file is larger than 10 MB.');
    const imported = JSON.parse(await file.text());
    const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const validActivity = (activity) => isRecord(activity) && typeof activity.id === 'string' && typeof activity.name === 'string'
      && Array.isArray(activity.sections) && activity.sections.every((section) => isRecord(section) && typeof section.id === 'string'
        && typeof section.name === 'string' && Array.isArray(section.fields)
        && section.fields.every((field) => isRecord(field) && typeof field.id === 'string' && typeof field.name === 'string'));
    const validEntry = (entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.date === 'string'
      && typeof entry.activityId === 'string' && typeof entry.sectionId === 'string'
      && (entry.values === undefined || isRecord(entry.values));
    const validTodo = (todo) => isRecord(todo) && typeof todo.id === 'string' && typeof todo.date === 'string'
      && typeof todo.title === 'string';
    const validJournal = (journal) => isRecord(journal) && typeof journal.date === 'string'
      && typeof journal.content === 'string' && (journal.savedAt === undefined || typeof journal.savedAt === 'string');
    if (!isRecord(imported) || !Array.isArray(imported.activities) || !imported.activities.every(validActivity)
      || !Array.isArray(imported.entries) || !imported.entries.every(validEntry)
      || (imported.todos !== undefined && (!Array.isArray(imported.todos) || !imported.todos.every(validTodo)))
      || (imported.journals !== undefined && (!Array.isArray(imported.journals) || !imported.journals.every(validJournal)))) {
      throw new Error('This file does not look like a valid Daywell export.');
    }
    const action = state.entries.length || state.todos.length || state.journals.length
      ? `This will replace the data currently saved in this browser with ${imported.entries.length} actions, ${(imported.todos || []).length} todos, and ${(imported.journals || []).length} journal entries. Continue?`
      : `Import ${imported.entries.length} actions, ${(imported.todos || []).length} todos, and ${(imported.journals || []).length} journal entries into this browser?`;
    if (!confirm(action)) return;
    state = { ...imported, weightKg: Number(imported.weightKg) > 0 ? Number(imported.weightKg) : 70, todos: imported.todos || [], journals: imported.journals || [] };
    selectedDate = localDate();
    save();
    render();
    alert('Daywell data imported successfully.');
  } catch (error) {
    alert(`Could not import this file: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});
render();
