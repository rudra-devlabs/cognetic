const fs = require('fs');
const css = `
/* --- Indexing Loader --- */
.indexing-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    margin: 4px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-muted);
    animation: fadeIn 0.3s ease;
}

.indexing-card .lucide {
    width: 14px;
    height: 14px;
}

.indexing-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}
`;
fs.appendFileSync('src/views/home/Home.css', css);
console.log('CSS appended.');
