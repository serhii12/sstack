# Spec: export report

Status: ready
Agreed in: grill summary confirmed by the user on 2026-11-20

## Problem

A user cannot get the monthly report out of the app. They copy the numbers by hand.

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

- HTTP endpoint `/report.csv`: a test checks the body and the headers. existing

Prior art: None found

## Decisions

- The export uses the same query as the report page.

## Assumed without asking

None

## Open questions

None

## Glossary terms and decision records

- Report: [GLOSSARY.md](../../GLOSSARY.md)
