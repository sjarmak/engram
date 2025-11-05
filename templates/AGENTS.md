# Project Agent Knowledge Base

**Maintained by**: Engram learning loop

**Purpose**: Behavioral guardrails and learned patterns for AI agents working in this codebase.

---

## Development Workflow

### Task Tracking

Use `bd` (beads) for all issue tracking:

```bash
bd ready                              # Find unblocked work
bd update <id> --status in_progress   # Claim issue
# Do work, run tests
bd close <id> --reason "Done"         # Complete
```

**Never use markdown TODO lists.** All tasks belong in beads.

### Test-First Development

1. Write tests first for testable specifications
2. Never edit tests to make them pass - fix the implementation
3. Propose commit after each green test (wait for approval)
4. Run full test suite before closing beads

---

## Code Standards

### TypeScript

**Imports**: Always use `.js` extensions for ESM:
```typescript
import { foo } from './bar.js';  // Even for .ts files
```

**Types**:
- Use `unknown` and validate with Zod (not `any`)
- Leverage inference; don't over-annotate
- Avoid `@ts-expect-error`; fix the type issue

**Zod Validation** at all boundaries:
```typescript
const result = MySchema.safeParse(input);
if (!result.success) {
  const errors = result.error.issues.map((e: z.ZodIssue) => 
    `${e.path.join('.')}: ${e.message}`
  );
  throw new Error(`Validation failed: ${errors.join(', ')}`);
}
```

### Testing

- **Framework**: [Your test framework - e.g., Vitest, Jest, pytest]
- **Command**: `[Your test command - e.g., npm test, pytest]`
- **Determinism**: Mock timestamps, IDs, random values

### Code Quality

- **Self-documenting**: Function/variable names explain purpose
- **Minimal comments**: Remove "what", keep "why"
- **Single responsibility**: One focused purpose per function

---

## Pre-Commit Checklist

Before proposing any commit:

- [ ] Tests pass
- [ ] Linter passes
- [ ] Type checker passes
- [ ] No `any` types introduced
- [ ] Validation added at boundaries
- [ ] Excess comments removed

---

<!-- BEGIN: LEARNED_PATTERNS -->
## Learned Patterns

*Auto-maintained by learning loop. Patterns accumulate from execution feedback.*

---
<!-- END: LEARNED_PATTERNS -->

## Common Failures & Fixes

*Auto-populated by Engram learning loop from captured execution traces.*

---

*This file is maintained by `en knowledge render`. Manual edits will be overwritten.*
