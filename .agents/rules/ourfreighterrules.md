---
trigger: always_on
---

1. Technical Robustness
   * Handle NaN/empty conditions in formulas; use UTF-8 for file I/O
   * Escape variables with backticks (`); wrap Python one-liners in double quotes with triple-quoted SQL
   * Use CRLF handling via PowerShell when needed

2. Windows/PowerShell-First Approach
   * Replace Unix tools: grep → Select-String, cat → Get-Content, ls → Get-ChildItem, find → Get-ChildItem -Recurse, rm -rf → Remove-Item -Recurse -Force
   * Clean up temporary files after use

3. Knowledge-Before-Action
   * Review README.md (tech stack & foundation) before designing solutions

4. User Experience First
   * Prioritize interface comfort and clarity in all outputs

5. OurFreighter Architecture
   * Frontend: Route all data through frontend/src/services/api.js; forbid inline API calls & direct storage access
   * Backend: Use service layer for DB/logic; forbid raw SQL in controllers; prefer SQL aggregations over loops
   * Config: Centralize constants; distinguish Master Baseline from Scenario Overrides