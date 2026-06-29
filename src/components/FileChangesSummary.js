// FileChangesSummary.js
// Usage: window.showFileChangesSummary({filesChanged, additions, deletions, files})

import './FileChangesSummary.css';

const iconMap = {
  html: '<svg width="20" height="20" fill="none" viewBox="0 0 24 24" class="icon-html"><path fill="#e44d26" d="M3.344 2l1.512 17.037L12 22l7.145-2.965L20.656 2H3.344z"></path><path fill="#f16529" d="M12 4v15.07l5.725-2.372L19.34 4H12z"></path><path fill="#ebebeb" d="M12 11.512h2.45L14.34 8H12V6h4v1.2l-2.27 5.247H12zm0 2v1.994l.007.003L16.243 15.31 16 16.8l-4 .002-.242-1.448 2.234-.002-.247-1.524-1.272.001H8.424L8 12.655H12z"></path></svg>',
  js: '<svg width="20" height="20" fill="none" viewBox="0 0 24 24" class="icon-js"><path fill="#f7df1e" d="M3 2v20l9 3 9-3V2H3zm13.76 17.93h-.021c-.407 0-.855-.085-1.238-.245l-.16-.076-.176.149c-.248.209-.588.37-.976.37-.795 0-1.31-.71-1.31-1.747v-2.186c0-1.029.51-1.699 1.399-1.699.391 0 .62.14.712.24l.073.08V10.6c0-.556.37-.904.892-.904.542 0 .89.37.89.882v6.498h.006c.03.413-.23.818-.742.818zM8.6 18.622c-.2 0-.397-.059-.554-.164l-.086-.058V13.19h1.137v4.782c0 .097-.072.163-.199.163z"></path></svg>'
};

// Utility to infer file icon type from filename
function getFileIcon(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.js')) return iconMap.js;
  if (lower.endsWith('.html')) return iconMap.html;
  return '<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#888" stroke-width="2" fill="none"/><text x="7" y="16" font-size="8" fill="#888">file</text></svg>';
}

// Attachment to window for demo use
window.showFileChangesSummary = function ({filesChanged, additions, deletions, files}) {
  let container = document.getElementById('file-changes-summary-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'file-changes-summary-root';
    document.body.appendChild(container);
  }
  container.innerHTML = `
    <div class="fcs-box">
      <div class="fcs-header">
        <span class="fcs-text">${filesChanged} file${filesChanged === 1 ? '' : 's'} changed</span>
        <span class="fcs-add">+${additions}</span>
        <span class="fcs-del">-${deletions}</span>
        <span class="fcs-toggle" tabindex="0" title="Toggle details">&#8250;</span>
        <button class="fcs-review" disabled>🗒️ Review</button>
      </div>
      <div class="fcs-details" style="display:none">
        ${files.map(f => `<div class="fcs-file-row">${getFileIcon(f.name)}<span class="fcs-file-name">${f.name}</span> <span class="fcs-file-path">${f.path}</span></div>`).join('')}
      </div>
    </div>
  `;

  const toggle = container.querySelector('.fcs-toggle');
  const details = container.querySelector('.fcs-details');
  let open = false;
  toggle.onclick = () => {
    open = !open;
    details.style.display = open ? '' : 'none';
    toggle.innerHTML = open ? '&#8964;' : '&#8250;';
  };
};

// Example usage for demonstration
// window.showFileChangesSummary({filesChanged:2, additions:57, deletions:8, files:[{name:'Home.html', path:'/c/Users/rudra/OneDrive/Desktop/agent-framework/src/views/home'},{name:'Home.js', path:'/c/Users/rudra/OneDrive/Desktop/agent-framework/src/views/home'}]});
