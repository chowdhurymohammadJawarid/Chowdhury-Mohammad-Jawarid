import { useState } from 'react';
import { ExternalLink, MessageSquare, Phone, PhoneCall, ShieldCheck, UserPlus } from 'lucide-react';
import { ContactItem, PendingConfirmation } from '../types/ultron';

interface CommsViewProps {
  contacts: ContactItem[];
  onAddContact: (c: ContactItem) => void;
  onRequestConfirmation: (conf: PendingConfirmation) => void;
  callHistory: Array<{
    id: string;
    contactName: string;
    service: string;
    timestamp: string;
    status: string;
  }>;
}

export function CommsView({
  contacts,
  onAddContact,
  onRequestConfirmation,
  callHistory,
}: CommsViewProps) {
  const [selectedService, setSelectedService] = useState<'Phone Link' | 'WhatsApp' | 'VoIP'>(
    'Phone Link'
  );
  const [customTarget, setCustomTarget] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const initiateCallPrompt = (contactName: string, targetHandle: string, service: string) => {
    onRequestConfirmation({
      id: `call-${Date.now()}`,
      type: 'initiate_call',
      title: `Confirm Outgoing Call`,
      description: `ULTRON is ready to place a call to ${contactName} (${targetHandle}) using ${service}. Calls are never placed without your explicit authorization.`,
      detailLabel: `Contact: ${contactName} · Service: ${service}`,
      payload: {
        contactName,
        targetHandle,
        service,
      },
    });
  };

  const handleCustomCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTarget.trim()) return;
    initiateCallPrompt(customTarget.trim(), customTarget.trim(), selectedService);
    setCustomTarget('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    onAddContact({
      id: `contact-${Date.now()}`,
      name: newName.trim(),
      role: 'Personal Contact',
      phone: newPhone.trim(),
      whatsapp: newPhone.trim().replace(/[^0-9+]/g, ''),
      voipHandle: `${newName.trim().toLowerCase().replace(/\s+/g, '.')}@voip.local`,
      preferredService: selectedService,
    });
    setNewName('');
    setNewPhone('');
    setShowAdd(false);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/15 pb-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Phone Call & Communication Module
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Windows Phone Link · WhatsApp Calling · VoIP · Explicit Boss confirmation required before every call
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/25 transition-colors cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Contact
        </button>
      </div>

      {/* Calling Service Selector & Direct Dial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-300">Active Calling Integration</span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#050810] border border-slate-800">
              {(['Phone Link', 'WhatsApp', 'VoIP'] as const).map((svc) => (
                <button
                  key={svc}
                  type="button"
                  onClick={() => setSelectedService(svc)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedService === svc
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {svc}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCustomCall} className="flex gap-2">
            <input
              type="text"
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value)}
              placeholder={`Enter contact name or phone number for ${selectedService}...`}
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-[#050810] border border-cyan-500/25 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-200 border border-amber-400/30 hover:bg-amber-500/30 cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              Stage Call
            </button>
          </form>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Safeguard Active: Selected contact and service are always displayed for confirmation before dialing.
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Supported Integrations
          </h3>
          <div className="space-y-2 text-xs">
            <a
              href="ms-phone:"
              className="flex items-center justify-between p-2.5 rounded border border-slate-800 bg-[#050810] text-slate-200 hover:border-cyan-400/40"
            >
              <span>Windows Phone Link</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
            <a
              href="https://web.whatsapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded border border-slate-800 bg-[#050810] text-slate-200 hover:border-cyan-400/40"
            >
              <span>WhatsApp Web / Desktop</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-lg border border-cyan-500/30 bg-[#090f1d] p-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Contact Name"
            className="flex-1 min-w-[160px] px-3 py-2 text-xs rounded bg-[#050810] border border-slate-700 text-slate-100"
          />
          <input
            type="text"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone / WhatsApp Number (e.g. +15550192)"
            className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded bg-[#050810] border border-slate-700 text-slate-100"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 cursor-pointer"
          >
            Save Contact
          </button>
        </form>
      )}

      {/* Contacts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="text-sm font-semibold text-slate-100">{contact.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{contact.role}</div>
              <div className="font-mono-tabular text-xs text-cyan-300 mt-2">{contact.phone}</div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => initiateCallPrompt(contact.name, contact.phone, selectedService)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                Call ({selectedService})
              </button>
              <a
                href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open WhatsApp Chat"
                className="p-1.5 rounded border border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Authorized Call Log */}
      <div className="rounded-lg border border-cyan-500/20 bg-[#090f1d] p-4">
        <h3 className="font-display text-sm font-semibold text-slate-100 mb-3">
          Authorized Call Audit Log
        </h3>
        {callHistory.length === 0 ? (
          <p className="text-xs text-slate-400">No calls initiated during this session.</p>
        ) : (
          <div className="divide-y divide-slate-800 text-xs">
            {callHistory.map((item) => (
              <div key={item.id} className="py-2 flex items-center justify-between gap-4">
                <div>
                  <span className="font-medium text-slate-200">{item.contactName}</span>
                  <span className="text-slate-400 ml-2">via {item.service}</span>
                </div>
                <div className="font-mono-tabular text-slate-400">
                  {item.status} · {new Date(item.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
