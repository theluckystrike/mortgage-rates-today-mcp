# Data sources

All sources below were fetched on 2026-11-05 while building version 1.0.0. Rates are read at call time; nothing about rates is written into the code.

| Data | URL | Notes |
|---|---|---|
| Weekly mortgage rates since 1971 | https://www.freddiemac.com/pmms/docs/PMMS_history.csv | Columns date, pmms30, pmms30p, pmms15, pmms15p, pmms51, pmms51p, pmms51m, pmms51spread. 2,901 rows on 2026-11-05, latest week 10/29/2026 (30-year 7.24, 15-year 6.60). Keyless. Cached 1 hour. |
| Method, release time, attribution | https://www.freddiemac.com/pmms | Released Thursdays at 12 p.m. ET (Wednesday when a US holiday falls on Thursday). Average of purchase applications submitted to Freddie Mac, borrower profile good to excellent credit and 20 percent down. 5/1 ARM and fees and points discontinued in November 2022. "Information from this document may be used with proper attribution." Every result carries "Source: Freddie Mac Primary Mortgage Market Survey (PMMS)". |

The test fixture in `test/fixtures/` is the PMMS history file downloaded on 2026-11-05.
