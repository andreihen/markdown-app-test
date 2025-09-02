// Please replace with your own CLIENT_ID and API_KEY from Google Cloud Console
const CLIENT_ID = '716832953958-rj4vgkdk7ftn03lbrs4h2or9v2di16e6.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDc7g27_P5QnUwBdsnsMTlmXG2Yr3IGfAM';

// The scope is set to full Drive access to handle creating, reading, and writing files.
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive';
const APP_FOLDER_NAME = 'Markdown Editor App';

// UI elements
const authButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const mainContent = document.getElementById('main-content');
const welcomeScreen = document.getElementById('welcome-screen');
const fileListContainer = document.getElementById('file-list');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const saveButton = document.getElementById('save-file-button');
const newFileButton = document.getElementById('new-file-button');
const userInfo = document.getElementById('user-info');
const loadingSpinner = document.getElementById('loading');
const backButton = document.getElementById('back-button');

// State variables
let gapiInited = false;
let gisInited = false;
let tokenClient;
let currentFile = null;
let currentFolderId = 'root';
let folderStack = [];

// Load the Google API client library
function gapiLoad() {
    gapi.load('client', intializeGapiClient);
}

// Load the Google Identity Services library
function gisLoad() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableAuthButton();
}

// Initialize the GAPI client
async function intializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableAuthButton();
}

// Enable the auth button once libraries are loaded
function maybeEnableAuthButton() {
    if (gapiInited && gisInited) {
        authButton.style.display = 'block';
    }
}

// Handle authentication click
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Authentication error:', resp.error);
            alert('Erro de autenticação. Por favor, tente novamente.');
            return;
        }
        showAuthenticatedUI();
        await listFolderContents(currentFolderId);
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

// Handle sign out click
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        showSignedOutUI();
    }
}

// Display authenticated UI
async function showAuthenticatedUI() {
    authButton.style.display = 'none';
    signoutButton.style.display = 'block';
    welcomeScreen.style.display = 'none';
    mainContent.style.display = 'flex';
    
    // Get user info
    try {
        const user = await gapi.client.oauth2.userinfo.get();
        userInfo.textContent = `Olá, ${user.result.name}`;
        userInfo.style.display = 'inline';
    } catch (err) {
        console.error('Error fetching user info:', err);
    }
}

// Display signed out UI
function showSignedOutUI() {
    authButton.style.display = 'block';
    signoutButton.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    mainContent.style.display = 'none';
    userInfo.style.display = 'none';
    saveButton.style.display = 'none';
    currentFile = null;
    editor.value = '';
    preview.innerHTML = '';
    currentFolderId = 'root';
    folderStack = [];
    updateBackButton();
}

// List files and folders inside a given folder
async function listFolderContents(folderId) {
    loadingSpinner.style.display = 'block';
    fileListContainer.innerHTML = '';
    
    try {
        const response = await gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name, mimeType)',
        });
        
        loadingSpinner.style.display = 'none';
        const files = response.result.files;

        if (files.length === 0) {
            fileListContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Nenhum arquivo ou pasta encontrado.</p>';
            return;
        }
        
        // Separate folders and files for sorting
        const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        const regularFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

        // Sort both lists by name
        folders.sort((a, b) => a.name.localeCompare(b.name));
        regularFiles.sort((a, b) => a.name.localeCompare(b.name));

        const sortedFiles = [...folders, ...regularFiles];

        sortedFiles.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.classList.add('p-2', 'bg-secondary-dark', 'rounded-lg', 'shadow-sm', 'cursor-pointer', 'hover:bg-gray-700', 'transition-colors', 'duration-150');
            const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
            fileElement.innerHTML = `<span class="mr-2">${icon}</span>${file.name}`;
            fileElement.dataset.fileId = file.id;
            fileElement.dataset.mimeType = file.mimeType;
            fileElement.addEventListener('click', () => handleFileClick(file));
            fileListContainer.appendChild(fileElement);
        });

    } catch (error) {
        console.error('Erro ao listar arquivos e pastas:', error);
        loadingSpinner.style.display = 'none';
        fileListContainer.innerHTML = '<p class="text-red-400 text-sm p-2">Erro ao carregar arquivos.</p>';
    }
}

// Handle file/folder click
async function handleFileClick(file) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
        folderStack.push(currentFolderId);
        currentFolderId = file.id;
        updateBackButton();
        await listFolderContents(file.id);
    } else {
        loadFile(file.id);
    }
}

// Load content of a file
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
        console.error('Erro ao carregar o arquivo:', error);
        alert('Erro ao carregar o arquivo. Por favor, tente novamente.');
    }
}

// Save the current file
async function saveFile() {
    if (!currentFile) {
        alert('Nenhum arquivo selecionado para salvar.');
        return;
    }
    const content = editor.value;
    const file = new Blob([content], {type: 'text/markdown'});
    
    try {
        const response = await gapi.client.request({
            path: `/upload/drive/v3/files/${currentFile}?uploadType=media`,
            method: 'PATCH',
            body: file,
            headers: {
                'Content-Type': 'text/markdown'
            }
        });
        console.log('Arquivo salvo:', response);
        alert('Arquivo salvo com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar o arquivo:', error);
        alert('Erro ao salvar o arquivo. Por favor, verifique a conexão e permissões.');
    }
}

// Create a new file
async function createNewFile() {
    const newFileName = prompt("Digite o nome do novo arquivo (ex: meu-documento.md):");
    if (!newFileName || !newFileName.endsWith('.md')) {
        alert('Nome do arquivo inválido. Por favor, use a extensão .md');
        return;
    }

    const fileMetadata = {
        'name': newFileName,
        'mimeType': 'text/markdown',
        'parents': [currentFolderId], // Save in the current folder
    };

    const content = `# ${newFileName.replace('.md', '')}\n\nComece a escrever aqui...`;
    const file = new Blob([content], {type: 'text/markdown'});
    
    try {
        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            media: {
                mimeType: 'text/markdown',
                body: file
            },
            fields: 'id'
        });

        console.log('Novo arquivo criado:', response);
        alert('Novo arquivo criado com sucesso!');
        await listFolderContents(currentFolderId);
        loadFile(response.result.id);
    } catch (error) {
        console.error('Erro ao criar o novo arquivo:', error);
        alert('Erro ao criar o novo arquivo. Por favor, verifique a conexão e permissões.');
    }
}

// Render the Markdown preview
function updatePreview() {
    const markdownText = editor.value;
    // marked.js is automatically loaded via the script tag in index.html
    preview.innerHTML = marked.parse(markdownText);
}

// Update back button visibility based on folder stack
function updateBackButton() {
    backButton.style.display = folderStack.length > 0 ? 'block' : 'none';
}

// Handle back button click
async function navigateBack() {
    const previousFolderId = folderStack.pop();
    if (previousFolderId) {
        currentFolderId = previousFolderId;
        updateBackButton();
        await listFolderContents(currentFolderId);
    }
}

// Event Listeners
window.onload = function() {
    gapiLoad();
    gisLoad();
    authButton.addEventListener('click', handleAuthClick);
    signoutButton.addEventListener('click', handleSignoutClick);
    editor.addEventListener('input', updatePreview);
    saveButton.addEventListener('click', saveFile);
    newFileButton.addEventListener('click', createNewFile);
    backButton.addEventListener('click', navigateBack);
};
