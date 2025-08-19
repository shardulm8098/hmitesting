let testSuite = { config: {}, testCases: [{ name: 'test_case_1', steps: [] }] }; // Start with one test case
let inspectorData = { xmlDoc: null, imageSize: null, originalSize: null };
let completedTests = 0;
let totalTests = 0;

// --- DOM Element Cache ---
const elements = {
    deviceSelect: document.getElementById('device-select'),
    appPackageInput: document.getElementById('app-package'),
    appActivityInput: document.getElementById('app-activity'),
    testStepsList: document.getElementById('test-steps-list'),
    addStepBtn: document.getElementById('add-step-btn'),
    refreshDevicesBtn: document.getElementById('refresh-devices-btn'),
    executeTestsBtn: document.getElementById('execute-tests-btn'),
    inspectBtn: document.getElementById('inspect-btn'),
    reportOutput: document.getElementById('report-output'),
    executeText: document.getElementById('execute-text'),
    playIcon: document.getElementById('play-icon'),
    spinner: document.getElementById('spinner'),
    toast: document.getElementById('toast'),
    inspectorModal: document.getElementById('inspector-modal'),
    closeInspectorBtn: document.getElementById('close-inspector-btn'),
    inspectorScreenshot: document.getElementById('inspector-screenshot'),
    inspectorHighlight: document.getElementById('inspector-highlight'),
    propertiesList: document.getElementById('properties-list'),
    inspectorInstructions: document.getElementById('inspector-instructions'),
    progressSection: document.getElementById('progress-section'),
    progressLabel: document.getElementById('progress-label'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    reportSummary: document.getElementById('report-summary')
};

// --- Toast Notification ---
function showToast(message, isSuccess = true) {
    elements.toast.textContent = message;
    elements.toast.style.backgroundColor = isSuccess ? '#28a745' : '#dc3545';
    elements.toast.className = "toast show";
    setTimeout(() => { elements.toast.className = elements.toast.className.replace("show", ""); }, 3000);
}

// --- Progress Update ---
function updateProgress() {
    completedTests++;
    const percentage = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;
    elements.progressLabel.textContent = `${completedTests} / ${totalTests}`;
    elements.progressBarFill.style.width = `${percentage}%`;
}

// --- Core Functions ---
async function fetchAndPopulateDevices() {
    elements.deviceSelect.innerHTML = '<option>Detecting devices...</option>';
    elements.deviceSelect.disabled = true;
    const { devices, error } = await window.electronAPI.getDevices();
    elements.deviceSelect.innerHTML = '';
    if (error) {
        elements.deviceSelect.innerHTML = `<option>Error: ${error.substring(0, 50)}...</option>`;
    } else if (devices.length === 0) {
        elements.deviceSelect.innerHTML = '<option>No devices found.</option>';
    } else {
        devices.forEach(deviceId => {
            const option = document.createElement('option');
            option.value = deviceId;
            option.textContent = deviceId;
            elements.deviceSelect.appendChild(option);
        });
    }
    elements.deviceSelect.disabled = false;
}

async function showInspector() {
    const deviceId = elements.deviceSelect.value;
    const appPackage = elements.appPackageInput.value;
    const appActivity = elements.appActivityInput.value;

    if (!deviceId || !appPackage || !appActivity) {
        showToast("Please provide Device ID, App Package, and App Activity.", false);
        return;
    }
    
    elements.inspectorInstructions.textContent = 'Launching app and fetching screen data... Please make sure Appium server is running.';
    elements.propertiesList.innerHTML = '';
    elements.inspectorScreenshot.src = '';
    elements.inspectorHighlight.style.width = '0px';
    elements.inspectorModal.classList.remove('hidden');

    const result = await window.electronAPI.inspectScreen({
        deviceId,
        appPackage,
        appActivity
    });

    if (result.success) {
        elements.inspectorInstructions.textContent = 'Click an element in the screenshot to see its properties.';
        elements.inspectorScreenshot.src = result.screenshotPath + '?t=' + new Date().getTime();
        
        const parser = new DOMParser();
        inspectorData.xmlDoc = parser.parseFromString(result.source, "application/xml");
        inspectorData.originalSize = result.dimensions;

        elements.inspectorScreenshot.onload = () => {
            inspectorData.imageSize = {
                width: elements.inspectorScreenshot.offsetWidth,
                height: elements.inspectorScreenshot.offsetHeight
            };
        };
    } else {
        elements.inspectorInstructions.textContent = `Error fetching screen data:\n\n${result.error}`;
    }
}

function handleInspectorClick(event) {
    if (!inspectorData.xmlDoc || !inspectorData.imageSize || !inspectorData.originalSize) return;

    const rect = event.target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const scaleX = inspectorData.originalSize.width / inspectorData.imageSize.width;
    const scaleY = inspectorData.originalSize.height / inspectorData.imageSize.height;
    const originalX = clickX * scaleX;
    const originalY = clickY * scaleY;

    const allElements = inspectorData.xmlDoc.getElementsByTagName('*');
    let foundElement = null;

    for (let i = allElements.length - 1; i >= 0; i--) {
        const el = allElements[i];
        const boundsStr = el.getAttribute('bounds');
        if (boundsStr) {
            const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
            if (match) {
                const [x1, y1, x2, y2] = match.slice(1).map(Number);
                if (originalX >= x1 && originalX <= x2 && originalY >= y1 && originalY <= y2) {
                    foundElement = el;
                    break;
                }
            }
        }
    }

    if (foundElement) {
        displayElementProperties(foundElement);
        highlightElement(foundElement);
    }
}

function displayElementProperties(el) {
    elements.propertiesList.innerHTML = '';
    const attributes = ['resource-id', 'content-desc', 'class', 'text', 'package', 'checkable', 'checked', 'clickable', 'enabled', 'focusable', 'focused', 'scrollable', 'password', 'selected', 'bounds'];
    
    let hasContent = false;
    attributes.forEach(attrName => {
        const attrValue = el.getAttribute(attrName);
        if (attrValue) {
            hasContent = true;
            const propDiv = document.createElement('div');
            propDiv.className = 'text-sm mb-3 p-2 bg-slate-100 rounded-md';
            
            const valueSpan = document.createElement('span');
            valueSpan.className = 'text-slate-600 break-all block mt-1';
            valueSpan.textContent = attrValue;
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'text-xs text-indigo-500 hover:underline ml-2';
            copyBtn.textContent = 'copy';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(attrValue);
                showToast('Copied to clipboard!');
            };
            
            const titleStrong = document.createElement('strong');
            titleStrong.className = 'text-slate-800';
            titleStrong.textContent = attrName;
            
            propDiv.appendChild(titleStrong);
            propDiv.appendChild(copyBtn);
            propDiv.appendChild(valueSpan);
            elements.propertiesList.appendChild(propDiv);
        }
    });

    if(!hasContent) {
        elements.propertiesList.innerHTML = '<p class="text-sm text-slate-500">No standard attributes found for this element.</p>';
    }
}

