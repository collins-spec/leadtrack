'use client';

import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account-context';
import { api } from '@/lib/api';
import { AudioPlayer } from '@/components/audio-player';
import { TagBadge } from '@/components/tag-badge';
import { TagInput } from '@/components/tag-input';
import { Phone, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Lead {
  id: string;
  type: 'call' | 'form';
  source: string | null;
  medium: string | null;
  campaign: string | null;
  contact: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  duration: number | null;
  callStatus: string | null;
  tags: Array<{ id: string; label: string; color: string }>;
  recordingUrl: string | null;
  formData: any;
  leadScore: number | null;
  createdAt: string;
  pageUrl: string | null;
}

export default function LeadsPage() {
  const { currentAccount } = useAccount();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [minScoreFilter, setMinScoreFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const limit = 25;

  useEffect(() => {
    if (!currentAccount) return;
    loadLeads();
  }, [currentAccount, page, typeFilter, sourceFilter, tagFilter, minScoreFilter, searchFilter]);

  const loadLeads = async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      const filters: any = { page, limit };
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (sourceFilter) filters.source = sourceFilter;
      if (tagFilter) filters.tag = tagFilter;
      if (minScoreFilter) filters.minScore = parseInt(minScoreFilter);
      if (searchFilter) filters.search = searchFilter;

      const data = await api.getLeads(currentAccount.id, filters);
      setLeads(data.leads || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async (leadId: string, leadType: 'call' | 'form', tagName: string, tagColor: string) => {
    try {
      if (leadType === 'call') {
        await api.addTagToCall(leadId, tagName, tagColor);
      } else {
        await api.addTagToForm(leadId, tagName, tagColor);
      }
      loadLeads(); // Refresh to show new tag
    } catch (error) {
      console.error('Failed to add tag:', error);
    }
  };

  const handleRemoveTag = async (leadId: string, leadType: 'call' | 'form', tagId: string) => {
    try {
      await api.removeTag(leadId, leadType, tagId);
      loadLeads(); // Refresh to remove tag
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-400';
    if (score >= 70) return 'text-green-600 font-semibold';
    if (score >= 40) return 'text-yellow-600 font-medium';
    return 'text-red-600';
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total leads</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Type filter */}
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || 'all')}>
          <SelectTrigger className="w-36">
            <span className="truncate">
              {typeFilter === 'all' ? 'All Types' : typeFilter === 'call' ? 'Calls Only' : 'Forms Only'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="call">Calls Only</SelectItem>
            <SelectItem value="form">Forms Only</SelectItem>
          </SelectContent>
        </Select>

        {/* Source filter */}
        <Input
          placeholder="Filter by source..."
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(1);
          }}
          className="w-48"
        />

        {/* Tag filter */}
        <Input
          placeholder="Filter by tag..."
          value={tagFilter}
          onChange={(e) => {
            setTagFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        />

        {/* Min score filter */}
        <Input
          type="number"
          placeholder="Min score..."
          value={minScoreFilter}
          onChange={(e) => {
            setMinScoreFilter(e.target.value);
            setPage(1);
          }}
          className="w-32"
          min="0"
          max="100"
        />

        {/* Search */}
        <Input
          placeholder="Search contact..."
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value);
            setPage(1);
          }}
          className="w-52"
        />

        {loading && <span className="text-sm text-gray-500 self-center">Loading...</span>}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Contact</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Source</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Score</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Tags</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                {/* Type */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {lead.type === 'call' ? (
                      <Phone className="w-5 h-5 text-blue-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-green-600" />
                    )}
                    <div className="text-sm">
                      <div className="font-medium">{lead.type === 'call' ? 'Call' : 'Form'}</div>
                      {lead.type === 'call' && (
                        <div className="text-gray-500">{formatDuration(lead.duration)}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact */}
                <td className="px-4 py-3">
                  <div className="text-sm">
                    <div className="font-medium">{lead.contactName || lead.contactEmail || lead.contactPhone || lead.contact}</div>
                    {lead.contactPhone && <div className="text-gray-500">{lead.contactPhone}</div>}
                    {lead.contactEmail && <div className="text-gray-500 text-xs">{lead.contactEmail}</div>}
                  </div>
                  {/* Recording playback for calls */}
                  {lead.type === 'call' && lead.recordingUrl && (
                    <div className="mt-2 max-w-xs">
                      <AudioPlayer src={lead.recordingUrl} />
                    </div>
                  )}
                  {/* Form data preview */}
                  {lead.type === 'form' && lead.formData?.message && (
                    <div className="mt-1 text-xs text-gray-500 italic line-clamp-2">
                      "{lead.formData.message}"
                    </div>
                  )}
                </td>

                {/* Source */}
                <td className="px-4 py-3">
                  <div className="text-sm">
                    <div className="font-medium">{lead.source || 'Unknown'}</div>
                    {lead.medium && <div className="text-gray-500">{lead.medium}</div>}
                    {lead.campaign && <div className="text-gray-500 text-xs">{lead.campaign}</div>}
                    {lead.callStatus && (
                      <div className="mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                            lead.callStatus === 'COMPLETED'
                              ? 'bg-green-100 text-green-800'
                              : lead.callStatus === 'NO_ANSWER'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {lead.callStatus}
                        </span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Score */}
                <td className="px-4 py-3">
                  <div className={`text-2xl font-bold tabular-nums ${getScoreColor(lead.leadScore)}`}>
                    {lead.leadScore || '—'}
                  </div>
                </td>

                {/* Tags */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {lead.tags.map((tag) => (
                      <TagBadge
                        key={tag.id}
                        label={tag.label}
                        color={tag.color}
                        onRemove={() => handleRemoveTag(lead.id, lead.type, tag.id)}
                      />
                    ))}
                    <TagInput
                      onAddTag={(tagName, tagColor) => handleAddTag(lead.id, lead.type, tagName, tagColor)}
                      existingTags={lead.tags.map((t) => t.label)}
                    />
                  </div>
                </td>

                {/* Date */}
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                  {formatDate(lead.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {leads.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            No leads found. Adjust your filters or wait for new leads to come in.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
