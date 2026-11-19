import {EditorState, Compartment} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, highlightSpecialChars} from '@codemirror/view';
import {history, historyKeymap, defaultKeymap, indentWithTab} from '@codemirror/commands';
import {bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, defaultHighlightStyle} from '@codemirror/language';
import {python} from '@codemirror/lang-python';
import {oneDark} from '@codemirror/theme-one-dark';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
const prefix = 'atelier-nsi-2025/';
let storageAvailable = true;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(prefix + key, JSON.stringify(value)); }
  catch { storageAvailable = false; }
}

let catalogue = [];
let subject, details;
let exercise = 0, page = 0;
const briefs = new Map();
let drafts = read('brouillons', {});
let simulation = read('simulation', null);
let textMode = read('texte', false);
let selection = 0, timerId, currentRun, worker, ready = false;
let saveTimer, awaitingSubject = false;
const editorTheme = new Compartment();
const consoleLog = new Map();
const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const key = () => subject && subject.id + '-' + (exercise + 1);
const active = () => details?.exercises[exercise];
const root = info => './sujets/' + info.id + '/';

const editor = new EditorView({state: createEditorState(''), parent: $('editor')});

function editorAppearance() {
  return document.documentElement.dataset.theme === 'projecteur'
    ? [syntaxHighlighting(defaultHighlightStyle)] : [oneDark];
}