function highlightElement(el) {
    const boundsStr = el.getAttribute('bounds');
    if (!boundsStr) return;
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return;

    const [x1, y1, x2, y2] = match.slice(1).map(Number);

    const scaleX = inspectorData.imageSize.width / inspectorData.originalSize.width;
    const scaleY = inspectorData.imageSize.height / inspectorData.originalSize.height;

    elements.inspectorHighlight.style.left = `${x1 * scaleX}px`;
    elements.inspectorHighlight.style.top = `${y1 * scaleY}px`;
    elements.inspectorHighlight.style.width = `${(x2 - x1) * scaleX}px`;
    elements.inspectorHighlight.style.height = `${(y2 - y1) * scaleY}px`;
}

function closeInspector() {
    elements.inspectorModal.classList.add('hidden');
}

function renderSteps() {
    elements.testStepsList.innerHTML = '';
    const testCase = testSuite.testCases[0]; // Simplified to one test case
    testCase.steps.forEach((step, stepIndex) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'flex items-center gap-2 p-2 bg-white rounded-md border';
        let stepInputs = '';
        switch (step.action) {
            case 'find_element':
                stepInputs = `<select onchange="updateStepProperty(${stepIndex}, 'locator', this.value)" class="text-sm rounded-md border-slate-300"><option value="id" ${step.locator === 'id' ? 'selected' : ''}>by ID</option><option value="xpath" ${step.locator === 'xpath' ? 'selected' : ''}>by XPath</option><option value="accessibility_id" ${step.locator === 'accessibility_id' ? 'selected' : ''}>by Accessibility ID</option></select><input type="text" value="${step.value || ''}" onchange="updateStepProperty(${stepIndex}, 'value', this.value)" placeholder="Element Identifier" class="flex-grow text-sm rounded-md border-slate-300">`;
                break;
            case 'check_value':
                stepInputs = `<span class="text-sm">is</span><input type="text" value="${step.expected || ''}" onchange="updateStepProperty(${stepIndex}, 'expected', this.value)" placeholder="Expected Value" class="flex-grow text-sm rounded-md border-slate-300">`;
                break;
            case 'click':
                stepInputs = `<span class="text-sm text-slate-500">(No parameters needed)</span>`;
                break;
            case 'wait':
                stepInputs = `<span class="text-sm">for</span><input type="number" value="${step.duration || '5'}" onchange="updateStepProperty(${stepIndex}, 'duration', this.value)" placeholder="Seconds" class="w-20 text-sm rounded-md border-slate-300"><span class="text-sm">seconds</span>`;
                break;
        }
        stepDiv.innerHTML = `<select onchange="updateStepAction(${stepIndex}, this.value)" class="text-sm font-semibold rounded-md border-slate-300"><option value="find_element" ${step.action === 'find_element' ? 'selected' : ''}>Find Element</option><option value="click" ${step.action === 'click' ? 'selected' : ''}>Click Element</option><option value="check_value" ${step.action === 'check_value' ? 'selected' : ''}>Check Value</option><option value="wait" ${step.action === 'wait' ? 'selected' : ''}>Wait</option></select>${stepInputs}<button onclick="deleteStep(${stepIndex})" class="text-slate-400 hover:text-red-600 text-xs font-bold ml-auto">X</button>`;
        elements.testStepsList.appendChild(stepDiv);
    });
}
function addStep() { testSuite.testCases[0].steps.push({ action: 'find_element', locator: 'id', value: '' }); renderSteps(); }
function deleteStep(stepIndex) { testSuite.testCases[0].steps.splice(stepIndex, 1); renderSteps(); }
function updateStepAction(stepIndex, newAction) { testSuite.testCases[0].steps[stepIndex] = { action: newAction }; if (newAction === 'find_element') { testSuite.testCases[0].steps[stepIndex].locator = 'id'; } renderSteps(); }
function updateStepProperty(stepIndex, prop, value) { testSuite.testCases[0].steps[stepIndex][prop] = value; }


// --- EVENT LISTENERS ---
elements.refreshDevicesBtn.addEventListener('click', fetchAndPopulateDevices);
elements.inspectBtn.addEventListener('click', showInspector);
elements.closeInspectorBtn.addEventListener('click', closeInspector);
elements.inspectorScreenshot.addEventListener('click', handleInspectorClick);
elements.addStepBtn.addEventListener('click', addStep);


// --- INITIAL RENDER ---
document.addEventListener('DOMContentLoaded', () => {
    fetchAndPopulateDevices();
    renderSteps();
});
