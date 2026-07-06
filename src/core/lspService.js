/**
 * lspService.js — Hidden LSP Self-Correction Loop (Phase 1)
 *
 * Instantiates a headless Monaco editor environment (never shown to the user)
 * and uses its built-in TypeScript/JavaScript language workers to semantically
 * validate code BEFORE it is written to disk by the agent's edit tools.
 *
 * Usage (from toolEngine.js):
 *   const { validateCode } = await import('./lspService.js');
 *   const result = await validateCode(filepath, newContent);
 *   if (!result.ok) return result.errorReport; // feed back to the LLM
 */

// Vite-compatible worker imports (see: monaco-editor ESM + Vite docs)
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Wire up Monaco's worker environment for Vite
self.MonacoEnvironment = {
    getWorker(_moduleId, label) {
        if (label === 'typescript' || label === 'javascript') {
            return new tsWorker();
        }
        return new editorWorker();
    }
};

// Lazily-initialized monaco namespace (kept out of the critical startup path)
let _monaco = null;
let _initPromise = null;
let _hiddenContainer = null;
let _hiddenEditor = null;

// File extensions we know how to validate
const VALIDATABLE_EXTENSIONS = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript'
};

/**
 * Diagnostic codes to IGNORE. These are almost always false positives in a
 * headless single-file validation context (no node_modules type resolution),
 * and must not block legitimate edits:
 *  - 2307: Cannot find module '...' (bare imports like 'marked', '?raw', css)
 *  - 2792: Cannot find module — did you mean to set moduleResolution?
 *  - 7016: Could not find a declaration file for module '...'
 *  - 2732: Cannot find module ... resolveJsonModule
 *  - 2580: Cannot find name 'require' (node context)
 *  - 2688: Cannot find type definition file
 *  - 1479: CommonJS module import interop
 */
const IGNORED_DIAGNOSTIC_CODES = new Set([2307, 2792, 7016, 2732, 2580, 2688, 1479]);

const MarkerSeverityError = 8; // monaco.MarkerSeverity.Error

async function initMonaco() {
    if (_monaco) return _monaco;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        // Core editor API + TypeScript/JavaScript language contribution only.
        // Importing the full 'monaco-editor' entry would drag in every language.
        const monaco = await import('monaco-editor');

        const compilerOptions = {
            target: 99, // ESNext
            module: 99, // ESNext
            moduleResolution: 2, // NodeJs
            jsx: 2, // React
            allowJs: true,
            allowNonTsExtensions: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            noEmit: true,
            skipLibCheck: true
        };

        const diagnosticsOptions = {
            noSemanticValidation: false,
            noSyntaxValidation: false,
            noSuggestionDiagnostics: true,
            diagnosticCodesToIgnore: [...IGNORED_DIAGNOSTIC_CODES]
        };

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
        monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
        // Eager sync so markers are computed even for models not attached to a visible editor
        monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
        monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

        // Hidden container + editor instance. Attaching a (display:none) editor
        // guarantees the language services fully activate in all Monaco versions.
        _hiddenContainer = document.createElement('div');
        _hiddenContainer.id = 'cognetic-hidden-lsp';
        _hiddenContainer.style.cssText = 'display:none;width:0;height:0;overflow:hidden;position:absolute;left:-9999px;';
        document.body.appendChild(_hiddenContainer);

        _hiddenEditor = monaco.editor.create(_hiddenContainer, {
            value: '',
            language: 'javascript',
            minimap: { enabled: false },
            automaticLayout: false
        });

        _monaco = monaco;
        return monaco;
    })();

    return _initPromise;
}

/** Returns the monaco language id for a filepath, or null if not validatable. */
export function getValidatableLanguage(filepath) {
    if (!filepath) return null;
    const lower = filepath.toLowerCase();
    for (const [ext, lang] of Object.entries(VALIDATABLE_EXTENSIONS)) {
        if (lower.endsWith(ext)) return lang;
    }
    return null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate file content in the hidden Monaco instance.
 *
 * @param {string} filepath  Absolute or project-relative path (used for language detection + URI)
 * @param {string} content   The candidate file content (NOT yet written to disk)
 * @returns {Promise<{ok: boolean, errors: Array, errorReport: string|null}>}
 *   ok=true  → content is clean (or file type is not validatable / LSP unavailable): safe to write.
 *   ok=false → Error-level markers found; errorReport is a formatted string for the LLM.
 */
export async function validateCode(filepath, content) {
    const language = getValidatableLanguage(filepath);
    if (!language) {
        return { ok: true, errors: [], errorReport: null }; // not our concern (css, html, rust, ...)
    }

    let monaco;
    try {
        monaco = await initMonaco();
    } catch (e) {
        // Fail-open: if Monaco cannot load (e.g. worker path issue), never block edits.
        console.warn('[lspService] Monaco init failed, skipping validation:', e);
        return { ok: true, errors: [], errorReport: null };
    }

    // Unique in-memory URI per validation run to avoid stale-marker collisions
    const cleanPath = filepath.replace(/\\/g, '/').replace(/[^a-zA-Z0-9_\-./]/g, '_');
    const uri = monaco.Uri.parse(`inmemory://lsp-check/${Date.now()}/${cleanPath}`);

    let model = null;
    try {
        model = monaco.editor.createModel(content, language, uri);
        _hiddenEditor.setModel(model);

        // Give the TS worker time to run semantic analysis (~500ms), then poll
        // briefly in case the worker is cold-starting on the first validation.
        let markers = [];
        const deadline = Date.now() + 3000;
        await sleep(500);
        for (;;) {
            markers = monaco.editor.getModelMarkers({ resource: uri });
            if (markers.length > 0 || Date.now() > deadline) break;
            await sleep(250);
        }

        const errors = markers.filter(m =>
            m.severity === MarkerSeverityError &&
            !IGNORED_DIAGNOSTIC_CODES.has(Number(m.code?.value !== undefined ? m.code.value : m.code))
        );

        if (errors.length === 0) {
            return { ok: true, errors: [], errorReport: null };
        }

        const lines = content.split(/\r?\n/);
        const formatted = errors.slice(0, 15).map(m => {
            const srcLine = lines[m.startLineNumber - 1];
            const context = srcLine !== undefined ? `\n    > ${srcLine.trim()}` : '';
            return `LSP Error on line ${m.startLineNumber}, col ${m.startColumn}: ${m.message}${context}`;
        });
        if (errors.length > 15) {
            formatted.push(`...and ${errors.length - 15} more errors.`);
        }

        const errorReport =
            `TOOL FAILED — the proposed edit was NOT written to disk because the language server ` +
            `found ${errors.length} error(s) in the resulting file:\n\n` +
            formatted.join('\n') +
            `\n\nFix the code and call edit_file again with a corrected version.`;

        return { ok: false, errors, errorReport };
    } catch (e) {
        console.warn('[lspService] Validation error, failing open:', e);
        return { ok: true, errors: [], errorReport: null };
    } finally {
        try {
            if (_hiddenEditor) _hiddenEditor.setModel(null);
            if (model) model.dispose();
        } catch (_) { /* noop */ }
    }
}
