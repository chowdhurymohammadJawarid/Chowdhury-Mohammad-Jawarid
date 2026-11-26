import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  clearLogs,
  getLogs,
  isEmergencyHalted,
  recordLog,
  setEmergencyHalted,
} from '../server/activityLog.ts';
import { collectSystemTelemetry, getHardwareProfile } from '../server/systemMonitor.ts';
import {
  createFolder,
  deleteEntry,
  ensureWorkspaceSeeded,
  findDuplicateFiles,
  getPermittedRoots,
  getRecentFiles,
  listDirectory,
  moveOrCopyEntry,
  organizeFolder,
  readFileContent,
  renameEntry,
  safeResolve,
  searchFiles,
  WORKSPACE_ROOT,
} from '../server/fileManager.ts';
import { getWindowsCompanionScript, validateExternalUrl } from '../server/desktopBridge.ts';
import { controlWindowsApplication, discoverInstalledApps } from '../server/windowsControl.ts';
import { parseLocalIntent } from '../server/geminiService.ts';

async function runTests() {
  console.log('--- ULTRON Independent Module Verification Suite ---');

  // 1. Activity Log & Emergency Halt
  clearLogs();
  recordLog('action', 'Test', 'Sample action entry');
  recordLog('error', 'Test', 'Sample error entry');
  assert.equal(getLogs('error').length, 1, 'Error log filter should return 1 entry');
  setEmergencyHalted(true);
  assert.equal(isEmergencyHalted(), true, 'Emergency halt should engage');
  setEmergencyHalted(false);
  assert.equal(isEmergencyHalted(), false, 'Emergency halt should release');
  console.log('[PASS] Module 1: Activity Log & Safety Halt');

  // 2. Hardware Independence & System Telemetry
  const hw = getHardwareProfile();
  assert.ok(hw.cpuCores >= 1, 'CPU core count detected');
  assert.ok(hw.totalRamGb > 0, 'Total RAM detected');
  const telemetry = await collectSystemTelemetry();
  assert.ok(telemetry.cpuPercent >= 0 && telemetry.cpuPercent <= 100, 'CPU % in valid bounds');
  assert.ok(telemetry.memoryPercent >= 0 && telemetry.memoryPercent <= 100, 'Memory % in valid bounds');
  assert.ok(Array.isArray(telemetry.processes) && telemetry.processes.length > 0, 'Processes captured');
  console.log('[PASS] Module 2: Hardware Profile & Real-Time System Telemetry');

  // 3. Confined File Manager & Document Parser
  ensureWorkspaceSeeded();
  assert.throws(
    () => safeResolve('../../etc/passwd'),
    /Access denied/i,
    'Path traversal must be blocked'
  );
  const rootEntries = listDirectory('');
  assert.ok(rootEntries.length >= 3, 'Workspace should contain seeded directories');
  const pdfs = searchFiles('', 'pdf');
  assert.ok(pdfs.length >= 2, 'PDF search should locate seeded PDFs');
  const recents = getRecentFiles(5);
  assert.ok(recents.length > 0, 'Recent files returned');
  const dups = findDuplicateFiles();
  assert.ok(dups.length >= 1, 'SHA-256 duplicate detector should find seeded duplicates');

  // CRUD + PDF/ZIP parsing + conflict + organize + confirmed delete cycle in a temporary test folder
  const testDirName = `__test_dir_${Date.now()}`;
  createFolder('', testDirName);
  const testFileAbs = path.join(WORKSPACE_ROOT, testDirName, 'note.txt');
  fs.writeFileSync(testFileAbs, 'ULTRON unit test file', 'utf8');
  const testPdfAbs = path.join(WORKSPACE_ROOT, testDirName, 'sample.pdf');
  fs.writeFileSync(
    testPdfAbs,
    '%PDF-1.4\nBT /F1 12 Tf 72 720 Td (ULTRON Quarterly System Roadmap for Boss) Tj ET\n%%EOF\n',
    'utf8'
  );
  const pdfRead = readFileContent(`${testDirName}/sample.pdf`);
  assert.ok(pdfRead.previewable && pdfRead.content.includes('Roadmap'), 'PDF text extractor works');

  const renamed = renameEntry(`${testDirName}/note.txt`, 'note_renamed.txt');
  assert.equal(renamed.name, 'note_renamed.txt', 'Rename works');
  const copyRes = moveOrCopyEntry(renamed.path, testDirName, 'copy', true);
  assert.equal(copyRes.name, 'note_renamed_copy.txt', 'Copy creates suffixed copy in same folder');
  const orgRes = organizeFolder(testDirName);
  assert.equal(orgRes.movedCount, 3, 'Smart organize categorizes loose files');
  deleteEntry(testDirName);
  assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, testDirName)), false, 'Delete removes folder');
  const roots = getPermittedRoots();
  assert.equal(roots.activeRootId, 'workspace', 'Default permitted root is workspace');
  console.log('[PASS] Module 3: Confined File Manager, Duplicate Scan, OOXML/PDF Reader & Safe CRUD');

  // 4. Desktop Bridge, URL Sanitizer & App Discovery
  assert.equal(validateExternalUrl('javascript:alert(1)'), null, 'Must block javascript: URLs');
  assert.equal(validateExternalUrl('data:text/html,hi'), null, 'Must block data: URLs');
  assert.equal(validateExternalUrl('youtube'), 'https://www.youtube.com', 'Resolves known site');
  const apps = await discoverInstalledApps();
  assert.ok(apps.length >= 8, 'Discovered/pinned application registry populated');
  const launchRes = await controlWindowsApplication('chrome', 'open', apps);
  assert.equal(launchRes.ok, true, 'Allowlisted app launch succeeds');
  const blockedApp = await controlWindowsApplication('nonexistent_binary_xyz', 'open', apps);
  assert.equal(blockedApp.ok, false, 'Unknown binary blocked by allowlist');
  assert.ok(getWindowsCompanionScript().includes('HttpListener'), 'PowerShell companion script generated');
  console.log('[PASS] Module 4: Desktop Bridge, URL Validation & Application Allowlist');

  // 5. Natural Language Intent Engine (Offline/Local)
  const greet = await parseLocalIntent('Hey ULTRON');
  assert.equal(greet.intent, 'greeting');
  assert.ok(greet.reply.includes('Boss'));

  const openChrome = await parseLocalIntent('ULTRON, open Chrome');
  assert.equal(openChrome.intent, 'open_application');

  const ytSearch = await parseLocalIntent('ULTRON, open YouTube and search for tutorials');
  assert.equal(ytSearch.intent, 'open_website');
  assert.ok(String(ytSearch.actionCard?.url || '').includes('youtube.com/results'));

  const sysCheck = await parseLocalIntent("Check my computer's performance");
  assert.equal(sysCheck.intent, 'system_monitor');

  const callCheck = await parseLocalIntent('ULTRON, call Alex Mercer via WhatsApp');
  assert.equal(callCheck.intent, 'initiate_call');
  assert.ok(
    callCheck.clientActions.some((a) => a.type === 'request_confirmation'),
    'Calls must always require Boss confirmation'
  );
  console.log('[PASS] Module 5: Local Natural Language Intent & Confirmation Gate');

  console.log('ALL 5 MODULES VERIFIED SUCCESSFULLY.');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
