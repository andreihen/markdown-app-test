// Please replace with your own CLIENT_ID and API_KEY from Google Cloud Console
const CLIENT_ID = '716832953958-rj4vgkdk7ftn03lbrs4h2or9v2di16e6.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDc7g27_P5QnUwBdsnsMTlmXG2Yr3IGfAM';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let gapiInited = false;
let gisInited = false;
let tokenClient;
let currentFile = null;
let currentFolderId = null; // pasta atual
let rootFolderId = null; // raiz da aplicação

// ELEMENTOS
const authButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const fileListContainer = document.getElementById('file-list');
const editorContainer = document.getElementById('editor-container');
const previewContainer = document.getElementById('preview-container');
const welcomeScreen = document.getElementById('welcome-screen');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const saveButton = document.getElementById('save-file-button');
const newFileButton = document.getElementById('new-file-button');
const userInfo = document.getElementById('user-info');
const loadingSpinner = document.getElementById('loading');

// ---------- AUTENTICAÇÃO ----------
function gapiLoad() {
  gapi.load('client', intializeGapiClient);
}

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
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: DISCOVERY_DOCS,
  });
  gapiInited = true;
  maybeEnableAuthButton();
}

function maybeEnableAuthButton() {
  if (gapiInited && gisInited) {
    authButton.style.display = 'block';
  }
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    showAuthenticatedUI();
    rootFolderId = await getAppFolderId();
    currentFolderId = rootFolderId;
    await listDriveItems(rootFolderId);
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    showSignedOutUI();
  }
}

// ---------- UI ----------
function showAuthenticatedUI() {
  authButton.style.display = 'none';
  signoutButton.style.display = 'block';
  welcomeScreen.style.display = 'none';
  editorContainer.style.display = 'flex';
  previewContainer.style.display = 'flex';
}

function showSignedOutUI() {
  authButton.style.display = 'block';
  signoutButton.style.display = 'none';
  welcomeScreen.style.display = 'flex';
  editorContainer.style.display = 'none';
  previewContainer.style.display = 'none';
  userInfo.style.display = 'none';
  saveButton.style.display = 'none';
  currentFile = null;
}

// ---------- DRIVE ----------
async function getAppFolderId() {
  const APP_FOLDER_NAME = 'Markdown Editor App';
  try {
    const response = await gapi.client.drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${APP_FOLDER_NAME}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
    });
    const folder = response.result.files[0];
    if (folder) return folder.id;

    const newFolder = await gapi.client.drive.files.create({
      resource: {
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    return newFolder.result.id;
  } catch (error) {
    console.error('Erro ao criar pasta app:', error);
    return null;
  }
}

// Lista arquivos e pastas
async function listDriveItems(folderId) {
  fileListContainer.innerHTML = '';
  loadingSpinner.style.display = 'block';
  try {
    const response = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, mimeType)',
    });

    if (folderId !== rootFolderId) {
      const backBtn = document.createElement('div');
      backBtn.textContent = '⬅ Voltar';
      backBtn.classList.add('p-2', 'bg-gray-200', 'rounded-lg', 'cursor-pointer', 'hover:bg-gray-300');
      backBtn.addEventListener('click', () => navigateUp(folderId));
      fileListContainer.appendChild(backBtn);
    }

    if (response.result.files.length === 0) {
      fileListContainer.innerHTML += '<p class="text-gray-500 text-sm">Nenhum item encontrado.</p>';
    } else {
      response.result.files.forEach(file => {
        const el = document.createElement('div');
        el.classList.add('p-2', 'bg-white', 'rounded-lg', 'shadow-sm', 'cursor-pointer', 'hover:bg-gray-100');

        el.textContent = file.name;
        el.dataset.fileId = file.id;

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          el.addEventListener('click', () => {
            currentFolderId = file.id;
            listDriveItems(file.id);
          });
        } else if (file.mimeType === 'text/markdown') {
          el.addEventListener('click', () => loadFile(file.id));
        }
        fileListContainer.appendChild(el);
      });
    }
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
  } finally {
    loadingSpinner.style.display = 'none';
  }
}

async function navigateUp(folderId) {
  try {
    const response = await gapi.client.drive.files.get({
      fileId: folderId,
      fields: 'parents',
    });
    if (response.result.parents) {
      currentFolderId = response.result.parents[0];
      await listDriveItems(currentFolderId);
    }
  } catch (error) {
    console.error('Erro ao voltar:', error);
  }
}

// Carregar arquivo
async function loadFile(fileId) {
  try {
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });
    editor.value = response.body;
    updatePreview();
    currentFile = fileId;
    saveButton.style.display = 'block';
    editor.focus();
  } catch (error) {
    console.error('Erro ao carregar arquivo:', error);
  }
}

// Salvar arquivo
async function saveFile() {
  if (!currentFile) return alert('Nenhum arquivo aberto.');
  const content = editor.value;
  const file = new Blob([content], { type: 'text/markdown' });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: `documento-${Date.now()}.md` })], { type: 'application/json' }));
  form.append('file', file);

  try {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${currentFile}?uploadType=multipart&alt=json`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${gapi.client.getToken().access_token}` },
      body: form,
    });
    alert('Arquivo salvo!');
  } catch (error) {
    console.error('Erro ao salvar arquivo:', error);
  }
}

// Criar novo arquivo
async function createNewFile() {
  const name = prompt("Nome do arquivo (ex: notas.md):");
  if (!name || !name.endsWith('.md')) return alert('Nome inválido.');

  const content = `# ${name.replace('.md', '')}\n\nComece a escrever aqui...`;
  const file = new Blob([content], { type: 'text/markdown' });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: name,
    mimeType: 'text/markdown',
    parents: [currentFolderId]
  })], { type: 'application/json' }));
  form.append('file', file);

  try {
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&alt=json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${gapi.client.getToken().access_token}` },
      body: form,
    });
    const result = await response.json();
    await listDriveItems(currentFolderId);
    loadFile(result.id);
  } catch (error) {
    console.error('Erro ao criar arquivo:', error);
  }
}

// ---------- PREVIEW ----------
function updatePreview() {
  preview.innerHTML = marked.parse(editor.value);
}

// ---------- EVENTOS ----------
window.onload = function () {
  gapiLoad();
  gisLoad();
  authButton.addEventListener('click', handleAuthClick);
  signoutButton.addEventListener('click', handleSignoutClick);
  editor.addEventListener('input', updatePreview);
  saveButton.addEventListener('click', saveFile);
  newFileButton.addEventListener('click', createNewFile);
};