function createEditorState(doc) {
  return EditorState.create({doc, extensions: [
    lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), highlightActiveLine(),
    highlightSpecialChars(), indentOnInput(), bracketMatching(),
    python(), indentUnit.of("    "), EditorState.tabSize.of(4),
    EditorView.contentAttributes.of({'aria-label':'Code Python', spellcheck:'false'}),
    editorTheme.of(editorAppearance()),
    keymap.of([{key:'Mod-Enter', run: () => { start(false); return true; }}, indentWithTab, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of(update => { if (update.docChanged && active()) onEdit(update.state.doc.toString()); })
  ]});
}

function onEdit(code) {
  const id = key();
  const old = drafts[id];
  const hadProgress = old?.passed || (!old?.code && code !== active().starter);
  drafts[id] = {...old, code, passed:false};
  if (hadProgress) renderCatalogue();
  if (consoleLog.get(id)?.results) {
    consoleLog.set(id, {text:'Le code a changé. Relancez les vérifications.'});
    showLog();
  }
  ui.saved.textContent = 'Enregistrement…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistDrafts, 200);
}

function persistDrafts() {
  clearTimeout(saveTimer);
  write('brouillons', drafts);
  ui.saved.textContent = storageAvailable ? 'Brouillon enregistré ici' : 'Sauvegarde indisponible · exportez le .py';
}

function filtered() {
  const query = normalize(ui.search.value.trim());
  const selectedTheme = $('theme-filter').value;
  const compact = query.replace(/^sujet\s*/, '');
  return catalogue.filter(entry => {
    const searchable = normalize([entry.theme, ...entry.titles, 'sujet ' + entry.id, '25-nsi-' + entry.id].join(' '));
    return (!selectedTheme || selectedTheme === entry.theme) &&
      (!query || searchable.includes(query) || (/^\d+$/.test(compact) && Number(compact) === Number(entry.id)));
  });
}

function workStatus(id) {
  const a = drafts[id + '-1'], b = drafts[id + '-2'];
  if (a?.passed && b?.passed) return 'passed';
  if (a?.passed || b?.passed || a?.code !== undefined || b?.code !== undefined) return 'in-progress';
  return '';
}

function renderCatalogue() {
  const list = filtered();
  const grid = $('subject-grid');
  const focusedId = grid.contains(document.activeElement) && document.activeElement.dataset.subject;
  const buttons = list.map(entry => {
    const button = document.createElement('button');
    const status = workStatus(entry.id);
    const active = entry.id === subject?.id;
    button.type = 'button';
    button.className = 'subject-num ' + status;
    button.dataset.subject = entry.id;
    button.textContent = entry.id;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', 'Sujet ' + entry.id + ' · ' + entry.titles.join(' et '));
    button.title = entry.titles.join(' · ');
    button.disabled = !!simulation && !active;
    button.onclick = () => openSubject(entry);
    return button;
  });
  grid.replaceChildren(...buttons);
  if (focusedId) buttons.find(button => button.dataset.subject === focusedId)?.focus({preventScroll:true});
  $('no-subjects').hidden = !!list.length;
  ui.random.disabled = !list.length || !!simulation;
  const total = Object.values(drafts).filter(draft => draft.passed).length;
  ui.progress.value = total;
  $('progress-label').textContent = total + ' / 96';
}

function fetchJson(url) {
  return fetch(url).then(response => {
    if (!response.ok) throw new Error('Chargement impossible (' + response.status + ').');
    return response.json();
  });
}

async function openSubject(entry, nextExercise = 0, returnFocus = false) {
  if (!entry || (simulation && entry.id !== simulation.subject)) return;
  const request = ++selection;
  if (currentRun) cancel('Exécution interrompue.');
  awaitingSubject = true;
  persistDrafts();
  controls();
  try {
    if (!briefs.has(entry.id)) {
      briefs.set(entry.id, fetchJson(root(entry) + 'atelier.json').catch(error => {
        briefs.delete(entry.id);
        throw error;
      }));
    }
    const resource = await briefs.get(entry.id);
    if (request !== selection) return;
    subject = entry;
    write('dernier-sujet', entry.id);
    details = resource;
    $('boot-error').hidden = true;
    $('subject-meta').textContent = 'SUJET ' + entry.id + ' · SESSION 2025';
    $('subject-heading').textContent = 'Sujet ' + entry.id + ' · ' + entry.theme;
    ui.title1.textContent = entry.titles[0];
    ui.title2.textContent = entry.titles[1];
    $('pdf-link').href = root(entry) + entry.pdf;
    $('source-link').href = root(entry) + entry.python;
    renderCatalogue();
    awaitingSubject = false;
    selectExercise(nextExercise);
    if (returnFocus) $('workspace').focus();
  } catch (error) {
    if (request !== selection) return;
    awaitingSubject = false;
    $('boot-error').textContent = 'Le sujet n’a pas pu être ouvert. ' + error.message;
    $('boot-error').hidden = false;
    controls();
  }
}

function selectExercise(index) {
  if (!details || awaitingSubject) return;
  if (currentRun) cancel('Exécution interrompue.');
  exercise = index;
  page = 0;
  const record = drafts[key()];
  editor.setState(createEditorState(record?.code ?? active().starter));
  ui.stdin.value = record?.stdin ?? '';
  ui.saved.textContent = !storageAvailable ? 'Sauvegarde indisponible · exportez le .py'
    : record ? 'Brouillon enregistré ici' : 'Brouillon local';
  ui.ex1.setAttribute('aria-pressed', String(index === 0));
  ui.ex2.setAttribute('aria-pressed', String(index === 1));
  updatePage();
  showLog();
  controls();
  historyReplace();
}

function historyReplace() {
  const hash = '#sujet-' + subject.id + '-exercice-' + (exercise + 1);
  try { window.history.replaceState(null, '', hash); } catch { /* aperçu intégré */ }
}

function updatePage() {
  if (!active()) return;
  const item = active().pages[page];
  const total = active().pages.length;
  const image = $('paper-image');
  image.alt = 'Fac-similé du sujet ' + subject.id + ', page ' + item.number;
  if (!textMode) image.src = root(subject) + item.number + '.webp';
  image.hidden = textMode;
  $('zoom-paper').hidden = textMode;
  $('paper-text').textContent = item.text || 'Page sans texte. Consultez le fac-similé ou le PDF.';
  $('paper-text').hidden = !textMode;
  $('text-mode').setAttribute('aria-pressed', String(textMode));
  $('text-mode').textContent = textMode ? 'Fac-similé' : 'Texte';
  $('page-info').textContent = 'Page ' + (page + 1) + ' / ' + total + ' · PDF p. ' + item.number;
  $('prev-page').disabled = page === 0;
  $('next-page').disabled = page === total - 1;
  $('paper-view').scrollTo(0, 0);
}

function showLog() {
  const entry = consoleLog.get(key());
  ui.output.textContent = entry?.text ?? 'La sortie de votre programme s’affichera ici.';
  ui.output.classList.toggle('has-error', !!entry?.error);
  ui.feedback.replaceChildren();
  ui.feedback.className = '';
  if (entry?.results && !simulation) {
    const results = entry.results;
    const count = results.filter(item => item.pass).length;
    const summary = document.createElement('strong');
    summary.textContent = count + ' / ' + results.length + ' vérifications réussies';
    const list = document.createElement('ul');
    results.forEach((item, index) => {
      const row = document.createElement('li');
      const test = active().tests[index];
      row.className = item.pass ? 'ok' : 'failed';
      const label = document.createElement('span');
      label.textContent = (item.pass ? 'Réussi · ' : 'À revoir · ') + (test.label || test.expr);
      row.append(label);
      if (!item.pass) {
        const detail = document.createElement('small');
        detail.textContent = item.error || 'Attendu ' + item.expected + ' · obtenu ' + item.actual;
        row.append(detail);
      }
      list.append(row);
    });
    ui.feedback.className = count === results.length ? 'feedback-ok' : 'feedback-warn';
    ui.feedback.append(summary, list);
  }
}

function controls() {
  const unavailable = !active() || awaitingSubject;
  ui.run.disabled = unavailable || !!currentRun;
  ui.check.disabled = unavailable || !!currentRun;
  ui.check.hidden = !!simulation;
  ui.stop.hidden = !currentRun;
  ui.reset.disabled = unavailable || !!currentRun;
  ui.export.disabled = unavailable;
  ui.simulation.disabled = unavailable;
  ui.ex1.disabled = unavailable;
  ui.ex2.disabled = unavailable;
}

function runtimeStatus(message, kind = '') {
  $('runtime-label').textContent = message;
  $('runtime-dot').dataset.state = kind;
}

function closeWorker() {
  worker?.terminate();
  worker = null;
  ready = false;
}

function cancel(message, error = false) {
  if (!currentRun) return;
  const job = currentRun;
  clearTimeout(job.timeout);
  currentRun = null;
  closeWorker();
  consoleLog.set(job.key, {text:message, error});
  showLog();
  runtimeStatus('Python prêt à redémarrer');
  controls();
}

function submit() {
  const job = currentRun;
  if (!job) return;
  clearTimeout(job.timeout);
  job.timeout = setTimeout(() => cancel('Exécution arrêtée après 8 secondes. Vérifiez les conditions de vos boucles et les cas d’arrêt de vos fonctions.', true), 8000);
  runtimeStatus('Exécution en cours', 'busy');
  worker.postMessage({type:'run', code:job.code, stdin:job.stdin, cases:job.tests});
}

function workerMessage(event) {
  if (event.currentTarget !== worker || !currentRun) return;
  const data = event.data;
  if (data.type === 'ready') { ready = true; submit(); return; }
  if (data.type === 'init-error') {
    cancel('Le moteur Python n’a pas démarré. Relancez l’exécution depuis une adresse HTTP ou HTTPS.\n' + data.error, true);
    return;
  }
  if (data.type !== 'result') return;
  const job = currentRun;
  currentRun = null;
  clearTimeout(job.timeout);
  const error = !!data.error;
  let text = data.output || '';
  if (error) {
    text += (text ? '\n' : '') + data.error;
    if (data.error.includes('EOFError')) text += '\nAjoutez une valeur par appel à input() dans « Valeurs pour input() ».';
    if (data.error.includes('SyntaxError') && job.code.includes('...')) text += '\nVérifiez les pointillés du code fourni · certaines lignes doivent être complétées avant que Python puisse exécuter le fichier.';
  }
  const sameCode = editor.state.doc.toString() === job.code;
  const results = job.tests.length && !error && sameCode ? data.results : null;
  if (!sameCode) text = 'Le code a changé pendant l’exécution. Relancez le programme.\n' + text;
  if (results?.length && results.every(item => item.pass)) {
    drafts[job.key] = {...drafts[job.key], code:job.code, passed:true};
    persistDrafts();
    renderCatalogue();
  }
  consoleLog.set(job.key, {
    text: text || (results ? 'Aucun affichage produit par le programme.' : 'Exécution terminée. Pour afficher une valeur, utilisez print(…).'),
    error, results
  });
  runtimeStatus('Moteur Python prêt', 'ready');
  showLog();
  controls();
}

function start(checking) {
  if (!active() || awaitingSubject || currentRun || (checking && simulation)) return;
  const job = {key:key(), code:editor.state.doc.toString(), stdin:ui.stdin.value, tests:checking ? active().tests : []};
  currentRun = job;
  consoleLog.set(job.key, {text:checking ? 'Vérification du code…' : 'Démarrage de l’exécution…'});
  controls();
  showLog();
  if (ready) { submit(); return; }
  runtimeStatus('Chargement du moteur Python…', 'busy');
  job.timeout = setTimeout(() => cancel('Le moteur Python met trop de temps à démarrer. Vous pouvez réessayer.', true), 28000);
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url));
    worker.onmessage = workerMessage;
    worker.onerror = event => {
      if (event.currentTarget === worker) cancel('Le moteur Python a cessé de répondre. Relancez l’exécution.', true);
    };
    worker.postMessage({type:'init'});
  } catch {
    cancel('Le navigateur ne peut pas lancer le moteur Python. Ouvrez cet atelier depuis un serveur HTTP ou HTTPS.', true);
  }
}

