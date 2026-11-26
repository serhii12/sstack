# Spec: export report

Status: draft
Agreed in: this conversation

## Problem Statement

Not agreed. See Open questions.

## Solution

### Who it is for

Account owners who read the monthly report.

### In scope

- A button that exports the report as CSV.

### User-visible behavior

1. When the owner clicks Export, the browser downloads `report.csv`.

## User Stories

1. As an account owner, I want a CSV file, so that I can open it in a spreadsheet.

## Implementation Decisions

- The export uses the same query as the report page.

## Testing Decisions

Not agreed. See Open questions.

Prior art: None found

## Out of Scope

- PDF export. The user chose to leave it out.

## Further Notes

### Assumed without asking

None

### Open questions

- Problem: not agreed yet. The user did not say what is wrong.
- Test boundaries: not agreed yet. The user was not sure about the boundary.

### Glossary terms and decision records

- Report: [GLOSSARY.md](../../GLOSSARY.md)
