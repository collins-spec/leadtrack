'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@/lib/account-context';
import { api } from '@/lib/api';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Phone, FileText, Search, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { TagBadge } from '@/components/tag-badge';

interface PipelineLead {
  type: 'call' | 'form';
  id: string;
  stageId: string | null;
  contact: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  duration: number | null;
  callStatus: string | null;
  leadScore: number | null;
  leadScoreLabel: string | null;
  tags: Array<{ id: string; label: string; color: string }>;
  createdAt: string;
}

interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string;
  isDefault: boolean;
  isWon: boolean;
  isLost: boolean;
}

interface PipelineColumn {
  stage: PipelineStage;
  leads: PipelineLead[];
}

export default function PipelinePage() {
  const { currentAccount } = useAccount();
  const [pipeline, setPipeline] = useState<PipelineColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const loadPipeline = useCallback(async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      const filters: any = {};
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (sourceFilter) filters.source = sourceFilter;
      if (searchFilter) filters.search = searchFilter;

      const data = await api.getPipelineLeads(currentAccount.id, filters);
      setPipeline(data.pipeline || []);
    } catch (error) {
      console.error('Failed to load pipeline:', error);
    } finally {
      setLoading(false);
    }
  }, [currentAccount, typeFilter, sourceFilter, searchFilter]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const handleSeedStages = async () => {
    if (!currentAccount) return;
    setSeeding(true);
    try {
      await api.seedDefaultStages(currentAccount.id);
      await loadPipeline();
    } catch (error) {
      console.error('Failed to seed stages:', error);
    } finally {
      setSeeding(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, source, destination } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    // Parse draggableId: "call-xxx" or "form-xxx"
    const [leadType, ...idParts] = draggableId.split('-');
    const leadId = idParts.join('-');
    const toStageId = destination.droppableId;

    // Optimistic update
    setPipeline((prev) => {
      const next = prev.map((col) => ({
        ...col,
        leads: col.leads.filter((l) => !(l.type === leadType && l.id === leadId)),
      }));
      const movedLead = prev
        .flatMap((col) => col.leads)
        .find((l) => l.type === leadType && l.id === leadId);
      if (movedLead) {
        const destCol = next.find((col) => col.stage.id === toStageId);
        if (destCol) {
          destCol.leads = [{ ...movedLead, stageId: toStageId }, ...destCol.leads];
        }
      }
      return next;
    });

    try {
      await api.moveLead(leadType as 'call' | 'form', leadId, toStageId);
    } catch (error) {
      console.error('Failed to move lead:', error);
      loadPipeline(); // Revert on error
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-400';
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-500';
  };

  // Empty state — no stages set up
  if (!loading && pipeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Pipeline Stages</h2>
          <p className="text-gray-500 mb-6">
            Set up your lead pipeline stages to start tracking lead progression.
          </p>
          <Button onClick={handleSeedStages} disabled={seeding}>
            {seeding ? 'Creating...' : 'Create Default Stages'}
          </Button>
          <p className="text-xs text-gray-400 mt-3">
            Creates: New, Contacted, Qualified, Booked, Won, Lost
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pipeline.reduce((sum, col) => sum + col.leads.length, 0)} leads across{' '}
            {pipeline.length} stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="w-4 h-4 mr-1" />
            Filters
          </Button>
          <Button variant="outline" size="sm" onClick={loadPipeline} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || 'all')}>
            <SelectTrigger className="w-36">
              <span>{typeFilter === 'all' ? 'All Types' : typeFilter === 'call' ? 'Calls' : 'Forms'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="call">Calls Only</SelectItem>
              <SelectItem value="form">Forms Only</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by source..."
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="w-48"
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search contacts..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-52 pl-9"
            />
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
          {pipeline.map((column) => (
            <div key={column.stage.id} className="flex flex-col min-w-[300px] w-[300px] flex-shrink-0">
              {/* Column Header */}
              <div
                className="rounded-t-lg px-3 py-2 flex items-center justify-between"
                style={{ backgroundColor: column.stage.color + '20', borderTop: `3px solid ${column.stage.color}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{column.stage.name}</span>
                  {column.stage.isWon && <span className="text-xs text-green-600">Won</span>}
                  {column.stage.isLost && <span className="text-xs text-red-500">Lost</span>}
                </div>
                <span className="text-xs text-gray-500 bg-white rounded-full px-2 py-0.5">
                  {column.leads.length}
                </span>
              </div>

              {/* Droppable Area */}
              <Droppable droppableId={column.stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 overflow-y-auto rounded-b-lg border border-t-0 p-2 space-y-2 min-h-[200px] transition-colors ${
                      snapshot.isDraggingOver ? 'bg-blue-50' : 'bg-gray-50/50'
                    }`}
                  >
                    {column.leads.map((lead, index) => (
                      <Draggable
                        key={`${lead.type}-${lead.id}`}
                        draggableId={`${lead.type}-${lead.id}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white rounded-lg border p-3 shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${
                              snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-200' : 'hover:shadow-md'
                            }`}
                          >
                            {/* Lead Card */}
                            <div className="flex items-start gap-2 mb-2">
                              {lead.type === 'call' ? (
                                <Phone className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              ) : (
                                <FileText className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  {lead.contactName || lead.contactPhone || lead.contact}
                                </p>
                                {lead.contactEmail && (
                                  <p className="text-xs text-gray-500 truncate">{lead.contactEmail}</p>
                                )}
                              </div>
                              {lead.leadScore != null && (
                                <span className={`text-sm font-bold ${getScoreColor(lead.leadScore)}`}>
                                  {lead.leadScore}
                                </span>
                              )}
                            </div>

                            {/* Source + Duration */}
                            <div className="flex items-center gap-2 mb-2">
                              {lead.source && (
                                <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 truncate max-w-[120px]">
                                  {lead.source}
                                </span>
                              )}
                              {lead.type === 'call' && lead.duration != null && lead.duration > 0 && (
                                <span className="text-xs text-gray-500">
                                  {formatDuration(lead.duration)}
                                </span>
                              )}
                              {lead.callStatus && lead.callStatus !== 'COMPLETED' && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  lead.callStatus === 'NO_ANSWER' ? 'bg-yellow-100 text-yellow-700' :
                                  lead.callStatus === 'BUSY' ? 'bg-orange-100 text-orange-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {lead.callStatus}
                                </span>
                              )}
                            </div>

                            {/* Tags */}
                            {lead.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {lead.tags.slice(0, 3).map((tag) => (
                                  <TagBadge key={tag.id} label={tag.label} color={tag.color} />
                                ))}
                                {lead.tags.length > 3 && (
                                  <span className="text-xs text-gray-400">+{lead.tags.length - 3}</span>
                                )}
                              </div>
                            )}

                            {/* Timestamp */}
                            <p className="text-xs text-gray-400">{relativeTime(lead.createdAt)}</p>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {column.leads.length === 0 && (
                      <div className="text-center py-8 text-xs text-gray-400">
                        No leads in this stage
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