function ask(title, paragraphs, confirm = '') {
  $('dialog-title').textContent = title;
  $('dialog-body').replaceChildren(...paragraphs.map(text => Object.assign(document.createElement('p'), {textContent:text})));
  $('dialog-confirm').hidden = !confirm;
  $('dialog-confirm').textContent = confirm;
  $('dialog-cancel').textContent = confirm ? 'Annuler' : 'Fermer';
  ui.dialog.returnValue = '';
  ui.dialog.showModal();
  return new Promise(resolve => ui.dialog.addEventListener('close', () => resolve(ui.dialog.returnValue === 'ok'), {once:true}));
}

function refreshTimer() {
  if (!simulation) return;
  const left = Math.max(0, Math.ceil((simulation.deadline - Date.now()) / 1000));
  const pad = number => String(number).padStart(2, '0');
  ui.timer.textContent = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
  ui.timer.classList.toggle('timer-low', left < 300);
  ui.simulation.textContent = left ? 'Terminer la simulation' : 'Temps écoulé · Terminer';
}

function renderSimulation() {
  clearInterval(timerId);
  ui.timer.hidden = !simulation;
  ui.simulation.classList.toggle('simulation-active', !!simulation);
  if (simulation) {
    refreshTimer();
    timerId = setInterval(refreshTimer, 250);
  } else {
    ui.simulation.textContent = 'Simulation · 1 h';
  }
  renderCatalogue();
  showLog();
  controls();
}

