import { useEffect, useState } from 'react';
import {
  Clock,
  Copy,
  Edit3,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  Layers,
  Move,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DuplicateGroup, FileEntry, PendingConfirmation, PermittedRoot } from '../types/ultron';

interface FileManagerViewProps {
  refreshSignal: number;
  onRequestConfirmation: (conf: PendingConfirmation) => void;
  onStatusSpeak: (msg: string) => void;
}

const FORMAT_FILTERS = [
  'all',
  'pdf',
  'docx',
  'txt',
  'xlsx',
  'pptx',
  'jpg',
  'png',
  'mp4',
  'mp3',
  'zip',
];

export function FileManagerView({
  refreshSignal,
  onRequestConfirmation,
  onStatusSpeak,
}: FileManagerViewProps) {
  const [mode, setMode] = useState<'browse' | 'recent' | 'duplicates'>('browse');
  const [roots, setRoots] = useState<PermittedRoot[]>([]);
  const [activeRootId, setActiveRootId] = useState<PermittedRoot['id']>('workspace');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [extFilter, setExtFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const [previewDoc, setPreviewDoc] = useState<{
    entry: FileEntry;
    previewable: boolean;
    content: string;
  } | null>(null);

  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [transferTarget, setTransferTarget] = useState<{
    entry: FileEntry;
    mode: 'move' | 'copy';
  } | null>(null);
  const [transferDest, setTransferDest] = useState('Projects');

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'recent') {
        const res = await fetch('/api/files/recent');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEntries(data.entries || []);
      } else if (mode === 'duplicates') {
        const res = await fetch('/api/files/duplicates');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDuplicates(data.groups || []);
      } else if (searchQuery.trim() || extFilter !== 'all') {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (extFilter !== 'all') params.set('ext', extFilter);
        const res = await fetch(`/api/files/search?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEntries(data.entries || []);
      } else {
        const res = await fetch(`/api/files/list?path=${encodeURIComponent(currentPath)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEntries(data.entries || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workspace files.');
    } finally {
      setLoading(false);
    }
  };

  const loadRoots = async () => {
    try {
      const res = await fetch('/api/files/roots');
      if (res.ok) {
        const data = await res.json();
        setRoots(data.roots || []);
        setActiveRootId(data.activeRootId || 'workspace');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadRoots();
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [mode, currentPath, extFilter, refreshSignal, activeRootId]);

  const handleSelectRoot = async (root: PermittedRoot) => {
    setError(null);
    try {
      if (!root.enabled) {
        const permRes = await fetch('/api/files/roots/permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: root.id, enabled: true }),
        });
        if (permRes.ok) {
          const permData = await permRes.json();
          setRoots(permData.roots || []);
        }
      }
      const res = await fetch('/api/files/roots/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: root.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentPath('');
      setActiveRootId(data.activeRootId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch folder root.');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMode('browse');
    void loadFiles();
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/files/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: currentPath, name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewFolderName('');
      setShowNewFolder(false);
      onStatusSpeak(`Folder ${data.entry.name} created, Boss.`);
      void loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder.');
    }
  };

  const handleReadFile = async (entry: FileEntry) => {
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(entry.path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewDoc(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file.');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    try {
      const res = await fetch('/api/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: renameTarget.path, newName: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRenameTarget(null);
      setRenameValue('');
      void loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.');
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent, overwrite = false) => {
    e.preventDefault();
    if (!transferTarget) return;
    try {
      const res = await fetch('/api/files/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          src: transferTarget.entry.path,
          destDir: transferDest,
          mode: transferTarget.mode,
          overwrite,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        onRequestConfirmation({
          id: `overwrite-${Date.now()}`,
          type: 'overwrite_file',
          title: 'Overwrite Existing File',
          description: `A file named "${transferTarget.entry.name}" already exists in "${transferDest}". Do you want to overwrite it?`,
          detailLabel: `Destination: ${transferDest}/${transferTarget.entry.name}`,
          payload: {
            src: transferTarget.entry.path,
            destDir: transferDest,
            mode: transferTarget.mode,
          },
        });
        setTransferTarget(null);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setTransferTarget(null);
      void loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File operation failed.');
    }
  };

  const handleOrganizeClick = () => {
    const targetFolder = currentPath || 'Downloads';
    onRequestConfirmation({
      id: `org-${Date.now()}`,
      type: 'organize_files',
      title: `Organize "${targetFolder}"`,
      description: `Sort loose files in "${targetFolder}" into categorized subfolders (Documents, Spreadsheets, Presentations, Media, Archives).`,
      detailLabel: `Workspace directory: ${targetFolder}`,
      payload: { folder: targetFolder },
    });
  };

  const handleDeleteClick = (entry: FileEntry) => {
    onRequestConfirmation({
      id: `del-${Date.now()}`,
      type: 'delete_file',
      title: `Delete "${entry.name}"`,
      description: `Permanently delete "${entry.path}" from your ULTRON workspace?`,
      detailLabel: `Type: ${entry.isDirectory ? 'Folder' : entry.extension.toUpperCase() || 'File'} · Size: ${entry.size} bytes`,
      payload: { path: entry.path },
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/15 pb-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Advanced File Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Permission-confined workspace · SHA-256 duplicate scan · Multi-format support
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090f1d] border border-cyan-500/20">
            <button
              type="button"
              onClick={() => setMode('browse')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'browse' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => setMode('recent')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'recent' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Recent
            </button>
            <button
              type="button"
              onClick={() => setMode('duplicates')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'duplicates' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Duplicates
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowNewFolder((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#090f1d] border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Folder
          </button>

          <button
            type="button"
            onClick={handleOrganizeClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Organize {currentPath || 'Downloads'}
          </button>
        </div>
      </div>

      {/* Permitted Directory Roots */}
      {roots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Location:</span>
          {roots.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!r.exists}
              onClick={() => void handleSelectRoot(r)}
              title={r.exists ? r.absPath : `${r.label} not found on this host`}
              className={`px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                activeRootId === r.id
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 cursor-pointer'
                  : r.exists
                  ? 'bg-[#090f1d] border-cyan-500/20 text-slate-300 hover:border-cyan-400/45 cursor-pointer'
                  : 'bg-[#050810] border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              {r.label}
              {!r.enabled && r.exists ? ' (Grant Access)' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Search & Extension Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files by name or path..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-[#090f1d] border border-cyan-500/20 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </form>

        <select
          value={extFilter}
          onChange={(e) => {
            setMode('browse');
            setExtFilter(e.target.value);
          }}
          aria-label="Filter by file extension"
          className="px-3 py-2 text-xs rounded-lg bg-[#090f1d] border border-cyan-500/20 text-slate-200 focus:outline-none focus:border-cyan-400"
        >
          {FORMAT_FILTERS.map((fmt) => (
            <option key={fmt} value={fmt}>
              {fmt === 'all' ? 'All Formats' : `.${fmt.toUpperCase()}`}
            </option>
          ))}
        </select>
      </div>

      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="flex items-center gap-2 p-3 rounded-lg bg-[#090f1d] border border-cyan-500/30">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Enter new folder name (e.g. Projects)"
            className="flex-1 px-3 py-1.5 text-xs rounded bg-[#050810] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/30 cursor-pointer"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setShowNewFolder(false)}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Breadcrumbs when browsing */}
      {mode === 'browse' && !searchQuery.trim() && extFilter === 'all' && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => setCurrentPath('')}
            className="hover:text-cyan-300 transition-colors cursor-pointer"
          >
            ultron_workspace
          </button>
          {breadcrumbs.map((seg, idx) => {
            const target = breadcrumbs.slice(0, idx + 1).join('/');
            return (
              <span key={target} className="flex items-center gap-1.5">
                <span>/</span>
                <button
                  type="button"
                  onClick={() => setCurrentPath(target)}
                  className="hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Duplicate Groups View */}
      {mode === 'duplicates' ? (
        <div className="space-y-4">
          {loading ? (
            <p className="text-xs text-slate-400">Scanning SHA-256 checksums...</p>
          ) : duplicates.length === 0 ? (
            <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-6 text-center text-xs text-slate-400">
              No duplicate files detected in your workspace.
            </div>
          ) : (
            duplicates.map((group) => (
              <div
                key={group.hash}
                className="rounded-lg border border-amber-400/30 bg-[#090f1d] p-4 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-amber-300">
                    Identical Content Group · Hash {group.hash}
                  </span>
                  <span className="font-mono-tabular text-slate-400">
                    {formatSize(group.size)} each
                  </span>
                </div>
                <div className="divide-y divide-slate-800">
                  {group.files.map((f) => (
                    <div key={f.path} className="py-2 flex items-center justify-between gap-4 text-xs">
                      <span className="text-slate-200 truncate">{f.path}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(f)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove Copy
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* File Table */
        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] overflow-hidden">
          {loading ? (
            <div className="p-6 text-xs text-slate-400">Reading workspace directory...</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-xs text-slate-400">No files match the current filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-4 font-medium">Name</th>
                    <th className="py-2.5 px-3 font-medium">Category</th>
                    <th className="py-2.5 px-3 font-medium">Size</th>
                    <th className="py-2.5 px-3 font-medium">Modified</th>
                    <th className="py-2.5 px-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {entries.map((entry) => (
                    <tr key={entry.path} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4">
                        {entry.isDirectory ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMode('browse');
                              setSearchQuery('');
                              setExtFilter('all');
                              setCurrentPath(entry.path);
                            }}
                            className="inline-flex items-center gap-2 font-medium text-amber-300 hover:underline cursor-pointer"
                          >
                            <Folder className="w-4 h-4 shrink-0" />
                            <span>{entry.name}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReadFile(entry)}
                            className="inline-flex items-center gap-2 text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer text-left"
                          >
                            <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                            <span>{entry.name}</span>
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{entry.category}</td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-300">
                        {entry.isDirectory ? '—' : formatSize(entry.size)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-400">
                        {new Date(entry.modifiedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {!entry.isDirectory && (
                            <button
                              type="button"
                              onClick={() => handleReadFile(entry)}
                              title="Read Document"
                              className="p-1.5 rounded text-slate-300 hover:bg-slate-700/60 hover:text-cyan-200 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTarget(entry);
                              setRenameValue(entry.name);
                            }}
                            title="Rename"
                            className="p-1.5 rounded text-slate-300 hover:bg-slate-700/60 hover:text-cyan-200 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferTarget({ entry, mode: 'move' })}
                            title="Move"
                            className="p-1.5 rounded text-slate-300 hover:bg-slate-700/60 hover:text-cyan-200 cursor-pointer"
                          >
                            <Move className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferTarget({ entry, mode: 'copy' })}
                            title="Copy"
                            className="p-1.5 rounded text-slate-300 hover:bg-slate-700/60 hover:text-cyan-200 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(entry)}
                            title="Delete (Requires Confirmation)"
                            className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-md rounded-xl border border-cyan-500/30 bg-[#090f1d] p-5 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-slate-100">
              Rename Entry
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-[#050810] border border-cyan-500/30 text-slate-100 focus:outline-none focus:border-cyan-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 text-xs rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/30 cursor-pointer"
              >
                Save Name
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move / Copy Modal */}
      {transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={(e) => handleTransferSubmit(e, false)}
            className="w-full max-w-md rounded-xl border border-cyan-500/30 bg-[#090f1d] p-5 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-slate-100">
              {transferTarget.mode === 'move' ? 'Move' : 'Copy'} "{transferTarget.entry.name}"
            </h3>
            <label className="block text-xs text-slate-400">
              Destination Folder (relative to ultron_workspace)
              <input
                type="text"
                value={transferDest}
                onChange={(e) => setTransferDest(e.target.value)}
                placeholder="e.g. Projects or Documents"
                className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg bg-[#050810] border border-cyan-500/30 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                className="px-4 py-2 text-xs rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/30 cursor-pointer"
              >
                {transferTarget.mode === 'move' ? 'Move File' : 'Copy File'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Document Reader Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-cyan-500/30 bg-[#090f1d] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  {previewDoc.entry.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {previewDoc.entry.path} · {formatSize(previewDoc.entry.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
            <pre className="max-h-96 overflow-y-auto p-4 rounded-lg bg-[#050810] border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap">
              {previewDoc.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
