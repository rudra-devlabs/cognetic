import * as diffPkg from 'diff';

class ChangeTracker {
    constructor() {
        this.changes = [];
    }

    startSession() {
        this.changes = [];
    }

    record(filepath, before, after) {
        // Simple line count diffing
        const beforeLines = before ? before.split('\n') : [];
        const afterLines = after ? after.split('\n') : [];
        
        let additions = 0;
        let deletions = 0;
        
        // Accurate calculation using diff package
        const lineChanges = diffPkg.diffLines(before || "", after || "");
        lineChanges.forEach(part => {
            if (part.added) additions += part.count;
            if (part.removed) deletions += part.count;
        });

        const existingIdx = this.changes.findIndex(c => c.filepath === filepath);
        if (existingIdx !== -1) {
            this.changes[existingIdx].after = after;
            const origBefore = this.changes[existingIdx].before || "";
            
            // Re-calculate accurately from the original state
            let reAdditions = 0;
            let reDeletions = 0;
            const reLineChanges = diffPkg.diffLines(origBefore, after || "");
            reLineChanges.forEach(part => {
                if (part.added) reAdditions += part.count;
                if (part.removed) reDeletions += part.count;
            });
            
            this.changes[existingIdx].additions = reAdditions;
            this.changes[existingIdx].deletions = reDeletions;
            this.changes[existingIdx].patch = diffPkg.createTwoFilesPatch(filepath, filepath, origBefore, after || "", 'Original', 'Modified', { context: 3 });
        } else {
            const patch = diffPkg.createTwoFilesPatch(filepath, filepath, before || "", after || "", 'Original', 'Modified', { context: 3 });
            this.changes.push({
                filepath,
                before,
                after,
                additions,
                deletions,
                patch
            });
        }
    }

    getChanges() {
        return this.changes;
    }

    clear() {
        this.changes = [];
    }
}

export const changeTracker = new ChangeTracker();
if (typeof window !== 'undefined') {
    window._changeTracker = changeTracker;
}