function download() {
  if (!active()) return;
  const blob = new Blob([editor.state.doc.toString()], {type:'text/x-python;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {href:url, download:key() + '-solution.py'});
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyTheme(theme) {
  if (!['clair', 'sombre', 'projecteur'].includes(theme)) theme = 'clair';
  document.documentElement.dataset.theme = theme;
  ui.theme.value = theme;
  editor.dispatch({effects:editorTheme.reconfigure(editorAppearance())});
}

function mobile(mode) {
  ui.split.dataset.mobile = mode;
  $('show-statement').setAttribute('aria-pressed', String(mode === 'statement'));
  $('show-code').setAttribute('aria-pressed', String(mode === 'code'));
}

function fromHash() {
  const hash = location.hash.match(/^#sujet-(\d{2})-exercice-([12])$/);
  return {id:simulation?.subject ?? hash?.[1] ?? read('dernier-sujet', '01'), ex:(Number(hash?.[2]) || 1) - 1};
}

ui.search.addEventListener('input', renderCatalogue);
$('theme-filter').onchange = renderCatalogue;
ui.random.onclick = () => {
  const list = filtered();
  const pool = list.length > 1 ? list.filter(entry => entry.id !== subject?.id) : list;
  openSubject(pool[Math.floor(Math.random() * pool.length)], 0, true);
};
ui.ex1.onclick = () => selectExercise(0);
ui.ex2.onclick = () => selectExercise(1);
$('prev-page').onclick = () => { page--; updatePage(); };
$('next-page').onclick = () => { page++; updatePage(); };
$('text-mode').onclick = () => { textMode = !textMode; write('texte', textMode); updatePage(); };
$('zoom-paper').onclick = () => {
  const view = $('paper-view');
  const zoom = view.classList.toggle('zoomed');
  $('zoom-paper').setAttribute('aria-pressed', String(zoom));
  $('zoom-paper').textContent = zoom ? '−' : '+';
  view.scrollTo(0, 0);
};
$('paper-image').onerror = () => { $('paper-image').alt = 'Fac-similé indisponible. Ouvrez le PDF ou passez en mode Texte.'; };
$('show-statement').onclick = () => mobile('statement');
$('show-code').onclick = () => mobile('code');
ui.theme.onchange = () => { applyTheme(ui.theme.value); write('theme', ui.theme.value); };
ui.run.onclick = () => start(false);
ui.check.onclick = () => start(true);
ui.stop.onclick = () => cancel('Exécution arrêtée.');
ui.export.onclick = download;
$('clear-output').onclick = () => { consoleLog.delete(key()); showLog(); };
ui.reset.onclick = async () => {
  if (!active()) return;
  if (!await ask('Réinitialiser cet exercice ?', ['Le brouillon de cet exercice sera remplacé par le code de départ. Pensez à l’exporter si vous souhaitez le conserver.'], 'Réinitialiser')) return;
  delete drafts[key()];
  consoleLog.delete(key());
  persistDrafts();
  selectExercise(exercise);
  renderCatalogue();
};
ui.stdin.oninput = () => {
  if (!active()) return;
  drafts[key()] = {...drafts[key()], stdin:ui.stdin.value};
  persistDrafts();
};
ui.simulation.onclick = async () => {
  if (!subject) return;
  if (simulation) {
    if (!await ask('Terminer la simulation ?', ['Vous pourrez de nouveau changer de sujet et lancer les vérifications. Vos brouillons restent disponibles.'], 'Terminer')) return;
    simulation = null;
  } else {
    if (!await ask('Démarrer une simulation d’une heure ?', ['Le chronomètre démarre sur le sujet ' + subject.id + '. Vous pouvez travailler sur ses deux exercices, exécuter votre code et l’exporter. Les vérifications sont masquées jusqu’à la fin de la simulation.'], 'Démarrer')) return;
    if (currentRun?.tests.length) cancel('Vérification interrompue.');
    simulation = {subject:subject.id, deadline:Date.now() + 3600000};
  }
  write('simulation', simulation);
  renderSimulation();
};
ui.help.onclick = () => ask('Utiliser l’atelier', [
  'Sélectionnez un numéro de sujet, puis un exercice. Les boutons sous l’énoncé permettent de parcourir ses pages. Le PDF original contient aussi les schémas et la couverture.',
  'Dans l’éditeur, Ctrl ou ⌘ + Entrée exécute le code. Pour appeler une fonction, ajoutez une instruction comme print(ma_fonction(…)) en fin de fichier. Renseignez les entrées à l’avance dans « Valeurs pour input() ».',
  '« Vérifier » compare votre code à quelques exemples et cas de l’atelier. L’épreuve couvre aussi le respect des consignes et le choix des algorithmes.',
  'Vos brouillons et votre progression sont enregistrés sur ce navigateur. « Exporter .py » télécharge le code de l’exercice actif.'
]);
window.addEventListener('pagehide', persistDrafts);
window.addEventListener('hashchange', () => {
  const {id, ex} = fromHash();
  openSubject(catalogue.find(entry => entry.id === id), ex);
});

applyTheme(read('theme', 'clair'));
controls();
fetchJson('./catalogue.json').then(async items => {
  catalogue = items;
  for (const name of [...new Set(items.map(entry => entry.theme))].sort((a, b) => a.localeCompare(b, 'fr'))) {
    $('theme-filter').add(new Option(name, name));
  }
  const {id, ex} = fromHash();
  await openSubject(items.find(entry => entry.id === id) ?? items[0], ex);
  renderSimulation();
}).catch(error => {
  $('boot-error').textContent = 'Le catalogue ne s’est pas chargé. Ouvrez l’atelier depuis un serveur HTTP ou HTTPS. ' + error.message;
  $('boot-error').hidden = false;
});
