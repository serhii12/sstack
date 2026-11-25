# Spec: export report

Status: draft
Agreed in: grill summary confirmed by the user on 2026-11-20

## Problem

Not agreed. See Open questions.

## Who it is for

Account owners who read the monthly report.

## Scope

### In

- A button that exports the report as CSV.

### Out

- PDF export. The user chose to leave it out.

## User stories

1. As an account owner, I want a CSV file, so that I can open it in a spreadsheet.

## User-visible behavior

1. When the owner clicks Export, the browser downloads `report.csv`.
2. When the report has no rows, the file has only the header row.

## Test boundaries

Not agreed. See Open questions.

## Decisions

- The export uses the same query as the report page.

## Assumed without asking

None

## Open questions

- Problem: not agreed yet. The user did not say what is wrong.
- Test boundaries: not agreed yet. The user did not pick a boundary.

## Glossary terms and decision records

- Report: [GLOSSARY.md](../../GLOSSARY.md)
