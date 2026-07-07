const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(['endpoint', 'token']).then(({ endpoint, token }) => {
  $('endpoint').value = endpoint || '';
  $('token').value = token || '';
});

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    endpoint: $('endpoint').value.trim(),
    token: $('token').value.trim(),
  });
  $('status').textContent = 'saved ✓';
});
