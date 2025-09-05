// ===== CONFIG =====
const CLIENT_ID = '716832953958-rj4vgkdk7ftn03lbrs4h2or9v2di16e6.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDc7g27_P5QnUwBdsnsMTlmXG2Yr3IGfAM';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let gapiInited = false;
let gisInited = false;
let tokenClient;
let currentFile = null;
let currentFolderId = null;
let rootFolderId = null;
let loadedChildren = new Set();

// ===== ELEMENTOS =====
const authButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const editorContainer = document.getElementById('editor-container');
const previewContainer = document.getElementById('preview-container');
const welcomeScreen = document.getElementById('welcome-screen');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const saveButton = document.getElementById('save-file-button');
const newFileButton = document.getElementById('new-file-button');
const folderTree = document.getElementById('folder-tree');
const currentRoot = document.getElementById('current-root');
const selectRootBtn = document.getElementById('select-root-button');
const folderModal = document.getElementById('folder-modal');
const modalTree = document.getElementById('modal-tree');
const closeFolderModalBtn = document.getElementById('close-folder-modal');

// ===== AUTENTICAÇÃO =====
function gapiLoad() { gapi.load('client', intializeGapiClient); }
function gisLoad() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  gisInited = true;
  maybeEnableAuthButton();
}
async function intializeGapiClient() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
  gapiInited = true; maybeEnableAuthButton();
}
function maybeEnableAuthButton() { if (gapiInited && gisInited) authButton.style.display = 'block'; }

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    showAuthenticatedUI();
    const savedRoot = localStorage.getItem('mdRootFolderId');
    if (savedRoot) {
      rootFolderId = savedRoot; currentFolderId = savedRoot;
      await renderRootLabel(savedRoot);
      await renderTree(rootFolderId, folderTree, true);
    } else openFolderModal();
  };
  if (gapi.client.getToken() === null) tokenClient.requestAccessToken({ prompt: 'consent' });
  else tokenClient.requestAccessToken({ prompt: '' });
}
function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    showSignedOutUI();
  }
}

// ===== UI =====
function showAuthenticatedUI() {
  authButton.style.display = 'none';
  signoutButton.style.display = 'block';
  welcomeScreen.style.display = 'none';
  editorContainer.style.display = 'flex';
  previewContainer.style.display = 'flex';
  currentRoot.classList.remove('hidden');
}
function showSignedOutUI() {
  authButton.style.display = 'block';
  signoutButton.style.display = 'none';
  welcomeScreen.style.display = 'flex';
  editorContainer.style.display = 'none';
  previewContainer.style.display = 'none';
  saveButton.style.display = 'none';
  currentFile = null;
  currentRoot.classList.add('hidden');
  folderTree.innerHTML = '';
}

// ===== DRIVE =====
async function getFileMetadata(id) {
  const res = await gapi.client.drive.files.get({ fileId: id, fields: 'id, name, mimeType, parents' });
  return res.result;
}
async function listChildren(folderId, includeFiles = true) {
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await gapi.client.drive.files.list({
    q, spaces: 'drive', fields: 'files(id, name, mimeType)', pageSize: 1000,
  });
  const folders = res.result.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  let files = [];
  if (includeFiles) files = res.result.files.filter(f => f.mimeType === 'text/markdown' || f.name?.toLowerCase().endsWith('.md'));
  folders.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  files.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  return { folders, files };
}

// ===== TREE =====
function makeNode({ id, name, type }) {
  const node = document.createElement('div');
  node.className = 'tree-node'; node.dataset.id = id; node.dataset.type = type;

  const toggle = document.createElement('span');
  toggle.className = 'toggle'; toggle.textContent = type === 'folder' ? '▶' : '';
  node.appendChild(toggle);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name ' + (type === 'file' ? 'file' : '');
  nameSpan.textContent = name; node.appendChild(nameSpan);

  if (type === 'folder') {
    const useBtn = document.createElement('button');
    useBtn.className = 'text-[10px] px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100';
    useBtn.textContent = 'Usar esta pasta';
    useBtn.addEventListener('click', async (e) => { e.stopPropagation(); await setAsRoot(id, name); });
    node.appendChild(useBtn);
  } else {
    nameSpan.addEventListener('click', () => loadFile(id));
  }

  const childrenWrap = document.createElement('div');
  childrenWrap.className = 'children hidden'; node.appendChild(childrenWrap);

  if (type === 'folder') {
    toggle.addEventListener('click', async () => {
      const opened = !childrenWrap.classList.contains('hidden');
      if (opened) { childrenWrap.classList.add('hidden'); toggle.textContent = '▶'; }
      else {
        toggle.textContent = '▼'; childrenWrap.classList.remove('hidden');
        const key = `loaded:${id}`;
        if (!loadedChildren.has(key)) {
          const { folders, files } = await listChildren(id, true);
          folders.forEach(f => childrenWrap.appendChild(makeNode({ id: f.id, name: f.name, type: 'folder' })));
          files.forEach(f => childrenWrap.appendChild(makeNode({ id: f.id, name: f.name, type: 'file' })));
          loadedChildren.add(key);
        }
      }
    });
  }
  return node;
}
async function renderTree(rootId, container, clear = false) {
  if (clear) container.innerHTML = '';
  const meta = await getFileMetadata(rootId);
  const rootNode = makeNode({ id: meta.id, name: meta.name || 'Pasta', type: 'folder' });
  container.appendChild(rootNode);
}
async function setAsRoot(folderId, name) {
  rootFolderId = folderId; currentFolderId = folderId;
  localStorage.setItem('mdRootFolderId', folderId);
  await renderRootLabel(folderId, name);
  loadedChildren.clear(); folderTree.innerHTML = '';
  await renderTree(rootFolderId, folderTree, true);
}
async function renderRootLabel(folderId, knownName) {
  let name = knownName;
  if (!name) { try { const meta = await getFileMetadata(folderId); name = meta.name; } catch {} }
  currentRoot.textContent = name ? `Raiz: ${name}` : `Raiz definida`;
}

// ===== ARQUIVOS =====
async function loadFile
