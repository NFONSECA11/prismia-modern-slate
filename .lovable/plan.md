

## Plan: Handle `cancel` and `reschedule` procedure codes

### What changes

**1. BookingDrawer.tsx — Hide "Profissional" and "Procedimento" for `cancel` procedure code**

In the details grid (around line 692), add a condition to check if `procedure_code === "cancel"`. When true:
- Hide the `DetailRow` for "Procedimento" (line 693)
- Hide the `DetailRow` for "Profissional" (line 695-698)

This will use the same pattern already in place for detecting procedure codes:
```typescript
const isCancel = normalizedProcedureCode === "cancel";
```

The `normalizedProcedureCode` already exists in the drawer (derived from `procedure_code ?? procedure_slug ?? procedure_name`).

**2. BookingTable.tsx — No changes needed**

The table already handles `cancel` and `reschedule` with the "Cancelar Agendamento" quick action button on hover (added in previous iteration).

### Summary
- One file changed: `BookingDrawer.tsx`
- Wrap the Procedimento and Profissional `DetailRow` components with `{!isCancel && ...}` conditionals
- `reschedule` procedure code keeps these fields visible (only `cancel` hides them per user request)

