const RULE_ID = 1;
const STORAGE_KEY = 'headerRules';
const $ = id => document.getElementById(id);
const setStatus = msg => $('status').textContent = msg;

const RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media',
  'websocket', 'other'
];

function addRow(container, name = '', value = '', enabled = true) {
  const row = document.createElement('div');
  row.className = 'row';
  if (!enabled) row.classList.add('disabled');

  const checkbox = Object.assign(document.createElement('input'), {
    type: 'checkbox', className: 'henabled', checked: enabled,
    title: '勾选才会写入规则；取消=保留为草稿'
  });
  checkbox.addEventListener('change', () => {
    row.classList.toggle('disabled', !checkbox.checked);
  });

  const nameInput = Object.assign(document.createElement('input'), {
    type: 'text', className: 'hname', value: name,
    placeholder: '头名称 (如 X-Foo)'
  });

  const valueInput = Object.assign(document.createElement('input'), {
    type: 'text', className: 'hvalue', value,
    placeholder: '值 (留空=删除该头)'
  });

  const del = Object.assign(document.createElement('button'), {
    textContent: '×', title: '删除这一行'
  });
  del.addEventListener('click', () => row.remove());

  row.append(checkbox, nameInput, valueInput, del);
  container.append(row);
}

function collect(container) {
  return [...container.querySelectorAll('.row')]
    .map(row => ({
      name: row.querySelector('.hname').value.trim(),
      value: row.querySelector('.hvalue').value.trim(),
      enabled: row.querySelector('.henabled').checked
    }))
    .filter(h => h.name);
}

function toOps(list) {
  return list.map(h => h.value
    ? { header: h.name, operation: 'set', value: h.value }
    : { header: h.name, operation: 'remove' }
  );
}

function render(container, list) {
  container.innerHTML = '';
  const items = list?.length ? list : [{}];
  items.forEach(h => {
    const enabled = h.enabled !== false;
    addRow(container, h.name || '', h.value || '', enabled);
  });
}

async function load() {
  const { [STORAGE_KEY]: saved = {} } = await chrome.storage.local.get(STORAGE_KEY);
  render($('reqList'), saved.request);
  render($('resList'), saved.response);
}

async function save() {
  const requestAll = collect($('reqList'));
  const responseAll = collect($('resList'));

  await chrome.storage.local.set({
    [STORAGE_KEY]: { request: requestAll, response: responseAll }
  });

  const requestEnabled  = requestAll.filter(h => h.enabled);
  const responseEnabled = responseAll.filter(h => h.enabled);

  const requestHeaders  = toOps(requestEnabled);
  const responseHeaders = toOps(responseEnabled);

  if (!requestHeaders.length && !responseHeaders.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID] });
    const draftCount = requestAll.length + responseAll.length;
    setStatus(draftCount
      ? `未启用任何头，已清除规则（保留 ${draftCount} 条草稿）`
      : '未填写任何头，已清除规则');
    return;
  }

  const action = { type: 'modifyHeaders' };
  if (requestHeaders.length)  action.requestHeaders  = requestHeaders;
  if (responseHeaders.length) action.responseHeaders = responseHeaders;

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID],
      addRules: [{
        id: RULE_ID,
        priority: 1,
        action,
        condition: {
          urlFilter: '*',
          resourceTypes: RESOURCE_TYPES
        }
      }]
    });

    const reqN = requestEnabled.length;
    const resN = responseEnabled.length;
    const draftN = (requestAll.length - reqN) + (responseAll.length - resN);
    setStatus(
      `已启用 请求${reqN} / 响应${resN}` +
      (draftN ? `，草稿 ${draftN} 条未生效` : '') +
      '，全局生效'
    );
    console.log('当前动态规则：', await chrome.declarativeNetRequest.getDynamicRules());
  } catch (e) {
    setStatus('保存失败：' + e.message);
    console.error('保存失败', e);
  }
}

async function clear() {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID] });
  await chrome.storage.local.remove(STORAGE_KEY);
  render($('reqList'), []);
  render($('resList'), []);
  setStatus('已清除所有规则与草稿');
}

$('addReq').addEventListener('click', () => addRow($('reqList')));
$('addRes').addEventListener('click', () => addRow($('resList')));
$('save').addEventListener('click', save);
$('clear').addEventListener('click', clear);

load();