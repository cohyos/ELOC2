# Sync Documentation Indexes

Audit and auto-update all documentation indexes in the ELOC2 repo to keep them in sync with the actual codebase.

## Targets
- `CLAUDE.md` — Key Files section, Architecture section, completion tables
- `Knowledge_Base_and_Agents_instructions/Chunk_index.md` — Index of all knowledge base chunks

## Workflow

### Step 1: Discover Current State
1. Use Glob to find every `.md` file in `Knowledge_Base_and_Agents_instructions/`
2. Use Glob to find all TypeScript source files across `packages/` and `apps/`
3. Use Glob to find all `package.json` files in workspaces
4. Read `CLAUDE.md` and `Chunk_index.md` to understand the current documented state

### Step 2: Identify Gaps
For each source/doc file found that is NOT referenced in the indexes:
- Read the file header/first 20 lines to understand its purpose
- Draft a one-line description

For each entry in the indexes that references a file that no longer exists:
- Mark it for removal

### Step 3: Check Architecture Accuracy
- Verify the Architecture section in CLAUDE.md lists all workspace packages
- Verify the Key Files section includes important new files (routes, stores, components)
- Check that Dockerfile, cloudbuild.yaml, and deployment config references are current
- Verify completion tables match actual implementation status

### Step 4: Apply Updates
- Add missing entries with descriptions based on file contents
- Remove stale entries for deleted files
- Update any incorrect descriptions or status information
- Keep the existing formatting style consistent

### Step 5: Commit
```bash
git add CLAUDE.md Knowledge_Base_and_Agents_instructions/Chunk_index.md
git commit -m "docs: auto-sync documentation indexes after latest changes"
```

### Step 6: Report
Show a summary of:
- Files added to indexes (with descriptions)
- Stale entries removed
- Descriptions or status updated
- Any architectural discrepancies found and fixed
