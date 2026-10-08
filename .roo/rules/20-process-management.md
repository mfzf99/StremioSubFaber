# 20-process-management Rules

1. **STRICTLY FORBIDDEN (ZERO TOLERANCE):**
   - NEVER execute `taskkill /IM node.exe`, `taskkill /F /IM node.exe`, `pkill node`, or `killall node` under ANY circumstances, even if servers seem stubborn or cache needs clearing.
   - Reason: Background MCP services (Playwright MCP, Context7 MCP, terminal runners) operate inside node.exe. Killing node.exe globally kills the MCP servers instantly and results in fatal "MCP tool: Not connected" disconnections.

2. **KILLING STUCK SERVERS (PORT-SPECIFIC ONLY):**
   - Always target ONLY the specific local port occupied by the app (e.g. port 7001).
   - Recommended command (Cross-platform):
     `npx --yes kill-port <PORT>`
   - Windows PowerShell (Target single PID safely):
     `Get-NetTCPConnection -LocalPort <PORT> -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Stop-Process -Force`
   - Windows CMD (Manual PID):
     `for /f "tokens=5" %a in ('netstat -aon ^| findstr :<PORT>') do taskkill /f /pid %a`

3. **CACHE IN-MEMORY / TEMPLATE RELOAD:**
   - If changes in templates (e.g. configurePageGenerator / main.html) do not reflect due to in-memory caching, strictly kill the specific server port, verify the port is free, and start the script afresh (`node index.js`). Never kill other background Node runtimes.